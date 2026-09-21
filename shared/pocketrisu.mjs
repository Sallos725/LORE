import {requireValue} from './core.mjs';
// A bounded, non-evaluating decoder for PocketRisu's no-records MessagePack chat
// response. Unsupported extensions/compression fail closed; no host code is copied.
export function decodeChat(bytes) {
  const header=[0,82,73,83,85,83,65,86,69,0,7];
  requireValue(bytes instanceof Uint8Array&&header.every((v,i)=>bytes[i]===v),'Unsupported PocketRisu chat encoding');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder('utf-8',{fatal:true});let at=header.length,nodes=0;
  const take=n=>{requireValue(Number.isSafeInteger(n)&&n>=0&&at+n<=bytes.length,'Truncated chat');const start=at;at+=n;return start;};
  const uint=n=>{const pos=take(n);return n===1?view.getUint8(pos):n===2?view.getUint16(pos):view.getUint32(pos);};
  const string=n=>decoder.decode(bytes.subarray(take(n),at));
  const read=(depth=0)=>{
    requireValue(depth<=32&&++nodes<=500000,'Chat structure too large');const tag=uint(1);
    if(tag<128)return tag;if(tag>=224)return tag-256;
    if(tag>=160&&tag<=191)return string(tag&31);
    const array=n=>{requireValue(n<=100000&&n<=bytes.length-at,'Chat array too large');return Array.from({length:n},()=>read(depth+1));};
    const map=n=>{requireValue(n<=100000&&n*2<=bytes.length-at,'Chat map too large');const value=Object.create(null);for(let i=0;i<n;i++){const key=read(depth+1);requireValue(typeof key==='string'&&!Object.hasOwn(value,key),'Invalid chat key');value[key]=read(depth+1);}return value;};
    if(tag>=144&&tag<=159)return array(tag&15);if(tag>=128&&tag<=143)return map(tag&15);
    if(tag===192)return null;if(tag===194)return false;if(tag===195)return true;
    if(tag===204)return uint(1);if(tag===205)return uint(2);if(tag===206)return uint(4);
    if(tag===208)return view.getInt8(take(1));if(tag===209)return view.getInt16(take(2));if(tag===210)return view.getInt32(take(4));
    if(tag===202)return view.getFloat32(take(4));if(tag===203)return view.getFloat64(take(8));
    if(tag===207||tag===211){const value=Number(tag===207?view.getBigUint64(take(8)):view.getBigInt64(take(8)));requireValue(Number.isSafeInteger(value),'Unsafe chat integer');return value;}
    if(tag===217)return string(uint(1));if(tag===218)return string(uint(2));if(tag===219)return string(uint(4));
    if(tag===220)return array(uint(2));if(tag===221)return array(uint(4));if(tag===222)return map(uint(2));if(tag===223)return map(uint(4));
    if([196,197,198].includes(tag)){const n=uint(2**(tag-196));return bytes.slice(take(n),at);}
    if(tag===212){const type=uint(1),value=uint(1);if(type===0&&value===0)return undefined;}
    throw Error('Unsupported MessagePack extension');
  };
  const chat=read();requireValue(at===bytes.length&&typeof chat?.id==='string'&&chat.id.length>0&&chat.id.length<=160&&Array.isArray(chat.message)&&!chat._stub&&!chat._serverPlaceholder,'Invalid saved chat');return chat;
}
export async function readBounded(response,maxBytes,{checkStatus=true}={}) {
  if(checkStatus)requireValue(response.ok,`PocketRisu HTTP ${response.status}`,502);
  const declared=Number(response.headers.get('content-length')??0);
  if(declared>maxBytes){await response.body?.cancel();throw Error('Chat exceeds this edition’s size limit');}
  requireValue(response.body?.getReader,'Streaming response required');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;requireValue(size<=maxBytes,'Chat exceeds this edition’s size limit');chunks.push(value);}}
  finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(size);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}return bytes;
}
export function chatSelector(value) {
  const stable=typeof value?.characterId==='string'&&value.characterId.length>0&&value.characterId.length<=160;
  const numeric=Number.isSafeInteger(value?.characterIndex)&&value.characterIndex>=0&&value.characterIndex<100000;
  requireValue((stable||numeric)&&Number.isSafeInteger(value.index)&&value.index>=0&&value.index<100000,'Open a saved PocketRisu chat');
  return {...(stable?{characterId:value.characterId}:{characterIndex:value.characterIndex}),index:value.index};
}
export async function resolveChatSelector(fetcher,base,value,token,maxBytes=262144){
 const selector=chatSelector(value);if(selector.characterId)return selector;
 // Stock PocketRisu returns the DB array index in V3. Its authenticated stats
 // endpoint emits active rows in that same order, followed by archived rows.
 // This metadata response contains no chat text or character-card bodies.
 const response=await fetcher(base+'/api/db/stats/characters',{method:'GET',headers:{'risu-auth':token},redirect:'error',requestTimeoutMs:5000,signal:AbortSignal.timeout(5000)});
 const result=JSON.parse(new TextDecoder().decode(await readBounded(response,maxBytes))),row=result.characters?.[selector.characterIndex];
 requireValue(row&&!row.archived&&typeof row.chaId==='string'&&row.chaId.length>0,'Selected character is not saved yet');
 return chatSelector({characterId:row.chaId,index:selector.index});
}
export function savedIdentity(selector,chat){return {characterId:selector.characterId,chatId:chat.id,branchId:chat.id};}
export function confirmedSnapshot(selector,chat,boundaries) {
  requireValue(Array.isArray(boundaries)&&boundaries.length>0&&boundaries.length<=32&&boundaries.every(id=>typeof id==='string'&&id.length>0&&id.length<=160),'No confirmed message IDs in request');
  // Every anchor must belong to the saved branch, in order. Never use a future
  // message merely because it is already present on disk (regeneration/rewind).
  let last=-1;for(const id of boundaries){const next=chat.message.findIndex(m=>m.chatId===id);requireValue(next>last,'Saved chat does not match the request; wait for PocketRisu to save');last=next;}
  return {chaId:selector.characterId,chatPage:0,chats:[{...chat,message:chat.message.slice(0,last+1)}]};
}
export async function fetchSavedChat(fetcher,base,selector,token,maxBytes) {
  chatSelector(selector);requireValue(typeof token==='string'&&token.length<=4096,'Invalid PocketRisu session token');
  const response=await fetcher(`${base}/api/chat-content/${encodeURIComponent(selector.characterId)}/${selector.index}`,{method:'GET',headers:token?{'risu-auth':token}:{},redirect:'error',requestTimeoutMs:5000,signal:AbortSignal.timeout(5000)});
  return decodeChat(await readBounded(response,maxBytes));
}
