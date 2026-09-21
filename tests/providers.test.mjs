import test from 'node:test';import assert from 'node:assert/strict';
import {providerConfig,providerRequest} from '../shared/providers.mjs';import {createExtractor} from '../shared/extraction.mjs';
const input={sources:[{id:'m',revision:1,visibility:'public',text:'A fact.'}],pages:[]};
for(const provider of ['openai','openrouter','ollama','custom','anthropic','gemini'])test(`${provider} sends independent extraction request and validates response`,async()=>{
 const extractor=createExtractor({provider,url:provider==='custom'?'http://local:1234/v1/chat/completions':undefined,model:'test-model',apiKey:'synthetic-key',jsonMode:true},async(url,args)=>{
  const body=JSON.parse(args.body);assert.equal(args.redirect,'error');assert.ok(!url.includes('synthetic-key'));
  if(provider==='anthropic'){assert.equal(args.headers['x-api-key'],'synthetic-key');assert.ok(body.system);return Response.json({content:[{type:'text',text:'{"pages":[]}'}]});}
  if(provider==='gemini'){assert.equal(args.headers['x-goog-api-key'],'synthetic-key');assert.match(url,/models\/test-model:generateContent$/);assert.equal(body.generationConfig.responseMimeType,'application/json');return Response.json({candidates:[{content:{parts:[{text:'{"pages":[]}'}]}}]});}
  assert.equal(args.headers.authorization,'Bearer synthetic-key');assert.equal(body.model,'test-model');return Response.json({choices:[{message:{content:'{"pages":[]}'}}]});
 });assert.deepEqual(await extractor(input),[]);
});
test('provider settings reject credential URLs and malformed keys',()=>{
 assert.throws(()=>providerConfig({provider:'unknown',model:'x'}));assert.throws(()=>providerConfig({provider:'openai',url:'https://x/?key=secret',model:'x'}));assert.throws(()=>providerConfig({provider:'openai',model:'x',apiKey:'secret\nheader'}));
 assert.equal(providerRequest({provider:'anthropic',model:'x'},[{role:'system',content:'s'},{role:'user',content:'u'}]).body.max_tokens,4096);
});
