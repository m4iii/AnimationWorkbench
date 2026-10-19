"""Fetch the explicitly selected Lucide source SVGs and their license."""
from pathlib import Path
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json

DEST = Path(__file__).resolve().parent / 'frontend/vendor/lucide'
BASE = 'https://raw.githubusercontent.com/lucide-icons/lucide/main/'
NAMES = ['clapperboard', 'images', 'grid-2x2', 'film', 'save', 'download',
         'ellipsis', 'folder-open', 'settings-2', 'sliders-horizontal', 'copy',
         'sparkles', 'wand-sparkles', 'image-plus', 'trash', 'square-dashed',
         'bookmark', 'bookmark-x', 'arrow-left', 'arrow-right', 'x', 'play',
         'pause', 'scan', 'plus', 'check', 'rotate-ccw', 'file-code', 'info',
         'logs', 'layers', 'chevron-down']

def fetch(name):
    remote = 'LICENSE' if name == 'LICENSE' else 'icons/' + name + '.svg'
    target = DEST / ('LICENSE' if name == 'LICENSE' else name + '.svg')
    if target.exists():
        data = target.read_bytes()
    else:
        try:
            with urlopen(Request(BASE + remote, headers={'User-Agent': 'AnimationWorkbench-asset-fetch'}), timeout=25) as response:
                data = response.read()
        except Exception as error:
            print(name + ': ' + str(error), flush=True)
            return None
    if name != 'LICENSE' and b'<svg' not in data:
        raise ValueError('Invalid SVG: ' + name)
    target.write_bytes(data)
    return {'file': target.name, 'source': BASE + remote, 'sha256': hashlib.sha256(data).hexdigest()}

if __name__ == '__main__':
    DEST.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        records = list(pool.map(fetch, NAMES + ['LICENSE']))
    records = [record for record in records if record]
    (DEST / 'sources.json').write_text(json.dumps({'project': 'Lucide', 'downloaded': '2026-10-15', 'files': records}, indent=2), encoding='utf-8')
    print(json.dumps({'downloaded': len(records), 'directory': str(DEST)}))

