import {requireValue} from '../shared/core.mjs';
export function connectionURL(value) {
  const url=new URL(value);
  requireValue(url.protocol==='https:' || (url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)), 'Full URL은 HTTPS 또는 localhost HTTP를 사용하세요.');
  requireValue(!url.username&&!url.password&&!url.search&&!url.hash,'URL에 credential/query/fragment를 넣지 마세요.');
  return url.href.replace(/\/$/,'');
}
export class FullStore {
  constructor(host,url,token) { this.host=host;this.url=connectionURL(url);requireValue(typeof token==='string'&&token.length>=32&&token.length<=512,'32자 이상의 scope token이 필요합니다.');this.token=token;this.closed=false;this.busy=false; }
  async request(path,method='GET',data) {
    requireValue(!this.closed,'UI가 닫혔습니다.'); requireValue(!this.busy,'이전 요청이 끝난 뒤 다시 시도하세요.');
    this.busy=true; let timer;
    // Native RPC fetch cannot reliably transfer AbortSignal. Keep one outstanding
    // request even after the UI deadline; late completion cannot update a closed UI.
    const pending=(async()=>{
      try {
        const response=await this.host.nativeFetch(this.url+path,{method,headers:{authorization:`Bearer ${this.token}`,'content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
        const text=await response.text(); requireValue(text.length<=524288,'응답 크기 제한 초과');
        const result=JSON.parse(text); requireValue(response.ok,result.error??`HTTP ${response.status}`,response.status);
        requireValue(!this.closed,'UI가 닫혔습니다.'); return result;
      } finally { this.busy=false; }
    })();
    try { return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('연결 시간 초과. 저장 결과는 다시 조회하세요.')),10000);})]); }
    finally {clearTimeout(timer);}
  }
  identity(){return this.request('/identity');}
  list({query='',offset=0,limit=20}={}){return this.request(`/wiki?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`);}
  page(id){return this.request('/wiki/'+encodeURIComponent(id));}
  put(id,page,expectedRevision){return this.request('/wiki/'+encodeURIComponent(id),'PATCH',{page,expectedRevision});}
  async history(id){return (await this.request('/wiki/'+encodeURIComponent(id)+'/history')).history;}
  context(options){return this.request('/context','POST',options);}
  close(){this.closed=true;this.token='';}
}
