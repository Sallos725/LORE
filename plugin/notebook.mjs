import {boundedString} from '../shared/core.mjs';
export async function chatNotebook(scope){
 const value=JSON.stringify(['characterId','chatId','branchId'].map(k=>boundedString(scope[k],k)));
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return 'chat-'+[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
