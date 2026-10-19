const assert = require('node:assert/strict');
const Selection = require('../frontend/frame-selection.js');

const frames = ['a', 'b', 'c', 'd'].map((id, index) => ({
  id, time: index, redraw: index % 2 === 0, url: `blob:${id}`
}));
const bounds = [
  { id: 'a', left: 10, top: 20, right: 110, bottom: 120 },
  { id: 'b', left: 130, top: 20, right: 230, bottom: 120 },
  { id: 'c', left: 10, top: 140, right: 110, bottom: 240 },
  { id: 'd', left: 130, top: 140, right: 230, bottom: 240 }
];
const stateBefore = JSON.stringify({ frames, bounds });
const box = (start, end, base = [], additive = false, boxes = bounds, items = frames) =>
  Selection.marquee(items, boxes, start, end, base, additive);

// A normal gesture replaces the prior selection and includes partial overlaps.
assert.deepEqual(box({ x: 100, y: 30 }, { x: 135, y: 110 }, ['c']), ['a', 'b']);
assert.deepEqual(box({ x: 130, y: 140 }, { x: 150, y: 160 }), ['d']);
assert.deepEqual(box({ x: 135, y: 110 }, { x: 100, y: 30 }), ['a', 'b'],
  'dragging toward the upper left must hit the same cards');

// Empty gaps and touching an edge without crossing it do not select a card.
assert.deepEqual(box({ x: 111, y: 30 }, { x: 129, y: 100 }), []);
assert.deepEqual(box({ x: 110, y: 20 }, { x: 130, y: 120 }), []);
assert.deepEqual(box({ x: 0, y: 0 }, { x: 10, y: 20 }), []);
assert.deepEqual(box({ x: 40, y: 40 }, { x: 40, y: 100 }, ['b']), []);
assert.deepEqual(box({ x: 40, y: 40 }, { x: 100, y: 40 }, ['b']), []);

// Additive gestures union the captured starting selection, not incremental hits.
const base = ['d', 'missing', 'd'];
assert.deepEqual(box({ x: 5, y: 15 }, { x: 115, y: 125 }, base, true), ['a', 'd']);
assert.deepEqual(box({ x: 111, y: 30 }, { x: 129, y: 100 }, base, true), ['d']);
assert.deepEqual(box({ x: 40, y: 40 }, { x: 40, y: 40 }, base, true), ['d']);
assert.deepEqual(base, ['d', 'missing', 'd'], 'additive selection must not mutate its starting IDs');

// Coordinates belong to the scrollable content, including currently offscreen rows.
const scrolled = bounds.map(b => ({
  ...b, top: b.top + 900, bottom: b.bottom + 900,
  left: b.left + 600, right: b.right + 600
}));
assert.deepEqual(box({ x: 605, y: 1035 }, { x: 835, y: 1145 }, [], false, scrolled), ['c', 'd']);

// Output always follows current frame order, and stale bounds cannot revive frames.
const reordered = [frames[3], frames[0], frames[2]];
assert.deepEqual(box({ x: 0, y: 0 }, { x: 250, y: 250 }, ['b'], true, bounds, reordered), ['d', 'a', 'c']);
assert.deepEqual(box({ x: 0, y: 0 }, { x: 250, y: 250 }, [], false, bounds, []), []);
assert.equal(JSON.stringify({ frames, bounds }), stateBefore,
  'marquee selection must preserve redraw marks, frame times, media and bounds');

console.log(JSON.stringify({ passed: true, coverage: [
  'partial_overlap_and_reverse_drag', 'empty_gaps_and_edge_contact',
  'zero_area_does_not_select', 'additive_union_and_stale_id_pruning',
  'scroll_content_coordinates', 'current_display_order',
  'selection_preserves_redraw_and_frame_data'
] }));
