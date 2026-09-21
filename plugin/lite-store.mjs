import {LIMITS, requireValue, boundedString, revision, validatePage, compileContext} from '../shared/core.mjs';
export class LiteStore {
  constructor(storage, notebook = 'default') {
    this.storage=storage; this.prefix=`lore:lite:v1:${boundedString(notebook,'notebook')}:`; this.writes=Promise.resolve();
  }
  async index() { return await this.storage.getItem(this.prefix+'index') ?? []; }
  async identity() { return {scope:{notebook:this.prefix}, audience:'world',mode:'device-local'}; }
  async list({query='',offset=0,limit=20}={}) {
    boundedString(query,'query',200,true);
    requireValue(Number.isInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>=1&&limit<=128,'Invalid pagination');
    const matches=(await this.index()).filter(p=>p.title.toLowerCase().includes(query.toLowerCase()));
    return {pages:matches.slice(offset,offset+limit),hasMore:matches.length>offset+limit,nextOffset:matches.length>offset+limit?offset+limit:null};
  }
  async page(id) {
    const entry=(await this.index()).find(p=>p.id===id);
    const page=entry && await this.storage.getItem(`${this.prefix}page:${id}:${entry.revision}`);
    requireValue(page,'Page not found',404); return page;
  }
  put(id,input,expectedRevision) {
    const operation=this.writes.then(async()=>{
      boundedString(id,'page ID'); revision(expectedRevision);
      const page={...validatePage(input),id,revision:expectedRevision+1,active:true,origin:'manual',evidence:[]};
      requireValue(page.visibility==='public','Lite uses a personal notebook; audience policies require Full');
      const index=await this.index(),old=index.find(p=>p.id===id);
      requireValue((old?.revision??0)===expectedRevision,'Page revision conflict',409);
      requireValue(old || index.length<LIMITS.pages,'Lite notebook is full (128 pages)',413);
      // Publish a small index pointer only after writing the immutable revision.
      await this.storage.setItem(`${this.prefix}page:${id}:${page.revision}`,page);
      const {body,evidence,...metadata}=page;
      await this.storage.setItem(this.prefix+'index',[...index.filter(p=>p.id!==id),metadata]);
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
    const result={...compileContext([],{budgetBytes}),fresh:true,pendingJobs:0,candidateLimitReached:false};
    for(const row of (await this.list({query,limit:128})).pages){
      const compiled=compileContext([await this.page(row.id)],{budgetBytes:budgetBytes-result.usedBytes});
      result.text+=compiled.text; result.usedBytes+=compiled.usedBytes;
      result.included.push(...compiled.included); result.excluded.push(...compiled.excluded);
    }
    return result;
  }
  close() {}
}
