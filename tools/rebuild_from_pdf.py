from __future__ import annotations

import json
import re
import shutil
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
import html as htmllib

import pdfplumber

APP_DIR = Path(__file__).resolve().parents[1]
PUBLIC_DIR = APP_DIR / "public"
TOOLS_DIR = APP_DIR / "tools"

PDF_PATH = next(APP_DIR.glob("*.pdf"))
PAGE_CONTENT_PATH = PUBLIC_DIR / "page-content.js"
PAGE_CONTENT_SOURCE_PATH = PUBLIC_DIR / "page-content.source.js"
SONGS_INDEX_PATH = PUBLIC_DIR / "songs-index.js"
PAGES_INDEX_PATH = PUBLIC_DIR / "pages-index.js"
SECTIONS_PATH = PUBLIC_DIR / "sections.json"

PDF_PAGES_DIR = PUBLIC_DIR / "pdf-pages"
PDF_PAGES_DIR.mkdir(parents=True, exist_ok=True)

OFFSET = 2  # PDF file page = printed page + OFFSET


def normalize(text: str) -> str:
    text = text.lower()
    text = "".join(
        c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn"
    )
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def add_alias(alias_map: dict[str, str], alias: str, title: str) -> None:
    norm = normalize(alias)
    if not norm:
        return
    if norm in alias_map and alias_map[norm] != title:
        return
    alias_map[norm] = title


def build_title_aliases(songs_index: list[dict]) -> dict[str, str]:
    alias_map: dict[str, str] = {}
    for song in songs_index:
        title = song.get("title", "").strip()
        if not title:
            continue
        add_alias(alias_map, title, title)
        base = re.sub(r"\s*\(.*?\)\s*", "", title).strip()
        if base and base != title:
            add_alias(alias_map, base, title)
    return alias_map


def strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text)
    text = htmllib.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def load_js_object(path: Path, prefix: str) -> dict:
    raw = path.read_text(encoding="utf-8")
    json_str = raw.split(prefix, 1)[1].strip()
    if json_str.endswith(";"):
        json_str = json_str[:-1].strip()
    return json.loads(json_str)


def extract_song_blocks(page_html: str) -> list[tuple[str, str]]:
    matches = list(
        re.finditer(r'<div class="song-title"[^>]*>(.*?)</div>', page_html, re.I | re.S)
    )
    if not matches:
        return []

    blocks: list[tuple[str, str]] = []
    prelude = page_html[: matches[0].start()].strip()

    for idx, match in enumerate(matches):
        start = match.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(page_html)
        block_html = page_html[start:end].strip()
        if idx == 0 and prelude:
            block_html = prelude + "\n" + block_html
        title_text = strip_html(match.group(1))
        blocks.append((title_text, block_html))

    return blocks


def extract_section_title(page_html: str) -> str | None:
    match = re.search(r"<h1[^>]*>(.*?)</h1>", page_html, re.I | re.S)
    if match:
        return strip_html(match.group(1))
    match = re.search(r"section-divider-title\">(.*?)</", page_html, re.I | re.S)
    if match:
        return strip_html(match.group(1))
    return None


def html_has_song_title(page_html: str) -> bool:
    return bool(re.search(r"class=\"song-title\"", page_html, re.I))


def pdf_text_lines(page) -> list[str]:
    text = page.extract_text() or ""
    lines = []
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if line:
            lines.append(line)
    return lines


def pdf_text_norm(page) -> str:
    return normalize(" ".join(pdf_text_lines(page)))


def contains_title(norm_text: str, norm_title: str) -> bool:
    if not norm_title or len(norm_title) < 3:
        return False
    hay = f" {norm_text} "
    needle = f" {norm_title} "
    return needle in hay


def tokenize(norm_text: str) -> set[str]:
    if not norm_text:
        return set()
    return set(norm_text.split())


def choose_best_block(
    blocks: list[dict[str, str]],
    page_norm: str,
    used_ids: set[str] | None = None,
) -> dict[str, str] | None:
    if not blocks:
        return None
    page_tokens = tokenize(page_norm)
    best = None
    best_score = -1.0
    for block in blocks:
        if used_ids and block.get("id") in used_ids:
            continue
        tokens = block.get("tokens", set())
        if not tokens:
            score = 0.0
        else:
            score = len(tokens & page_tokens) / max(len(tokens), 1)
        if score > best_score:
            best_score = score
            best = block
    return best


def choose_best_blocks_from_tokens(
    blocks: list[dict[str, str]],
    page_tokens: set[str],
    used_ids: set[str],
    max_blocks: int = 3,
    min_score: float = 0.18,
) -> list[dict[str, str]]:
    selected: list[dict[str, str]] = []
    remaining = set(page_tokens)
    for _ in range(max_blocks):
        best = None
        best_score = 0.0
        for block in blocks:
            if block.get("id") in used_ids:
                continue
            tokens = block.get("tokens", set())
            if not tokens:
                continue
            overlap = len(tokens & remaining)
            score = overlap / max(len(tokens), 1)
            if score > best_score:
                best_score = score
                best = block
        if not best or best_score < min_score:
            break
        selected.append(best)
        remaining -= best.get("tokens", set())
    return selected


def extract_pdf_lines(page) -> list[dict[str, str | float]]:
    words = page.extract_words(use_text_flow=True, extra_attrs=["size"]) or []
    words = [w for w in words if w.get("text")]
    if not words:
        return []

    line_tol = 3.0
    lines = []
    for word in sorted(words, key=lambda w: (w.get("top", 0), w.get("x0", 0))):
        if not lines or abs(word.get("top", 0) - lines[-1]["top"]) > line_tol:
            lines.append({
                "top": word.get("top", 0),
                "bottom": word.get("bottom", 0),
                "size": word.get("size", 0),
                "words": [word],
            })
        else:
            line = lines[-1]
            line["words"].append(word)
            line["bottom"] = max(line["bottom"], word.get("bottom", 0))
            line["size"] = max(line["size"], word.get("size", 0))

    merged = []
    for line in lines:
        text = " ".join(w.get("text", "") for w in line["words"]).strip()
        if not text or not re.search(r"[A-Za-zÀ-ÖØ-öø-ÿ]", text):
            continue
        if not merged:
            merged.append({
                "top": line["top"],
                "bottom": line["bottom"],
                "size": line["size"],
                "text": text,
            })
            continue

        last = merged[-1]
        if line["top"] - last["bottom"] <= 8 and abs(line["size"] - last["size"]) <= 1:
            last["text"] = f"{last['text']} {text}"
            last["bottom"] = max(last["bottom"], line["bottom"])
            last["size"] = max(last["size"], line["size"])
        else:
            merged.append({
                "top": line["top"],
                "bottom": line["bottom"],
                "size": line["size"],
                "text": text,
            })

    return merged


def is_toc_title(line: str) -> bool:
    norm = normalize(line)
    return "table" in norm and ("matiere" in norm or "alphabet" in norm or "thematique" in norm)


def is_toc_page(lines: list[str]) -> bool:
    return any(is_toc_title(line) for line in lines[:3])


def is_toc_continuation(lines: list[str]) -> bool:
    if len(lines) < 8:
        return False
    digit_lines = sum(1 for line in lines if re.search(r"\d", line))
    return (digit_lines / max(len(lines), 1)) >= 0.6


def group_words_by_line(words: list[dict], line_tol: float = 3.0) -> list[str]:
    if not words:
        return []
    lines = []
    for word in sorted(words, key=lambda w: (w.get("top", 0), w.get("x0", 0))):
        if not lines or abs(word.get("top", 0) - lines[-1]["top"]) > line_tol:
            lines.append({"top": word.get("top", 0), "words": [word]})
        else:
            lines[-1]["words"].append(word)
    out = []
    for line in lines:
        text = " ".join(w.get("text", "") for w in line["words"]).strip()
        if text:
            out.append(text)
    return out


def parse_toc_line(line: str) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    current: list[str] = []
    for token in line.split():
        token_clean = token.strip()
        if re.fullmatch(r"\d{1,3}\D*", token_clean) and not re.search(r"[A-Za-z]", token_clean):
            page_num = re.sub(r"\D", "", token_clean)
            if current and page_num:
                title = " ".join(current).strip()
                entries.append((title, page_num))
                current = []
            continue
        current.append(token)
    return entries


def build_toc_html(page, lines: list[str], title_override: str | None = None) -> str:
    def build_toc_column(lines_block: list[str]) -> str:
        parts: list[str] = []
        for line in lines_block:
            entries = parse_toc_line(line)
            if entries:
                for title, page_num in entries:
                    parts.append(
                        f"<div class=\"toc-line\">"
                        f"<a class=\"toc-link\" href=\"#page-{page_num}\">{htmllib.escape(title)}</a>"
                        f"<span class=\"toc-page-num\">{htmllib.escape(page_num)}</span>"
                        f"</div>"
                    )
            else:
                parts.append(f"<div class=\"toc-section\">{htmllib.escape(line)}</div>")
        return "".join(parts)

    words = page.extract_words(use_text_flow=True) or []
    if not words:
        title = title_override or "Table des matieres"
        column_html = build_toc_column([line for line in lines if line.strip()])
        return (
            f"<div class=\"toc-page\">"
            f"<div class=\"toc-title\">{htmllib.escape(title)}</div>"
            f"<div class=\"toc-columns\"><div class=\"toc-column\">{column_html}</div></div>"
            f"</div>"
        )

    mid_x = page.width / 2
    left_words = [w for w in words if w.get("x0", 0) < mid_x]
    right_words = [w for w in words if w.get("x0", 0) >= mid_x]

    left_lines = group_words_by_line(left_words)
    right_lines = group_words_by_line(right_words)

    left_lines = [line for line in left_lines if not is_toc_title(line)]
    right_lines = [line for line in right_lines if not is_toc_title(line)]

    title = title_override or next((line for line in lines if is_toc_title(line)), "Table des matieres")
    left_html = build_toc_column(left_lines)
    right_html = build_toc_column(right_lines)

    return (
        f"<div class=\"toc-page\">"
        f"<div class=\"toc-title\">{htmllib.escape(title)}</div>"
        f"<div class=\"toc-columns\">"
        f"<div class=\"toc-column\">{left_html}</div>"
        f"<div class=\"toc-column\">{right_html}</div>"
        f"</div></div>"
    )


def match_title(candidate_text: str, title_norm_map: dict[str, str]) -> str | None:
    norm = normalize(candidate_text)
    if not norm or len(norm) < 3:
        return None
    if norm in title_norm_map:
        return title_norm_map[norm]

    if len(norm) >= 4:
        candidates = [title for key, title in title_norm_map.items() if norm in key or key in norm]
        unique = list(dict.fromkeys(candidates))
        if len(unique) == 1:
            return unique[0]

    best_norm = None
    best_ratio = 0.0
    second_ratio = 0.0
    for title_norm in title_norm_map.keys():
        ratio = SequenceMatcher(None, norm, title_norm).ratio()
        if ratio > best_ratio:
            second_ratio = best_ratio
            best_ratio = ratio
            best_norm = title_norm
        elif ratio > second_ratio:
            second_ratio = ratio

    if best_norm and best_ratio >= 0.86 and (best_ratio - second_ratio) >= 0.05:
        return title_norm_map[best_norm]

    return None


def extract_titles_from_html(page_html: str) -> list[str]:
    return [strip_html(m.group(1)) for m in re.finditer(
        r'<div class="song-title"[^>]*>(.*?)</div>', page_html, re.I | re.S
    )]


def build_song_html_from_lines(title: str, lines_text: list[str]) -> str:
    title_norm = normalize(title)
    content_lines = [line for line in lines_text if normalize(line) != title_norm]

    blocks: list[tuple[str, list[str]]] = []
    current: list[str] = []
    mode = "verse"

    for line in content_lines:
        if re.match(r"^refrain", line, re.I):
            if current:
                blocks.append((mode, current))
                current = []
            mode = "refrain"
            current.append(line)
            continue

        if mode == "refrain" and re.match(r"^\d+\s*[\.-]", line):
            blocks.append(("refrain", current))
            current = []
            mode = "verse"

        if mode == "verse" and re.match(r"^\d+\s*[\.-]", line) and current:
            blocks.append(("verse", current))
            current = []

        current.append(line)

    if current:
        blocks.append((mode, current))

    html_parts = [f"<div class=\"song-title\">{htmllib.escape(title)}</div>"]
    for block_type, block_lines in blocks:
        body = "<br/>\n".join(htmllib.escape(line) for line in block_lines)
        if block_type == "refrain":
            html_parts.append(f"<div class=\"refrain\">{body}</div>")
        else:
            html_parts.append(f"<div class=\"verse\">{body}</div>")

    return "\n".join(html_parts)


def split_lines_by_titles(lines_text: list[str], title_norm_map: dict[str, str]) -> dict[str, list[str]]:
    indices: list[tuple[int, str]] = []
    for idx, line in enumerate(lines_text):
        title = match_title(line, title_norm_map)
        if title:
            indices.append((idx, title))

    if not indices:
        return {}

    indices.sort(key=lambda item: item[0])
    segments: dict[str, list[str]] = {}
    for i, (start_idx, title) in enumerate(indices):
        end_idx = indices[i + 1][0] if i + 1 < len(indices) else len(lines_text)
        segments[title] = lines_text[start_idx:end_idx]

    return segments


def main() -> None:
    if not PAGE_CONTENT_SOURCE_PATH.exists():
        shutil.copyfile(PAGE_CONTENT_PATH, PAGE_CONTENT_SOURCE_PATH)

    page_content = load_js_object(PAGE_CONTENT_SOURCE_PATH, "window.page_content_data = ")
    songs_index_original = load_js_object(SONGS_INDEX_PATH, "window.songs_index_data = ")
    title_norm_map = build_title_aliases(songs_index_original)

    # Build song blocks map
    song_blocks: dict[str, list[dict[str, str]]] = {}
    duplicate_titles: list[str] = []
    all_blocks: list[dict[str, str]] = []
    for html in page_content.values():
        blocks = extract_song_blocks(html)
        for title, block_html in blocks:
            norm = normalize(title)
            block_text_norm = normalize(strip_html(block_html))
            block_id = f"{norm}:{len(song_blocks.get(norm, []))}"
            block = {
                "title": title,
                "html": block_html,
                "text_norm": block_text_norm,
                "tokens": tokenize(block_text_norm),
                "id": block_id,
            }
            if norm in song_blocks:
                duplicate_titles.append(title)
                song_blocks[norm].append(block)
            else:
                song_blocks[norm] = [block]
            all_blocks.append(block)

    # Load section names
    sections = json.loads(SECTIONS_PATH.read_text(encoding="utf-8"))
    section_names = {normalize(s["name"]): s["name"] for s in sections.values()}

    # Rebuild page content based on PDF
    new_page_content: dict[str, str] = {}
    unmatched_pages: list[int] = []
    unmatched_titles: list[str] = []
    matched_titles_norm: set[str] = set()
    used_block_ids: set[str] = set()

    cover_image = None
    owner_image = None
    back_image = None
    section_page_titles: dict[str, str] = {}
    pdf_norm_texts: list[tuple[int, str]] = []
    toc_pages: list[int] = []
    illustration_pages: list[int] = []
    raw_text_pages: list[int] = []
    toc_active = False
    toc_title = "Table des matieres"

    with pdfplumber.open(PDF_PATH) as pdf:
        total_pages = len(pdf.pages)

        # Cache normalized text for all pages
        for idx, page in enumerate(pdf.pages, start=1):
            pdf_norm_texts.append((idx, pdf_text_norm(page)))

        # Cover and ownership pages
        cover_image = PDF_PAGES_DIR / "pdf_cover.png"
        pdf.pages[0].to_image(resolution=150).save(cover_image, format="PNG")
        owner_image = PDF_PAGES_DIR / "pdf_owner.png"
        pdf.pages[1].to_image(resolution=150).save(owner_image, format="PNG")
        back_image = PDF_PAGES_DIR / "pdf_back.png"
        pdf.pages[-1].to_image(resolution=150).save(back_image, format="PNG")

        for pdf_index in range(2, total_pages - 1):
            pdf_page = pdf.pages[pdf_index]
            printed_page = pdf_index + 1 - OFFSET
            if printed_page <= 0:
                continue

            norm_text_full = pdf_norm_texts[pdf_index][1]
            lines_text = pdf_text_lines(pdf_page)
            words = pdf_page.extract_words() or []

            if is_toc_page(lines_text):
                toc_active = True
                toc_title = next((line for line in lines_text if is_toc_title(line)), toc_title)
                new_page_content[str(printed_page)] = build_toc_html(pdf_page, lines_text, toc_title)
                toc_pages.append(printed_page)
                continue

            if toc_active and is_toc_continuation(lines_text):
                new_page_content[str(printed_page)] = build_toc_html(pdf_page, lines_text, toc_title)
                toc_pages.append(printed_page)
                continue

            if toc_active:
                toc_active = False

            if lines_text and len(lines_text) <= 2 and 0 < len(words) <= 5:
                section_title = lines_text[0]
                section_page_titles[str(printed_page)] = section_title
                new_page_content[str(printed_page)] = ""
                continue

            line_segments = split_lines_by_titles(lines_text, title_norm_map) if lines_text else {}

            matched_titles: list[tuple[float, str]] = []
            lines = extract_pdf_lines(pdf_page)
            if lines:
                sizes = sorted([float(line.get("size", 0)) for line in lines])
                max_size = sizes[-1]
                median_size = sizes[len(sizes) // 2]
                threshold = max(median_size + 0.5, max_size * 0.75)
                max_top = pdf_page.height * 0.9

                for line in lines:
                    if float(line.get("top", 0)) > max_top:
                        continue
                    if float(line.get("size", 0)) < threshold:
                        continue
                    title = match_title(str(line.get("text", "")), title_norm_map)
                    if title:
                        matched_titles.append((float(line.get("top", 0)), title))

                if not matched_titles:
                    for line in lines:
                        if float(line.get("top", 0)) > max_top:
                            continue
                        norm_line = normalize(str(line.get("text", "")))
                        if norm_line in title_norm_map:
                            matched_titles.append((float(line.get("top", 0)), title_norm_map[norm_line]))

            if not matched_titles and lines_text:
                for idx, line_text in enumerate(lines_text[:6]):
                    title = match_title(line_text, title_norm_map)
                    if title:
                        matched_titles.append((float(idx), title))

            if not matched_titles:
                fallback_matches: list[tuple[int, str]] = []
                for norm_title, title in title_norm_map.items():
                    if contains_title(norm_text_full, norm_title):
                        fallback_matches.append((norm_text_full.find(norm_title), title))
                if 0 < len(fallback_matches) <= 6:
                    matched_titles = [(float(idx), title) for idx, title in sorted(fallback_matches)]

            if not matched_titles and lines:
                top_candidates = sorted(lines, key=lambda item: (-float(item.get("size", 0)), float(item.get("top", 0))))
                fallback_title = str(top_candidates[0].get("text", "")).strip()
                if fallback_title:
                    matched_titles = [(float(top_candidates[0].get("top", 0)), fallback_title)]

            if matched_titles:
                matched_titles.sort(key=lambda item: item[0])
                used_titles = []
                seen_norms = set()
                blocks = []
                for _, title in matched_titles:
                    norm = normalize(title)
                    if norm in seen_norms:
                        continue
                    seen_norms.add(norm)
                    block = choose_best_block(song_blocks.get(norm, []), norm_text_full, used_block_ids)
                    if block:
                        blocks.append(block["html"])
                        used_titles.append(title)
                        matched_titles_norm.add(norm)
                        used_block_ids.add(block.get("id", ""))
                    elif lines_text:
                        segment = line_segments.get(title, lines_text)
                        blocks.append(build_song_html_from_lines(title, segment))
                        used_titles.append(title)
                        matched_titles_norm.add(norm)

                if blocks:
                    new_page_content[str(printed_page)] = "\n".join(blocks)
                    continue

            if lines_text:
                page_tokens = tokenize(norm_text_full)
                best_blocks = choose_best_blocks_from_tokens(all_blocks, page_tokens, used_block_ids)
                if best_blocks:
                    new_page_content[str(printed_page)] = "\n".join(block["html"] for block in best_blocks)
                    for block in best_blocks:
                        used_block_ids.add(block.get("id", ""))
                    continue

            # Section page match
            section_match = None
            for norm_section in section_names.keys():
                if contains_title(norm_text_full, norm_section):
                    section_match = norm_section
                    break

            if section_match:
                section_title = section_names.get(section_match, "")
                if section_title:
                    section_page_titles[str(printed_page)] = section_title
                new_page_content[str(printed_page)] = ""
                continue

            if lines_text:
                raw_html = "<br/>".join(htmllib.escape(line) for line in lines_text)
                new_page_content[str(printed_page)] = f"<div class=\"page-raw-text\">{raw_html}</div>"
                raw_text_pages.append(printed_page)
                continue

            img_path = PDF_PAGES_DIR / f"pdf_page_{pdf_index + 1}.png"
            pdf_page.to_image(resolution=300).save(img_path, format="PNG")
            new_page_content[str(printed_page)] = (
                f"<div class=\"page-illustration\">"
                f"<img src=\"public/pdf-pages/{img_path.name}\" "
                f"alt=\"Illustration PDF page {pdf_index + 1}\" loading=\"lazy\" decoding=\"async\">"
                f"</div>"
            )
            illustration_pages.append(printed_page)
            unmatched_pages.append(printed_page)

    # Update songs-index.js
    section_name_to_id = {normalize(s["name"]): s["id"] for s in sections.values()}
    songs_index: list[dict] = []
    current_section_id = None
    current_section_name = None

    for page_num in sorted(new_page_content.keys(), key=lambda n: int(n)):
        if page_num in section_page_titles:
            current_section_name = section_page_titles[page_num]
            current_section_id = section_name_to_id.get(normalize(current_section_name))
            continue

        html = new_page_content[page_num]
        titles = extract_titles_from_html(html)
        for title in titles:
            entry = {
                "title": title,
                "page": int(page_num),
            }
            if current_section_name:
                entry["sectionName"] = current_section_name
                if current_section_id:
                    entry["section"] = current_section_id
            songs_index.append(entry)
            matched_titles_norm.add(normalize(title))

    new_titles_norm = {normalize(song["title"]) for song in songs_index}
    for song in songs_index_original:
        if normalize(song["title"]) not in new_titles_norm:
            unmatched_titles.append(song["title"])

    # Update pages-index.js
    pages_index: dict[str, dict] = {}
    for page_num, html in new_page_content.items():
        if page_num in section_page_titles:
            pages_index[str(page_num)] = {
                "songs": [],
                "isSectionDivider": True,
                "sectionName": section_page_titles[page_num],
            }
            continue

        titles = extract_titles_from_html(html)
        if titles:
            pages_index[str(page_num)] = {"songs": titles}
        else:
            pages_index[str(page_num)] = {"songs": []}

    # Update sections.json start/end from songs
    for section_id, section in sections.items():
        pages = [s["page"] for s in songs_index if s.get("section") == section_id]
        if pages:
            section["start"] = min(pages)
            section["end"] = max(pages)

    # Write outputs
    PAGE_CONTENT_PATH.write_text(
        "window.page_content_data = " + json.dumps(new_page_content, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    SONGS_INDEX_PATH.write_text(
        "window.songs_index_data = " + json.dumps(songs_index, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    PAGES_INDEX_PATH.write_text(
        "window.pages_index_data = " + json.dumps(pages_index, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    SECTIONS_PATH.write_text(json.dumps(sections, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    title_matches: dict[str, list[int]] = {}
    for title in unmatched_titles:
        alias_norms = [key for key, mapped in title_norm_map.items() if mapped == title]
        if not alias_norms:
            alias_norms = [normalize(title)]
        hits = []
        for pdf_num, norm_text in pdf_norm_texts:
            if any(contains_title(norm_text, alias) for alias in alias_norms):
                hits.append(pdf_num)
        title_matches[title] = hits

    report = {
        "pdf_path": str(PDF_PATH),
        "cover_image": str(cover_image) if cover_image else None,
        "owner_image": str(owner_image) if owner_image else None,
        "back_image": str(back_image) if back_image else None,
        "section_pages": section_page_titles,
        "toc_pages": toc_pages,
        "unmatched_pages": unmatched_pages,
        "illustration_pages": illustration_pages,
        "raw_text_pages": raw_text_pages,
        "duplicate_titles": duplicate_titles,
        "unmatched_titles": unmatched_titles,
        "title_matches": title_matches,
    }
    (TOOLS_DIR / "rebuild-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print("Rebuild complete.")
    print(f"Cover image: {cover_image}")
    print(f"Owner image: {owner_image}")
    print(f"Back image: {back_image}")
    print(f"Unmatched pages: {len(unmatched_pages)}")
    print(f"Duplicate titles: {len(duplicate_titles)}")
    print(f"Unmatched titles: {len(unmatched_titles)}")


if __name__ == "__main__":
    main()
