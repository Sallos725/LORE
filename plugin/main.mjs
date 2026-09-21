import {chatNotebook} from './notebook.mjs';
import {PocketRisuClient} from './pocketrisu.mjs';
import {AutoMemory} from './runtime.mjs';
import {createExtractor} from '../shared/extraction.mjs';
import {LiteStore} from './lite-store.mjs';
import {FullStore} from './full-store.mjs';
import {openUI} from './ui.mjs';
export async function install(host,edition) {
  let ui=null,alive=true;const registrations=[],notebooks=new Map(),runtime=new AutoMemory(host);
  const getStore=async options=>{
    if(edition==='Full')return new FullStore(host,options.url).connect();
    let notebook=options.notebook,scope;
    if(!notebook){const identity=await new PocketRisuClient(host).identity(null);scope={characterId:identity.characterId,chatId:identity.chatId,branchId:identity.branchId};notebook=await chatNotebook(scope);}
    if(!notebooks.has(notebook))notebooks.set(notebook,new LiteStore(await host.getLocalPluginStorage(),notebook));
    const store=notebooks.get(notebook);if(scope)await store.bind(scope);return store;
  };
  let autoStore=null,llmBusy=false;
  const automation={scope:async options=>{const client=new PocketRisuClient(host),selection=await client.selection();let s;try{s=await getStore(options);return await client.identity(s);}catch(error){return {...selection,message:error.message};}finally{if(edition==='Full')s?.close();}},status:()=>runtime.state,stop:async()=>{await runtime.stop();autoStore?.close();autoStore=null;},start:async options=>{
    await automation.stop();autoStore=await getStore(options);
    // Native fetch transfers a response through RPC; avoid nonserializable signals
    // and never overlap an unabortable provider request after its local deadline.
    const providerFetch=async(url,{signal,...args})=>{if(llmBusy)throw Error('이전 LLM 요청이 아직 끝나지 않았습니다.');llmBusy=true;try{return await host.nativeFetch(url,{...args,requestTimeoutMs:options.llm?.timeoutMs??45000});}finally{llmBusy=false;}};
    try{if(edition==='Full'&&options.llm)await autoStore.configureLLM(options.llm);await runtime.start({switchStore:async()=>{const next=await getStore(options);if(edition==='Full'&&options.llm)await next.configureLLM(options.llm);return next;},store:autoStore,memoryBudget:options.memoryBudget,injectionMode:options.injectionMode,extractor:edition==='Lite'?createExtractor(options.llm,providerFetch):null});}catch(error){autoStore?.close();autoStore=null;throw error;}
  }};
  const open=async()=>{
    if(!alive)return;ui?.close();
    const settingsStorage=await host.getLocalPluginStorage(),settingsKey='lore:settings:'+edition;
    ui=openUI({edition,host,connect:getStore,automation,preferences:await settingsStorage.getItem(settingsKey)??{},savePreferences:value=>settingsStorage.setItem(settingsKey,value)});
    await host.showContainer('fullscreen');
  };
  const dispose=async()=>{alive=false;await automation.stop();notebooks.clear();ui?.close();ui=null;for(const id of registrations)await host.unregisterUIPart?.(id);registrations.length=0;await host.hideContainer?.();};
  await host.onUnload(dispose);
  const setting=await host.registerSetting(`LORE ${edition}`,open,'📖','html',`lore-${edition.toLowerCase()}-settings`);
  if(setting?.id)registrations.push(setting.id);
  const button=await host.registerButton?.({name:`LORE ${edition}`,icon:'📖',iconType:'html',location:'chat',id:`lore-${edition.toLowerCase()}-chat`},open);
  if(button?.id)registrations.push(button.id);
  if(!alive)await dispose();
  return {open,dispose};
}
