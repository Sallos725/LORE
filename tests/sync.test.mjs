import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {readLoreDelta} from '../shared/chat-delta.mjs';import {Store} from '../server/store.mjs';
const scope={installationId:'i',userId:'u',characterId:'c',chatId:'t',branchId:'t'};
const hashFactory=()=>{const h=createHash('sha256');return {update:v=>h.update(v),hex:()=>h.digest('hex')};};
const character=()=>({chaId:'c',chatPage:0,chats:[{id:'t',message:Array.from({length:70},(_,i)=>({chatId:'m'+i,role:i%2?'char':'user',data:'Story '+i}))}]});
test('bounded saved delta pages history and detects edit/delete/rewind',async t=>{
 const s=new Store(':memory:');t.after(()=>s.close());const c=character();let cursor=null;
 for(let i=0;i<3;i++){const delta=await readLoreDelta(c,cursor,{hashFactory});assert.ok(delta.messages.length<=32);const result=s.sync(scope,delta);cursor=result.cursor;assert.equal(s.sync(scope,delta).duplicate,true);}
 assert.equal(cursor.count,70);assert.equal((await readLoreDelta(c,cursor,{hashFactory,generating:true})).busy,true);
 while(s.runOne()){}assert.equal(s.list(scope,{limit:128}).pages.length,70);
 c.chats[0].message[0].data='Edited';const delta=await readLoreDelta(c,cursor,{hashFactory});assert.equal(delta.reset,true);s.sync(scope,delta);assert.equal(s.list(scope).pages.length,0);
 assert.equal((await readLoreDelta(c,cursor,{hashFactory,mode:'state'})).valid,false);
 c.chats[0].message.length=2;assert.equal((await readLoreDelta(c,cursor,{hashFactory})).reset,true);
});
test('stable scope, missing IDs, oversized source and duplicate IDs fail safely',async()=>{
 const c=character();delete c.chats[0].message[0].chatId;await assert.rejects(()=>readLoreDelta(c,null,{hashFactory}),/stable/);
 c.chats[0].message[0].chatId='m0';c.chats[0].message[0].data='한'.repeat(6000);await assert.rejects(()=>readLoreDelta(c,null,{hashFactory}),/16 KiB/);
});
test('actual PocketRisu Message chatId, comments and allBefore flags control collection',async()=>{
 const character={chaId:'c',chatPage:0,chats:[{id:'t',message:[{chatId:'one',role:'char',data:'Old fact.'},{chatId:'comment',role:'char',data:'Never happened',isComment:true},{chatId:'off',role:'user',data:'Discarded',disabled:true}]}]};
 const hashFactory=()=>{const h=createHash('sha256');return {update:s=>h.update(s),hex:()=>h.digest('hex')};};
 const first=await readLoreDelta(character,null,{hashFactory});assert.deepEqual(first.messages.map(m=>m.id),['one']);
 character.chats[0].message.push({chatId:'cut',role:'char',data:'Hidden marker',disabled:'allBefore'},{chatId:'now',role:'char',data:'Current fact.'});
 assert.equal((await readLoreDelta(character,first.cursor,{hashFactory,mode:'state'})).valid,false);
 const reset=await readLoreDelta(character,first.cursor,{hashFactory});assert.equal(reset.reset,true);assert.deepEqual(reset.messages.map(m=>m.id),['now']);
 character.chats[0].message.at(-1).disabled=true;assert.equal((await readLoreDelta(character,reset.cursor,{hashFactory,mode:'state'})).valid,false);
});
