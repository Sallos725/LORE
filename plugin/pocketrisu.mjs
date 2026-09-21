import {requireValue} from '../shared/core.mjs';
import {chatSelector,resolveChatSelector,fetchSavedChat,readBounded,savedIdentity,confirmedSnapshot} from '../shared/pocketrisu.mjs';
import {readLoreDelta} from '../shared/chat-delta.mjs';
import {sameCursor} from '../shared/sync.mjs';
export class PocketRisuClient {
 constructor(host){this.host=host;}
 async selection(){const selected=await this.host.getCurrentCharacterIndex();requireValue((Number.isSafeInteger(selected)&&selected>=0)||(typeof selected==='string'&&selected.length>0),'채팅을 연 뒤 채팅 메뉴 → LORE에서 연결하세요.');return chatSelector({...typeof selected==='string'?{characterId:selected}:{characterIndex:selected},index:await this.host.getCurrentChatIndex()});}
 async session(){
  const response=await this.host.nativeFetch('/api/test_auth',{method:'GET',requestTimeoutMs:5000});
  const result=JSON.parse(new TextDecoder().decode(await readBounded(response,8192)));
  requireValue(result.status==='success'&&typeof result.token==='string','PocketRisu에 먼저 로그인하세요.');return result.token;
 }
 async read(selector,token){
  const fetcher=(url,{signal,...options})=>this.host.nativeFetch(url,options);
  const chat=await fetchSavedChat(fetcher,'',selector,token,1024*1024);
  requireValue(chat.message.length<=128,'Lite는 저장된 메시지 128개까지 지원합니다. 긴 채팅은 Full을 사용하세요.');return chat;
 }
 async capture(store,boundaries=null){
  const selector=await this.selection(),sessionToken=await this.session();let result;
  if(store?.capture)result=await store.capture({selector,sessionToken,identityOnly:boundaries===null,...(boundaries?{boundaries}:{})});
  else {
   const resolved=await resolveChatSelector((url,{signal,...args})=>this.host.nativeFetch(url,args),'',selector,sessionToken);
   const chat=await this.read(resolved,sessionToken),identity=savedIdentity(resolved,chat);
   if(boundaries===null)result=identity;
   else {
    const bound=(await store.identity()).scope;requireValue(bound.characterId===identity.characterId&&bound.chatId===identity.chatId&&bound.branchId===identity.branchId,'다른 채팅입니다. 이 노트북의 자동 기억을 중지했습니다.',409);
    const snapshot=confirmedSnapshot(resolved,chat,boundaries);let {cursor}=await store.syncState(),delta;
    for(let i=0;i<4;i++){delta=await readLoreDelta(snapshot,cursor);if(!sameCursor(cursor,delta.cursor))await store.sync(delta);cursor=delta.cursor;if(!delta.hasMore)break;}
    result={...identity,cursor,complete:!delta.hasMore};
   }
  }
  const current=await this.selection();requireValue(JSON.stringify(current)===JSON.stringify(selector),'열린 채팅이 변경되었습니다.');
  return {...result,selector};
 }
 async identity(store){return this.capture(store);}
}
export function confirmedBoundaries(messages) {
 const lastUser=messages.findLastIndex(m=>m.role==='user');
 return messages.filter((m,i)=>i!==lastUser&&['assistant','user'].includes(m.role)&&typeof m.memo==='string'&&m.memo&&m.memo!=='NewChat').slice(-32).map(m=>m.memo);
}
export function requestBudget(messages,memory,settings,responseReserve,memoryBudget) {
 const bytes=value=>new TextEncoder().encode(value).length;
 const plain=Array.isArray(messages)&&messages.length<=1000&&messages.every(m=>['user','assistant','system'].includes(m.role)&&typeof m.content==='string'&&!m.multimodals?.length&&!m.thoughts?.length&&!m.tool_calls&&!m.function_call);
 const limit=Number(settings.maxContext),reserve=Math.max(Number(settings.maxResponse),Number(responseReserve??0));
 // The stock plugin API exposes no tokenizer. UTF-8 bytes plus generous message
 // framing deliberately overestimate common byte-BPE text; this is an estimate,
 // not a claim to count every provider's private tokenizer exactly.
 const memoryTokens=memory?bytes(memory)+64:0,requestTokens=plain?messages.reduce((sum,m)=>sum+bytes(m.content)+bytes(m.name??'')+64,64)+memoryTokens:Infinity;
 return {fits:plain&&Number.isSafeInteger(limit)&&Number.isSafeInteger(reserve)&&reserve>0&&limit>reserve&&memoryTokens<=memoryBudget&&requestTokens+reserve<=limit,memoryTokens,requestTokens,reserve,limit,method:'conservative-utf8-estimate'};
}
