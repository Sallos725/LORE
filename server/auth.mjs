import {createHash,randomUUID} from 'node:crypto';
import {boundedString,requireValue,scopeKey} from '../shared/core.mjs';
import {chatSelector,fetchSavedChat,readBounded,savedIdentity} from '../shared/pocketrisu.mjs';

// PocketRisu has one password-protected account per installation. Validate its
// existing login at a fixed operator-configured origin; never accept a client URL
// or an unverified JWT claim as a user/installation identity.
export function pocketRisuAuth(store,upstream,fetcher=fetch){
 const origin=new URL(upstream);requireValue(['http:','https:'].includes(origin.protocol)&&origin.pathname==='/'&&!origin.username&&!origin.password&&!origin.search&&!origin.hash,'Configure one PocketRisu origin');
 store.db.exec('CREATE TABLE IF NOT EXISTS host_installations(origin TEXT PRIMARY KEY,id TEXT NOT NULL); CREATE TABLE IF NOT EXISTS host_chats(scope TEXT PRIMARY KEY);');
 store.db.prepare('INSERT OR IGNORE INTO host_installations VALUES (?,?)').run(origin.origin,randomUUID());
 const installationId=store.db.prepare('SELECT id FROM host_installations WHERE origin=?').get(origin.origin).id;
 const verified=new Map();
 async function authenticate(req){
  const token=req.headers.authorization?.match(/^Bearer ([^\s]{1,4096})$/)?.[1];requireValue(token,'PocketRisu login required',401);
  const hash=createHash('sha256').update(token).digest('hex');
  if((verified.get(hash)??0)<=Date.now()){
   const response=await fetcher(origin.origin+'/api/test_auth',{method:'GET',headers:{'risu-auth':token},redirect:'error',signal:AbortSignal.timeout(5000)});
   const result=JSON.parse(new TextDecoder().decode(await readBounded(response,8192)));
   requireValue(result.status==='success','PocketRisu login expired; sign in again',401);
   // Very short cache bounds upstream work without retaining raw login tokens.
   if(verified.size>=256)verified.delete(verified.keys().next().value);verified.set(hash,Date.now()+5000);
  }
  const characterId=req.headers['x-lore-character'],chatId=req.headers['x-lore-chat'];
  const scope=characterId&&chatId?{installationId,userId:'pocketrisu',characterId:boundedString(decodeURIComponent(characterId),'characterId'),chatId:boundedString(decodeURIComponent(chatId),'chatId'),branchId:decodeURIComponent(chatId)}:null;
  if(scope)requireValue(store.db.prepare('SELECT 1 FROM host_chats WHERE scope=?').get(scopeKey(scope)),'Connect the selected PocketRisu chat first',403);
  return {scope,audience:'world',collect:true,configure:true,sessionToken:token};
 }
 authenticate.connect=async(principal,data)=>{
  const selector=chatSelector(data.selector),chat=await fetchSavedChat(fetcher,origin.origin,selector,principal.sessionToken,16*1024*1024);
  const scope={installationId,userId:'pocketrisu',...savedIdentity(selector,chat)};
  store.db.prepare('INSERT OR IGNORE INTO host_chats VALUES (?)').run(scopeKey(scope));
  return {scope,audience:'world'};
 };
 return authenticate;
}
