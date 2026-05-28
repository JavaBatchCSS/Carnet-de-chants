import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Remove the existing nav and search bar
html = re.sub(r'<!-- Navigation principale -->\s*<nav class="wrap-nav".*?</nav>', '', html, flags=re.DOTALL)
html = re.sub(r'<!-- Barre de recherche fixe -->\s*<header class="search-bar">.*?</header>', '', html, flags=re.DOTALL)

# Insert the combined header after <body>
header_code = '''
    <div id="global-header">
        <!-- Navigation principale -->
        <nav class="wrap-nav" data-current-tab="" aria-label="Navigation principale">
          <div class="bar">
            <a class="tab" data-tab="accueil" href="https://sites.google.com/fsggb.fr/info/" target="_blank" rel="noopener">
              <span class="icon"><svg viewBox="0 0 24 24"><path d="M12 3.1 2.6 10.9l1.2 1.4L5 11.4V21h5.9v-5.4h2.2V21H19v-9.6l1.2.9 1.2-1.4z"/></svg></span>
              Accueil
            </a>
            <a class="tab" data-tab="archives" href="https://sites.google.com/fsggb.fr/archives" target="_blank" rel="noopener">
              <span class="icon"><svg viewBox="0 0 24 24"><path d="M3 5h18v5H3zm1.8 6.4h14.4V20H4.8zm3.1 2.5h8.2v1.9H7.9z"/></svg></span>
              Archives
            </a>
            <a class="tab active" data-tab="documentation" href="https://sites.google.com/fsggb.fr/documentation" target="_blank" rel="noopener">
              <span class="icon"><svg viewBox="0 0 24 24"><path d="M6 3h9l5 5v13H6zm8.2 1.9V8h3.1zM8.6 12h8v1.8h-8zm0 3.3h8v1.8h-8z"/></svg></span>
              Documentation
            </a>
            <div class="ext">
              <a class="tab" data-tab="ecole" href="https://www.saintjosephdescarmes.com/" target="_blank" rel="noopener">
                <img class="logo" src="https://static.wixstatic.com/media/c1f88d_ea9f645e9d5b4d5fb80744d1d2a43fbb~mv2.png/v1/fill/w_44,h_48,al_c,q_85,enc_avif,quality_auto/blason%20fond%20transparent_edited.png" alt="Logo école" loading="lazy" decoding="async" width="22" height="22">
                Site de l'école
              </a>
              <a class="tab" data-tab="federation" href="https://www.fsggb.fr/" target="_blank" rel="noopener">
                <img class="logo" src="https://lh3.googleusercontent.com/pw/AP1GczNBrfpjXkpFikCrTgKqBGB5MCIlU2fSS-lP45c-ID_UHqP3mad46USRfqCfzhE2JOVqt4RFVnNC8YI7zaskkyMTv8Zq28-xGaRh8cndsnmm9ZydS87qytOutC0ZYOpWlbBFKVQTRl_7G-W9Nv-JzvqJ=w299-h296-s-no-gm?authuser=0" alt="Logo Fédération" loading="lazy" decoding="async" width="22" height="22">
                Site de la Fédération
              </a>
            </div>
          </div>
        </nav>

        <!-- Barre de recherche -->
        <header class="search-bar">
            <div class="search-container">
                <input type="text" id="search-input" placeholder="Rechercher un chant ou une page...">
                <button id="search-btn">🔍</button>
            </div>
            <!-- Search Results (hidden by default) -->
            <div id="search-results" class="search-results hidden"></div>
        </header>
    </div>
'''

html = re.sub(r'<body>', f'<body>\\n{header_code}', html)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
