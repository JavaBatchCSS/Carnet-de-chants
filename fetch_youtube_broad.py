import json
import subprocess
import time
import re
import unicodedata
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

# Target channels/choirs
CHANNELS_LOWER = [
    "choeur montjoie saint denis", 
    "chœur montjoie saint denis",
    "choeur montjoie",
    "chœur montjoie",
    "sapiens france", 
    "sapiens",
    "les padrés",
    "les padres"
]

# Validation keywords to ensure we match relevant content
VALIDATION_KEYWORDS = [
    "montjoie", "sapiens", "padre", "padres", 
    "scout", "scouts", "suf", "fse", "sgdf", "camp",
    "militaire", "legion", "légion", "saint-cyr", "prytanee", "prytanée", 
    "tradition", "traditionnel", "choeur", "chœur", "musique de l'air",
    "marine nationale", "troupes de marine", "paras", "parachutiste",
    "gendarmerie", "cavalerie", "infanterie", "joyeuse garde"
]

def clean_string(s):
    s = s.lower()
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9\s]', '', s).strip()

def is_title_match(song_title, video_title):
    s_clean = clean_string(song_title)
    v_clean = clean_string(video_title)
    
    # 1. Gold standard: exact substring match
    if s_clean in v_clean:
        return True
        
    s_words = s_clean.split()
    if not s_words:
        return False
        
    # 2. Check if all significant words are in the video title (excluding short/stop words)
    stop_words = {"la", "le", "les", "de", "des", "un", "une", "du", "et", "en", "au", "aux", "sur", "pour", "dans", "par", "a", "o", "d", "l", "s"}
    sig_words = [w for w in s_words if w not in stop_words and len(w) > 1]
    
    if not sig_words:
        sig_words = s_words
        
    return all(w in v_clean for w in sig_words)

def search_youtube(title):
    # Try multiple specific query combinations to maximize finding a match
    queries = [
        f'{title} Choeur Montjoie',
        f'{title} Sapiens',
        f'{title} Les Padres',
        f'{title} chant scout',
        f'{title} chant militaire',
        f'{title}'  # General fallback
    ]
    
    for q in queries:
        print(f"Searching: {q}", flush=True)
        try:
            cmd = ['yt-dlp', f'ytsearch5:{q}', '--dump-json', '--no-warnings', '--flat-playlist']
            result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='ignore')
            lines = result.stdout.strip().split('\n')
            
            for line in lines:
                if not line: continue
                try:
                    data = json.loads(line)
                    uploader = data.get('uploader', '').lower()
                    channel = data.get('channel', '').lower()
                    video_title = data.get('title', '')
                    video_id = data.get('id')
                    
                    if not video_id:
                        continue
                    
                    video_title_lower = video_title.lower()
                    
                    # Check channel/uploader match
                    channel_match = any(c in uploader or c in channel for c in CHANNELS_LOWER)
                    
                    # Check broad validation: uploader, channel, or video title contains keyword
                    broad_match = channel_match or any(kw in uploader or kw in channel or kw in video_title_lower for kw in VALIDATION_KEYWORDS)
                    
                    if broad_match:
                        if is_title_match(title, video_title):
                            print(f"  -> MATCHED: '{title}' ==> '{video_title}' ({video_id}) [{uploader}]", flush=True)
                            return video_id
                except Exception:
                    pass
        except Exception as e:
            print(f"  Error searching {title} with query '{q}': {e}", flush=True)
            
    return None

# Load song list
with open('public/songs-index.js', 'r', encoding='utf-8') as f:
    content = f.read()
    json_str = content.split('=', 1)[1].strip().rstrip(';')
    songs = json.loads(json_str)

# Load existing matches
audio_map = {}
already_matched = set()
if os.path.exists('public/audio-map.js'):
    try:
        with open('public/audio-map.js', 'r', encoding='utf-8') as f:
            content = f.read()
            if 'window.audio_map_data = ' in content:
                json_str = content.split('window.audio_map_data = ', 1)[1].strip()
                if json_str.endswith(';'):
                    json_str = json_str[:-1].strip()
                audio_map = json.loads(json_str)
                for page, entries in audio_map.items():
                    for entry in entries:
                        already_matched.add(clean_string(entry['title']))
                print(f"Loaded existing matches from audio-map.js. Skipping {len(already_matched)} already matched songs.", flush=True)
    except Exception as e:
        print(f"Could not load existing audio-map.js: {e}", flush=True)

# Threads and locking
file_lock = threading.Lock()
print_lock = threading.Lock()

def safe_print(*args, **kwargs):
    with print_lock:
        print(*args, **kwargs)

def save_match(page, title, vid):
    with file_lock:
        page_str = str(page)
        if page_str not in audio_map:
            audio_map[page_str] = []
        # Avoid duplicate song entries in the same page
        if not any(clean_string(a['title']) == clean_string(title) for a in audio_map[page_str]):
            audio_map[page_str].append({
                "title": title,
                "youtubeId": vid
            })
        with open('public/audio-map.js', 'w', encoding='utf-8') as f:
            f.write('window.audio_map_data = ' + json.dumps(audio_map, ensure_ascii=False, indent=2) + ';')

# Filter out songs that are already matched
songs_to_search = [s for s in songs if clean_string(s['title']) not in already_matched]
total_songs = len(songs_to_search)

safe_print(f"Starting parallel broad YouTube search for {total_songs} songs (out of {len(songs)} total)...", flush=True)

success_count = len(already_matched)

def process_song(song):
    title = song['title']
    page = song['page']
    vid = search_youtube(title)
    if vid:
        save_match(page, title, vid)
        return title, vid
    return title, None

# Run with ThreadPoolExecutor
max_workers = 10
completed_count = 0

with ThreadPoolExecutor(max_workers=max_workers) as executor:
    futures = {executor.submit(process_song, s): s for s in songs_to_search}
    for future in as_completed(futures):
        song = futures[future]
        title = song['title']
        completed_count += 1
        try:
            title, vid = future.result()
            if vid:
                success_count += 1
                safe_print(f"[{completed_count}/{total_songs}] SUCCESS: {title} -> {vid} (Total matches: {success_count})", flush=True)
            else:
                safe_print(f"[{completed_count}/{total_songs}] NO MATCH: {title}", flush=True)
        except Exception as e:
            safe_print(f"[{completed_count}/{total_songs}] ERROR for {title}: {e}", flush=True)

safe_print(f"All done! Successfully matched {success_count} songs with broad validation.", flush=True)
