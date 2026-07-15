# -*- coding: utf-8 -*-
# Bundles index.html + style.css + catechism-data.js + app.js into a single
# self-contained HTML file that can be shared as an email/LINE attachment and
# opened directly on a phone (no server, no network needed).
import re

with open('index.html', encoding='utf-8') as f:
    html = f.read()
with open('style.css', encoding='utf-8') as f:
    css = f.read()
with open('catechism-data.js', encoding='utf-8') as f:
    data_js = f.read()
with open('app.js', encoding='utf-8') as f:
    app_js = f.read()

html = html.replace(
    '<link rel="stylesheet" href="style.css">',
    f'<style>\n{css}\n</style>'
)
html = html.replace(
    '<script src="catechism-data.js"></script>\n<script src="app.js"></script>',
    f'<script>\n{data_js}\n</script>\n<script>\n{app_js}\n</script>'
)

assert 'href="style.css"' not in html, 'stylesheet link not inlined'
assert 'src="catechism-data.js"' not in html, 'data script not inlined'
assert 'src="app.js"' not in html, 'app script not inlined'

out_name = 'ウェストミンスター小教理問答アプリ.html'
with open(out_name, 'w', encoding='utf-8') as f:
    f.write(html)

print('wrote', out_name, len(html), 'bytes')
