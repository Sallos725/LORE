import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LiteStore} from '../plugin/lite-store.mjs';
import {AutoMemory} from '../plugin/runtime.mjs';
import {readLoreDelta} from '../integration/pocketrisu-lore.mjs';
const hashFactory=()=>{const h=createHash('sha256');return {update:s=>h.update(s),hex:()=>h.digest('hex')};};
const storage=()=>{const data=new Map();return {getItem:async k=>structuredClone(data.get(k)),setItem:async(k,v)=>data.set(k,structuredClone(v)),removeItem:async k=>data.delete(k)};};
function fixture(){
  const character={chaId:'c',chatPage:0,chats:[{id:'chat',message:[{chatId:'m1',role:'char',data:'Alice lives in Seoul.'}]}]},store=new LiteStore(storage()),state={generating:false,fits:true},hooks=new Set();
  const host={getLoreChatDelta:async(cursor,mode)=>readLoreDelta(character,cursor,{hashFactory,mode,generating:state.generating}),checkLoreBudget:async()=>({fits:state.fits}),addRisuReplacer:async(_,fn)=>hooks.add(fn),removeRisuReplacer:async(_,fn)=>hooks.delete(fn),registerBodyIntercepter:async fn=>{hooks.add(fn);return {id:'body'};},unregisterBodyIntercepter:async()=>hooks.clear()};
  const extractor=async input=>[{title:'Alice',kind:'person',path:'people/Alice.md',aliases:['앨리스'],body:'Alice lives in Seoul.',expectedRevision:0,visibility:'public',evidence:[{messageId:input.sources[0].id,revision:input.sources[0].revision,quote:input.sources[0].text}]}];
  return {character,store,state,hooks,host,extractor};
}
test('Lite collects, extracts evidence, injects relevant memory and checks final request',async()=>{
  const f=fixture(),runtime=new AutoMemory(f.host);await runtime.start({store:f.store,extractor:f.extractor});
  try{
    const pages=(await f.store.list()).pages;assert.equal(pages.length,1);assert.equal((await f.store.page(pages[0].id)).evidence[0].messageId,'m1');
    const messages=[{role:'user',content:'Where is 앨리스?'}],injected=await runtime.before(messages,'model');assert.equal(injected.length,2);assert.match(injected[0].content,/Seoul/);
    assert.equal((await runtime.finalBody({messages:injected})).messages.length,2);
    f.state.fits=false;assert.deepEqual(await runtime.before(messages,'model'),messages);assert.deepEqual((await runtime.finalBody({messages:injected})).messages,messages);
    f.state.fits=true;f.character.chats[0].message[0].data='Alice moved to Busan.';
    assert.deepEqual(await runtime.before(messages,'model'),messages);
    f.character.chats[0].id='another-chat';assert.deepEqual(await runtime.before(messages,'model'),messages);
    assert.deepEqual(await runtime.before(messages,'other'),messages);
  }finally{await runtime.stop();assert.equal(f.hooks.size,0);}
});
test('generation candidates are not collected; unavailable backend leaves chat working',async()=>{
  const f=fixture();f.state.generating=true;const runtime=new AutoMemory(f.host);await runtime.start({store:f.store,extractor:f.extractor});
  try{assert.equal((await f.store.list()).pages.length,0);f.host.getLoreChatDelta=async()=>{throw Error('offline');};const messages=[{role:'user',content:'hello'}];assert.equal(await runtime.before(messages,'model'),messages);}finally{await runtime.stop();}
});
test('Lite reset invalidates manual corrections with old evidence; failed batch stays atomic',async()=>{
  const f=fixture(),id=await f.host.getLoreChatDelta(null,'identity');await f.store.bind({characterId:id.characterId,chatId:id.chatId,branchId:id.branchId});
  await f.store.sync(await f.host.getLoreChatDelta(null));await f.store.process(f.extractor);
  const p=(await f.store.list()).pages[0];await f.store.put(p.id,{...await f.store.page(p.id),body:'User correction'},p.revision);
  f.character.chats[0].message[0].data='Different event.';await f.store.sync(await f.host.getLoreChatDelta((await f.store.syncState()).cursor));
  assert.equal((await f.store.context()).text,'');
  await f.store.process(f.extractor);assert.equal((await f.store.conflicts()).length,1);assert.equal((await f.store.page(p.id)).body,'User correction');
  const before=await f.store.index();f.character.chats[0].message.push({chatId:'m2',role:'char',data:'Second event.'});await f.store.sync(await f.host.getLoreChatDelta((await f.store.syncState()).cursor));
  await assert.rejects(f.store.process(async()=>[{title:'bad'}]));assert.deepEqual(await f.store.index(),before);
});
test('mandatory pages ignore search and overflow refuses incomplete context',async()=>{
  const f=fixture();await f.store.put('required',{title:'Rules',kind:'note',body:'Mandatory facts',contextMode:'always'},0);
  assert.match((await f.store.context({query:'unrelated'})).text,/Mandatory/);
  const context=await f.store.context({query:'unrelated',budgetBytes:1});assert.equal(context.requiredOverflow,true);assert.equal(context.text,'');
});
