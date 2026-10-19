const assert = require('node:assert/strict');
const { Editor } = require('../frontend/motion-input.js');
global.FrameSelection = require('../frontend/frame-selection.js');

function fixture(kind) {
  const frames = [
    { id: 'a', kind, url: 'blob:frame-a', time: 1, redraw: true, prompt: '保留此帧提示词' },
    { id: 'b', kind, url: 'blob:frame-b', time: 2, redraw: false, prompt: null },
  ];
  const events = [];
  const editor = Object.create(Editor.prototype);
  Object.assign(editor, {
    frames, kind, selected: 'b', selectionIds: ['a', 'b'],
    videoUrl: 'blob:source-video', sourceVideoBlob: { name: 'source.mp4' },
    sourceName: 'source.mp4', duration: 6.4, cursor: 2,
    sourceFrameTimes: [0, 1 / 30, 2 / 30], timelineFps: 30,
    timelineView: { start: 1, span: 2 },
    video: { currentTime: 2, src: 'blob:source-video', paused: true },
    urls: new Set(['blob:source-video', 'blob:frame-a', 'blob:frame-b']),
    cancelMarquee() { events.push('cancel-marquee'); },
    renderFrames() { this.reconcileSelection(); events.push('render'); },
    action(id, payload) { events.push({ id, payload }); },
    release() { assert.fail('Clearing selection must not release image or video URLs'); },
    reset() { assert.fail('Clearing selection must not reset the source'); },
    changed() { assert.fail('Clearing selection must not change the frame document'); },
  });
  return { editor, frames, events };
}

for (const kind of ['video', 'image', 'sheet']) {
  const { editor, frames, events } = fixture(kind);
  const before = JSON.stringify(frames);
  const source = Object.fromEntries(['videoUrl', 'sourceVideoBlob', 'sourceName', 'duration', 'cursor', 'sourceFrameTimes', 'timelineFps', 'timelineView', 'video', 'urls'].map(key => [key, editor[key]]));
  editor.clearSelection();
  assert.equal(editor.selected, null);
  assert.deepEqual(editor.selectionIds, []);
  assert.strictEqual(editor.frames, frames, 'Frame list must not be replaced');
  assert.equal(JSON.stringify(frames), before, 'Frame contents, marks and prompts must remain');
  for (const [key, value] of Object.entries(source)) assert.strictEqual(editor[key], value, `${key} must remain unchanged`);
  assert.equal(editor.video.currentTime, 2);
  assert.deepEqual([...editor.urls], ['blob:source-video', 'blob:frame-a', 'blob:frame-b']);
  assert.deepEqual(events.slice(0, 2), ['cancel-marquee', 'render']);
  assert.equal(events.at(-1).id, 'motion.clear_selection');

  editor.click('select-all');
  assert.deepEqual(editor.selectionIds, ['a', 'b']);
  editor.click('clear-selection');
  assert.equal(editor.selected, null);
  assert.deepEqual(editor.selectionIds, []);
  assert.equal(JSON.stringify(frames), before, 'Select all then clear must retain every frame');
  editor.click('clear-selection');
  assert.deepEqual(editor.selectionIds, [], 'Clearing an empty selection is idempotent');
}

console.log(JSON.stringify({ passed: true, coverage: ['clear_selection_preserves_source_and_frames', 'clear_selection_preserves_redraw_and_prompts', 'select_all_then_clear_selection', 'clear_empty_selection'] }));
