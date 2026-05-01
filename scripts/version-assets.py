#!/usr/bin/env python3
"""
version-assets.py — تحديث الـ ?v=hash في index.html بعد كل تعديل على JS/CSS
الاستخدام: python3 scripts/version-assets.py
"""
import hashlib, re, os, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(BASE, 'public/dashboard/index.html')

with open(HTML, 'r') as f:
    content = f.read()

def hash_file(path):
    try:
        with open(path, 'rb') as f:
            return hashlib.md5(f.read()).hexdigest()[:8]
    except:
        return 'xxxxxxxx'

# نحدّث كل ?v= في الـ HTML
def replace_version(m):
    path = m.group(1)
    file_path = os.path.join(BASE, 'public' + path)
    new_hash = hash_file(file_path)
    return m.group(0).replace(m.group(2), new_hash)

updated = re.sub(
    r'(?:href|src)="(/dashboard/(?:js|css)/[^"?]+)\?v=([a-f0-9]+)"',
    replace_version,
    content
)

with open(HTML, 'w') as f:
    f.write(updated)

print('✅ Asset versions updated in index.html')
