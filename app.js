function startCarnetApp() {
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

                // Make titles link back to sommaire only (audio stays in floating overlay)
                const titles = tempDiv.querySelectorAll('.song-title');
                titles.forEach(titleElement => {
                    const titleText = titleElement.textContent.trim();
                    const songAudio = findAudioForTitle(String(i), titleText);
                    const audioButton = document.createElement('button');
                    audioButton.type = 'button';
                    audioButton.className = songAudio ? 'inline-song-audio-btn' : 'inline-song-audio-btn search';
                    audioButton.textContent = songAudio ? '▶ Écouter' : '🔍 Audio';
                    audioButton.title = songAudio ? `Écouter ${titleText}` : `Rechercher ${titleText} sur YouTube`;
                    audioButton.addEventListener('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (songAudio) {
                            playAudio(songAudio.title, songAudio.youtubeId);
                        } else {
                            const query = encodeURIComponent(`${titleText} Choeur Montjoie OR Sapiens OR Padres`);
                            window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
                        }
                    });
                    titleElement.appendChild(audioButton);
                    titleElement.title = "Retour au sommaire";
                    titleElement.addEventListener('click', () => {
                        scrollToId('sommaire');
                    });
                });

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
    const floatingAudioPanel = document.getElementById('floating-audio-panel');

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

    function repairMojibake(value) {
        try {
            return decodeURIComponent(escape(value));
        } catch (e) {
            return value;
        }
    }

    function cleanTitle(value) {
        return (value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');
    }

    function titleVariants(value) {
        return Array.from(new Set([value, repairMojibake(value)].map(cleanTitle).filter(Boolean)));
    }

    function getSongTitleText(titleElement) {
        const clone = titleElement.cloneNode(true);
        clone.querySelectorAll('.inline-song-audio-btn').forEach(button => button.remove());
        return clone.textContent.trim();
    }

    function titlesMatch(pageTitle, audioTitle) {
        const pageVariants = titleVariants(pageTitle);
        const audioVariants = titleVariants(audioTitle);
        return pageVariants.some(pageValue =>
            audioVariants.some(audioValue =>
                pageValue === audioValue ||
                pageValue.includes(audioValue) ||
                audioValue.includes(pageValue)
            )
        );
    }

    function extractYoutubeId(value) {
        const raw = (value || '').trim();
        if (!raw || raw === 'NONE') return raw;
        const patterns = [
            /youtu\.be\/([A-Za-z0-9_-]{11})/,
            /youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})/,
            /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
            /[?&]v=([A-Za-z0-9_-]{11})/
        ];
        for (const pattern of patterns) {
            const match = raw.match(pattern);
            if (match) return match[1];
        }
        return raw;
    }

    function findAudioForTitle(pageNum, titleText) {
        const pageAudios = (audioMap[pageNum] || [])
            .filter(aud => aud.youtubeId && aud.youtubeId !== 'NONE');
        return pageAudios.find(aud => titlesMatch(titleText, aud.title)) || null;
    }

    function getYoutubeThumbnailUrl(youtubeId, quality = 'hqdefault') {
        const id = extractYoutubeId(youtubeId);
        if (!id || id === 'NONE') return '';
        return `https://img.youtube.com/vi/${id}/${quality}.jpg`;
    }

    function getYoutubeWatchUrl(youtubeId) {
        return `https://www.youtube.com/watch?v=${extractYoutubeId(youtubeId)}`;
    }

    function getYoutubeMusicUrl(youtubeId) {
        return `https://music.youtube.com/watch?v=${extractYoutubeId(youtubeId)}`;
    }

    let youtubeApiPromise = null;
    let currentYoutubePlayer = null;
    let youtubeProgressTimer = null;
    let isYoutubeSeeking = false;
    let currentPlayerUi = null;

    function ensureYoutubeIframeApi() {
        if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
        if (youtubeApiPromise) return youtubeApiPromise;

        youtubeApiPromise = new Promise((resolve, reject) => {
            const previousReady = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (typeof previousReady === 'function') previousReady();
                resolve(window.YT);
            };

            if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
                const script = document.createElement('script');
                script.src = 'https://www.youtube.com/iframe_api';
                script.async = true;
                script.onerror = () => reject(new Error('API YouTube indisponible'));
                document.head.appendChild(script);
            }
        });

        return youtubeApiPromise;
    }

    function destroyYoutubePlayer() {
        stopYoutubeProgressTimer();
        if (currentYoutubePlayer && typeof currentYoutubePlayer.destroy === 'function') {
            currentYoutubePlayer.destroy();
        }
        currentYoutubePlayer = null;
        currentPlayerUi = null;
    }

    function updateYoutubeControlState(button, status, stateLabel, isPlaying) {
        button.disabled = false;
        button.textContent = isPlaying ? '⏸' : '▶';
        button.setAttribute('aria-label', isPlaying ? 'Mettre en pause' : 'Reprendre la lecture');
        button.title = isPlaying ? 'Mettre en pause' : 'Reprendre la lecture';
        if (status) status.textContent = stateLabel;
    }

    function stopYoutubeProgressTimer() {
        if (youtubeProgressTimer) {
            clearInterval(youtubeProgressTimer);
            youtubeProgressTimer = null;
        }
    }

    function formatYoutubeTime(value) {
        const seconds = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
        const mins = Math.floor(seconds / 60);
        const secs = String(seconds % 60).padStart(2, '0');
        return `${mins}:${secs}`;
    }

    function updateYoutubeTimeline() {
        if (!currentYoutubePlayer || !currentPlayerUi || isYoutubeSeeking) return;
        if (typeof currentYoutubePlayer.getCurrentTime !== 'function' || typeof currentYoutubePlayer.getDuration !== 'function') return;

        const duration = currentYoutubePlayer.getDuration() || 0;
        const currentTime = currentYoutubePlayer.getCurrentTime() || 0;
        const { timeline, currentTimeEl, durationEl } = currentPlayerUi;

        timeline.disabled = duration <= 0;
        timeline.max = duration > 0 ? String(Math.floor(duration)) : '0';
        timeline.value = duration > 0 ? String(Math.min(Math.floor(currentTime), Math.floor(duration))) : '0';
        currentTimeEl.textContent = formatYoutubeTime(currentTime);
        durationEl.textContent = duration > 0 ? formatYoutubeTime(duration) : '--:--';
    }

    function startYoutubeProgressTimer() {
        stopYoutubeProgressTimer();
        updateYoutubeTimeline();
        youtubeProgressTimer = setInterval(updateYoutubeTimeline, 500);
    }

    function createHiddenYoutubePlayer(youtubeId, host, playPauseButton, stopButton, status, timelineUi) {
        destroyYoutubePlayer();
        currentPlayerUi = timelineUi;

        const playerId = `youtube-hidden-player-${Date.now()}`;
        const playerMount = document.createElement('div');
        playerMount.id = playerId;
        host.innerHTML = '';
        host.appendChild(playerMount);

        playPauseButton.disabled = true;
        stopButton.disabled = true;
        if (currentPlayerUi?.skipAdButton) currentPlayerUi.skipAdButton.disabled = true;
        if (status) status.textContent = 'Chargement YouTube...';

        ensureYoutubeIframeApi()
            .then((YT) => {
                currentYoutubePlayer = new YT.Player(playerId, {
                    width: '200',
                    height: '120',
                    videoId: youtubeId,
                    playerVars: {
                        autoplay: 1,
                        controls: 0,
                        disablekb: 0,
                        enablejsapi: 1,
                        fs: 0,
                        iv_load_policy: 3,
                        modestbranding: 1,
                        playsinline: 1,
                        rel: 0
                    },
                    events: {
                        onReady: (event) => {
                            stopButton.disabled = false;
                            if (currentPlayerUi?.skipAdButton) currentPlayerUi.skipAdButton.disabled = false;
                            updateYoutubeControlState(playPauseButton, status, 'Lecture YouTube', true);
                            event.target.playVideo();
                            startYoutubeProgressTimer();
                        },
                        onStateChange: (event) => {
                            if (!window.YT || !window.YT.PlayerState) return;
                            if (event.data === window.YT.PlayerState.PLAYING) {
                                updateYoutubeControlState(playPauseButton, status, 'Lecture YouTube', true);
                                startYoutubeProgressTimer();
                            } else if (event.data === window.YT.PlayerState.PAUSED) {
                                updateYoutubeControlState(playPauseButton, status, 'En pause', false);
                            } else if (event.data === window.YT.PlayerState.ENDED) {
                                updateYoutubeControlState(playPauseButton, status, 'Terminé', false);
                                stopYoutubeProgressTimer();
                                updateYoutubeTimeline();
                            }
                        },
                        onError: () => {
                            playPauseButton.disabled = true;
                            stopButton.disabled = true;
                            if (currentPlayerUi?.skipAdButton) currentPlayerUi.skipAdButton.disabled = true;
                            if (status) status.textContent = 'Lecture intégrée indisponible';
                        }
                    }
                });
            })
            .catch(() => {
                playPauseButton.disabled = true;
                stopButton.disabled = true;
                if (currentPlayerUi?.skipAdButton) currentPlayerUi.skipAdButton.disabled = true;
                if (status) status.textContent = 'API YouTube indisponible';
            });
    }

    function updateFloatingControls(pageDiv) {
        if (!pageDiv) return;

        const songTitleEls = Array.from(pageDiv.querySelectorAll('.song-title'));
        if (songTitleEls.length === 0) {
            if (currentYoutubePlayer || (floatingAudioPanel && !floatingAudioPanel.classList.contains('hidden'))) {
                floatingControls.classList.remove('hidden-control');
            } else {
                floatingControls.classList.add('hidden-control');
            }
            return;
        }

        const pageId = pageDiv.id;
        const pageNum = pageId.replace('page-', '');
        const songsOnPage = songTitleEls.map(titleEl => {
            const title = getSongTitleText(titleEl);
            return {
                title,
                audio: findAudioForTitle(pageNum, title)
            };
        });

        if (songsOnPage.length > 1) {
            currentSongTitle.classList.add('multi-song');
            currentSongTitle.innerHTML = '';
            floatingPlayBtn.style.display = 'none';
            const list = document.createElement('div');
            list.className = 'floating-song-list';
            songsOnPage.forEach(song => {
                const row = document.createElement('div');
                row.className = 'floating-song-row';
                const label = document.createElement('span');
                label.className = 'floating-song-label';
                label.textContent = song.title;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = song.audio ? 'floating-song-btn' : 'floating-song-btn search';
                btn.textContent = song.audio ? 'Écouter' : 'Rechercher';
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (song.audio) {
                        playAudio(song.audio.title, song.audio.youtubeId);
                    } else {
                        const query = encodeURIComponent(`${song.title} Choeur Montjoie OR Sapiens OR Padres`);
                        window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
                    }
                });
                row.appendChild(label);
                row.appendChild(btn);
                list.appendChild(row);
            });
            currentSongTitle.appendChild(list);
            floatingControls.classList.remove('hidden-control');
            return;
        }

        currentSongTitle.classList.remove('multi-song');
        floatingPlayBtn.style.display = 'inline-flex';
        const titleText = songsOnPage[0].title;
        const songAudio = songsOnPage[0].audio;

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

    // --- Audio link panel logic (no embedded video in the carnet) ---
    window.playAudio = function(title, youtubeId) {
        youtubeId = extractYoutubeId(youtubeId);
        if (!youtubeId || youtubeId === 'NONE' || !floatingAudioPanel) return;

        const summary = document.createElement('div');
        summary.className = 'floating-audio-summary';

        const thumbnailLink = document.createElement('a');
        thumbnailLink.className = 'floating-audio-thumb-link';
        thumbnailLink.href = getYoutubeMusicUrl(youtubeId);
        thumbnailLink.target = '_blank';
        thumbnailLink.rel = 'noopener';
        thumbnailLink.title = 'Le chant sur YouTube Music';

        const thumbnail = document.createElement('img');
        thumbnail.className = 'floating-audio-thumb';
        thumbnail.src = getYoutubeThumbnailUrl(youtubeId);
        thumbnail.alt = `Miniature ${title}`;
        thumbnail.loading = 'lazy';
        thumbnail.decoding = 'async';
        thumbnail.onerror = () => {
            thumbnail.onerror = null;
            thumbnail.src = getYoutubeThumbnailUrl(youtubeId, 'mqdefault');
        };
        thumbnailLink.appendChild(thumbnail);

        const meta = document.createElement('div');
        meta.className = 'floating-audio-meta';

        const panelTitle = document.createElement('div');
        panelTitle.className = 'floating-audio-title';
        panelTitle.textContent = title;

        const actions = document.createElement('div');
        actions.className = 'floating-audio-actions';

        const musicLink = document.createElement('a');
        musicLink.className = 'floating-audio-link primary';
        musicLink.href = getYoutubeMusicUrl(youtubeId);
        musicLink.target = '_blank';
        musicLink.rel = 'noopener';
        musicLink.textContent = 'YouTube Music';
        musicLink.title = 'Le chant sur YouTube Music';

        const youtubeLink = document.createElement('a');
        youtubeLink.className = 'floating-audio-link';
        youtubeLink.href = getYoutubeWatchUrl(youtubeId);
        youtubeLink.target = '_blank';
        youtubeLink.rel = 'noopener';
        youtubeLink.textContent = 'YouTube';
        youtubeLink.title = 'Ouvrir le chant sur YouTube';

        actions.appendChild(musicLink);
        actions.appendChild(youtubeLink);
        meta.appendChild(panelTitle);
        meta.appendChild(actions);
        summary.appendChild(thumbnailLink);
        summary.appendChild(meta);

        const controlStrip = document.createElement('div');
        controlStrip.className = 'youtube-control-strip';

        const playPauseButton = document.createElement('button');
        playPauseButton.type = 'button';
        playPauseButton.className = 'youtube-control-btn youtube-icon-btn primary';
        playPauseButton.textContent = '▶';
        playPauseButton.title = 'Lecture';
        playPauseButton.setAttribute('aria-label', 'Lecture');

        const stopButton = document.createElement('button');
        stopButton.type = 'button';
        stopButton.className = 'youtube-control-btn youtube-icon-btn';
        stopButton.textContent = '■';
        stopButton.title = 'Stop';
        stopButton.setAttribute('aria-label', 'Stop');

        const skipAdButton = document.createElement('button');
        skipAdButton.type = 'button';
        skipAdButton.className = 'youtube-control-btn youtube-icon-btn youtube-skip-btn';
        skipAdButton.textContent = '⏭';
        skipAdButton.title = 'Passer la pub : stopper et relancer la lecture';
        skipAdButton.setAttribute('aria-label', 'Passer la pub : stopper et relancer la lecture');
        skipAdButton.disabled = true;

        const youtubeExternalLink = document.createElement('a');
        youtubeExternalLink.className = 'youtube-control-btn youtube-icon-btn youtube-youtube-link';
        youtubeExternalLink.href = getYoutubeWatchUrl(youtubeId);
        youtubeExternalLink.target = '_blank';
        youtubeExternalLink.rel = 'noopener';
        youtubeExternalLink.title = 'Lire sur YouTube';
        youtubeExternalLink.setAttribute('aria-label', 'Lire sur YouTube');
        youtubeExternalLink.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M21.6 7.2a3 3 0 0 0-2.1-2.1C17.7 4.6 12 4.6 12 4.6s-5.7 0-7.5.5a3 3 0 0 0-2.1 2.1A31 31 0 0 0 2 12a31 31 0 0 0 .4 4.8 3 3 0 0 0 2.1 2.1c1.8.5 7.5.5 7.5.5s5.7 0 7.5-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 22 12a31 31 0 0 0-.4-4.8z"></path>
                <path d="M10 15.5v-7l6 3.5-6 3.5z"></path>
            </svg>
        `;

        const timelineWrap = document.createElement('div');
        timelineWrap.className = 'youtube-timeline-wrap';

        const currentTimeEl = document.createElement('span');
        currentTimeEl.className = 'youtube-time';
        currentTimeEl.textContent = '0:00';

        const timeline = document.createElement('input');
        timeline.type = 'range';
        timeline.className = 'youtube-timeline';
        timeline.min = '0';
        timeline.max = '0';
        timeline.step = '1';
        timeline.value = '0';
        timeline.disabled = true;
        timeline.title = 'Se déplacer dans le chant';
        timeline.setAttribute('aria-label', 'Timeline du chant');

        const durationEl = document.createElement('span');
        durationEl.className = 'youtube-time';
        durationEl.textContent = '--:--';

        timelineWrap.appendChild(currentTimeEl);
        timelineWrap.appendChild(timeline);
        timelineWrap.appendChild(durationEl);

        const status = document.createElement('span');
        status.className = 'youtube-control-status';
        status.textContent = 'YouTube';

        const hiddenPlayerHost = document.createElement('div');
        hiddenPlayerHost.className = 'youtube-hidden-player-host';

        playPauseButton.addEventListener('click', () => {
            if (!currentYoutubePlayer || !window.YT || !window.YT.PlayerState) return;
            const state = currentYoutubePlayer.getPlayerState();
            if (state === window.YT.PlayerState.PLAYING) {
                currentYoutubePlayer.pauseVideo();
            } else {
                currentYoutubePlayer.playVideo();
            }
        });

        stopButton.addEventListener('click', () => {
            if (!currentYoutubePlayer) return;
            currentYoutubePlayer.stopVideo();
            updateYoutubeControlState(playPauseButton, status, 'Arrêté', false);
            stopYoutubeProgressTimer();
            updateYoutubeTimeline();
        });

        skipAdButton.addEventListener('click', () => {
            if (!currentYoutubePlayer) return;

            skipAdButton.disabled = true;
            stopYoutubeProgressTimer();
            if (status) status.textContent = 'Relance YouTube...';

            try {
                if (typeof currentYoutubePlayer.stopVideo === 'function') {
                    currentYoutubePlayer.stopVideo();
                }
            } catch (e) {}

            setTimeout(() => {
                if (!currentYoutubePlayer) return;

                if (typeof currentYoutubePlayer.loadVideoById === 'function') {
                    currentYoutubePlayer.loadVideoById({ videoId: youtubeId, startSeconds: 0 });
                } else {
                    createHiddenYoutubePlayer(youtubeId, hiddenPlayerHost, playPauseButton, stopButton, status, {
                        timeline,
                        currentTimeEl,
                        durationEl,
                        skipAdButton
                    });
                    return;
                }

                if (typeof currentYoutubePlayer.playVideo === 'function') {
                    currentYoutubePlayer.playVideo();
                }
                skipAdButton.disabled = false;
                updateYoutubeControlState(playPauseButton, status, 'Lecture YouTube', true);
                startYoutubeProgressTimer();
            }, 250);
        });

        timeline.addEventListener('input', () => {
            isYoutubeSeeking = true;
            currentTimeEl.textContent = formatYoutubeTime(Number(timeline.value));
        });

        timeline.addEventListener('change', () => {
            if (currentYoutubePlayer && typeof currentYoutubePlayer.seekTo === 'function') {
                currentYoutubePlayer.seekTo(Number(timeline.value), true);
                currentYoutubePlayer.playVideo();
            }
            isYoutubeSeeking = false;
            updateYoutubeTimeline();
        });

        controlStrip.appendChild(playPauseButton);
        controlStrip.appendChild(stopButton);
        controlStrip.appendChild(timelineWrap);
        controlStrip.appendChild(skipAdButton);
        controlStrip.appendChild(youtubeExternalLink);
        controlStrip.appendChild(status);
        controlStrip.appendChild(hiddenPlayerHost);

        floatingAudioPanel.innerHTML = '';
        floatingAudioPanel.appendChild(summary);
        floatingAudioPanel.appendChild(controlStrip);
        floatingAudioPanel.classList.remove('hidden');
        floatingControls.classList.remove('hidden-control');

        createHiddenYoutubePlayer(youtubeId, hiddenPlayerHost, playPauseButton, stopButton, status, {
            timeline,
            currentTimeEl,
            durationEl,
            skipAdButton
        });
    };

}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startCarnetApp);
} else {
    startCarnetApp();
}


// --- Navigation Top Bar Logic ---
!function(){
  var w=document.querySelector(".wrap-nav"),b=document.querySelector(".bar");
  if(!w||!b)return;
  var cur=(w.getAttribute("data-current-tab")||new URLSearchParams(location.search).get("tab")||"documentation").toLowerCase();
  if(!b.querySelector(".tab.active"))
    b.querySelector(".tab[data-tab='"+cur+"']")?.classList.add("active");
  function fit(){
    b.style.transform="scale(1)";
    var pw=(w.parentElement||w).clientWidth||w.clientWidth;
    var s=Math.min(1,pw/b.scrollWidth);
    b.style.transform="scale("+s.toFixed(4)+")";
    w.style.height=Math.ceil(b.offsetHeight*s)+"px";
  }
  fit();
  window.addEventListener("resize",fit);
  if(window.ResizeObserver)new ResizeObserver(fit).observe(w.parentElement||w);
}();


// --- Keyboard Navigation (Left/Right Arrows) ---
document.addEventListener('keydown', function(e) {
    // Ne pas interférer si l'utilisateur tape dans la barre de recherche
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const container = document.getElementById('book-container');
        if (!container) return;
        
        const pages = Array.from(document.querySelectorAll('.page'));
        if (pages.length === 0) return;
        
        // Find the page currently most visible or at the top
        let currentPageIndex = 0;
        let minDistance = Infinity;
        
        const containerRect = container.getBoundingClientRect();
        
        pages.forEach((page, index) => {
            const rect = page.getBoundingClientRect();
            // Distance from the top of the container
            const distance = Math.abs(rect.top - containerRect.top);
            if (distance < minDistance) {
                minDistance = distance;
                currentPageIndex = index;
            }
        });
        
        let targetIndex = currentPageIndex;
        if (e.key === 'ArrowRight') {
            targetIndex = Math.min(currentPageIndex + 1, pages.length - 1);
        } else if (e.key === 'ArrowLeft') {
            targetIndex = Math.max(currentPageIndex - 1, 0);
        }
        
        if (targetIndex !== currentPageIndex) {
            e.preventDefault(); // Prevent default scrolling
            pages[targetIndex].scrollIntoView({ behavior: 'smooth' });
        }
    }
});
