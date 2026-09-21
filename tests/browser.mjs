import {chromium,webkit} from 'playwright';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {Store} from '../server/store.mjs';
import {createServer} from '../server/http.mjs';
const scope={installationId:'test',userId:'test',characterId:'c',chatId:'chat',branchId:'branch'},token='browser-test-'.repeat(4);
const store=new Store(':memory:');const server=createServer(store,[{token,scope}],{workerInterval:0});server.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`;
try {
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch({headless:true});
    try {
      for(const edition of ['Lite','Full']){
        const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.exposeFunction('backendFetch',async(url,options)=>{assert.ok(url.startsWith(base+'/'));const res=await fetch(url,options);return {status:res.status,text:await res.text()};});
        await page.goto(base+'/health');
        await page.evaluate(()=>{
          document.body.replaceChildren();const values=new Map();window.registrations=new Set();window.forbiddenCalls=0;
          window.Risuai={
            registerSetting:async(name,open,icon,type,id)=>{window.openLore=open;window.registrations.add(id);return {id};},
            registerButton:async(options)=>{window.registrations.add(options.id);return {id:options.id};},
            unregisterUIPart:async id=>window.registrations.delete(id),onUnload:async fn=>window.disposeLore=fn,
            showContainer:async()=>{},hideContainer:async()=>{},
            getLocalPluginStorage:async()=>({getItem:async key=>structuredClone(values.get(key)),setItem:async(key,value)=>values.set(key,structuredClone(value)),removeItem:async key=>values.delete(key)}),
            nativeFetch:async(url,options)=>{const result=await window.backendFetch(url,options);return new Response(result.text,{status:result.status});},
            getDatabase:()=>{window.forbiddenCalls++;throw Error('forbidden');},getCharacter:()=>{window.forbiddenCalls++;throw Error('forbidden');},
            addRisuReplacer:()=>{window.forbiddenCalls++;throw Error('no auto injection');},
          };
        });
        await page.addScriptTag({content:readFileSync(edition==='Lite'?'lite/lore-lite.js':'full/plugin/lore-full.js','utf8')});
        await page.waitForFunction(()=>window.registrations.size===2);await page.evaluate(()=>window.openLore());
        if(edition==='Full'){await page.locator('[data-url]').fill(base);await page.locator('[data-token]').fill(token);}
        await page.locator('[data-start]').click();await page.locator('[data-work]').waitFor({state:'visible'});
        await page.getByText('열린 범위:',{exact:false}).waitFor();await page.locator('[data-new]').click();
        const title=`${name} ${edition}`;await page.locator('[data-title]').fill(title);await page.locator('[data-body]').fill('<img src=x onerror="window.bad=true"> 인물은 서울에 있다.');
        await page.locator('[data-save]').click();await page.getByText('저장했습니다.',{exact:true}).waitFor();
        await page.locator('[data-search]').fill(title);await page.locator('[data-find]').click();
        await page.waitForFunction(()=>document.querySelector('output').textContent.includes('1개 문서'));
        await page.locator('.list button').click();await page.locator('[data-history]').click();
        await page.waitForFunction(()=>document.querySelector('[data-preview]').textContent.includes('r1'));
        assert.equal(await page.locator('img').count(),0);
        await page.locator('[data-context]').click();await page.waitForFunction(()=>document.querySelector('output').textContent.includes('bytes'));
        assert.match(await page.locator('[data-preview]').textContent(),/서울/);
        const download=page.waitForEvent('download');await page.locator('[data-export]').click();assert.match((await download).suggestedFilename(),/\.md$/);
        await page.locator('[data-close]').click();assert.equal(await page.locator('.lore').count(),0);
        for(let i=0;i<5;i++){await page.evaluate(()=>window.openLore());await page.locator('[data-close]').click();}
        await page.evaluate(()=>window.disposeLore());assert.equal(await page.evaluate(()=>window.registrations.size),0);
        assert.equal(await page.evaluate(()=>window.forbiddenCalls),0);assert.deepEqual(errors,[]);
        await page.close();console.log(`PASS ${name} ${edition}: CRUD, context, escaping, export, repeated close and unload`);
      }
    } finally {await browser.close();}
  }
} finally {const closed=once(server,'close');server.close();server.closeAllConnections();await closed;store.close();}
