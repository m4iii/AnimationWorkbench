"""Generate tiny synthetic PNG examples deterministically; no external artwork."""
from pathlib import Path
import binascii
import struct
import hashlib
import json

ROOT = Path(__file__).resolve().parent

def png(width, height, pixels):
    raw = b''.join(b'\0' + pixels[y * width * 4:(y + 1) * width * 4] for y in range(height))
    # A single uncompressed DEFLATE block gives stable bytes across library versions.
    length = len(raw)
    a, b = 1, 0
    for byte in raw:
        a = (a + byte) % 65521
        b = (b + a) % 65521
    data = b'\x78\x01\x01' + struct.pack('<HH', length, 65535 - length) + raw + struct.pack('>I', (b << 16) | a)
    def chunk(kind, value):
        return struct.pack('>I', len(value)) + kind + value + struct.pack('>I', binascii.crc32(kind + value) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) + chunk(b'IDAT', data) + chunk(b'IEND', b'')

red, blue = bytes((220, 80, 70, 255)), bytes((60, 140, 230, 255))
for name, width, pixels in [('frame_0000.png', 3, red * 12), ('frame_0001.png', 3, blue * 12), ('example-atlas.png', 6, (red * 3 + blue * 3) * 4)]:
    (ROOT / name).write_bytes(png(width, 4, pixels))
expected = json.loads((ROOT / 'custom-animation.json').read_text(encoding='utf-8'))['assets']['example']['sourceImage']['sha256']
actual = hashlib.sha256((ROOT / 'example-atlas.png').read_bytes()).hexdigest()
if actual != expected:
    raise RuntimeError(f'Example JSON hash mismatch: generated {actual}')
print('Generated 3 synthetic example PNGs; manifest SHA-256 verified.')
