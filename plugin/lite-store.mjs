import {validateDelta,sameCursor} from '../shared/sync.mjs';
import {validateExtraction} from '../shared/extraction.mjs';
import {aliasesOf,wikiPath,pageDefaults,resolveLink,linkTargets,browsePages,scorePage} from '../shared/wiki.mjs';
import {LIMITS, requireValue, boundedString, revision, validatePage, compileContext} from '../shared/core.mjs';
export class LiteStore {
  constructor(storage, notebook = 'default') {
    this.storage=storage; this.prefix=`lore:lite:v1:${boundedString(notebook,'notebook')}:`; this.writes=Promise.resolve();
  }
  async state(){const value=await this.storage.getItem(this.prefix+'index');return Array.isArray(value)?{pages:value}:value??{pages:[]};}
  async index() { return (await this.state()).pages.map(pageDefaults); }
  serial(fn){const op=this.writes.then(fn);this.writes=op.catch(()=>{});return op;}
  async identity() { return {scope:(await this.state()).scope??{notebook:this.prefix}, audience:'world',mode:'device-local',collectionEnabled:true}; }
  async list({query='',offset=0,limit=20}={}) {
    boundedString(query,'query',200,true);
    requireValue(Number.isInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>=1&&limit<=128,'Invalid pagination');
    const matches=(await this.index()).filter(p=>scorePage(p,query)>0);
    return {pages:matches.slice(offset,offset+limit),hasMore:matches.length>offset+limit,nextOffset:matches.length>offset+limit?offset+limit:null};
  }
  async page(id) {
    const entry=(await this.index()).find(p=>p.id===id);
    const page=entry && await this.storage.getItem(`${this.prefix}page:${id}:${entry.revision}`);
    requireValue(page,'Page not found',404); return pageDefaults(page);
  }
  put(id,input,expectedRevision) {
    const operation=this.writes.then(async()=>{
      boundedString(id,'page ID'); revision(expectedRevision);
      const page={...validatePage(input),id,revision:expectedRevision+1,active:true,origin:'manual',evidence:[]};
      requireValue(page.visibility==='public','Lite uses a personal notebook; audience policies require Full');
      const state=await this.state(),index=state.pages,old=index.find(p=>p.id===id);
      if(old){const previous=await this.page(id);page.evidence=previous.evidence;page.active=previous.active;}
      requireValue((old?.revision??0)===expectedRevision,'Page revision conflict',409);
      requireValue(old || index.length<LIMITS.pages,'Lite notebook is full (128 pages)',413);
      page.aliases=aliasesOf(page.aliases,page.title);
      if(old&&old.title!==page.title)page.aliases=aliasesOf([...page.aliases,old.title],page.title);
      page.path=wikiPath(page.path??old?.path??`${page.kind}/${id}.md`);
      requireValue(!index.some(p=>p.id!==id&&p.path===page.path),'Path already exists',409);
      // Publish a small index pointer only after writing the immutable revision.
      await this.storage.setItem(`${this.prefix}page:${id}:${page.revision}`,page);
      const {body,evidence,...metadata}=page;
      await this.storage.setItem(this.prefix+'index',{...state,pages:[...index.filter(p=>p.id!==id),metadata]});
      if(page.revision>5) await this.storage.removeItem(`${this.prefix}page:${id}:${page.revision-5}`).catch(()=>{});
      return page;
    });
    this.writes=operation.catch(()=>{}); return operation;
  }
  async history(id) {
    const current=await this.page(id),result=[];
    for(let r=current.revision;r>Math.max(0,current.revision-5);r--){
      const page=await this.storage.getItem(`${this.prefix}page:${id}:${r}`); if(page) result.push(page);
    }
    return result;
  }
  async context({query='',budgetBytes=4096}={}) {
    boundedString(query,'query',200,true);
    const state=await this.state(),pages=[];
    for(const row of state.pages){if(row.contextMode==='always'||scorePage(row,query)>0)pages.push(await this.page(row.id));}
    const pendingJobs=(state.jobs??[]).filter(j=>['queued','running','failed'].includes(j.state)).length;
    return {...compileContext(pages,{budgetBytes}),fresh:pendingJobs===0,pendingJobs,candidateLimitReached:false};
  }
  bind(scope){return this.serial(async()=>{const state=await this.state();if(state.scope)requireValue(JSON.stringify(state.scope)===JSON.stringify(scope),'노트북이 다른 채팅에 연결되어 있습니다.',409);else await this.storage.setItem(this.prefix+'index',{...state,scope});});}
  async syncState(){return {cursor:(await this.state()).cursor??null};}
  sync(delta){return this.serial(async()=>{
    const state=await this.state();requireValue(state.scope,'Connect notebook to a chat first');
    if(sameCursor(state.cursor,delta.cursor)&&delta.chatId===state.scope.chatId&&delta.characterId===state.scope.characterId&&delta.branchId===state.scope.branchId)return {cursor:state.cursor,duplicate:true};
    validateDelta(delta,state.scope,state.cursor??null);
    const sources=delta.reset?[]:[...(state.sources??[])], jobs=delta.reset?[]:[...(state.jobs??[])];
    requireValue(sources.length+delta.messages.length<=128,'Lite 원문 한도 128개에 도달했습니다. 수집을 중지했습니다.',413);
    requireValue(jobs.filter(j=>['queued','running','failed'].includes(j.state)).length<4,'Lite 추출 작업을 먼저 완료하거나 실패 작업을 취소하세요.',409);
    const written=[],oldKeys=(state.sources??[]).map(s=>s.key);
    for(const m of delta.messages){
      requireValue(!sources.some(s=>s.id===m.id),'Duplicate message ID',409);
      const source={...m,revision:(state.sources?.find(s=>s.id===m.id)?.revision??0)+1,visibility:'public'},key=this.prefix+'source:'+crypto.randomUUID();
      await this.storage.setItem(key,source);written.push(key);sources.push({id:m.id,revision:source.revision,key});
    }
    let pages=state.pages;
    if(delta.reset){pages=[];for(const row of state.pages){const old=await this.page(row.id);if(old.evidence?.length&&old.active){const changed={...old,active:false,revision:old.revision+1};await this.storage.setItem(`${this.prefix}page:${old.id}:${changed.revision}`,changed);const {body,evidence,...meta}=changed;pages.push(meta);}else pages.push(row);}}
    if(written.length)jobs.push({id:crypto.randomUUID(),state:'queued',attempts:0,keys:written});
    await this.storage.setItem(this.prefix+'index',{...state,pages,sources,jobs:jobs.slice(-20),cursor:delta.cursor});
    if(delta.reset)for(const key of oldKeys)await this.storage.removeItem(key).catch(()=>{});
    return {cursor:delta.cursor,reset:delta.reset,hasMore:delta.hasMore};
  });}
  async jobs(){return (await this.state()).jobs??[];}
  async conflicts(){const state=await this.state();return Promise.all((state.conflicts??[]).map(key=>this.storage.getItem(key)));}
  cancel(id){return this.serial(async()=>{const state=await this.state();await this.storage.setItem(this.prefix+'index',{...state,jobs:(state.jobs??[]).map(j=>j.id===id?{...j,state:'cancelled'}:j)});});}
  async process(extractor,{signal}={}){
    if(this.processing)return false;this.processing=true;let job;
    try{
      job=await this.serial(async()=>{const state=await this.state(),next=state.jobs?.find(j=>['queued','running'].includes(j.state));if(!next)return null;const value={...next,state:'running',attempts:next.attempts+1};await this.storage.setItem(this.prefix+'index',{...state,jobs:state.jobs.map(j=>j.id===next.id?value:j)});return value;});
      if(!job)return false;
      const state=await this.state(),sources=await Promise.all(job.keys.map(k=>this.storage.getItem(k))),input={sources,pages:[]};
      const query=sources.map(s=>s.text).join(' ').slice(-200);
      for(const row of (await this.list({query,limit:12})).pages){
        const page=await this.page(row.id),extra=[];
        for(const e of page.evidence??[]){if(input.sources.some(s=>s.id===e.messageId&&s.revision===e.revision))continue;const ref=state.sources.find(s=>s.id===e.messageId&&s.revision===e.revision);if(ref)extra.push(await this.storage.getItem(ref.key));}
        if(input.sources.length+extra.length>32||new TextEncoder().encode(JSON.stringify({...input,sources:[...input.sources,...extra],pages:[...input.pages,page]})).length>90000)continue;
        input.sources.push(...extra);input.pages.push(page);
      }
      const proposals=validateExtraction({pages:await extractor(input,{signal})},input);
      await this.serial(async()=>{
        const latest=await this.state();if(!latest.jobs?.some(j=>j.id===job.id&&j.state==='running'))return;
        requireValue(input.sources.every(s=>latest.sources.some(r=>r.id===s.id&&r.revision===s.revision)),'Sources changed during extraction',409);
        const pages=[...latest.pages],conflicts=[...(latest.conflicts??[])];
        for(const candidate of proposals){
          const id=candidate.id??pages.find(p=>p.path===candidate.path)?.id??'memory-'+crypto.randomUUID(),old=pages.find(p=>p.id===id);
          if(old?.pinned||old?.origin==='manual'||(old?.revision??0)!==candidate.expectedRevision||pages.some(p=>p.path===candidate.path&&p.id!==id)){
            requireValue(conflicts.length<32,'Lite 충돌 한도 32개에 도달했습니다.');const key=this.prefix+'conflict:'+crypto.randomUUID();await this.storage.setItem(key,{page:id,proposal:candidate,reason:'수동 교정 또는 revision 충돌'});conflicts.push(key);continue;
          }
          requireValue(old||pages.length<128,'Lite notebook is full (128 pages)',413);
          const p={...candidate,id,revision:(old?.revision??0)+1,active:true,origin:'llm',reviewStatus:'unreviewed'};delete p.expectedRevision;
          if(old&&old.title!==p.title)p.aliases=aliasesOf([...p.aliases,old.title],p.title);
          await this.storage.setItem(`${this.prefix}page:${id}:${p.revision}`,p);
          const {body,evidence,...meta}=p;if(old)pages.splice(pages.indexOf(old),1,meta);else pages.push(meta);
        }
        await this.storage.setItem(this.prefix+'index',{...latest,pages,conflicts,jobs:latest.jobs.map(j=>j.id===job.id?{...j,state:'completed'}:j)});
        for(const p of pages)if(p.revision>5)await this.storage.removeItem(`${this.prefix}page:${p.id}:${p.revision-5}`).catch(()=>{});
      });
    }catch(error){
      if(job)await this.serial(async()=>{const state=await this.state();await this.storage.setItem(this.prefix+'index',{...state,jobs:state.jobs?.map(j=>j.id===job.id&&j.state==='running'?{...j,state:signal?.aborted?'queued':j.attempts>=3?'failed':'queued',error:'추출 실패: 설정과 모델 출력을 확인하세요.'}:j)});});
      throw error;
    }finally{this.processing=false;}
    return true;
  }
  async resolve(target){return resolveLink(target,await this.index());}
  async browse(options={}){return browsePages(await this.index(),options.folder,options.offset,options.limit);}
  async links(id){const page=await this.page(id),meta=await this.index(),backlinks=[];for(const row of meta){const p=await this.page(row.id);if(linkTargets(p.body).some(t=>{const r=resolveLink(t,meta);return r.status==='resolved'&&r.candidates[0].id===id;}))backlinks.push({id:p.id,title:p.title,path:p.path});}return {outgoing:linkTargets(page.body).map(target=>({target,...resolveLink(target,meta)})),backlinks};}
  close() {}
}
