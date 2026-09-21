import test from 'node:test';import assert from 'node:assert/strict';
import {LiteStore} from '../plugin/lite-store.mjs';
import {readLoreDelta} from '../shared/chat-delta.mjs';
function memory(){const data=new Map();return {data,getItem:async k=>structuredClone(data.get(k)),setItem:async(k,v)=>data.set(k,structuredClone(v)),removeItem:async k=>data.delete(k)};}
test('notebook backup preserves page history, source grounding and queued work in another storage namespace',async()=>{
 const storage=memory(),a=new LiteStore(storage,'original'),b=new LiteStore(storage,'restored');
 await a.bind({characterId:'c',chatId:'chat',branchId:'chat'});
 const delta=await readLoreDelta({chaId:'c',chatPage:0,chats:[{id:'chat',message:[{chatId:'m1',role:'char',data:'Alice is a pilot.'}]}]},null);
 await a.sync(delta);await a.put('manual',{title:'Alice',path:'people/Alice.md',aliases:['앨리스'],body:'Manual correction'},0);await a.put('manual',{...await a.page('manual'),body:'New manual correction'},1);
 const backup=await a.exportBackup(),restored=await b.importBackup(JSON.parse(JSON.stringify(backup)));
 assert.deepEqual(restored,{pages:1,sources:1});assert.deepEqual(await b.page('manual'),await a.page('manual'));assert.deepEqual(await b.history('manual'),await a.history('manual'));
 assert.equal((await b.jobs())[0].state,'queued');assert.ok((await b.jobs())[0].keys.every(k=>k.startsWith(b.prefix)));
 await b.process(async input=>{assert.equal(input.sources[0].text,'Alice is a pilot.');return [];});assert.equal((await b.jobs())[0].state,'completed');assert.equal((await a.jobs())[0].state,'queued');
 await assert.rejects(b.importBackup(backup),/빈 노트북/);
});
test('invalid paths, missing records and failed storage writes never publish a partial restore',async()=>{
 const a=new LiteStore(memory());await a.put('p',{title:'p',body:'Fact'},0);const backup=await a.exportBackup();
 for(const edit of [b=>b.records['page:p:1'].path='../escape.md',b=>delete b.records['page:p:1'],b=>b.state.pages.push(b.state.pages[0])]){
  const bad=structuredClone(backup);edit(bad);const target=new LiteStore(memory(),'empty');await assert.rejects(target.importBackup(bad));assert.equal((await target.index()).length,0);
 }
 const storage=memory(),set=storage.setItem;storage.setItem=async(k,v)=>{if(k.endsWith(':index'))throw Error('disk full');return set(k,v);};const target=new LiteStore(storage,'empty');await assert.rejects(target.importBackup(backup),/disk full/);assert.equal((await target.index()).length,0);
});
