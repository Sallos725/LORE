import {chromium,webkit} from 'playwright';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {encodeFixture} from './saved-chat-fixture.mjs';
import {pocketRisuAuth} from '../server/auth.mjs';
import {pocketRisuReader} from '../server/pocketrisu.mjs';

import {Store} from '../server/store.mjs';
import {createServer} from '../server/http.mjs';
const scope={installationId:'test',userId:'test',characterId:'c',chatId:'chat',branchId:'chat'},token='browser-test-'.repeat(4);
const extract=async input=>[{title:'Alice',kind:'person',path:'people/Alice.md',aliases:['앨리스'],body:'Alice lives in Seoul.',visibility:'public',expectedRevision:0,evidence:[{messageId:input.sources[0].id,revision:input.sources[0].revision,quote:input.sources[0].text}]}];
const savedChat={id:'chat',message:[{chatId:'browser-m1',role:'char',data:'Alice lives in Seoul.'}]};
const upstream=async(url)=>url.endsWith('/api/db/stats/characters')?Response.json({characters:[{chaId:'c'}]}):url.endsWith('/api/test_auth')?Response.json({status:'success'}):new Response(encodeFixture(savedChat));
const hostReader=pocketRisuReader('http://pocketrisu.test',upstream);
const store=new Store(':memory:');const server=createServer(store,{authenticate:pocketRisuAuth(store,'http://pocketrisu.test',upstream),workerInterval:50,extractor:extract,hostReader});server.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`;
try {
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch({headless:true});
    try {
      for(const edition of ['Lite','Full']){
        const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.exposeFunction('backendFetch',async(url,options)=>{
          if(url==='/api/db/stats/characters'){assert.equal(edition,'Lite');return {status:200,text:JSON.stringify({characters:[{chaId:'c'}]})};}
          if(url==='/api/test_auth')return {status:200,text:JSON.stringify({status:'success',token:'synthetic-session'})};
          if(url==='/api/chat-content/c/0'){assert.equal(edition,'Lite','Full must not copy raw chat through the browser');return {status:200,bytes:[...encodeFixture(savedChat)]};}
          assert.ok(url.startsWith(base+'/'));
          if(url===base+'/fake-llm'){const input=JSON.parse(JSON.parse(options.body).messages[1].content);return {status:200,text:JSON.stringify({choices:[{message:{content:JSON.stringify({pages:await extract(input)})}}]})};}
          const res=await fetch(url,options);return {status:res.status,text:await res.text()};
        });
        await page.goto(base+'/health');
        await page.evaluate(()=>{
          document.body.replaceChildren();const values=new Map();window.registrations=new Set();window.forbiddenCalls=0;
          window.Risuai={
            registerSetting:async(name,open,icon,type,id)=>{window.openLore=open;window.registrations.add(id);return {id};},
            registerButton:async(options)=>{window.registrations.add(options.id);return {id:options.id};},
            unregisterUIPart:async id=>window.registrations.delete(id),onUnload:async fn=>window.disposeLore=fn,
            showContainer:async()=>{},hideContainer:async()=>{},
            getLocalPluginStorage:async()=>({getItem:async key=>structuredClone(values.get(key)),setItem:async(key,value)=>values.set(key,structuredClone(value)),removeItem:async key=>values.delete(key)}),
            nativeFetch:async(url,options)=>{const result=await window.backendFetch(url,options);return new Response(result.bytes?Uint8Array.from(result.bytes):result.text,{status:result.status});},
            getDatabase:async keys=>{if(JSON.stringify(keys)!==JSON.stringify(['maxContext','maxResponse'])){window.forbiddenCalls++;throw Error('large DB read');}return {maxContext:8192,maxResponse:1024};},getCharacter:()=>{window.forbiddenCalls++;throw Error('forbidden');},
            getCurrentCharacterIndex:async()=>0,getCurrentChatIndex:async()=>0,
            addRisuReplacer:async(type,fn)=>{window.beforeLore=fn;},removeRisuReplacer:async()=>{window.beforeLore=null;},
            registerBodyIntercepter:async fn=>{window.finalLore=fn;return {id:'budget'};},unregisterBodyIntercepter:async()=>{window.finalLore=null;},
          };
        });
        await page.addScriptTag({content:readFileSync(edition==='Lite'?'lite/lore-lite.js':'full/plugin/lore-full.js','utf8')});
        await page.waitForFunction(()=>window.registrations.size===2);await page.evaluate(()=>window.openLore());
        if(edition==='Full'){await page.locator('[data-url]').fill(base);}
        await page.locator('[data-start]').click();await page.locator('[data-work]').waitFor({state:'visible'});
        await page.getByText('현재 채팅에 연결했습니다.',{exact:false}).waitFor();await page.locator('[data-new]').click();
        const title=`${name} ${edition}`;await page.locator('[data-title]').fill(title);await page.locator('[data-path]').fill('characters/team/'+title+'.md');await page.locator('[data-aliases]').fill('별칭, lookup_'+name+'_'+edition);await page.locator('[data-body]').fill('<img src=x onerror="window.bad=true"> 인물은 서울에 있다.');
        await page.locator('[data-save]').click();await page.getByText('저장했습니다.',{exact:true}).waitFor();
        await page.locator('[data-tree]').click();await page.getByRole('button',{name:'📁 characters',exact:true}).click();await page.getByRole('button',{name:'📁 team',exact:true}).click();await page.locator('.list button').filter({hasText:title}).waitFor();await page.locator('[data-search]').fill('lookup_'+name+'_'+edition);await page.locator('[data-find]').click();
        await page.waitForFunction(()=>document.querySelector('output').textContent.includes('1개 문서'));
        await page.locator('.list button').click();await page.locator('[data-history]').click();
        await page.waitForFunction(()=>document.querySelector('[data-preview]').textContent.includes('r1'));
        assert.equal(await page.locator('img').count(),0);
        await page.locator('[data-context]').click();await page.waitForFunction(()=>document.querySelector('output').textContent.includes('bytes'));
        assert.match(await page.locator('[data-preview]').textContent(),/서울/);
        const download=page.waitForEvent('download');await page.locator('[data-export]').click();assert.match((await download).suggestedFilename(),/\.md$/);
        await page.locator('summary').first().click();
        if(edition==='Full')await page.locator('[data-use-server]').uncheck();
        await page.locator('[data-provider]').selectOption('ollama');assert.match(await page.locator('[data-llm-url]').inputValue(),/11434/);
        await page.locator('[data-provider]').selectOption('custom');await page.locator('[data-llm-url]').fill(base+'/fake-llm');await page.locator('[data-model]').fill('fixture');
        // Full UI configuration is exercised separately with a local HTTP LLM below.
        if(edition==='Full')await page.locator('[data-use-server]').check();
        await page.locator('[data-auto]').click();await page.getByText('자동 기억을 시작했습니다.',{exact:false}).waitFor();
        await page.waitForFunction(async()=>{if(!window.beforeLore)return false;const messages=[{role:'assistant',content:'Alice lives in Seoul.',memo:'browser-m1'},{role:'user',content:'Alice',memo:'new-message'}];const result=await window.beforeLore(messages,'model');return result.some(m=>m.content.includes('lore-memory-'));});
        if(edition==='Lite'){
          const saved=page.waitForEvent('download');await page.locator('[data-backup]').click();const backup=await saved;
          await page.locator('[data-notebook]').fill('restored');await page.locator('[data-start]').click();await page.getByText('현재 채팅에 연결했습니다.',{exact:true}).waitFor();
          await page.locator('[data-restore]').setInputFiles(await backup.path());await page.getByText('복원했습니다.',{exact:false}).waitFor();
          await page.locator('[data-search]').fill('Alice');await page.locator('[data-find]').click();await page.locator('.list button').filter({hasText:'Alice'}).waitFor();
        }
        await page.locator('[data-close]').click();assert.equal(await page.locator('.lore').count(),0);
        for(let i=0;i<5;i++){await page.evaluate(()=>window.openLore());assert.equal(await page.locator('[data-model]').inputValue(),'fixture');await page.locator('[data-close]').click();}
        await page.evaluate(()=>window.disposeLore());assert.equal(await page.evaluate(()=>window.registrations.size),0);assert.equal(await page.evaluate(()=>window.beforeLore),null);assert.equal(await page.evaluate(()=>window.finalLore??null),null);
        assert.equal(await page.evaluate(()=>window.forbiddenCalls),0);assert.deepEqual(errors,[]);
        await page.close();console.log(`PASS ${name} ${edition}: create/read/update, folders, aliases, context, escaping, export, auto extraction/injection and unload`);
      }
    } finally {await browser.close();}
  }
} finally {const closed=once(server,'close');server.close();server.closeAllConnections();await closed;store.close();}
