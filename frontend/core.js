(function (root) {
  'use strict';
  const PHASES = [
    {id:'inputs',label:'素材',jobs:2},
    {id:'sampling',label:'选帧',jobs:1},
    {id:'poses',label:'重绘标记',jobs:1},
    {id:'prompts',label:'提示词',jobs:1},
    {id:'artwork',label:'生图',jobs:2},
    {id:'review',label:'检查导出',jobs:1}
  ];
  function buildPrompt(config) {
    return '【界面演示草稿：由前端模板填充，尚未调用本地 Codex】\n\n' +
      '制作目标\n' + (config.instructions.trim() || '请填写制作要求。') + '\n\n' +
      '参考图分工\n' +
      '1. 人设参考：只决定角色身份、服装和配饰。\n' +
      '2. 画风参考：决定头身比例、描边、色调、明暗与细节密度。\n' +
      '3. 动作参考：只决定动作、镜头、坐标和时间轴。\n\n' +
      '本次动作：' + config.action + '\n' +
      '重绘计划：' + ((config.motionInput?.frames||[]).filter(f=>f.redraw).map(f=>f.id+(f.time===null?'':' @ '+f.time+'s')).join('、')||'尚未标记重绘帧') + '\n' +
      '输出约束\n' + (config.separateWeapon ? '人物与武器分层。人物保留空握手势，不包含刀身、刀柄、护手；武器另行处理。\n' : '人物与武器的装配方式按当前配置处理。\n') +
      '后续姿势编辑已选画稿，保持角色与服装设计一致。\n' +
      '保留所有有运动变化的采样时刻；真正重复的画面按原停留时长复用。\n' +
      '透明背景；阴影和刀光独立，不烘焙进人物图。\n\n' +
      '检查要点\n脸、比例、配饰、服装、手脚和武器握点；不得用静止画面替代真实运动。';
  }
  class DemoRunner {
    constructor(onChange, options) {
      const o = options || {};
      this.onChange = onChange || function () {};
      this.delay = o.delay || 850;
      this.schedule = o.schedule || setTimeout;
      this.unschedule = o.unschedule || clearTimeout;
      this.timer = null;
      this.generation = 0;
      this.reset(false);
    }
    reset(emit = true) {
      if (this.timer !== null) this.unschedule(this.timer);
      this.timer = null; this.generation++;
      this.state = 'idle'; this.phase = -1; this.nextPhase = 0; this.rangeStart = 0; this.end = PHASES.length - 1;
      this.done = 0; this.stopAfter = false; this.reviewPending = false; this.reviewGate = false;
      this.statuses = PHASES.map(() => 'pending');
      if (emit) this.emit('reset');
    }
    snapshot() {
      return { state: this.state, phase: this.phase, nextPhase: this.nextPhase,
        done: this.done, total: PHASES[this.phase] ? PHASES[this.phase].jobs : 0,
        stopAfter: this.stopAfter, reviewPending: this.reviewPending, rangeStart: this.rangeStart,
        rangeEnd: this.end, statuses: this.statuses.slice() };
    }
    emit(event) { this.onChange(event, this.snapshot()); }
    active() { return this.state === 'running' || this.state === 'draining'; }
    start(options) {
      if (this.active()) return false;
      const o = options || {};
      this.reset(false); this.reviewGate = !!o.reviewGate;
      this.phase = Number.isInteger(o.start) ? o.start : 0;
      this.rangeStart = this.phase;
      this.end = o.single ? this.phase : PHASES.length - 1;
      this.beginPhase(); return true;
    }
    beginPhase() {
      if (this.phase > this.end) { this.state = 'completed'; this.emit('completed'); return; }
      this.state = 'running'; this.done = 0; this.statuses[this.phase] = 'running';
      this.emit('phase_started'); this.queueTick();
    }
    queueTick() {
      const token = this.generation;
      this.timer = this.schedule(() => {
        if (token !== this.generation || !this.active()) return;
        this.timer = null; this.done++; this.emit('job_completed');
        if (this.done < PHASES[this.phase].jobs) { this.queueTick(); return; }
        this.statuses[this.phase] = 'completed'; this.nextPhase = this.phase + 1;
        this.reviewPending = this.reviewGate && ['poses','artwork'].includes(PHASES[this.phase].id);
        this.emit('phase_completed');
        if (this.stopAfter) {
          this.state = 'paused'; this.stopAfter = false; this.emit('paused'); return;
        }
        if (this.reviewPending) { this.state = 'waiting_review'; this.emit('waiting_review'); return; }
        this.phase = this.nextPhase; this.beginPhase();
      }, this.delay);
    }
    stopNow() {
      if (!this.active() && !['paused', 'waiting_review'].includes(this.state)) return false;
      if (this.timer !== null) this.unschedule(this.timer);
      this.timer = null; this.generation++; this.stopAfter = false;
      if (this.phase >= 0 && this.statuses[this.phase] === 'running') this.statuses[this.phase] = 'cancelled';
      this.state = 'cancelled'; this.emit('cancelled'); return true;
    }
    toggleAfterStage() {
      if (!this.active()) return false;
      this.stopAfter = !this.stopAfter;
      this.state = this.stopAfter ? 'draining' : 'running'; this.emit('stop_after_changed'); return true;
    }
    continueRun(approve = false) {
      if (!['paused', 'waiting_review', 'cancelled'].includes(this.state)) return false;
      if (this.state === 'cancelled') {
        if (this.reviewPending && !approve) { this.state = 'waiting_review'; this.emit('waiting_review'); return true; }
        if (this.statuses[this.phase] === 'completed') this.phase = this.nextPhase;
        this.reviewPending = false;
      } else {
        if (this.reviewPending && !approve) { this.state = 'waiting_review'; this.emit('waiting_review'); return true; }
        this.reviewPending = false; this.phase = this.nextPhase;
      }
      this.beginPhase(); return true;
    }
  }
  const api = { PHASES, DemoRunner, buildPrompt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WorkbenchCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
