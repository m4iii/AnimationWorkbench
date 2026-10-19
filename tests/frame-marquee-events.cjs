const assert = require('node:assert/strict');
global.FrameSelection = require('../frontend/frame-selection.js');
const { Editor } = require('../frontend/motion-input.js');
const { attach } = require('../frontend/frame-marquee.js');

// Event/selection regression harness only: no browser layout is simulated.
function fixture() {
  const events = {}, captured = new Set(), jobs = new Map();
  let nextJob = 0;
  global.requestAnimationFrame = fn => { jobs.set(++nextJob, fn); return nextJob; };
  global.cancelAnimationFrame = id => jobs.delete(id);
  global.document = { createElement() { return { style: {}, setAttribute() {}, remove() { this.removed = true; } }; } };
  const list = {
    clientLeft: 0, clientTop: 0, clientWidth: 350, clientHeight: 150,
    scrollLeft: 0, scrollTop: 0, scrollWidth: 480, scrollHeight: 150,
    getBoundingClientRect() { return { left: 100, top: 200, right: 450, bottom: 350 }; },
    addEventListener(type, fn) { events[type] = fn; },
    querySelectorAll() { return cards; },
    setPointerCapture(id) { captured.add(id); },
    hasPointerCapture(id) { return captured.has(id); },
    releasePointerCapture(id) { captured.delete(id); events.lostpointercapture?.({ pointerId: id }); },
    focus() {}, append(box) { this.box = box; }, closest() { return null; }
  };
  const cards = ['a', 'b', 'c', 'd'].map((id, index) => ({
    dataset: { frameId: id }, classes: new Set(), attrs: {},
    classList: { toggle() {} }, setAttribute(name, value) { this.attrs[name] = value; },
    getBoundingClientRect() { const left = 105 + index * 100 - list.scrollLeft; return { left, top: 210, right: left + 90, bottom: 320 }; },
    closest(selector) { return selector === '[data-frame-id]' ? this : null; }
  }));
  const editor = Object.create(Editor.prototype);
  Object.assign(editor, {
    epoch: 1, kind: 'video', duration: 10, selected: 'c', selectionIds: ['c'],
    frames: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, kind: 'video', time: i, url: `blob:${id}`, redraw: id === 'd', prompt: `prompt ${id}` })),
    q: () => list, video: { pause() {} }, frameRenders: 0, actions: [], released: [],
    updateInspector() {}, renderMarkers() {}, stopSequence() {}, changed() {},
    renderFrames() { this.frameRenders++; this.reconcileSelection(); },
    setCursor(time) { this.cursor = time; },
    release(url) { this.released.push(url); },
    action(id, payload) { this.actions.push({ id, payload }); }
  });
  attach(editor);
  function fire(type, x = 0, y = 0, id = null, extra = {}) {
    const e = { pointerId: 1, button: 0, clientX: x + 100, clientY: y + 200,
      target: cards.find(card => card.dataset.frameId === id) || list,
      preventDefault() { this.prevented = true; }, ...extra };
    events[type](e); return e;
  }
  const drag = (x1, y1, x2, y2, extra = {}) => {
    fire('pointerdown', x1, y1, null, extra); fire('pointermove', x2, y2, null, extra); fire('pointerup', x2, y2, null, extra);
  };
  return { editor, list, cards, fire, drag, jobs, captured };
}

// Dragging over cards adds to selection; it never changes frame order.
{
  const f = fixture(), original = f.editor.frames.map(frame => ({ ...frame }));
  f.fire('pointerdown', 1, 1);
  f.fire('pointermove', 200, 125);
  assert.deepEqual(f.editor.selectionIds, ['a', 'b', 'c']);
  assert.equal(f.editor.frameRenders, 0, 'the captured list must survive the gesture');
  assert.ok(f.editor.marqueeGesture);
  f.fire('pointerup', 200, 125);
  assert.deepEqual(f.editor.selectionIds, ['a', 'b', 'c']);
  assert.equal(f.editor.selected, 'c');
  assert.deepEqual(f.editor.frames, original, 'selection must not reorder or edit frames');
  assert.equal(f.captured.size, 0); assert.equal(f.jobs.size, 0);
  assert.equal(f.editor.marqueeGesture, null); assert.ok(f.list.box.removed);
  assert.equal(f.editor.cursor, 2, 'preview follows primary selected frame on release');
}

// An auto-height grid scrolls its enclosing panel, not a nested list viewport.
{
  const f=fixture(),panel={scrollTop:0,scrollHeight:1000,clientHeight:300,getBoundingClientRect:()=>({top:100,bottom:400})};
  f.editor.frameLayout='grid';f.list.clientHeight=600;f.list.scrollHeight=600;f.list.closest=selector=>selector==='.studio-bottom'?panel:null;
  f.list.getBoundingClientRect=()=>({left:100,right:450,top:200-panel.scrollTop,bottom:800-panel.scrollTop});
  f.fire('pointerdown',1,1);f.fire('pointermove',200,195);
  const [id,tick]=f.jobs.entries().next().value;f.jobs.delete(id);tick();
  assert.equal(panel.scrollTop,12,'grid edge selection scrolls the outer panel');
  assert.equal(f.list.scrollTop,0,'auto-height grid never scrolls internally');
  f.fire('pointercancel',200,195);assert.deepEqual(f.editor.selectionIds,['c']);
}

// Modifier drag adds; modifier click toggles; plain clicks toggle and blank clicks preserve selection.
{
  const f = fixture();
  f.drag(1, 1, 200, 125, { ctrlKey: true });
  assert.deepEqual(f.editor.selectionIds, ['a', 'b', 'c']);
  f.fire('pointerdown', 240, 40, 'c', { ctrlKey: true });
  f.fire('pointerup', 240, 40, 'c', { ctrlKey: true });
  assert.deepEqual(f.editor.selectionIds, ['a', 'b']);
  f.fire('pointerdown', 340, 140); f.fire('pointerup', 340, 140);
  assert.deepEqual(f.editor.selectionIds, ['a','b']);
  f.fire('pointerdown', 140, 40, 'b'); f.fire('pointermove', 142, 41, 'b'); f.fire('pointerup', 142, 41, 'b');
  assert.deepEqual(f.editor.selectionIds, ['a'], 'clicking selected b toggles it off');
  f.fire('pointerdown',140,40,'b');f.fire('pointerup',140,40,'b');assert.deepEqual(f.editor.selectionIds,['a','b'],'clicking b again adds it without clearing a');
}

// Cancelling restores the pre-gesture IDs, including the primary and redraw plan.
for (const type of ['pointercancel', 'lostpointercapture', 'Escape']) {
  const f = fixture();
  f.fire('pointerdown', 1, 1); f.fire('pointermove', 200, 125);
  if (type === 'Escape') f.fire('keydown', 0, 0, null, { key: 'Escape' });
  else f.fire(type, 200, 125);
  assert.deepEqual(f.editor.selectionIds, ['c'], type);
  assert.equal(f.editor.selected, 'c');
  assert.deepEqual(f.editor.frames.filter(frame => frame.redraw).map(frame => frame.id), ['d']);
  assert.equal(f.editor.marqueeGesture, null); assert.equal(f.jobs.size, 0);
}

// Delete finishes the live rectangle and deletes exactly that selection.
{
  const f = fixture();
  f.fire('pointerdown', 1, 1); f.fire('pointermove', 200, 125);
  f.fire('keydown', 0, 0, null, { key: 'Delete', repeat: false });
  assert.deepEqual(f.editor.frames.map(frame => frame.id), ['d']);
  assert.deepEqual(f.editor.released, ['blob:a', 'blob:b', 'blob:c']);
  assert.deepEqual(f.editor.actions.at(-1), { id: 'motion.remove', payload: { frameIds: ['a', 'b', 'c'] } });
  assert.equal(f.editor.frames[0].redraw, true);
  assert.equal(f.editor.frames[0].prompt, 'prompt d');
  assert.equal(f.editor.marqueeGesture, null);
}

// Source replacement cannot restore stale IDs when a captured pointer releases.
{
  const f = fixture();
  f.fire('pointerdown', 1, 1); f.fire('pointermove', 200, 125);
  f.editor.epoch++; f.editor.frames = [{ id: 'new', kind: 'video', time: 0 }];
  f.editor.selected = 'new'; f.editor.selectionIds = ['new'];
  f.fire('pointerup', 200, 125);
  assert.deepEqual(f.editor.selectionIds, ['new']);
  assert.equal(f.editor.marqueeGesture, null);
}

// Sorting is opt-in; its pointer presses do not start a selection rectangle.
{
  const f = fixture(); f.editor.frameSortMode = true;
  f.fire('pointerdown', 40, 40, 'a');
  assert.equal(f.editor.marqueeGesture, undefined);
  f.fire('click', 40, 40, 'a');
  assert.deepEqual(f.editor.selectionIds, ['a','c']);
}

console.log(JSON.stringify({ passed: true, coverage: [
  'default_marquee_keeps_frame_order_and_capture_node', 'click_toggle_and_blank_preserves_selection',
  'pointercancel_captureloss_and_escape_restore_selection', 'delete_exact_live_selection',
  'source_epoch_invalidates_old_gesture', 'sorting_is_opt_in', 'auto_height_grid_scrolls_outer_panel'
] }));
