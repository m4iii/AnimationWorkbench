"""Check the publishable file set and empty public UI without reading private files."""
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], cwd=ROOT, text=True).splitlines()
for name in files:
    parts = Path(name).parts
    assert not any(p in {'.runtime', '.codex', '.aws', '__pycache__', 'backups', 'uploads', 'downloads'} for p in parts), name
    assert not name.endswith(('.pem', '.key', '.awb', '.log')), name
    assert Path(name).name not in {'token.txt', '.env', 'auth.json', 'credentials.json'}, name
    if Path(name).suffix in {'.py', '.js', '.cjs', '.json', '.html', '.md', '.yml', '.txt'}:
        text = (ROOT / name).read_text(encoding='utf-8')
        assert not re.search(r'gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{32,}|-----BEGIN [A-Z ]*PRIVATE KEY-----', text), name
html = (ROOT / 'AnimationWorkbench.html').read_text(encoding='utf-8')
media = re.search(r'<script id="sample-media" type="application/json">(.*?)</script>', html, re.S)
assert media and json.loads(media.group(1)) == {}, 'Public UI must not embed reference artwork'
version = (ROOT / 'VERSION').read_text().strip()
assert re.fullmatch(r'\d+\.\d+\.\d+', version), 'VERSION must contain a semantic version'
assert f'## v{version} ' in (ROOT / 'CHANGELOG.md').read_text(encoding='utf-8')
assert (ROOT / 'frontend/vendor/lucide/LICENSE').is_file()
print(f'Public release checks passed for {len(files)} non-ignored files.')
