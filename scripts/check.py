"""Rebuild and run local regression checks. Never invokes a real model."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

def run(*command):
    subprocess.run(command, cwd=ROOT, check=True)

run(sys.executable, 'scripts/generate_sample_media.py')
run(sys.executable, 'build_frontend.py')
run(sys.executable, 'tests/check_bundle.py')
# Own JavaScript suite discovery here so each suite runs exactly once.
for test in sorted((ROOT / 'tests').glob('*.cjs')):
    run('node', str(test))
run(sys.executable, 'tests/backend_test.py')
run(sys.executable, 'tests/public_release_test.py')
print('All build, JavaScript, bundle and backend checks passed (no real model calls).')
