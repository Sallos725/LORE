import {PocketRisuClient} from './pocketrisu.mjs';
import {readBounded} from '../shared/pocketrisu.mjs';
import {requireValue} from '../shared/core.mjs';
export function connectionURL(value) {
  const url=new URL(value);
  requireValue(['https:','http:'].includes(url.protocol), 'Full URL은 HTTP 또는 HTTPS를 사용하세요.');
  requireValue(!url.username&&!url.password&&!url.search&&!url.hash,'URL에 credential/query/fragment를 넣지 마세요.');
  return url.href.replace(/\/$/,'');
}
export class FullStore {
  constructor(host,url) {this.host=host;this.url=connectionURL(url);this.client=new PocketRisuClient(host);this.closed=false;this.busy=false;}
  async connect(){const selector=await this.client.selection();const result=await this.request('/connect','POST',{selector});this.scope=result.scope;return this;}
  async request(path,method='GET',data) {
    requireValue(!this.closed,'UI가 닫혔습니다.'); requireValue(!this.busy,'이전 요청이 끝난 뒤 다시 시도하세요.');
    this.busy=true; let timer;
    // Native RPC fetch cannot reliably transfer AbortSignal. Keep one outstanding
    // request even after the UI deadline; late completion cannot update a closed UI.
    const pending=(async()=>{
      try {
        const token=await this.client.session();
        const response=await this.host.nativeFetch(this.url+path,{method,requestTimeoutMs:10000,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...(this.scope?{'x-lore-character':encodeURIComponent(this.scope.characterId),'x-lore-chat':encodeURIComponent(this.scope.chatId)}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});
        const text=new TextDecoder().decode(await readBounded(response,524288,{checkStatus:false}));
        const result=JSON.parse(text); requireValue(response.ok,result.error??`HTTP ${response.status}`,response.status);
        requireValue(!this.closed,'UI가 닫혔습니다.'); return result;
      } finally { this.busy=false; }
    })();
    try { return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('연결 시간 초과. 저장 결과는 다시 조회하세요.')),10000);})]); }
    finally {clearTimeout(timer);}
  }
  configureLLM(config){return this.request('/llm','POST',config);}
  capture({sessionToken,...data}){return this.request('/capture','POST',data);}
  identity(){return this.request('/identity');}
  list({query='',offset=0,limit=20}={}){return this.request(`/wiki?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`);}
  page(id){return this.request('/wiki/'+encodeURIComponent(id));}
  put(id,page,expectedRevision){return this.request('/wiki/'+encodeURIComponent(id),'PATCH',{page,expectedRevision});}
  async history(id){return (await this.request('/wiki/'+encodeURIComponent(id)+'/history')).history;}
  context(options){return this.request('/context','POST',options);}
  syncState(){return this.request('/sync');}
  sync(delta){return this.request('/sync','POST',delta);}
  browse({folder='',offset=0}={}){return this.request(`/browse?folder=${encodeURIComponent(folder)}&offset=${offset}`);}
  resolve(target){return this.request('/resolve?target='+encodeURIComponent(target));}
  links(id){return this.request('/wiki/'+encodeURIComponent(id)+'/links');}
  async jobs(){return (await this.request('/jobs')).jobs;}
  async conflicts(){return (await this.request('/conflicts')).conflicts;}
  retry(id){return this.request('/jobs/'+encodeURIComponent(id)+'/retry','POST',{});}
  dismissConflict(id){return this.request('/conflicts/'+encodeURIComponent(id),'DELETE');}
  cancel(id){return this.request('/jobs/'+encodeURIComponent(id)+'/cancel','POST',{});}
  close(){this.closed=true;this.scope=null;}
}
