import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/store.mjs';
import {compileContext} from '../shared/core.mjs';
const scope = {installationId:'i', userId:'u', characterId:'c', chatId:'chat', branchId:'b'};
const event = (baseRevision = 0, text = 'Alice visited Seoul.', rev = baseRevision + 1) => ({eventId:`event-${baseRevision}`, baseRevision, changes:[{id:'m1', revision:rev, op:'upsert',visibility:'public', text}]});
function memory(t) { const s = new Store(':memory:'); t.after(() => s.close()); return s; }
test('duplicate delivery, scope auth boundary and source evidence', t => {
  const s = memory(t), first = s.enqueue(scope,event());
  assert.equal(s.enqueue(scope,event()).id, first.id);
  assert.throws(() => s.enqueue(scope,event(0,'different')), /reused/);
  s.runOne(); const page = s.list(scope,{includeBody:true}).pages[0];
  assert.deepEqual(page.evidence,[{messageId:'m1',revision:1}]);
  assert.equal(s.list({...scope,branchId:'other'}).pages.length,0);
  assert.throws(() => s.job({...scope,userId:'other'},first.id), /not found/);
});
test('edit/delete invalidates immediately and late jobs cannot restore old facts', t => {
  const s = memory(t); s.enqueue(scope,event()); s.runOne();
  s.enqueue(scope,event(1,'Alice visited Busan.'));
  assert.equal(s.list(scope).pages.length,0);
  s.runOne(); assert.match(s.context(scope).text,/Busan/);
  assert.equal(s.source(scope,'m1',1).text,'Alice visited Seoul.');
  s.enqueue(scope,{eventId:'delete',baseRevision:2,changes:[{id:'m1',revision:3,op:'delete',visibility:'public'}]});
  assert.equal(s.list(scope).pages.length,0); s.runOne();
  assert.equal(s.context(scope).text,'');
  const other = {...scope,chatId:'late'};
  s.enqueue(other,event()); s.enqueue(other,event(1,'newest')); s.runOne(); s.runOne();
  assert.match(s.context(other).text,/newest/); assert.doesNotMatch(s.context(other).text,/Seoul/);
});
test('failed batch is atomic and stale scope revisions rejected', t => {
  const s=memory(t); s.enqueue(scope,event());
  assert.throws(() => s.enqueue(scope,event(0,'old')), /reused/);
  assert.throws(() => s.enqueue(scope,{eventId:'bad',baseRevision:1,changes:[{id:'m2',revision:1,op:'upsert',visibility:'public',text:'B'},{id:'m1',revision:1,op:'delete',visibility:'public'}]}), /revision conflict/);
  assert.equal(s.head(scope),1);
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM sources').get().n,1);
});
test('manual revisions/history, visibility and byte budget', t => {
  const s=memory(t), page={title:'인물',body:'비밀 '.repeat(50),kind:'person',visibility:'Alice'};
  s.put(scope,'p',page,0,'Alice');
  assert.equal(s.list(scope).pages.length,0);
  assert.throws(() => s.page(scope,'p'),/not found/);
  assert.throws(() => s.put(scope,'p',page,0,'Alice'),/revision conflict/);
  s.put(scope,'p',{...page,body:'수정'},1,'Alice');
  assert.equal(s.history(scope,'p','Alice').length,2);
  const context=s.context(scope,{budgetBytes:5,audience:'Alice'});
  assert.equal(context.text,''); assert.equal(context.excluded[0].reason,'budget');
  assert.equal(s.page(scope,'p','Alice').pinned,true);
  assert.equal(compileContext([{id:'x',title:'x',body:'secret',visibility:'Alice'}]).included.length,0);
});
test('queue recovers after restart and cancellation is persistent', t => {
  const dir=mkdtempSync(join(tmpdir(),'lore-')); t.after(() => rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'db.sqlite'); let s=new Store(path);
  const job=s.enqueue(scope,event()); s.db.prepare("UPDATE jobs SET state='running'").run(); s.close();
  s=new Store(path); t.after(() => s.close()); assert.equal(s.job(scope,job.id).state,'queued');
  s.runOne(); assert.equal(s.job(scope,job.id).state,'completed');
  const next=s.enqueue(scope,event(1,'next')); s.cancel(scope,next.id); s.runOne();
  assert.equal(s.job(scope,next.id).state,'cancelled'); assert.equal(s.context(scope).text,'');
});
test('derivation failure rolls back partial pages and stops after three attempts', t => {
  const s=memory(t);
  const job=s.enqueue(scope,{eventId:'failure',baseRevision:0,changes:[
    {id:'one',revision:1,op:'upsert',visibility:'public',text:'one'},
    {id:'two',revision:1,op:'upsert',visibility:'public',text:'two'},
  ]});
  const save=s.save.bind(s);s.save=(key,page,source)=>{if(source==='two')throw Error('synthetic failure');return save(key,page,source);};
  for(let attempt=1;attempt<=3;attempt++){s.runOne();assert.equal(s.list(scope).pages.length,0);assert.equal(s.job(scope,job.id).attempts,attempt);}
  assert.equal(s.job(scope,job.id).state,'failed');assert.equal(s.runOne(),false);assert.equal(s.context(scope).fresh,false);
  assert.equal(s.source(scope,'one',1).text,'one');
});
test('source audience is preserved through event jobs and evidence lookup', t => {
  const s=memory(t),e={eventId:'secret',baseRevision:0,changes:[{id:'secret',revision:1,op:'upsert',visibility:'Alice',text:'Hidden fact'}]};
  assert.throws(()=>s.enqueue(scope,e),/Visibility/);s.enqueue(scope,e,'Alice');s.runOne();
  assert.equal(s.list(scope).pages.length,0);assert.equal(s.context(scope).text,'');
  assert.match(s.context(scope,{audience:'Alice'}).text,/Hidden fact/);
  assert.throws(()=>s.source(scope,'secret',1),/not found/);
});
