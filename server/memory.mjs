import {createHash} from 'node:crypto';
import {scopeKey,requireValue,canRead} from '../shared/core.mjs';
import {pageDefaults,aliasesOf} from '../shared/wiki.mjs';
import {validateExtraction} from '../shared/extraction.mjs';
export function installMemory(Store) {
  Store.prototype.memorySchema=function(){
    this.db.exec(`CREATE TABLE IF NOT EXISTS evidence(scope TEXT,page TEXT,message TEXT,revision INTEGER,PRIMARY KEY(scope,page,message,revision));
      CREATE INDEX IF NOT EXISTS evidence_source ON evidence(scope,message);
      CREATE TABLE IF NOT EXISTS proposals(scope TEXT,id TEXT PRIMARY KEY,job TEXT,page TEXT,data TEXT,reason TEXT);
      CREATE TABLE IF NOT EXISTS sync_state(scope TEXT PRIMARY KEY,cursor TEXT);`);
    for(const row of this.db.prepare('SELECT scope,id,data FROM pages').iterate())for(const e of JSON.parse(row.data).evidence??[])this.db.prepare('INSERT OR IGNORE INTO evidence VALUES (?,?,?,?)').run(row.scope,row.id,e.messageId,e.revision);
  };
  Store.prototype.extractionInput=function(job){
    const event=JSON.parse(job.payload),sources=event.changes.filter(c=>c.op==='upsert'),scope=JSON.parse(job.scope);
    const scopeObject=Object.fromEntries(['installationId','userId','characterId','chatId','branchId'].map((k,i)=>[k,scope[i]]));
    const audience=sources.find(s=>s.visibility!=='public')?.visibility??'world';
    const query=sources.map(s=>s.text).join(' ').slice(-200);
    const pages=this.list(scopeObject,{query,limit:12,includeBody:true,audience}).pages.filter(p=>p.origin!=='source-quote');
    const input={sources:[...sources],pages:[]};
    for(const p of pages){
      const extra=[];
      for(const e of p.evidence??[]){if(input.sources.some(s=>s.id===e.messageId&&s.revision===e.revision))continue;try{const source=this.source(scopeObject,e.messageId,e.revision,audience),current=this.db.prepare('SELECT revision,deleted FROM sources WHERE scope=? AND id=?').get(job.scope,e.messageId);if(current&&!current.deleted&&current.revision===e.revision)extra.push(source);}catch{}}
      if(input.sources.length+extra.length>32||Buffer.byteLength(JSON.stringify({...input,sources:[...input.sources,...extra],pages:[...input.pages,p]}))>90000)continue;
      input.sources.push(...extra);input.pages.push(p);
    }
    return input;
  };
  Store.prototype.runExtraction=async function(extractor){
    if(this.extractionRunning)return false;
    const job=this.db.prepare("SELECT * FROM jobs WHERE state='queued' ORDER BY createdAt,id LIMIT 1").get();if(!job)return false;
    this.extractionRunning=true;const controller=new AbortController();this.activeExtraction={id:job.id,controller};
    this.db.prepare("UPDATE jobs SET state='running',attempts=attempts+1,updatedAt=? WHERE id=?").run(Date.now(),job.id);
    try{
      const input=this.extractionInput(job);
      // Extractors return normalized proposals; validate again at the trust boundary.
      const proposals=input.sources.length?validateExtraction({pages:await extractor(input,{signal:controller.signal})},input):[];
      this.transaction(()=>{
        const state=this.db.prepare('SELECT state FROM jobs WHERE id=?').get(job.id).state;
        if(state!=='running')return;
        // Reject the whole batch if any read source changed while the LLM ran.
        const current=input.sources.every(s=>{const row=this.db.prepare('SELECT revision,deleted FROM sources WHERE scope=? AND id=?').get(job.scope,s.id);return row&&!row.deleted&&row.revision===s.revision;});
        if(!current){this.db.prepare("UPDATE jobs SET state='cancelled',error='Sources changed during extraction',updatedAt=? WHERE id=?").run(Date.now(),job.id);return;}
        for(const candidate of proposals){
          const id=candidate.id??'memory-'+createHash('sha256').update(candidate.path).digest('hex').slice(0,24);
          const row=this.db.prepare('SELECT data FROM pages WHERE scope=? AND id=?').get(job.scope,id),old=row&&pageDefaults(JSON.parse(row.data));
          const collision=this.db.prepare("SELECT id FROM pages WHERE scope=? AND json_extract(data,'$.path')=? AND id<>?").get(job.scope,candidate.path,id);
          if(collision||old?.pinned||old?.origin==='manual'||(old?.revision??0)!==candidate.expectedRevision){
            this.db.prepare('INSERT OR REPLACE INTO proposals VALUES (?,?,?,?,?,?)').run(job.scope,job.id+':'+id,job.id,id,JSON.stringify(candidate),'Manual edit, pin, path or revision conflict');continue;
          }
          const page={...candidate,id,revision:(old?.revision??0)+1,origin:'llm',active:true,reviewStatus:'unreviewed'};delete page.expectedRevision;
          if(old&&old.title!==page.title)page.aliases=aliasesOf([...page.aliases,old.title],page.title);
          this.save(job.scope,page);
        }
        this.db.prepare("UPDATE jobs SET state='completed',error=NULL,updatedAt=? WHERE id=?").run(Date.now(),job.id);
      });
    }catch(error){
      this.db.prepare("UPDATE jobs SET state=?,error=?,updatedAt=? WHERE id=? AND state='running'").run(job.attempts+1>=3?'failed':'queued',error.status===400?'Invalid LLM proposal':'Extraction failed or timed out',Date.now(),job.id);
    }finally{this.extractionRunning=false;this.activeExtraction=null;}
    return true;
  };
  Store.prototype.jobs=function(scope,audience='world'){return this.db.prepare('SELECT id,eventId,state,attempts,error,updatedAt,payload FROM jobs WHERE scope=? ORDER BY createdAt DESC LIMIT 100').all(scopeKey(scope)).filter(j=>JSON.parse(j.payload).changes.every(c=>canRead(c,audience))).slice(0,20).map(({payload,...j})=>j);};
  Store.prototype.conflicts=function(scope,audience='world'){return this.db.prepare('SELECT id,job,page,data,reason FROM proposals WHERE scope=? ORDER BY rowid DESC LIMIT 100').all(scopeKey(scope)).map(r=>({...r,proposal:JSON.parse(r.data),data:undefined})).filter(r=>canRead(r.proposal,audience));};
}
