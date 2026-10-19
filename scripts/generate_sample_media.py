"""Generate geometric fixtures without external artwork (FFmpeg required)."""
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'tests/fixtures'

def main():
    DEST.mkdir(exist_ok=True)
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ffmpeg, '-v', 'error', '-f', 'lavfi', '-i',
                    'testsrc2=size=256x256:rate=30:duration=6.4', '-frames:v', '192',
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                    '-y', str(DEST / 'geometric-motion.mp4')], check=True)

if __name__ == '__main__':
    main()
