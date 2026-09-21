import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {readLoreDelta} from '../integration/pocketrisu-lore.mjs';import {Store} from '../server/store.mjs';
const scope={installationId:'i',userId:'u',characterId:'c',chatId:'t',branchId:'t'};
const hashFactory=()=>{const h=createHash('sha256');return {update:v=>h.update(v),hex:()=>h.digest('hex')};};
const character=()=>({chaId:'c',chatPage:0,chats:[{id:'t',message:Array.from({length:70},(_,i)=>({memo:'m'+i,role:i%2?'char':'user',data:'Story '+i}))}]});
test('bounded host delta pages history, skips streams, and detects edit/delete/rewind',t=>{
 const s=new Store(':memory:');t.after(()=>s.close());const c=character();let cursor=null;
 for(let i=0;i<3;i++){const delta=readLoreDelta(c,cursor,{hashFactory});assert.ok(delta.messages.length<=32);const result=s.sync(scope,delta);cursor=result.cursor;assert.equal(s.sync(scope,delta).duplicate,true);}
 assert.equal(cursor.count,70);assert.equal(readLoreDelta(c,cursor,{hashFactory,generating:true}).busy,true);
 while(s.runOne()){}assert.equal(s.list(scope,{limit:128}).pages.length,70);
 c.chats[0].message[0].data='Edited';const delta=readLoreDelta(c,cursor,{hashFactory});assert.equal(delta.reset,true);s.sync(scope,delta);assert.equal(s.list(scope).pages.length,0);
 assert.equal(readLoreDelta(c,cursor,{hashFactory,mode:'state'}).valid,false);
 c.chats[0].message.length=2;assert.equal(readLoreDelta(c,cursor,{hashFactory}).reset,true);
});
test('stable scope, missing IDs, oversized source and duplicate IDs fail safely',()=>{
 const c=character();delete c.chats[0].message[0].memo;assert.throws(()=>readLoreDelta(c,null,{hashFactory}),/stable/);
 c.chats[0].message[0].memo='m0';c.chats[0].message[0].data='한'.repeat(6000);assert.throws(()=>readLoreDelta(c,null,{hashFactory}),/16 KiB/);
});
