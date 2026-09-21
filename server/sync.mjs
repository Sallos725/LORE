import {createHash} from 'node:crypto';
import {scopeKey,requireValue} from '../shared/core.mjs';
import {validateDelta,sameCursor} from '../shared/sync.mjs';
export function installSync(Store){
  Store.prototype.syncState=function(scope){const row=this.db.prepare('SELECT cursor FROM sync_state WHERE scope=?').get(scopeKey(scope));return {cursor:row?JSON.parse(row.cursor):null};};
  Store.prototype.sync=function(scope,delta,audience='world'){
    return this.transaction(()=>{
      const key=scopeKey(scope),cursor=this.syncState(scope).cursor;
      if(sameCursor(cursor,delta.cursor)&&delta.characterId===scope.characterId&&delta.chatId===scope.chatId&&delta.branchId===scope.branchId)return {cursor,duplicate:true};
      validateDelta(delta,scope,cursor);
      if(delta.reset){
        // A reset may not mutate another audience's evidence in the same scope.
        for(const source of this.db.prepare('SELECT id,revision FROM sources WHERE scope=? AND deleted=0').iterate(key))this.source(scope,source.id,source.revision,audience);
        for(const row of this.db.prepare('SELECT data FROM pages WHERE scope=?').all(key)){const p=JSON.parse(row.data);if(p.active&&p.evidence?.length)this.save(key,{...p,active:false,revision:p.revision+1});}
        this.db.prepare('UPDATE sources SET deleted=1 WHERE scope=?').run(key);
        this.db.prepare("UPDATE jobs SET state='cancelled',error='Chat revised; rebuilding',updatedAt=? WHERE scope=? AND state IN ('queued','running')").run(Date.now(),key);
      }
      const changes=delta.messages.map(m=>{
        const old=this.db.prepare('SELECT revision,deleted FROM sources WHERE scope=? AND id=?').get(key,m.id);
        requireValue(!old||old.deleted||delta.reset,'Duplicate stable message ID in chat',409);
        return {...m,op:'upsert',revision:(old?.revision??0)+1,visibility:audience==='world'?'public':audience};
      });
      let job;
      if(changes.length)job=this.enqueue(scope,{eventId:'sync-'+createHash('sha256').update(JSON.stringify(delta)).digest('hex'),baseRevision:this.head(scope),changes},audience);
      this.db.prepare('INSERT OR REPLACE INTO sync_state VALUES (?,?)').run(key,JSON.stringify(delta.cursor));
      return {cursor:delta.cursor,job,reset:delta.reset,hasMore:delta.hasMore};
    });
  };
}
