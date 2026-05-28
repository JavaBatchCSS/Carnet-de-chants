with open('style.css', 'a', encoding='utf-8') as f:
    f.write('''
/* --- Navigation Top Bar --- */
.wrap-nav {width:100%;overflow:hidden;margin-bottom:20px;}
.bar {display:flex;align-items:center;flex-wrap:nowrap;gap:8px;width:max-content;min-width:100%;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:linear-gradient(180deg,#334167,#2a3452);box-shadow:0 8px 18px rgba(9,12,22,.22);transform-origin:left top}
.tab {display:inline-flex;align-items:center;gap:9px;padding:9px 13px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#edf1ff;text-decoration:none;font-weight:700;font-size:.85rem;white-space:nowrap}
.tab:hover {background:rgba(255,255,255,.14)}
.tab.active {background:#f4f7ff;color:#1f2944;border-color:rgba(34,44,69,.2);box-shadow:0 4px 12px rgba(6,11,24,.2)}
.icon {width:22px;height:22px;border-radius:6px;background:rgba(255,255,255,.1);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.tab.active .icon {background:rgba(34,44,69,.12)}
.icon svg {width:13px;height:13px;fill:currentColor}
.logo {width:22px;height:22px;padding:2px;border-radius:6px;object-fit:contain;background:#fff;flex-shrink:0}
.ext {margin-left:auto;padding-left:12px;border-left:1px solid rgba(255,255,255,.25);display:flex;gap:8px}
''')
