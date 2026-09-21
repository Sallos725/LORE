import {requireValue} from '../shared/core.mjs';
import {fetchSavedChat,confirmedSnapshot,savedIdentity,chatSelector} from '../shared/pocketrisu.mjs';
import {readLoreDelta} from '../shared/chat-delta.mjs';
import {sameCursor} from '../shared/sync.mjs';
export function pocketRisuReader(upstream,fetcher=fetch) {
  const url=new URL(upstream);requireValue(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/','Configure one PocketRisu origin');
  return async(store,scope,audience,data)=>{
    const selector=chatSelector(data.selector);requireValue(selector.characterId===scope.characterId,'Character scope mismatch',403);
    const chat=await fetchSavedChat(fetcher,url.origin,selector,data.sessionToken,16*1024*1024),identity=savedIdentity(selector,chat);
    requireValue(identity.chatId===scope.chatId&&identity.branchId===scope.branchId,'Chat scope mismatch',409);
    if(data.identityOnly===true)return identity;
    const snapshot=confirmedSnapshot(selector,chat,data.boundaries);let {cursor}=store.syncState(scope),delta;
    // Finish reconciliation before allowing retrieval. Raw chat never crosses
    // the plugin RPC; subsequent LLM work remains asynchronous and durable.
    for(let page=0;page<8;page++){
      delta=await readLoreDelta(snapshot,cursor);if(!sameCursor(cursor,delta.cursor))store.sync(scope,delta,audience);cursor=delta.cursor;
      if(!delta.hasMore)return {...identity,cursor,complete:true};
    }
    return {...identity,cursor,complete:false};
  };
}
