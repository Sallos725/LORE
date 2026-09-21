import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {Store} from '../server/store.mjs';
import {createServer} from '../server/http.mjs';
const scope={installationId:'i',userId:'u',characterId:'c',chatId:'chat',branchId:'branch'};
function testAuth(credentials){return req=>credentials.find(c=>req.headers.authorization==='Bearer '+c.token)&&{audience:'world',...credentials.find(c=>req.headers.authorization==='Bearer '+c.token)};}
async function setup(t) {
  const store=new Store(':memory:');
  const token='a'.repeat(32), other='b'.repeat(32);
  const server=createServer(store,{authenticate:testAuth([{token,scope},{token:other,scope:{...scope,userId:'other'},ingest:true}]),workerInterval:0});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(async () => { const closed=once(server,'close'); server.close(); server.closeAllConnections(); await closed; store.close(); });
  const url=`http://127.0.0.1:${server.address().port}`;
  const request=(path,method='GET',value,credential=token) => fetch(url+path,{method,headers:{authorization:`Bearer ${credential}`,'content-type':'application/json'},body:value === undefined ? undefined : JSON.stringify(value)});
  return {store,request,token,other,url};
}
test('auth, credential scope, manual conflict and pagination', async t => {
  const {request,other}=await setup(t);
  assert.equal((await request('/wiki','GET',undefined,'wrong')).status,401);
  assert.equal((await request('/health','GET',undefined,'wrong')).status,200);
  const page={title:'Alice',body:'A researcher',kind:'person'};
  assert.equal((await request('/wiki/p','PATCH',{page,expectedRevision:0})).status,200);
  assert.equal((await request('/wiki/p','PATCH',{page,expectedRevision:0})).status,409);
  assert.equal((await request('/wiki/p','GET',undefined,other)).status,404);
  const list=await (await request('/wiki?limit=1')).json(); assert.equal(list.pages[0].body,undefined);
  assert.equal((await request('/wiki?limit=100000')).status,400);
  assert.equal((await request('/context','POST',{scope:{},budgetBytes:500})).status,400);
  assert.match((await (await request('/context','POST',{budgetBytes:500})).json()).text,/researcher/);
});
test('body cap, malformed input, separate ingest credential, disconnected worker', async t => {
  const {request,store,other,url}=await setup(t);
  assert.equal((await request('/context','POST',{query:'x'.repeat(140000)})).status,413);
  assert.equal((await fetch(url+'/wiki',{headers:{authorization:`Bearer ${other}`},method:'PATCH',body:'bad'})).status,404);
  assert.equal((await request('/context','POST',null)).status,400);
  const value={eventId:'e',baseRevision:0,changes:[{id:'m',revision:1,op:'upsert',visibility:'public',text:'Committed text'}]};
  assert.equal((await request('/events','POST',value)).status,403);
  const response=await request('/events','POST',value,other); assert.equal(response.status,202);
  const job=await response.json();
  // No client connection or watcher is involved in processing accepted jobs.
  store.runOne();
  assert.equal((await (await request('/jobs/'+job.id,'GET',undefined,other)).json()).state,'completed');
  assert.equal((await request('/jobs/'+job.id)).status,403);
});

test('Full LLM settings are credential-bound, redact keys, and keep accepted jobs off the browser',async t=>{
 const {createServer:serverFactory}=await import('node:http');
 let calls=0;
 const llm=serverFactory(async(req,res)=>{calls++;assert.equal(req.headers.authorization,'Bearer secret-key-fixture');let raw='';for await(const part of req)raw+=part;const data=JSON.parse(raw);assert.equal(data.model,'test-model');res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:'{"pages":[]}'}}]}));});
 llm.listen(0,'127.0.0.1');await once(llm,'listening');t.after(()=>llm.close());
 const store=new Store(':memory:'),token='configured-token-'.repeat(3),readToken='read-only-token-'.repeat(3),server=createServer(store,{authenticate:testAuth([{token,scope,collect:true,configure:true},{token:readToken,scope}]),workerInterval:10});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{const done=once(server,'close');server.close();server.closeAllConnections();await done;store.close();});
 const endpoint=`http://127.0.0.1:${server.address().port}`,config={provider:'custom',url:`http://127.0.0.1:${llm.address().port}/v1/chat/completions`,model:'test-model',apiKey:'secret-key-fixture'};
 const request=(method,credential=token)=>fetch(endpoint+'/llm',{method,headers:{authorization:`Bearer ${credential}`,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(config)}:{})});
 assert.equal((await request('POST',readToken)).status,403);assert.equal((await request('POST')).status,200);
 assert.ok(!(await (await request('GET')).text()).includes('secret-key-fixture'));
 store.enqueue(scope,{eventId:'independent',baseRevision:0,changes:[{id:'m',revision:1,op:'upsert',visibility:'public',text:'Fact.'}]});
 const deadline=Date.now()+3000;while(store.jobs(scope)[0].state!=='completed'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
 assert.equal(store.jobs(scope)[0].state,'completed');assert.equal(calls,1);assert.equal((await request('DELETE')).status,200);
 assert.equal((await (await request('GET')).json()).configured,false);
});


test('replayed HTTP edits return the saved revision while independent stale edits still conflict',async t=>{
 const {request,store,other}=await setup(t),page={title:'Alice',body:'Original fact'},data={page,expectedRevision:0,requestId:'edit-one'};
 const first=await (await request('/wiki/p','PATCH',data)).json();
 assert.deepEqual(await (await request('/wiki/p','PATCH',data)).json(),first);
 assert.equal(store.history(scope,'p').length,1);
 assert.equal((await request('/wiki/p','PATCH',{...data,page:{...page,body:'Different fact'}})).status,409);
 assert.equal((await request('/wiki/p','PATCH',{...data,requestId:'different-edit'})).status,409);
 assert.equal((await request('/wiki/p','PATCH',{page:{...page,body:'New revision'},expectedRevision:1,requestId:'edit-two'})).status,200);
 assert.equal((await (await request('/wiki/p','PATCH',data)).json()).revision,1);
 assert.equal(store.page(scope,'p').body,'New revision');
 assert.equal((await request('/wiki/p','PATCH',data,other)).status,200);
});
