import test from 'node:test';
import assert from 'node:assert/strict';
import {LiteStore} from '../plugin/lite-store.mjs';
import {FullStore,connectionURL} from '../plugin/full-store.mjs';
function storage(){const map=new Map();return {map,async getItem(k){return structuredClone(map.get(k));},async setItem(k,v){map.set(k,structuredClone(v));},async removeItem(k){map.delete(k);}};}
const page={title:'인물',body:'기억',kind:'person'};
test('Lite isolates notebooks, serializes revisions and bounds history',async()=>{
  const db=storage(),a=new LiteStore(db,'a'),b=new LiteStore(db,'b');
  await a.put('p',page,0);assert.equal((await b.list()).pages.length,0);
  const writes=await Promise.allSettled([a.put('p',page,1),a.put('p',page,1)]);
  assert.equal(writes.filter(x=>x.status==='fulfilled').length,1);
  for(let r=2;r<8;r++)await a.put('p',page,r);
  assert.equal((await a.history('p')).length,5);assert.equal(db.map.size,6);
  const context=await a.context({budgetBytes:1});assert.equal(context.text,'');assert.equal(context.excluded.length,1);
});
test('failed Lite index commit keeps old readable revision',async()=>{
  const db=storage(),a=new LiteStore(db);await a.put('p',page,0);
  const set=db.setItem;db.setItem=async(k,v)=>{if(k.endsWith(':index'))throw Error('disk full');return set(k,v);};
  await assert.rejects(a.put('p',{...page,body:'new'},1),/disk full/);
  assert.equal((await a.page('p')).body,'기억');
});
test('Lite page cap and UTF-8 body cap',async()=>{
  const a=new LiteStore(storage());for(let i=0;i<128;i++)await a.put('p'+i,page,0);
  await assert.rejects(a.put('overflow',page,0),/full/);
  await assert.rejects(a.put('p0',{...page,body:'한'.repeat(6000)},1),/large/);
});
test('Full transport allows HTTP and HTTPS URLs, handles errors and close',async()=>{
  assert.equal(connectionURL('http://100.96.204.101:6011'),'http://100.96.204.101:6011');
  assert.throws(()=>connectionURL('file:///tmp/lore'),/HTTP/);
  assert.equal(connectionURL('http://localhost:6011/'),'http://localhost:6011');
  const full=new FullStore({nativeFetch:async()=>new Response('{"error":"Unauthorized"}',{status:401})},'https://example.com','a'.repeat(32));
  await assert.rejects(full.identity(),/Unauthorized/);full.close();await assert.rejects(full.identity(),/닫혔/);
});
