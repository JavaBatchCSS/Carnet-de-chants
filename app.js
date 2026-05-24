document.addEventListener('DOMContentLoaded', async () => {
    const bookContainer = document.getElementById('book-container');
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const audioContainer = document.getElementById('audio-player-container');
    const audioTitle = document.getElementById('audio-title');
    const youtubeContainer = document.getElementById('youtube-container');
    const closeAudioBtn = document.getElementById('close-audio');

    let songsIndex = window.songs_index_data || [];
    let pageContent = window.page_content_data || {};
    let pagesIndex = window.pages_index_data || {};
    let audioMap = window.audio_map_data || {};

    try {
        initApp();
    } catch (e) {
        console.error("Erreur d'initialisation", e);
        bookContainer.innerHTML = '<div style="text-align:center; padding:50px;">Erreur lors de l\'initialisation de l\'application.</div>';
    }

    function initApp() {
        buildSommaire();
        buildContentPages();
        setupSearch();
        setupFloatingControlsObserver();
        setupColumnSwitcher();
        
        // Initial scroll to hash if present
        setTimeout(handleHashChange, 100);
        window.addEventListener('hashchange', handleHashChange);
    }

    function buildSommaire() {
        const itemsPerPage = 25;
        const totalPages = Math.ceil(songsIndex.length / itemsPerPage);

        for (let p = 0; p < totalPages; p++) {
            const sommairePage = document.createElement('div');
            sommairePage.className = 'page';
            // The very first page of the book is the sommaire
            sommairePage.id = p === 0 ? 'sommaire' : `sommaire-${p}`;

            const wrapper = document.createElement('div');
            wrapper.className = 'page-content-wrapper';

            if (p === 0) {
                const title = document.createElement('h1');
                title.className = 'sommaire-title';
                title.textContent = 'Sommaire';
                wrapper.appendChild(title);
            }

            const list = document.createElement('ul');
            list.className = 'sommaire-list';

            const startIdx = p * itemsPerPage;
            const endIdx = Math.min(startIdx + itemsPerPage, songsIndex.length);

            for (let i = startIdx; i < endIdx; i++) {
                const song = songsIndex[i];
                const li = document.createElement('li');
                li.className = 'sommaire-item';
                
                const link = document.createElement('a');
                link.href = `#page-${song.page}`;
                link.textContent = song.title;
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    scrollToId(`page-${song.page}`);
                });

                const pageNum = document.createElement('span');
                pageNum.className = 'sommaire-page';
                pageNum.textContent = song.page;

                li.appendChild(link);
                li.appendChild(pageNum);
                list.appendChild(li);
            }

            wrapper.appendChild(list);
            sommairePage.appendChild(wrapper);

            const pageFooter = document.createElement('div');
            pageFooter.className = 'page-number';
            pageFooter.textContent = p === 0 ? 'I' : `I${p}`;
            sommairePage.appendChild(pageFooter);

            bookContainer.appendChild(sommairePage);
        }
    }

    function buildContentPages() {
        const pageNumbers = Object.keys(pageContent).map(n => parseInt(n)).sort((a,b) => a-b);
        const maxPage = pageNumbers.length > 0 ? pageNumbers[pageNumbers.length - 1] : 0;

        for (let i = 1; i <= maxPage; i++) {
            const pageInfo = pagesIndex[i.toString()];
            const htmlContent = pageContent[i.toString()];

            if (!htmlContent && !pageInfo) continue;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.id = `page-${i}`;

            const wrapper = document.createElement('div');
            wrapper.className = 'page-content-wrapper';

            if (pageInfo && pageInfo.isSectionDivider) {
                wrapper.innerHTML = `
                    <div class="section-divider">
                        <div class="section-divider-title">${pageInfo.sectionName || ''}</div>
                        <div class="section-divider-line"></div>
                    </div>
                `;
            } else if (htmlContent) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlContent;

                // Make titles link back to sommaire and append play buttons under them
                const titles = tempDiv.querySelectorAll('.song-title');
                const matchedAudioTitles = new Set();
                const matchedTitleElements = new Set();

                // First pass: match titles to audio map entries
                titles.forEach(titleElement => {
                    const titleText = titleElement.textContent.trim();
                    titleElement.title = "Retour au sommaire";
                    titleElement.addEventListener('click', () => {
                        scrollToId('sommaire');
                    });

                    // Add play button if the song has matching audio in the map
                    if (audioMap[i.toString()]) {
                        // Normalize string to match titles robustly (ignoring case, accents, and non-alphanumeric chars)
                        const cleanSongTitle = titleText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
                        
                        const songAudio = audioMap[i.toString()].find(aud => {
                            const cleanAudTitle = aud.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
                            return cleanAudTitle === cleanSongTitle || cleanSongTitle.includes(cleanAudTitle) || cleanAudTitle.includes(cleanSongTitle);
                        });

                        if (songAudio) {
                            matchedAudioTitles.add(songAudio.title);
                            matchedTitleElements.add(titleElement);
                            
                            if (songAudio.youtubeId !== 'NONE') {
                                const playContainer = document.createElement('div');
                                playContainer.className = 'song-play-container';

                                const btn = document.createElement('button');
                                btn.className = 'song-play-btn';
                                btn.innerHTML = `<span>▶</span> Écouter le chant`;
                                btn.onclick = (e) => {
                                    e.stopPropagation(); // Prevent returning to sommaire
                                    playAudio(songAudio.title, songAudio.youtubeId);
                                };

                                playContainer.appendChild(btn);
                                titleElement.parentNode.insertBefore(playContainer, titleElement.nextSibling);
                            }
                        }
                    }
                });

                // Second pass: for title elements that didn't match any audio, add a YouTube search button
                titles.forEach(titleElement => {
                    if (!matchedTitleElements.has(titleElement)) {
                        const titleText = titleElement.textContent.trim();
                        const playContainer = document.createElement('div');
                        playContainer.className = 'song-play-container';

                        const btn = document.createElement('button');
                        btn.className = 'song-play-btn search-btn';
                        btn.innerHTML = `<span>🔍</span> Rechercher sur YouTube`;
                        btn.onclick = (e) => {
                            e.stopPropagation();
                            const query = encodeURIComponent(`${titleText} Choeur Montjoie OR Sapiens OR Padres`);
                            window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
                        };

                        playContainer.appendChild(btn);
                        titleElement.parentNode.insertBefore(playContainer, titleElement.nextSibling);
                    }
                });

                // Fallback for any audio mapped to this page that didn't match a title element
                if (audioMap[i.toString()]) {
                    const unmatchedAudios = audioMap[i.toString()].filter(aud => !matchedAudioTitles.has(aud.title) && aud.youtubeId !== 'NONE');
                    unmatchedAudios.forEach(aud => {
                        const playContainer = document.createElement('div');
                        playContainer.className = 'song-play-container';

                        const btn = document.createElement('button');
                        btn.className = 'song-play-btn';
                        btn.innerHTML = `<span>▶</span> Écouter : ${aud.title}`;
                        btn.onclick = () => playAudio(aud.title, aud.youtubeId);

                        playContainer.appendChild(btn);
                        tempDiv.appendChild(playContainer);
                    });
                }

                wrapper.appendChild(tempDiv);
            }

            pageDiv.appendChild(wrapper);

            const pageFooter = document.createElement('div');
            pageFooter.className = 'page-number';
            pageFooter.textContent = i;
            pageDiv.appendChild(pageFooter);

            bookContainer.appendChild(pageDiv);
        }
    }

    function setupSearch() {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (!query) {
                searchResults.classList.add('hidden');
                return;
            }

            const filtered = songsIndex.filter(s => {
                const title = s.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                return title.includes(query) || s.page.toString() === query;
            });

            searchResults.innerHTML = '';
            if (filtered.length === 0) {
                const noRes = document.createElement('div');
                noRes.className = 'search-item';
                noRes.textContent = "Aucun résultat";
                searchResults.appendChild(noRes);
            } else {
                filtered.forEach(song => {
                    const item = document.createElement('div');
                    item.className = 'search-item';
                    
                    const titleDiv = document.createElement('div');
                    titleDiv.className = 'search-item-title';
                    titleDiv.textContent = song.title;

                    const pageDiv = document.createElement('div');
                    pageDiv.className = 'search-item-page';
                    pageDiv.textContent = `p.${song.page}`;

                    item.appendChild(titleDiv);
                    item.appendChild(pageDiv);

                    item.addEventListener('click', () => {
                        scrollToId(`page-${song.page}`);
                        searchResults.classList.add('hidden');
                        searchInput.value = '';
                    });

                    searchResults.appendChild(item);
                });
            }
            searchResults.classList.remove('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-bar')) {
                searchResults.classList.add('hidden');
            }
        });
    }

    function scrollToId(id) {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
            // Update URL hash without scrolling again
            if(history.pushState) {
                history.pushState(null, null, `#${id}`);
            } else {
                location.hash = `#${id}`;
            }
        }
    }

    function handleHashChange() {
        const hash = window.location.hash;
        if (hash) {
            const id = hash.replace('#', '');
            scrollToId(id);
        }
    }

    // --- Floating Controls & Column Switcher ---
    const floatingControls = document.getElementById('floating-controls');
    const currentSongTitle = document.getElementById('current-song-title');
    const floatingPlayBtn = document.getElementById('floating-play-btn');

    function setupFloatingControlsObserver() {
        const observerOptions = {
            root: bookContainer,
            threshold: 0.5
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    updateFloatingControls(entry.target);
                }
            });
        }, observerOptions);

        document.querySelectorAll('.page').forEach(page => {
            observer.observe(page);
        });
    }

    function updateFloatingControls(pageDiv) {
        if (!pageDiv) return;

        const songTitleEl = pageDiv.querySelector('.song-title');
        if (!songTitleEl) {
            floatingControls.classList.add('hidden-control');
            return;
        }

        const titleText = songTitleEl.textContent.trim();
        const pageId = pageDiv.id;
        const pageNum = pageId.replace('page-', '');

        // Find if this song has an audio match
        let songAudio = null;
        if (audioMap[pageNum]) {
            const cleanSongTitle = titleText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
            songAudio = audioMap[pageNum].find(aud => {
                const cleanAudTitle = aud.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
                return cleanAudTitle === cleanSongTitle || cleanSongTitle.includes(cleanAudTitle) || cleanAudTitle.includes(cleanSongTitle);
            });
        }

        currentSongTitle.textContent = titleText;
        floatingControls.classList.remove('hidden-control');

        if (songAudio) {
            floatingPlayBtn.innerHTML = `<span>▶</span> Écouter`;
            floatingPlayBtn.title = `Écouter ${titleText}`;
            floatingPlayBtn.onclick = (e) => {
                e.stopPropagation();
                playAudio(songAudio.title, songAudio.youtubeId);
            };
        } else {
            floatingPlayBtn.innerHTML = `<span>🔍</span> Rechercher`;
            floatingPlayBtn.title = `Rechercher ${titleText} sur YouTube`;
            floatingPlayBtn.onclick = (e) => {
                e.stopPropagation();
                const query = encodeURIComponent(`${titleText} Choeur Montjoie OR Sapiens OR Padres`);
                window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
            };
        }
    }

    function setupColumnSwitcher() {
        const colButtons = document.querySelectorAll('.col-btn');
        colButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                colButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const cols = btn.getAttribute('data-cols');
                bookContainer.classList.remove('book-cols-1', 'book-cols-2', 'book-cols-3');
                
                if (cols === '1') {
                    bookContainer.classList.add('book-cols-1');
                } else if (cols === '2') {
                    bookContainer.classList.add('book-cols-2');
                } else if (cols === '3') {
                    bookContainer.classList.add('book-cols-3');
                }
            });
        });
    }

    // --- Audio Player Logic (Modal) ---
    const modal = document.getElementById('youtube-modal');
    const modalTitle = document.getElementById('modal-title');
    const iframeContainer = document.getElementById('youtube-iframe-container');
    const closeModalBtn = document.getElementById('close-modal');

    window.playAudio = function(title, youtubeId) {
        modalTitle.textContent = title;
        
        // Clean up any existing external link in modal content first
        const existingLink = modal.querySelector('.modal-external-link');
        if (existingLink) {
            existingLink.remove();
        }

        if (window.location.protocol === 'file:') {
            // Local execution warning for YouTube embedding (Error 153)
            iframeContainer.innerHTML = `
                <div class="local-warning-container" style="
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    padding: 30px;
                    background: linear-gradient(135deg, #1e293b, #0f172a);
                    color: #f8fafc;
                    text-align: center;
                    border-radius: 8px;
                    box-sizing: border-box;
                ">
                    <div style="font-size: 40px; margin-bottom: 15px;">⚠️</div>
                    <h3 style="font-family: var(--font-title); font-size: 20px; margin-bottom: 10px; color: #f1f5f9;">Lecture locale bloquée (Erreur 153)</h3>
                    <p style="font-size: 14px; line-height: 1.5; color: #cbd5e1; max-width: 400px; margin-bottom: 25px;">
                        YouTube n'autorise pas la lecture de cette vidéo intégrée en mode hors-ligne local (protocole <code>file://</code>).
                    </p>
                    <a href="https://www.youtube.com/watch?v=${youtubeId}" target="_blank" class="local-redirect-btn" style="
                        background: linear-gradient(135deg, #e11d48, #be123c);
                        color: white;
                        text-decoration: none;
                        padding: 12px 24px;
                        border-radius: 25px;
                        font-weight: bold;
                        font-size: 15px;
                        box-shadow: 0 4px 15px rgba(225, 29, 72, 0.4);
                        transition: all 0.2s ease;
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                    " onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 20px rgba(225, 29, 72, 0.6)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 15px rgba(225, 29, 72, 0.4)';">
                        Regarder sur YouTube ↗
                    </a>
                </div>
            `;
        } else {
            iframeContainer.innerHTML = `
                <iframe 
                    width="100%" 
                    height="100%" 
                    src="https://yewtu.be/embed/${youtubeId}?autoplay=1" 
                    title="${title}" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                </iframe>
            `;

            // Add external link as a fallback
            const extLink = document.createElement('a');
            extLink.className = 'modal-external-link';
            extLink.href = `https://www.youtube.com/watch?v=${youtubeId}`;
            extLink.target = '_blank';
            extLink.textContent = 'Ouvrir sur YouTube ↗';
            extLink.style.cssText = `
                display: block;
                text-align: center;
                margin-top: 15px;
                font-size: 13.5px;
                color: var(--accent-color);
                text-decoration: none;
                font-weight: bold;
            `;
            extLink.onmouseover = () => extLink.style.textDecoration = 'underline';
            extLink.onmouseout = () => extLink.style.textDecoration = 'none';
            iframeContainer.parentNode.appendChild(extLink);
        }
        modal.classList.remove('hidden');
    };

    function cleanUpModal() {
        iframeContainer.innerHTML = '';
        const existingLink = modal.querySelector('.modal-external-link');
        if (existingLink) {
            existingLink.remove();
        }
        modal.classList.add('hidden');
    }

    closeModalBtn.addEventListener('click', cleanUpModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            cleanUpModal();
        }
    });

});
