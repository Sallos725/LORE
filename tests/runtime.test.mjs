import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFixture} from './saved-chat-fixture.mjs';
import {requestBudget} from '../plugin/pocketrisu.mjs';
import {LiteStore} from '../plugin/lite-store.mjs';
import {AutoMemory} from '../plugin/runtime.mjs';
import {readLoreDelta} from '../shared/chat-delta.mjs';
const storage=()=>{const data=new Map();return {getItem:async k=>structuredClone(data.get(k)),setItem:async(k,v)=>data.set(k,structuredClone(v)),removeItem:async k=>data.delete(k)};};
function fixture(){
 const character={chaId:'c',chatPage:0,chats:[{id:'chat',message:[{chatId:'m1',role:'char',data:'Alice lives in Seoul.'},{chatId:'future',role:'char',data:'Unconfirmed stream.'}]}]},store=new LiteStore(storage()),state={offline:false,maxContext:8192},hooks=new Set();
 const host={
  getCurrentCharacterIndex:async()=>0,getCurrentChatIndex:async()=>character.chatPage,
  getDatabase:async keys=>{assert.deepEqual(keys,['maxContext','maxResponse']);return {maxContext:state.maxContext,maxResponse:1024};},
  getCharacter:()=>{throw Error('Full character copies forbidden');},
  nativeFetch:async(url,args)=>{if(state.offline)throw Error('offline');assert.equal(args.method,'GET');assert.ok(args.requestTimeoutMs);if(url==='/api/db/stats/characters')return Response.json({characters:[{chaId:character.chaId}]});if(url==='/api/test_auth')return Response.json({status:'success',token:'synthetic-session'});assert.equal(url,'/api/chat-content/c/0');assert.equal(args.headers['risu-auth'],'synthetic-session');return new Response(encodeFixture(character.chats[0]));},
  addRisuReplacer:async(_,fn)=>hooks.add(fn),removeRisuReplacer:async(_,fn)=>hooks.delete(fn),registerBodyIntercepter:async fn=>{hooks.add(fn);return {id:'body'};},unregisterBodyIntercepter:async()=>hooks.clear()
 };
 const extractor=async input=>[{title:'Alice',kind:'person',path:'people/Alice.md',aliases:['앨리스'],body:'Alice lives in Seoul.',expectedRevision:0,visibility:'public',evidence:[{messageId:input.sources[0].id,revision:input.sources[0].revision,quote:input.sources[0].text}]}];
 const delta=(cursor,mode)=>readLoreDelta(character,cursor,{mode});return {character,store,state,hooks,host,extractor,delta};
}
const messages=[{role:'assistant',content:'Alice lives in Seoul.',memo:'m1'},{role:'user',content:'Where is Alice?',memo:'new'}];
const wire=()=>JSON.stringify({model:'fixture',max_tokens:1024,messages:messages.map(({memo,...m})=>m)});
test('stock APIs collect canonical prefix; independent LLM extracts; JSON-string final hook injects',async()=>{
 const f=fixture(),runtime=new AutoMemory(f.host);await runtime.start({store:f.store,extractor:f.extractor,injectionMode:'final'});
 try {
  assert.equal((await f.store.index()).length,0);assert.equal(await runtime.before(messages,'model'),messages);
  while(f.store.processing)await new Promise(r=>setTimeout(r,1));await runtime.process();
  const pages=(await f.store.index());assert.equal(pages.length,1);assert.equal((await f.store.page(pages[0].id)).evidence[0].messageId,'m1');assert.equal((await f.store.syncState()).cursor.count,1);
  await runtime.before(messages,'model');const injected=await runtime.finalBody(wire(),'openai_streaming');assert.equal(JSON.parse(injected).messages.length,3);assert.match(injected,/lore-memory/);
  assert.equal(await runtime.finalBody(wire(),'openai_streaming'),wire());
  await runtime.before(messages,'model');f.state.maxContext=1200;assert.equal(await runtime.finalBody(wire(),'openai_basic'),wire());
  f.state.maxContext=8192;await runtime.before(messages,'model');f.character.chats[0].message[0].data='Alice moved to Busan.';
  assert.equal(await runtime.finalBody(wire(),'openai_basic'),wire());assert.equal((await f.store.context()).text,'');
 }finally{await runtime.stop();assert.equal(f.hooks.size,0);}
});
test('missing saved anchors, offline, alternate requests and changed chats fail open',async()=>{
 const f=fixture(),runtime=new AutoMemory(f.host);await runtime.start({store:f.store,extractor:f.extractor,injectionMode:'final'});
 try{
  assert.equal(await runtime.before(messages,'other'),messages);assert.equal((await f.store.syncState()).cursor,null);
  const noAnchor=[{role:'user',content:'first'}];assert.equal(await runtime.before(noAnchor,'model'),noAnchor);
  f.state.offline=true;assert.equal(await runtime.before(messages,'model'),messages);assert.equal(await runtime.finalBody(wire(),'openai_basic'),wire());
  f.state.offline=false;f.character.chats[0].id='branch';await runtime.before(messages,'model');assert.equal((await f.store.syncState()).cursor,null);
 }finally{await runtime.stop();}
});
test('budget estimate accounts for full prompt, framing, reserve and unsupported multimodal data',()=>{
 const settings={maxContext:8192,maxResponse:1024};assert.equal(requestBudget(messages,'memory',settings,1024,1024).fits,true);
 assert.equal(requestBudget(messages,'한'.repeat(400),settings,1024,1024).fits,false);
 assert.equal(requestBudget(messages,'memory',settings,9000,1024).fits,false);
 assert.equal(requestBudget([{role:'user',content:[{type:'image_url'}]}],'memory',settings,1024,1024).fits,false);
});
test('Lite reset invalidates manual corrections with old evidence; failed batch stays atomic',async()=>{
  const f=fixture(),id=await f.delta(null,'identity');await f.store.bind({characterId:id.characterId,chatId:id.chatId,branchId:id.branchId});
  await f.store.sync(await f.delta(null));await f.store.process(f.extractor);
  const p=(await f.store.list()).pages[0];await f.store.put(p.id,{...await f.store.page(p.id),body:'User correction'},p.revision);
  f.character.chats[0].message[0].data='Different event.';await f.store.sync(await f.delta((await f.store.syncState()).cursor));
  assert.equal((await f.store.context()).text,'');
  await f.store.process(f.extractor);assert.equal((await f.store.conflicts()).length,1);assert.equal((await f.store.page(p.id)).body,'User correction');
  const before=await f.store.index();f.character.chats[0].message.push({chatId:'m2',role:'char',data:'Second event.'});await f.store.sync(await f.delta((await f.store.syncState()).cursor));
  await assert.rejects(f.store.process(async()=>[{title:'bad'}]));assert.deepEqual(await f.store.index(),before);
});
test('mandatory pages ignore search and overflow refuses incomplete context',async()=>{
  const f=fixture();await f.store.put('required',{title:'Rules',kind:'note',body:'Mandatory facts',contextMode:'always'},0);
  assert.match((await f.store.context({query:'unrelated'})).text,/Mandatory/);
  const context=await f.store.context({query:'unrelated',budgetBytes:1});assert.equal(context.requiredOverflow,true);assert.equal(context.text,'');
});

test('a late final check cannot claim injection after the request deadline',async()=>{
 const f=fixture(),runtime=new AutoMemory(f.host);await runtime.start({store:f.store,extractor:f.extractor,injectionMode:'final'});
 try{
  await runtime.before(messages,'model');while(f.store.processing)await new Promise(r=>setTimeout(r,1));
  await runtime.before(messages,'model');assert.ok(runtime.receipt);
  let release;const capture=runtime.client.capture.bind(runtime.client);
  runtime.client.capture=async(...args)=>{await new Promise(r=>release=r);return capture(...args);};
  const deadline=runtime.deadline.bind(runtime);runtime.deadline=work=>deadline(work,10);
  assert.equal(await runtime.finalBody(wire(),'openai_basic'),wire());const state={...runtime.state};
  release();await new Promise(r=>setTimeout(r,20));assert.deepEqual(runtime.state,state);assert.match(state.message,/시간 초과/);
 }finally{await runtime.stop();}
});

test('common request injection reaches provider and model-preset paths without a final-body API',async()=>{
 const f=fixture();delete f.host.registerBodyIntercepter;const runtime=new AutoMemory(f.host);
 await runtime.start({store:f.store,extractor:f.extractor});
 try{
  await runtime.before(messages,'model');while(f.store.processing)await new Promise(r=>setTimeout(r,1));
  const prepared=await runtime.before(messages,'model');assert.equal(prepared.length,3);assert.match(prepared[1].content,/lore-memory/);
  assert.equal(messages.length,2);assert.equal(runtime.receipt,null);assert.equal(runtime.state.budgetStage,'beforeRequest');
  f.state.maxContext=1100;assert.equal(await runtime.before(messages,'model'),messages);
  const image=[messages[0],{...messages[1],multimodals:[{type:'image',data:'fixture'}]}];assert.equal(await runtime.before(image,'model'),image);
 }finally{await runtime.stop();}
});

test('new chat IDs, including replacement at the same array index, use separate wiki clusters',async()=>{
 const {chatNotebook}=await import('../plugin/notebook.mjs');
 const f=fixture(),runtime=new AutoMemory(f.host),storage=await f.store.storage,clusters=new Map();
 const get=async()=>{const scope={characterId:'c',chatId:f.character.chats[0].id,branchId:f.character.chats[0].id},key=await chatNotebook(scope);if(!clusters.has(key)){const store=new LiteStore(storage,key);await store.bind(scope);clusters.set(key,store);}return clusters.get(key);};
 const original=await get();await original.put('old',{title:'Old secret',body:'Only in chat A.',contextMode:'always'},0);
 await runtime.start({store:original,extractor:f.extractor,switchStore:get});
 try{
  f.character.chats[0].id='chat-B';const output=await runtime.before(messages,'model');assert.equal(output,messages);assert.equal(runtime.scope.chatId,'chat-B');assert.doesNotMatch(JSON.stringify(output),/Only in chat A/);
  while(runtime.store.processing)await new Promise(r=>setTimeout(r,1));
  assert.notEqual(await chatNotebook({characterId:'c',chatId:'chat',branchId:'chat'}),await chatNotebook({characterId:'c',chatId:'chat-B',branchId:'chat-B'}));
  assert.equal((await original.page('old')).body,'Only in chat A.');assert.equal((await runtime.store.list({query:'Old secret'})).pages.length,0);
  f.character.chats[0].id='chat';await runtime.before(messages,'model');assert.equal(runtime.store,original);
 }finally{await runtime.stop();}
});


test('a follow-up without a name recalls relevant wiki facts using recent conversation',async()=>{
 const f=fixture(),runtime=new AutoMemory(f.host);await runtime.start({store:f.store,extractor:async()=>[]});
 try{
  await f.store.put('profession',{title:'Alice',aliases:['앨리스'],body:'Her profession is a pilot.'},0);
  await f.store.put('unrelated',{title:'Unrelated castle',body:'Unrelated private subplot.'},0);
  const followup=[messages[0],{role:'user',content:'그녀의 직업은 뭐였지?',memo:'next'}];
  assert.equal((await f.store.context({query:followup[1].content})).text,'');
  const output=await runtime.before(followup,'model');
  assert.equal(output.length,3);assert.match(output[1].content,/profession is a pilot/);assert.doesNotMatch(output[1].content,/Unrelated private subplot/);
 }finally{await runtime.stop();}
});
