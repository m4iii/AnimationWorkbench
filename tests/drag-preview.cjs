const assert = require('node:assert/strict');
const {Editor, SerialQueue, snapFrameTime} = require('../frontend/motion-input.js');

const turn = () => new Promise(resolve => setImmediate(resolve));

// Decode is deliberately held until each test releases it. The real editor
// queue and preview coalescer must keep all media operations serialized.
function fixture() {
  const editor = Object.create(Editor.prototype);
  Object.assign(editor, {
    epoch: 1, pending: 0, queue: new SerialQueue(), kind: 'video', duration: 10,
    cursor: 0, timelineFps: 30, seekVersion: 0, urls: new Set(),
    selected: 'frame', selectionIds: ['frame'],
    frames: [{id: 'frame', kind: 'video', time: .5, url: 'blob:old', redraw: true, prompt: 'keep me'}],
    calls: [], waits: [], active: 0, maxActive: 0, errors: [], rasters: [], released: [],
    sourcePreviews: 0, options: {onSourcePreview() { editor.sourcePreviews++; }},
    video: {currentTime: 0, videoWidth: 100, videoHeight: 200, pause() {}, removeAttribute() {}, load() {}},
    updateControls() {}, renderTime() {}, render() {}, stopSequence() {},
    renderFrames() { this.sortVideoFrames(); }, changed() {}, action() {},
    message(text) { this.errors.push(text); }, release(url) { this.released.push(url); },
    raster: async function() {
      this.rasters.push(this.video.currentTime);
      return {url: 'blob:new', width: 100, height: 200};
    },
    seek(time) {
      this.calls.push(time); this.active++; this.maxActive = Math.max(this.maxActive, this.active);
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = error => {
          if (settled) return;
          settled = true; this.active--; this.abortSeek = null;
          if (error) reject(error);
          else { this.video.currentTime = time; resolve(); }
        };
        this.waits.push(() => finish());
        this.abortSeek = () => finish(Error('source_changed'));
      });
    }
  });
  return editor;
}

async function main() {
  const checks = [];
  assert.equal(snapFrameTime(.051, 10, 30), 2 / 30);
  assert.equal(snapFrameTime(10, 10, 30), 299 / 30, 'end must remain on the last frame, not duration minus an epsilon');
  assert.equal(snapFrameTime(999, .01, 30), 0, 'a clip shorter than one frame still starts at zero');
  assert.equal(snapFrameTime(-1, 10, 30), 0);
  assert.equal(snapFrameTime(1, 10, 24), 1);
  const ntsc = snapFrameTime(8.31, 10, 29.97);
  assert.ok(Math.abs(ntsc * 29.97 - Math.round(ntsc * 29.97)) < 1e-9);
  checks.push('quantization_and_last_frame_boundary');

  const ed = fixture();
  const first = ed.setCursor(1);
  await turn();
  assert.deepEqual(ed.calls, [1]);
  assert.equal(ed.setCursor(2), first);
  assert.equal(ed.setCursor(3), first);
  assert.equal(ed.pending, 1, 'rapid movement must use one queued preview job');
  const buttons = new Map();
  const control = key => { if (!buttons.has(key)) buttons.set(key, {}); return buttons.get(key); };
  ed.host = {querySelector: control}; ed.q = control; ed.updateStepControls = () => {};
  ed.video.readyState = 1; // Seeking may temporarily discard the current decoded frame.
  Editor.prototype.updateControls.call(ed);
  assert.equal(control('[data-mi-action="capture"]').disabled, false, 'preview seek must not flash the capture button disabled');
  assert.equal(ed.video.controls, true, 'preview seek must preserve native playback controls');
  ed.pending++;
  Editor.prototype.updateControls.call(ed);
  assert.equal(control('[data-mi-action="capture"]').disabled, true, 'actual capture work must still disable capture');
  ed.pending--;
  assert.equal(ed.cursor, 3, 'playhead follows the latest pointer even before decode completes');
  ed.waits.shift()(); await turn();
  assert.deepEqual(ed.calls, [1, 3], 'intermediate stale preview must be skipped');
  ed.waits.shift()(); await first;
  assert.equal(ed.video.currentTime, 3);
  assert.equal(ed.maxActive, 1);
  assert.equal(ed.pending, 0);
  assert.equal(ed.previewJob, null);
  assert.equal(ed.sourcePreviews, 3, 'scrubbing must request the source viewer');
  checks.push('live_preview_coalesces_to_latest_without_overlapping_seeks');

  const final = fixture();
  const preview = final.setCursor(1); await turn();
  final.setCursor(2);
  final.retime('frame', 3.047);
  final.waits.shift()(); await turn();
  const target = 91 / 30;
  assert.deepEqual(final.calls, [1, target], 'committing drops an obsolete preview and seeks the snapped release position');
  final.waits.shift()(); await final.queue.last; await preview; await turn();
  assert.deepEqual(final.rasters, [target]);
  assert.equal(final.frames[0].time, target);
  assert.equal(final.frames[0].pending, false);
  assert.equal(final.frames[0].prompt, 'keep me');
  assert.equal(final.frames[0].redraw, true);
  assert.equal(final.maxActive, 1);
  assert.deepEqual(final.released, ['blob:old']);
  checks.push('release_commits_only_final_decoded_frame_and_preserves_identity');

  const cancelled = fixture();
  const cancelJob = cancelled.setCursor(1); await turn();
  cancelled.setCursor(2);
  cancelled.setCursor(.5); // The pointer-cancel handler restores its old cursor.
  cancelled.waits.shift()(); await turn();
  assert.deepEqual(cancelled.calls, [1, .5]);
  cancelled.waits.shift()(); await cancelJob;
  assert.equal(cancelled.video.currentTime, .5);
  assert.equal(cancelled.frames[0].time, .5);
  assert.deepEqual(cancelled.rasters, []);
  checks.push('cancel_restore_supersedes_stale_drag_preview');

  const reset = fixture();
  const oldJob = reset.setCursor(1); await turn();
  reset.setCursor(2);
  reset.reset('video');
  reset.duration = 5;
  const newJob = reset.setCursor(4);
  await turn();
  assert.deepEqual(reset.calls, [1, 4], 'old source requests must not leak into the new source');
  assert.equal(reset.previewJob.epoch, reset.epoch, 'old completion must not clear the new preview job');
  reset.waits.at(-1)(); await Promise.all([oldJob, newJob]);
  assert.equal(reset.video.currentTime, 4);
  assert.equal(reset.pending, 0);
  assert.equal(reset.active, 0);
  assert.equal(reset.maxActive, 1);
  assert.deepEqual(reset.errors, [], 'source replacement is cancellation, not a visible decode error');
  checks.push('source_reset_aborts_old_decode_and_preserves_new_preview_job');

  // currentTime is updated before media decoding finishes. Matching timestamps
  // must not bypass the seeked event while the video is still seeking.
  const seeking = Object.create(Editor.prototype), handlers = new Map();
  seeking.video = {
    readyState: 2, seeking: true, currentTime: 3,
    addEventListener(name, fn) { handlers.set(name, fn); },
    removeEventListener(name) { handlers.delete(name); }
  };
  let resolved = false;
  const decode = seeking.seek(3).then(() => { resolved = true; });
  await turn(); assert.equal(resolved, false);
  seeking.video.seeking = false; handlers.get('seeked')(); await decode;
  assert.equal(resolved, true); assert.equal(handlers.size, 0);
  checks.push('same_timestamp_waits_for_pending_video_decode');

  console.log(JSON.stringify({passed: checks.length, checks}));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
