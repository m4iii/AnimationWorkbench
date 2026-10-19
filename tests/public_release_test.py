"""Check the publishable file set and empty public UI without reading private files."""
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], cwd=ROOT, text=True).splitlines()
for name in files:
    parts = {p.lower() for p in Path(name).parts}
    private_dirs = {'.runtime', 'runtime', '.codex', '.aws', '__pycache__',
                    'backups', 'uploads', 'downloads', 'assets', 'artifacts',
                    'jobs', 'private', 'media-assets', 'materials', 'test-assets',
                    'unicorn-overlord', 'cache', '.cache', 'tmp', 'temp'}
    assert not parts & private_dirs, name
    assert not any(p.endswith('-backup') for p in parts), name
    # All distributed raster/video inputs must be generated, never game assets.
    assert Path(name).suffix.lower() not in {'.png', '.jpg', '.jpeg', '.gif',
        '.webp', '.bmp', '.tif', '.tiff', '.mp4', '.mov', '.webm', '.avi',
        '.zip', '.7z', '.rar'}, name
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

# Check ignore rules without writing files; --no-index also catches future
# accidental tracking (the file-list audit above rejects already tracked data).
ignored_samples = [
    'media-assets/game.png', 'materials/game.gif', 'test-assets/frames.zip',
    'unicorn-overlord/sprite.webp', '.runtime/token.txt', 'runtime/jobs/task.json',
    'cache/preview.png', '.cache/preview.png', 'tmp/output.txt', 'temp/output.txt',
    'uploads/source.png', 'artifacts/result.png', 'jobs/task.json',
    'backups/source.py', 'work-backup/source.py', '.env', 'auth.json',
    'tests/fixtures/geometric-motion.mp4', 'nested/media-assets/game.png',
]
for sample in ignored_samples:
    result = subprocess.run(['git', 'check-ignore', '--no-index', '-q', sample], cwd=ROOT)
    assert result.returncode == 0, f'Missing ignore rule: {sample}'
for source in ['backend/server.py', 'frontend/backend-client.js',
               'scripts/generate_sample_media.py', 'tests/backend_test.py']:
    result = subprocess.run(['git', 'check-ignore', '--no-index', '-q', source], cwd=ROOT)
    assert result.returncode == 1, f'Source unexpectedly ignored: {source}'
print('Private material/runtime ignore rules verified.')
