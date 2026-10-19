const assert = require('node:assert/strict');
const { Editor, cleanMetadata } = require('../frontend/motion-input.js');

function fixture(mode = 'row') {
  const list = { scrollLeft: 145, scrollTop: 72 }, events = [];
  const editor = Object.create(Editor.prototype);
  Object.assign(editor, {
    frameLayout: mode, frameSortMode: false, kind: 'video', sourceName: 'attack.mp4',
    sourceVideoBlob: { source: 'original' }, videoUrl: 'blob:source', duration: 2,
    frames: [
      { id: 'a', name: 'First', kind: 'video', time: 0, url: 'blob:a', redraw: true, prompt: 'draw a', width: 80, height: 120 },
      { id: 'b', name: 'Second', kind: 'video', time: 1, url: 'blob:b', redraw: false, prompt: 'draw b', width: 80, height: 120 }
    ],
    selected: 'b', selectionIds: ['a', 'b'], timelineFps: 24,
    q(name) { assert.ok(['frames', 'sequence-fps'].includes(name)); return name === 'frames' ? list : { value: 12 }; },
    cancelMarquee() { events.push('cancel'); this.marqueeGesture = null; },
    renderFrames() { events.push('render'); },
    changed() { events.push('changed'); },
    action(id, payload) { events.push('action'); this.lastAction = { id, payload }; }
  });
  return { editor, list, events };
}

// Layout only changes presentation; it never changes source, order or identities.
for (const [from, to] of [['row', 'grid'], ['grid', 'row']]) {
  const { editor, list, events } = fixture(from);
  const frames = editor.frames, source = editor.sourceVideoBlob;
  const before = JSON.stringify({ frames, selected: editor.selected, ids: editor.selectionIds, sourceName: editor.sourceName, videoUrl: editor.videoUrl, duration: editor.duration });
  editor.marqueeGesture = { active: true };
  editor.toggleFrameLayout();
  assert.equal(editor.frameLayout, to);
  assert.equal(editor.marqueeGesture, null, 'the old-coordinate rectangle must stop before relayout');
  assert.equal(list.scrollLeft, 0); assert.equal(list.scrollTop, 0);
  assert.equal(events[0], 'cancel', 'cancel the old gesture before changing layout');
  for (const name of ['cancel', 'render', 'changed', 'action']) assert.equal(events.filter(x => x === name).length, 1, name);
  assert.equal(editor.frames, frames); assert.equal(editor.sourceVideoBlob, source);
  assert.equal(JSON.stringify({ frames: editor.frames, selected: editor.selected, ids: editor.selectionIds, sourceName: editor.sourceName, videoUrl: editor.videoUrl, duration: editor.duration }), before);
  assert.equal(cleanMetadata(editor.metadata()).frameLayout, to, 'the exported metadata keeps the selected layout');
}

// Old or malformed configs get the existing row layout; both explicit modes survive.
for (const mode of ['row', 'grid']) {
  const { editor } = fixture(mode);
  const sanitized = cleanMetadata(JSON.parse(JSON.stringify(editor.metadata())));
  assert.equal(sanitized.frameLayout, mode);
  assert.deepEqual(cleanMetadata(JSON.parse(JSON.stringify(sanitized))), sanitized);
  assert.ok(sanitized.frames.every(frame => !('url' in frame)), 'metadata does not save transient blob URLs');
}
for (const mode of [undefined, null, '', 'columns', 17, { mode: 'grid' }]) {
  assert.equal(cleanMetadata({ frameLayout: mode, frames: [] }).frameLayout, 'row');
}

// Restored plans can change display mode before the source file is reselected.
{
  const { editor } = fixture('row');
  editor.frames = []; editor.selected = null; editor.selectionIds = [];
  editor.savedPlan = cleanMetadata({ kind: 'video', frameLayout: 'row', frames: [{ id: 'saved', kind: 'video', time: 0 }] });
  editor.toggleFrameLayout();
  assert.equal(cleanMetadata(editor.metadata()).frameLayout, 'grid');
  assert.deepEqual(editor.savedPlan.frames.map(frame => frame.id), ['saved']);
}

console.log(JSON.stringify({ passed: true, coverage: [
  'row_grid_toggle_cancels_gesture_and_resets_scroll', 'toggle_preserves_source_selection_and_frame_data',
  'single_render_notification_and_action', 'layout_metadata_roundtrip_and_legacy_default',
  'saved_plan_layout_without_relinked_media'
] }));
