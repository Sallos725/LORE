import {chromium,webkit} from 'playwright';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {readLoreDelta} from '../integration/pocketrisu-lore.mjs';
import {createHash} from 'node:crypto';
import {Store} from '../server/store.mjs';
import {createServer} from '../server/http.mjs';
const scope={installationId:'test',userId:'test',characterId:'c',chatId:'chat',branchId:'chat'},token='browser-test-'.repeat(4);
const extract=async input=>[{title:'Alice',kind:'person',path:'people/Alice.md',aliases:['앨리스'],body:'Alice lives in Seoul.',visibility:'public',expectedRevision:0,evidence:[{messageId:input.sources[0].id,revision:input.sources[0].revision,quote:input.sources[0].text}]}];
const store=new Store(':memory:');const server=createServer(store,[{token,scope,collect:true}],{workerInterval:50,extractor:extract});server.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`;
try {
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch({headless:true});
    try {
      for(const edition of ['Lite','Full']){
        const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.exposeFunction('backendFetch',async(url,options)=>{assert.ok(url.startsWith(base+'/'));if(url===base+'/fake-llm'){const input=JSON.parse(JSON.parse(options.body).messages[1].content);return {status:200,text:JSON.stringify({choices:[{message:{content:JSON.stringify({pages:await extract(input)})}}]})};}const res=await fetch(url,options);return {status:res.status,text:await res.text()};});
        await page.exposeFunction('hostDelta',async(cursor,mode)=>readLoreDelta({chaId:'c',chatPage:0,chats:[{id:'chat',message:[{memo:'browser-m1',role:'char',data:'Alice lives in Seoul.'}]}]},cursor,{mode,hashFactory:()=>{const h=createHash('sha256');return {update:s=>h.update(s),hex:()=>h.digest('hex')};}}));
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
            getLoreChatDelta:(cursor,mode)=>window.hostDelta(cursor,mode),checkLoreBudget:async()=>({fits:true}),
            addRisuReplacer:async(type,fn)=>{window.beforeLore=fn;},removeRisuReplacer:async()=>{window.beforeLore=null;},
            registerBodyIntercepter:async fn=>{window.finalLore=fn;return {id:'budget'};},unregisterBodyIntercepter:async()=>{window.finalLore=null;},
          };
        });
        await page.addScriptTag({content:readFileSync(edition==='Lite'?'lite/lore-lite.js':'full/plugin/lore-full.js','utf8')});
        await page.waitForFunction(()=>window.registrations.size===2);await page.evaluate(()=>window.openLore());
        if(edition==='Full'){await page.locator('[data-url]').fill(base);await page.locator('[data-token]').fill(token);}
        await page.locator('[data-start]').click();await page.locator('[data-work]').waitFor({state:'visible'});
        await page.getByText('열린 범위:',{exact:false}).waitFor();await page.locator('[data-new]').click();
        const title=`${name} ${edition}`;await page.locator('[data-title]').fill(title);await page.locator('[data-path]').fill('characters/team/'+title+'.md');await page.locator('[data-aliases]').fill('별칭, '+title+' alias');await page.locator('[data-body]').fill('<img src=x onerror="window.bad=true"> 인물은 서울에 있다.');
        await page.locator('[data-save]').click();await page.getByText('저장했습니다.',{exact:true}).waitFor();
        await page.locator('[data-tree]').click();await page.locator('.list button').filter({hasText:'characters'}).click();await page.locator('.list button').filter({hasText:'team'}).click();await page.locator('.list button').filter({hasText:title}).waitFor();await page.locator('[data-search]').fill(title+' alias');await page.locator('[data-find]').click();
        await page.waitForFunction(()=>document.querySelector('output').textContent.includes('1개 문서'));
        await page.locator('.list button').click();await page.locator('[data-history]').click();
        await page.waitForFunction(()=>document.querySelector('[data-preview]').textContent.includes('r1'));
        assert.equal(await page.locator('img').count(),0);
        await page.locator('[data-context]').click();await page.waitForFunction(()=>document.querySelector('output').textContent.includes('bytes'));
        assert.match(await page.locator('[data-preview]').textContent(),/서울/);
        const download=page.waitForEvent('download');await page.locator('[data-export]').click();assert.match((await download).suggestedFilename(),/\.md$/);
        await page.locator('summary').first().click();
        if(edition==='Lite'){await page.locator('[data-llm-url]').fill(base+'/fake-llm');await page.locator('[data-model]').fill('fixture');}
        await page.locator('[data-auto]').click();await page.getByText('자동 기억을 시작했습니다.',{exact:false}).waitFor();
        await page.waitForFunction(async()=>{if(!window.beforeLore)return false;const result=await window.beforeLore([{role:'user',content:'Alice'}],'model');return result.some(m=>m.content.includes('lore-memory-'));});
        await page.locator('[data-close]').click();assert.equal(await page.locator('.lore').count(),0);
        for(let i=0;i<5;i++){await page.evaluate(()=>window.openLore());await page.locator('[data-close]').click();}
        await page.evaluate(()=>window.disposeLore());assert.equal(await page.evaluate(()=>window.registrations.size),0);assert.equal(await page.evaluate(()=>window.beforeLore),null);assert.equal(await page.evaluate(()=>window.finalLore),null);
        assert.equal(await page.evaluate(()=>window.forbiddenCalls),0);assert.deepEqual(errors,[]);
        await page.close();console.log(`PASS ${name} ${edition}: create/read/update, context, escaping, export, repeated close and unload`);
      }
    } finally {await browser.close();}
  }
} finally {const closed=once(server,'close');server.close();server.closeAllConnections();await closed;store.close();}
