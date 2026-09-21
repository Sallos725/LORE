// Original LORE adapter. Runs in the host, before iframe/RPC serialization.
// hashFactory provides an incremental SHA-256 {update(string), hex()} object.
export function readLoreDelta(character,cursor,{hashFactory,mode='delta',generating=false}={}) {
  const chat=character?.chats?.[character.chatPage];
  if(!character?.chaId||!chat?.id||!Array.isArray(chat.message)||chat._stub||chat._serverPlaceholder)throw Error('LORE: open a hydrated chat first');
  const identity={characterId:character.chaId,chatId:chat.id,branchId:chat.id};
  if(mode==='identity')return {...identity,generating};
  if(mode==='delta'&&generating)return {...identity,busy:true};
  if(cursor&&(!Number.isSafeInteger(cursor.count)||cursor.count<0||!/^[a-f0-9]{64}$/.test(cursor.digest)))throw Error('LORE: invalid cursor');
  // Match PocketRisu makeMs: an allBefore marker excludes itself and all older messages.
  let barrier=-1;for(let i=chat.message.length-1;i>=0;i--)if(chat.message[i].disabled==='allBefore'){barrier=i;break;}
  const newHash=()=>{const hash=hashFactory();hash.update('lore-chat-v2:'+barrier+':');return hash;};
  const feed=(hash,message)=>{
    const fields=[message.chatId??'',message.role??'',message.data??'',String(message.disabled??false),String(message.isComment??false),message.saying??'',message.name??''];
    for(const value of fields){if(typeof value!=='string')throw Error('LORE: unsupported message');hash.update(String(value.length)+':');hash.update(value);}
  };
  const prefix=newHash();for(let i=0;i<Math.min(cursor?.count??0,chat.message.length);i++)feed(prefix,chat.message[i]);
  const valid=!cursor||(cursor.count<=chat.message.length&&prefix.hex()===cursor.digest);
  if(mode==='state')return {...identity,valid,total:chat.message.length,generating};
  const start=valid?(cursor?.count??0):0,hash=newHash(),messages=[],ids=new Set();let end=start,bytes=0;
  for(let i=0;i<start;i++)feed(hash,chat.message[i]);
  for(let i=start;i<Math.min(start+32,chat.message.length);i++){
    const message=chat.message[i];
    if(i>barrier&&!message.disabled&&!message.isComment&&['user','char'].includes(message.role)&&message.data){
      if(typeof message.chatId!=='string'||!message.chatId||message.chatId.length>160)throw Error('LORE: message needs a stable chatId');
      const size=new TextEncoder().encode(message.data).length;if(size>16384)throw Error('LORE: source exceeds 16 KiB; collection paused without truncation');
      if(bytes+size>60000)break;if(ids.has(message.chatId))throw Error('LORE: duplicate message ID');ids.add(message.chatId);
      messages.push({id:message.chatId,text:message.data,role:message.role==='char'?'assistant':'user'});bytes+=size;
    }
    feed(hash,message);end=i+1;
  }
  return {...identity,previous:cursor??null,cursor:{count:end,digest:hash.hex()},reset:!valid,messages,hasMore:end<chat.message.length};
}
