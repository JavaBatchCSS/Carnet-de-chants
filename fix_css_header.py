import re

with open('style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Make global-header fixed
css += '''
#global-header {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    z-index: 1000;
    background-color: var(--accent-color);
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    display: flex;
    flex-direction: column;
}
'''

# Remove position fixed from search-bar
css = re.sub(
    r'\.search-bar \{(.*?)\}',
    r'.search-bar {\n    width: 100%;\n    background-color: var(--accent-color);\n    padding: 12px 20px;\n    display: flex;\n    flex-direction: column;\n    align-items: center;\n}',
    css, flags=re.DOTALL
)

# Increase book-container padding
css = re.sub(
    r'padding-top: 80px; /\* search bar height \+ padding \*/',
    r'padding-top: 140px; /* global header height + padding */',
    css
)

with open('style.css', 'w', encoding='utf-8') as f:
    f.write(css)
print('Fixed CSS header')
