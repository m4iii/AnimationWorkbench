const assert = require('node:assert/strict');
const {DemoRunner, PHASES, buildPrompt} = require('../frontend/core.js');
function fixture(){
  let seq=0;const queue=new Map();const events=[];
  const runner=new DemoRunner((type,state)=>events.push({type,state}),{
    schedule:fn=>{queue.set(++seq,fn);return seq;},unschedule:id=>queue.delete(id),delay:1});
  function tick(){const item=queue.entries().next().value;if(!item)return false;queue.delete(item[0]);item[1]();return true;}
  function drain(){let n=0;while(tick()){assert.ok(++n<100,'unbounded simulation');}}
  return {runner,events,queue,tick,drain};
}
const checks=[];
assert.deepEqual(PHASES.map(p=>p.id),['inputs','sampling','poses','prompts','artwork','review']);
{
 const f=fixture();f.runner.start();assert.equal(f.runner.start(),false,'double start must not queue a duplicate');
 f.drain();assert.equal(f.runner.state,'completed');assert.equal(f.events.filter(x=>x.type==='phase_started').length,6);checks.push('complete run visits all six phases once');
}
{
 const f=fixture();f.runner.start();f.tick();f.runner.stopNow();f.drain();assert.equal(f.runner.state,'cancelled');
 assert.equal(f.events.filter(x=>x.type==='phase_started').length,1);assert.equal(f.queue.size,0);checks.push('immediate stop cancels remaining work');
}
{
 const f=fixture();f.runner.start();f.runner.toggleAfterStage();f.tick();assert.equal(f.runner.state,'draining');
 f.tick();assert.equal(f.runner.state,'paused');assert.equal(f.runner.statuses[0],'completed');assert.equal(f.runner.statuses[1],'pending');
 f.runner.continueRun();f.drain();assert.equal(f.runner.state,'completed');checks.push('after-stage stop completes current work without starting downstream');
}
{
 const f=fixture();f.runner.start();f.runner.toggleAfterStage();f.runner.toggleAfterStage();f.drain();assert.equal(f.runner.state,'completed');checks.push('after-stage request is reversible before the boundary');
}
{
 const f=fixture();f.runner.start({start:3,single:true});f.drain();assert.equal(f.runner.state,'completed');
 assert.equal(f.events.filter(x=>x.type==='phase_started').length,1);assert.equal(f.runner.statuses[2],'pending');assert.equal(f.runner.statuses[4],'pending');checks.push('single stage does not execute implicit dependencies');
}
{
 const f=fixture();f.runner.start({reviewGate:true});f.drain();assert.equal(f.runner.state,'waiting_review');assert.equal(f.runner.phase,2);
 f.runner.continueRun();assert.equal(f.runner.state,'waiting_review');f.runner.stopNow();f.runner.continueRun();assert.equal(f.runner.state,'waiting_review','cancel must not bypass review');
 f.runner.continueRun(true);f.drain();assert.equal(f.runner.state,'waiting_review');assert.equal(f.runner.phase,4);
 f.runner.continueRun(true);f.drain();assert.equal(f.runner.state,'completed');checks.push('review gates require explicit confirmation including after cancellation');
}
{
 const f=fixture();f.runner.start({start:2,reviewGate:true});f.runner.toggleAfterStage();f.drain();assert.equal(f.runner.state,'paused');
 f.runner.continueRun();assert.equal(f.runner.state,'waiting_review');checks.push('pause and review requirements are retained independently');
}
{
 const prompt=buildPrompt({instructions:'保持眼镜和腰包',action:'攻击 1',separateWeapon:true});
 assert.ok(prompt.includes('未调用本地 Codex'));assert.ok(prompt.includes('人物与武器分层'));assert.ok(prompt.includes('保持眼镜和腰包'));checks.push('prompt draft is explicitly identified as a frontend template');
}
console.log(JSON.stringify({passed:checks.length,checks,browserRenderingTested:false},null,2));
