import {requireValue,boundedString,validatePage,revision} from '../shared/core.mjs';
import {wikiPath,aliasesOf,pageDefaults} from '../shared/wiki.mjs';
export const BACKUP_BYTES=16*1024*1024;
export function installBackup(LiteStore){
 LiteStore.prototype.exportBackup=function(){return this.serial(async()=>{
  const state=await this.state(),records={},keys=new Set();
  for(const p of state.pages)for(let r=p.revision;r>Math.max(0,p.revision-5);r--)keys.add(`${this.prefix}page:${p.id}:${r}`);
  for(const s of state.sources??[])keys.add(s.key);for(const key of state.conflicts??[])keys.add(key);
  for(const key of keys){const value=await this.storage.getItem(key);if(value!==undefined&&value!==null)records[key.slice(this.prefix.length)]=value;}
  const result={format:'lore-lite-backup',version:1,prefix:this.prefix,state,records};
  requireValue(new TextEncoder().encode(JSON.stringify(result)).length<=BACKUP_BYTES,'Backup exceeds 16 MiB');return result;
 });};
 LiteStore.prototype.importBackup=function(backup){return this.serial(async()=>{
  requireValue(!this.processing,'추출을 중지하고 진행 중인 작업이 끝난 뒤 복원하세요.');
  const current=await this.state();requireValue(!current.pages.length&&!current.sources?.length&&!current.jobs?.length,'빈 노트북에만 복원할 수 있습니다.',409);
  requireValue(backup?.format==='lore-lite-backup'&&backup.version===1,'지원하지 않는 백업 형식');
  requireValue(new TextEncoder().encode(JSON.stringify(backup)).length<=BACKUP_BYTES,'Backup exceeds 16 MiB');
  const oldPrefix=boundedString(backup.prefix,'backup prefix',200),state=backup.state,records=backup.records;
  requireValue(state&&records&&typeof records==='object'&&!Array.isArray(records),'Invalid backup');
  requireValue(Array.isArray(state.pages)&&state.pages.length<=128&&Object.keys(records).length<=800,'Invalid backup size');
  const allowed=new Map(),pages=[],ids=new Set(),paths=new Set();
  for(const row of state.pages){
   const id=boundedString(row.id,'page ID');revision(row.revision);requireValue(row.revision>0&&!ids.has(id),'Invalid page revision or duplicate');ids.add(id);
   for(let r=row.revision;r>Math.max(0,row.revision-5);r--){
    const key=`page:${id}:${r}`,value=records[key];if(!value){requireValue(r!==row.revision,'Missing current page');continue;}
    const normalized={...pageDefaults(value),...validatePage(value),aliases:aliasesOf(value.aliases,value.title),path:wikiPath(value.path)};
    requireValue(normalized.id===id&&normalized.revision===r&&normalized.visibility==='public'&&typeof normalized.active==='boolean'&&['manual','llm','source-quote'].includes(normalized.origin),'Invalid page');
    requireValue(Array.isArray(normalized.evidence)&&normalized.evidence.length<=32,'Invalid evidence');
    for(const e of normalized.evidence){boundedString(e.messageId,'evidence ID');revision(e.revision);boundedString(e.quote,'quote',16384);}
    allowed.set(key,normalized);
    if(r===row.revision){requireValue(!paths.has(normalized.path),'Duplicate path');paths.add(normalized.path);const {body,evidence,...meta}=normalized;pages.push(meta);}
   }
  }
  let scope;
  if(state.scope){scope={};for(const k of ['characterId','chatId','branchId'])scope[k]=boundedString(state.scope[k],k);}
  if(current.scope)requireValue(JSON.stringify(current.scope)===JSON.stringify(scope),'백업이 다른 채팅에 연결되어 있습니다.',409);
  const sources=[],sourceKeys=new Set(),sourceIds=new Set();
  requireValue(Array.isArray(state.sources??[])&&(state.sources??[]).length<=128,'Invalid sources');
  const relative=(key,kind)=>{requireValue(typeof key==='string'&&key.startsWith(oldPrefix+kind+':')&&key.length<=oldPrefix.length+200,'Invalid backup key');return key.slice(oldPrefix.length);};
  for(const ref of state.sources??[]){
   const key=relative(ref.key,'source'),value=records[key];requireValue(value&&value.id===ref.id&&value.revision===ref.revision&&!sourceIds.has(ref.id),'Invalid source');
   boundedString(value.id,'source ID');revision(value.revision);requireValue(value.revision>0&&value.visibility==='public'&&['user','assistant'].includes(value.role),'Invalid source');boundedString(value.text,'source text',16384);
   sourceIds.add(ref.id);sourceKeys.add(key);allowed.set(key,value);sources.push({id:ref.id,revision:ref.revision,key:this.prefix+key});
  }
  requireValue(Array.isArray(state.jobs??[])&&(state.jobs??[]).length<=20,'Invalid jobs');
  const jobIds=new Set(),jobs=(state.jobs??[]).map(j=>{
   boundedString(j.id,'job ID');requireValue(!jobIds.has(j.id)&&['queued','running','completed','failed','cancelled'].includes(j.state)&&Number.isInteger(j.attempts)&&j.attempts>=0&&j.attempts<=3&&Array.isArray(j.keys)&&j.keys.length<=32,'Invalid job');jobIds.add(j.id);
   const keys=j.keys.map(k=>{const key=relative(k,'source');requireValue(sourceKeys.has(key),'Missing job source');return this.prefix+key;});
   return {id:j.id,state:j.state==='running'?'queued':j.state,attempts:j.attempts,keys,...(j.error?{error:boundedString(j.error,'job error',500)}:{})};
  });
  requireValue(Array.isArray(state.conflicts??[])&&(state.conflicts??[]).length<=32,'Invalid conflicts');
  const conflicts=(state.conflicts??[]).map(k=>{const key=relative(k,'conflict'),value=records[key];requireValue(value?.proposal,'Missing conflict');validatePage(value.proposal);allowed.set(key,value);return this.prefix+key;});
  const cursor=state.cursor??null;if(cursor)requireValue(Number.isSafeInteger(cursor.count)&&cursor.count>=0&&cursor.count<=128&&/^[a-f0-9]{64}$/.test(cursor.digest),'Invalid cursor');
  requireValue(!sources.length||scope,'Missing source scope');
  // Validate first, then publish the index last. Failure leaves the empty target usable.
  for(const [key,value] of allowed)await this.storage.setItem(this.prefix+key,value);
  await this.storage.setItem(this.prefix+'index',{pages,...(scope?{scope}:{}),sources,jobs,conflicts,cursor});
  return {pages:pages.length,sources:sources.length};
 });};
}
