// Opt-in integration with a pristine, unmodified PocketRisu container.
// Refuses initialized servers. Only synthetic data and a fake chat/LLM provider.
import {chromium} from 'playwright';
import {createServer as httpServer} from 'node:http';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {Store} from '../server/store.mjs';
import {createServer} from '../server/http.mjs';
import {pocketRisuAuth} from '../server/auth.mjs';
import {fetchSavedChat,resolveChatSelector} from '../shared/pocketrisu.mjs';
import {pocketRisuReader} from '../server/pocketrisu.mjs';
const base=process.env.LORE_TEST_HOST,bridge=process.env.LORE_TEST_BRIDGE??'172.17.0.1';
assert.match(base??'',/^http:\/\/127\.0\.0\.1:\d+$/,'Provide an isolated loopback test container');
assert.equal((await (await fetch(base+'/api/test_auth')).json()).status,'unset','Refusing an initialized host');
const password='lore-synthetic-integration-password',store=new Store(':memory:');let llmCalls=0;
const llm=httpServer(async(req,res)=>{
 try{let text='';for await(const part of req)text+=part;const body=JSON.parse(text),input=JSON.parse(body.messages[1].content),source=input.sources[0];llmCalls++;
 const old=input.pages.find(p=>p.path==='people/extracted.md');
 const pages=source?[{...(old?{id:old.id}:{}),expectedRevision:old?.revision??0,title:'Extracted Alice',kind:'person',path:'people/extracted.md',aliases:['Alice'],body:source.text,visibility:'public',evidence:[{messageId:source.id,revision:source.revision,quote:source.text}]}]:[];
 res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({pages})}}]}));
 }catch{res.writeHead(500);res.end('{}');}
});llm.listen(0,'0.0.0.0');await once(llm,'listening');
const sidecar=createServer(store,{authenticate:pocketRisuAuth(store,base),hostReader:pocketRisuReader(base),workerInterval:20});sidecar.listen(0,'0.0.0.0');await once(sidecar,'listening');
const sidecarURL=`http://${bridge}:${sidecar.address().port}`,llmURL=`http://${bridge}:${llm.address().port}/v1/chat/completions`;
const apiRequests=[];sidecar.on('request',(req,res)=>{const end=res.end;res.end=function(chunk,...args){if(res.statusCode>=400)apiRequests.push(['error',String(chunk)]);return end.call(this,chunk,...args);};res.on('finish',()=>apiRequests.push([req.method,req.url,res.statusCode]));});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),wire=[];page.setDefaultTimeout(10000);
await page.route('**/generativelanguage.googleapis.com/**',route=>{
 wire.push(route.request().postDataJSON());return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({candidates:[{content:{role:'model',parts:[{text:'Alice lives in Busan and works as a pilot.'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:20,candidatesTokenCount:12,totalTokenCount:32}})});
});
const settings=async()=>{await page.locator('button').filter({has:page.locator('svg.lucide-list')}).first().click();await page.locator('.hamburger-menu button').first().click();};
const closeSettings=()=>page.locator('button').filter({has:page.locator('svg.lucide-circle-x')}).last().click();
const importFile=async(button,file)=>{const chooser=page.waitForEvent('filechooser');await button.click();await (await chooser).setFiles(file);};
const openPlugin=async edition=>{
 await page.locator('[data-char-id]').first().click();await page.getByRole('button',{name:'menu',exact:true}).click();await page.getByText('LORE '+edition,{exact:true}).click();
 for(let i=0;i<50;i++){for(const frame of page.frames().slice(1))if(await frame.locator('.lore h1').count()&&(await frame.locator('.lore h1').innerText())==='LORE '+edition)return frame;await page.waitForTimeout(100);}
 throw Error('Plugin UI did not open');
};
const permissions=async frame=>{
 for(let i=0;i<60;i++){
  if((await frame.locator('output').innerText()).includes('자동 기억을 시작했습니다.'))return;
  const text=await page.locator('body').innerText();
  if(/Plugin lore_(lite|full) is requesting/.test(text))await page.getByRole('button',{name:'Yes',exact:true}).click();
  await page.waitForTimeout(100);
 }
 throw Error('Automation failed: '+await frame.locator('output').innerText());
};
try{
 await page.goto(base);await page.getByRole('button',{name:'Confirm',exact:true}).waitFor();await page.locator('input').last().fill(password);await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await page.getByRole('button',{name:'Character Manager',exact:true}).click();await page.getByRole('button',{name:'Add Character',exact:true}).click();
 const card={spec:'chara_card_v2',spec_version:'2.0',data:{name:'LORE Integration',description:'Synthetic verification character.',personality:'',scenario:'',first_mes:'Alice is a pilot.',mes_example:'',creator_notes:'',system_prompt:'',post_history_instructions:'',alternate_greetings:[],tags:[],creator:'LORE',character_version:'1.0',extensions:{}}};
 await importFile(page.getByText('Import Character',{exact:true}),{name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(card))});await page.getByRole('button',{name:'Send',exact:true}).waitFor();
 for(const edition of ['Full','Lite']){
  await settings();await page.getByText('Chat Bot',{exact:true}).first().click();await page.locator('input[type=password]').fill('synthetic-key');await page.getByText('Plugin',{exact:true}).first().click();
  await importFile(page.getByRole('button',{name:'Import plugin',exact:true}),edition==='Full'?'full/plugin/lore-full.js':'lite/lore-lite.js');await page.getByText('LORE '+edition,{exact:true}).first().waitFor();await closeSettings();
  let frame=await openPlugin(edition);if(edition==='Full')await frame.locator('[data-url]').fill(sidecarURL);
  await frame.locator('[data-start]').click();await frame.getByText('현재 채팅에 연결했습니다.',{exact:true}).waitFor();
  const canary='LORE_CANARY_'+edition;
  await frame.locator('[data-new]').click();await frame.locator('[data-title]').fill('Verified wiki');await frame.locator('[data-path]').fill('people/manual.md');await frame.locator('[data-aliases]').fill('앨리스, Al');await frame.locator('[data-body]').fill('Alice is a pilot. Verification detail: '+canary);await frame.locator('[data-mode]').selectOption('always');await frame.locator('[data-save]').click();await frame.getByText('저장했습니다.',{exact:true}).waitFor();
  await frame.locator('summary').first().click();await frame.locator('[data-provider]').selectOption('custom');await frame.locator('[data-llm-url]').fill(llmURL);await frame.locator('[data-model]').fill('synthetic');await frame.locator('[data-auto]').click();await permissions(frame);await frame.locator('[data-close]').click();
  const start=wire.length,session=await (await page.request.get(base+'/api/test_auth')).json();
  const selected=await resolveChatSelector(fetch,base,{characterIndex:0,index:0},session.token);
  const savedCount=async()=>(await fetchSavedChat(fetch,base,selected,session.token,1048576)).message.length;
  const initialCount=await savedCount();
  for(let i=0;i<3;i++){await page.locator('textarea').fill(`Synthetic ${edition} turn ${i}: recall Alice.`);await page.getByRole('button',{name:'Send',exact:true}).click();const deadline=Date.now()+20000;while(await savedCount()<initialCount+2*(i+1)&&Date.now()<deadline)await page.waitForTimeout(200);assert.ok(await savedCount()>=initialCount+2*(i+1),'Host must save the confirmed turn before the next request');await page.getByRole('button',{name:'Send',exact:true}).waitFor();}
  assert.ok(wire.slice(start).some(r=>JSON.stringify(r).includes(canary)),edition+' memory must reach a real Gemini request');
  if(edition==='Lite')assert.ok(wire.slice(start).every(r=>!JSON.stringify(r).includes('LORE_CANARY_Full')),'Full stopped; no duplicate injection');
  frame=await openPlugin(edition);await frame.locator('[data-start]').click();await frame.getByText('현재 채팅에 연결했습니다.',{exact:true}).waitFor();await frame.locator('summary').first().click();await frame.locator('[data-jobs]').click();
  await frame.locator('[data-job-list]').filter({hasText:/completed/}).waitFor();
  await frame.locator('[data-stop]').click();await frame.locator('[data-close]').click();
  console.log(`PASS stock PocketRisu ${edition}: install, permissions, login, stable IDs, wiki edit, source collection, independent LLM, real Gemini request injection`);
 }
 assert.ok(llmCalls>=2);assert.ok(store.db.prepare('SELECT count(*) AS n FROM sources').get().n>=2);
}catch(error){console.error('API requests:',JSON.stringify(apiRequests));for(const f of page.frames().slice(1)){try{console.error('Plugin status:',await f.locator('output').allTextContents());}catch{}}throw error;}finally{
 await browser.close();sidecar.close();sidecar.closeAllConnections();llm.close();llm.closeAllConnections();
 while(store.extractionRunning)await new Promise(r=>setTimeout(r,10));store.close();
}
