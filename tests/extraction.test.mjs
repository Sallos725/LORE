import test from 'node:test';import assert from 'node:assert/strict';
import {Store} from '../server/store.mjs';import {validateExtraction,createExtractor} from '../shared/extraction.mjs';
const scope={installationId:'i',userId:'u',characterId:'c',chatId:'t',branchId:'b'};
const source={id:'m',revision:1,op:'upsert',visibility:'public',text:'Alice is a pilot.'};
const proposal={title:'Alice',kind:'person',path:'people/crew/alice.md',aliases:['앨리스'],body:'Alice is a pilot.',expectedRevision:0,visibility:'public',evidence:[{messageId:'m',revision:1,quote:'Alice is a pilot.'}]};
const input={sources:[source],pages:[]};
function setup(t){const s=new Store(':memory:');t.after(()=>s.close());s.enqueue(scope,{eventId:'e',baseRevision:0,changes:[source]});return s;}
test('LLM proposals validate exact evidence, visibility and paths',()=>{
 assert.equal(validateExtraction({pages:[proposal]},input).length,1);
 assert.throws(()=>validateExtraction({pages:[{...proposal,evidence:[{messageId:'m',revision:1,quote:'Invented'}]}]},input),/Evidence/);
 assert.throws(()=>validateExtraction({pages:[proposal]},{sources:[{...source,visibility:'Alice'}],pages:[]}),/Private/);
});
test('LLM commits evidence atomically; editing source excludes derived page',async t=>{
 const s=setup(t);await s.runExtraction(async()=>[proposal]);assert.equal(s.list(scope).pages[0].origin,'llm');
 s.enqueue(scope,{eventId:'edit',baseRevision:1,changes:[{...source,revision:2,text:'Alice is a doctor.'}]});assert.equal(s.context(scope).text,'');
});
test('late extraction cannot overwrite revised sources or manual edits',async t=>{
 const s=setup(t);let resolve;const pending=s.runExtraction(()=>new Promise(r=>resolve=r));
 s.enqueue(scope,{eventId:'edit',baseRevision:1,changes:[{...source,revision:2,text:'Alice is a doctor.'}]});resolve([proposal]);await pending;assert.equal(s.list(scope).pages.length,0);
});
test('manual/path conflicts are retained for review',async t=>{
 const s=setup(t);s.put(scope,'manual',{...proposal,body:'User correction',pinned:true},0);
 await s.runExtraction(async()=>[proposal]);assert.equal(s.page(scope,'manual').body,'User correction');assert.equal(s.conflicts(scope).length,1);
});
test('provider timeout, output cap and invalid JSON do not corrupt memory',async t=>{
 const s=setup(t);const extract=createExtractor({url:'http://localhost:1/chat/completions',model:'test',timeoutMs:100},async()=>new Promise(()=>{}));
 await s.runExtraction(extract);assert.equal(s.jobs(scope)[0].state,'queued');assert.equal(s.list(scope).pages.length,0);
 const bad=createExtractor({url:'https://test.invalid',model:'test'},async()=>new Response('x'.repeat(70000)));
 await assert.rejects(bad(input),/64 KiB/);
});
test('re-extraction can restore invalidated canonical pages with current revision',async t=>{
 const s=setup(t);await s.runExtraction(async()=>[proposal]);const original=s.list(scope).pages[0];
 s.enqueue(scope,{eventId:'revision2',baseRevision:1,changes:[{...source,revision:2,text:'Alice is a doctor.'}]});
 assert.equal(s.list(scope).pages.length,0);assert.equal(s.browse(scope,{folder:'people/crew'}).entries.length,1);
 await s.runExtraction(async input=>{const page=input.pages.find(p=>p.id===original.id);assert.equal(page.active,false);return [{...proposal,id:page.id,expectedRevision:page.revision,body:'Alice is a doctor.',evidence:[{messageId:'m',revision:2,quote:'Alice is a doctor.'}]}];});
 assert.match(s.context(scope).text,/doctor/);assert.doesNotMatch(s.context(scope).text,/pilot/);
});
test('required pages bypass query and never silently disappear at budget limits',t=>{
 const s=new Store(':memory:');t.after(()=>s.close());s.put(scope,'p',{title:'Rules',body:'Mandatory rule',contextMode:'always'},0);
 assert.match(s.context(scope,{query:'unrelated'}).text,/Mandatory/);assert.equal(s.context(scope,{query:'unrelated',budgetBytes:1}).requiredOverflow,true);
});

test('unconfigured scopes cannot starve ready jobs beyond the first 128',async t=>{
 const s=new Store(':memory:');t.after(()=>s.close());
 for(let i=0;i<128;i++)s.enqueue(scope,{eventId:'blocked'+i,baseRevision:i,changes:[{...source,id:'m'+i}]});
 const ready={...scope,chatId:'ready'};s.enqueue(ready,{eventId:'ready',baseRevision:0,changes:[source]});
 let calls=0;const extract=async()=>{calls++;return [proposal];};
 assert.equal(await s.runExtraction(null,{select:job=>JSON.parse(job.scope)[3]==='ready'?extract:null}),true);
 assert.equal(calls,1);assert.equal(s.jobs(ready)[0].state,'completed');assert.equal(s.jobs(scope)[0].attempts,0);
});
