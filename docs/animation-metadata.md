# Animation frame metadata

Animation JSON records a sequence and its per-occurrence timing. It does not embed
images, upload media, or download referenced filenames. Import the original image
sequence first, or load and split the original sprite sheet, then import its JSON.
Keep personal assets outside the repository.

## Version 1

```json
{
  "schema": "animation-workbench",
  "version": 1,
  "defaultFps": 12,
  "assets": [
    { "id": "A", "fileName": "synthetic-a.png" },
    { "id": "B", "fileName": "synthetic-b.png" }
  ],
  "frames": [
    { "id": "occurrence-1", "frameRef": "A", "durationMs": 33 },
    { "id": "occurrence-2", "frameRef": "B", "durationMs": 75.5 },
    { "id": "occurrence-3", "frameRef": "A", "durationMs": 150 }
  ]
}
```

This synthetic A, B, A example has two distinct assets and three ordered
occurrences. Total duration is 258.5 ms. Repeated references are retained; neither
order nor duration is deduplicated.

- `schema` and `version` are required and must exactly match the example.
- `defaultFps` is a required finite number from 1 to 60.
- `assets` and `frames` are required arrays, each limited to 200 entries. Empty
  arrays are valid metadata; every declared asset still needs a loaded match when
  resolving an import.
- An asset's `id` is unique within `assets`. An occurrence's `id` is unique within
  `frames`. IDs have 1–100 ASCII characters, begin with a letter or digit, and
  otherwise contain only letters, digits, `_`, `-`, `.`, and `:`.
- `fileName` is the source file's basename, limited to 300 characters. Paths, URLs,
  control characters, empty names, `.` and `..` are rejected. Sheet cells refer to
  the sheet filename, not a generated cell label.
- An optional `crop` contains `x`, `y`, `width`, and `height` in source pixels.
  Coordinates must be finite and nonnegative; dimensions must be finite and
  positive. Each value is at most 10,000,000. An origin of zero is valid.
- Optional `contentFingerprint` is a 64-hex-digit SHA-256 value, optionally
  prefixed by `WIDTHxHEIGHT:` with positive integer dimensions of up to eight
  digits. The application's fingerprint hashes original-resolution decoded RGBA
  pixels and includes the dimensions. Fingerprints are normalized to lowercase.
- `frameRef` must match a declared asset ID.
- `durationMs` is a positive finite number at most 3,600,000, with fractional
  milliseconds allowed. If omitted, it is filled from `defaultFps`. Invalid
  explicit values are rejected rather than silently replaced.
- Unknown fields are ignored. This format contains no executable instructions.

## Resolution and safety

Validation finishes before any imported sequence is returned. Malformed metadata,
duplicate IDs, dangling references, missing loaded assets, and ambiguous filename
matches fail without mutating the document or the existing frames.

When a fingerprint is supplied, a loaded frame must match it. Otherwise the source
filename and crop must match exactly. Multiple occurrences from the same loaded
source/crop are equivalent; two separately loaded sources with the same filename
are ambiguous without a fingerprint. Identical fingerprints may legitimately
match several loaded occurrences. Filenames are never fetched or evaluated.

Resolved occurrences copy an existing image or sheet frame, keeping its local URL,
source locator, dimensions, and other application properties. Imported occurrence
IDs and explicit durations replace the corresponding values in the copy. The editor retains an existing occurrence ID only when its asset is unchanged; otherwise it assigns a new local ID to prevent older generated results from attaching to another image. Crops
and locators are copied to avoid aliasing their mutable properties. Loading a
video alone does not satisfy an image/sheet asset reference.

## JavaScript API

`frontend/animation-metadata.js` exports `AnimationMetadata` in the browser and
`module.exports` in Node:

- `clean(value)` returns a canonical validated document, throwing on invalid input.
- `fromFrames(frames, sources, defaultFps, identityMap)` exports ordered local
  frames. A map entry's `referenceId` selects the representative asset. It uses
  explicit `durationMs`, then a positive legacy duration in seconds, then the
  default frame rate. Invalid internal fingerprints are omitted.
- `resolve(value, frames, sources)` returns `{metadata, frames}` after validation
  and local asset matching. The caller applies the result atomically.
- `timing(frames, defaultFps)` returns `{fps, count, duration, times}`. `fps` is the
  configured fallback rate, not an average inferred from variable durations.
  `duration` and the ordered start `times` are in seconds. Timing uses positive
  explicit `durationMs` or the fallback rate; it intentionally ignores legacy
  `duration`, which the editor may recalculate for display compatibility.

Timing accumulates milliseconds without rounding each frame to a nominal FPS.
For example, 60 occurrences of 33 ms last exactly 1.98 seconds, even if the default
frame rate is 30 FPS. Legacy saved-workspace durations should be migrated explicitly
before using the timing helper.

Run the focused synthetic regression suite with:

```sh
node tests/animation-metadata.cjs
```

The visible FPS editor is temporarily hidden while its final placement is decided. Playback and JSON import/export are in the existing timeline. Metadata `defaultFps` still supplies missing durations; explicit per-frame durations are preserved.
