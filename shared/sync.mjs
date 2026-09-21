import {boundedString,requireValue} from './core.mjs';
export function sameCursor(a,b){return JSON.stringify(a??null)===JSON.stringify(b??null);}
export function validateDelta(delta,scope,cursor){
  requireValue(delta&&delta.characterId===scope.characterId&&delta.chatId===scope.chatId&&delta.branchId===scope.branchId,'Chat scope mismatch',409);
  requireValue(sameCursor(delta.previous,cursor),'Collection cursor conflict',409);
  requireValue(delta.cursor&&Number.isSafeInteger(delta.cursor.count)&&delta.cursor.count>=0&&/^[a-f0-9]{64}$/.test(delta.cursor.digest),'Invalid collection cursor');
  requireValue(typeof delta.reset==='boolean'&&Array.isArray(delta.messages)&&delta.messages.length<=32,'Invalid delta');
  const start=delta.reset?0:(cursor?.count??0);requireValue(delta.cursor.count>=start&&delta.cursor.count-start<=32,'Invalid delta count');
  const ids=new Set();let bytes=0;
  for(const m of delta.messages){boundedString(m.id,'message ID');boundedString(m.text,'source',16384);const size=new TextEncoder().encode(m.text).length;requireValue(size<=16384,'Source too large',413);bytes+=size;requireValue(!ids.has(m.id)&&['user','assistant'].includes(m.role),'Invalid message');ids.add(m.id);}
  requireValue(bytes<=60000,'Delta too large',413);
}
