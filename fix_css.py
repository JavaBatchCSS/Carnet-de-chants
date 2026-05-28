import re

with open('style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Replace .two-columns flex with column-count
css = re.sub(
    r'\.two-columns, \.columns, \.two-column \{(.*?)\}',
    r'.two-columns, .columns, .two-column {\n    column-count: 2;\n    column-gap: 40px;\n    margin-top: 15px;\n    display: block;\n}',
    css, flags=re.DOTALL
)

css = re.sub(
    r'\.three-columns, \.three-column \{(.*?)\}',
    r'.three-columns, .three-column {\n    column-count: 3;\n    column-gap: 20px;\n    margin-top: 15px;\n    display: block;\n}',
    css, flags=re.DOTALL
)

with open('style.css', 'w', encoding='utf-8') as f:
    f.write(css)
print("CSS updated.")
