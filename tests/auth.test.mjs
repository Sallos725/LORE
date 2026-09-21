import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {Store} from '../server/store.mjs';
import {pocketRisuAuth} from '../server/auth.mjs';
import {createServer} from '../server/http.mjs';
import {FullStore} from '../plugin/full-store.mjs';
import {encodeFixture} from './saved-chat-fixture.mjs';
const chat={id:'saved-chat',message:[]};
const upstream=async(url,options)=>{
 assert.equal(options.headers['risu-auth'],'host-login-fixture');assert.equal(options.redirect,'error');
 if(url.endsWith('/api/test_auth'))return Response.json({status:'success'});
 assert.equal(url,'http://host.test/api/chat-content/character/0');return new Response(encodeFixture(chat));
};
test('Full connects with existing host login, derives stable scope, isolates installations and persists settings',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());
 const auth=pocketRisuAuth(store,'http://host.test',upstream);
 const server=createServer(store,[],{authenticate:auth,workerInterval:0});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{const done=once(server,'close');server.close();server.closeAllConnections();await done;});
 const base=`http://127.0.0.1:${server.address().port}`;
 let loginCalls=0;
 const host={getCurrentCharacterIndex:async()=>'character',getCurrentChatIndex:async()=>0,nativeFetch:async(url,options)=>{
  if(url==='/api/test_auth'){loginCalls++;return Response.json({status:'success',token:'host-login-fixture'});}return fetch(url,options);
 }};
 assert.equal((await fetch(base+'/wiki')).status,401);
 const client=await new FullStore(host,base).connect(),identity=await client.identity();assert.ok(loginCalls>=2);
 assert.equal(identity.scope.characterId,'character');assert.equal(identity.scope.chatId,'saved-chat');assert.equal(identity.scope.userId,'pocketrisu');
 await client.put('p',{title:'Connected',body:'A fact.'},0);assert.equal((await client.page('p')).body,'A fact.');
 await client.configureLLM({provider:'custom',url:'http://model.test',model:'fixture',apiKey:'secret-fixture'});
 assert.ok(!(await client.request('/llm')).apiKey);
 assert.equal((await fetch(base+'/identity',{headers:{authorization:'Bearer host-login-fixture','x-lore-character':'other','x-lore-chat':'saved-chat'}})).status,403);
 assert.equal((await fetch(base+'/sync',{method:'POST',headers:{authorization:'Bearer host-login-fixture','x-lore-character':'character','x-lore-chat':'saved-chat','content-type':'application/json'},body:'{}'})).status,403);
 const second=new FullStore(host,base);await second.connect();assert.deepEqual(second.scope,identity.scope);
 // Reconstructing authentication and the HTTP worker preserves identity/settings.
 const reopened=pocketRisuAuth(store,'http://host.test',upstream),principal=await reopened({headers:{authorization:'Bearer host-login-fixture'}});
 assert.deepEqual((await reopened.connect(principal,{selector:{characterId:'character',index:0}})).scope,identity.scope);
 const restored=createServer(store,[],{authenticate:reopened,workerInterval:0});restored.listen(0,'127.0.0.1');await once(restored,'listening');
 try{const response=await fetch(`http://127.0.0.1:${restored.address().port}/identity`,{headers:{authorization:'Bearer host-login-fixture','x-lore-character':'character','x-lore-chat':'saved-chat'}});assert.equal((await response.json()).extractionEnabled,true);}finally{restored.close();restored.closeAllConnections();}
 const other=pocketRisuAuth(store,'http://other.test',async()=>Response.json({status:'success'}));
 await assert.rejects(other({headers:{authorization:'Bearer host-login-fixture','x-lore-character':'character','x-lore-chat':'saved-chat'}}),/Connect/);
 client.close();second.close();
});
test('invalid login, password-unset host and client-provided upstream never grant access',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());
 for(const status of ['unset','incorrect']){const auth=pocketRisuAuth(store,'http://host.test',async()=>Response.json({status}));await assert.rejects(auth({headers:{authorization:'Bearer invalid'}}),/login expired/);}
 assert.throws(()=>pocketRisuAuth(store,'http://user:password@host.test'),/origin/);
});
