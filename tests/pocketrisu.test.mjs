import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeChat,readBounded,confirmedSnapshot} from '../shared/pocketrisu.mjs';
import {readLoreDelta} from '../shared/chat-delta.mjs';
import {pocketRisuReader} from '../server/pocketrisu.mjs';
import {Store} from '../server/store.mjs';
import {encodeFixture} from './saved-chat-fixture.mjs';
const scope={installationId:'i',userId:'u',characterId:'c',chatId:'chat',branchId:'chat'},selector={characterId:'c',index:0};
const chat={id:'chat',message:[{chatId:'m1',role:'char',data:'Alice lives in Seoul.'},{chatId:'future',role:'char',data:'UNCONFIRMED OUTPUT'}]};
test('saved MessagePack and streamed limits reject corrupt, oversized and unsafe input',async()=>{
 assert.equal(decodeChat(encodeFixture(chat)).message[0].data,chat.message[0].data);
 assert.throws(()=>decodeChat(encodeFixture(chat).slice(0,-1)),/Truncated/);
 await assert.rejects(readBounded(new Response(new Uint8Array(20)),10),/size limit/);
 const body=encodeFixture({id:'x',message:[],__proto__:null,constructor:'safe'});assert.equal(Object.getPrototypeOf(decodeChat(body)),null);
});
test('confirmed prefix excludes future outputs and detects rewind, edit and branch mismatch',async()=>{
 const snapshot=confirmedSnapshot(selector,chat,['m1']),first=await readLoreDelta(snapshot,null);
 assert.deepEqual(first.messages.map(m=>m.id),['m1']);assert.equal(first.cursor.count,1);
 assert.throws(()=>confirmedSnapshot(selector,chat,['missing']),/Saved chat/);
 assert.throws(()=>confirmedSnapshot(selector,chat,['future','m1']),/Saved chat/);
 snapshot.chats[0].message[0]={...chat.message[0],data:'Alice moved to Busan.'};assert.equal((await readLoreDelta(snapshot,first.cursor)).reset,true);
});
test('Full reads only configured upstream and keeps raw chat on the server',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());let seen;
 const reader=pocketRisuReader('http://pocketrisu:6001',async(url,args)=>{seen={url,args};return new Response(encodeFixture(chat));});
 const result=await reader(store,scope,'world',{selector,sessionToken:'session-fixture',boundaries:['m1']});
 assert.equal(result.complete,true);assert.equal(result.chatId,'chat');assert.ok(!JSON.stringify(result).includes('Alice'));
 assert.equal(seen.url,'http://pocketrisu:6001/api/chat-content/c/0');assert.equal(seen.args.headers['risu-auth'],'session-fixture');assert.equal(seen.args.redirect,'error');
 assert.equal(store.source(scope,'m1',1).text,'Alice lives in Seoul.');assert.throws(()=>store.source(scope,'future',1));
 await assert.rejects(reader(store,{...scope,chatId:'other'},'world',{selector,sessionToken:'x',boundaries:['m1']}),/Chat scope/);
 await assert.rejects(reader(store,scope,'world',{selector:{...selector,characterId:'other'},sessionToken:'x',boundaries:['m1']}),/Character scope/);
 assert.throws(()=>pocketRisuReader('http://user:secret@host'),/origin/);
});
