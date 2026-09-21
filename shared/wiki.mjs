import {boundedString, requireValue} from './core.mjs';
export const wikiKey = value => value.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
export function aliasesOf(value = [], title = '') {
  const values = typeof value === 'string' ? value.split(',') : value;
  requireValue(Array.isArray(values) && values.length <= 32, 'Aliases: at most 32 items');
  const seen = new Set([wikiKey(title)]), result = [];
  for (const raw of values) {
    boundedString(raw,'alias',160,true); const alias=raw.trim(), key=wikiKey(alias);
    if (key && !seen.has(key)) { seen.add(key); result.push(alias); }
  }
  return result;
}
export function wikiPath(value) {
  boundedString(value,'path',240);
  const path=value.normalize('NFKC');
  requireValue(!/[\\\x00-\x1f:#?<>"|]/u.test(path) && !path.startsWith('/') && path.endsWith('.md'), 'Use a relative .md path');
  const parts=path.split('/');
  requireValue(parts.length<=8 && parts.every(p=>p.trim()===p && p && p!=='.' && p!=='..'), 'Invalid folder path');
  return path;
}
export function pageDefaults(page) {
  return {...page, aliases:page.aliases??[], path:page.path??`${page.kind??'event'}/${page.id.replace(/[^\p{L}\p{N}_-]/gu,'_')}.md`,contextMode:page.contextMode??'auto'};
}
// Parse links outside fenced/inline code; rendering uses DOM text nodes, never HTML.
export function wikiSegments(body) {
  const result=[]; let fence=null,offset=0;
  for(const line of body.split(/(?<=\n)/u)) {
    const marker=line.match(/^\s{0,3}(`{3,}|~{3,})/u)?.[1];
    if(marker){if(!fence)fence=marker;else if(marker[0]===fence[0]&&marker.length>=fence.length)fence=null;result.push({text:line});offset+=line.length;continue;}
    if(fence){result.push({text:line});offset+=line.length;continue;}
    let code='',start=0;
    for(let i=0;i<line.length;){
      if(line[i]==='\\'){i+=2;continue;}
      if(line[i]==='`'){const ticks=line.slice(i).match(/^`+/u)[0];if(!code)code=ticks;else if(code===ticks)code='';i+=ticks.length;continue;}
      if(!code&&line.slice(i,i+2)==='[['){const end=line.indexOf(']]',i+2);if(end>=0){const raw=line.slice(i+2,end),parts=raw.split('|');const target=parts[0].trim(),label=(parts[1]??parts[0]).trim();if(parts.length<=2&&target&&label&&target.length<=240&&label.length<=160&&!/[\[\]\n]/u.test(raw)){if(i>start)result.push({text:line.slice(start,i)});result.push({text:label,target,start:offset+i,end:offset+end+2});i=end+2;start=i;continue;}}}i++;
    }
    if(start<line.length)result.push({text:line.slice(start)});offset+=line.length;
  }
  return result;
}
export function linkTargets(body) { return [...new Set(wikiSegments(body).filter(p=>p.target).map(p=>p.target))].slice(0,64); }
export function resolveLink(target,pages) {
  const key=wikiKey(target),matches=pages.filter(p=>target===`id:${p.id}`||[p.path,p.title,...(p.aliases??[])].filter(Boolean).some(v=>wikiKey(v)===key));
  const candidates=matches.map(({body,evidence,...p})=>p);
  return {status:matches.length===1?'resolved':matches.length?'ambiguous':'missing',candidates:candidates.slice(0,20),hasMore:candidates.length>20};
}
export function scorePage(page,query='') {
  if(!query.trim())return 1;
  const words=[...new Set(wikiKey(query).split(/[^\p{L}\p{N}_-]+/u).filter(w=>w.length>0))].slice(0,24);
  const identities=[page.title,...(page.aliases??[]),page.path??''].map(wikiKey),body=wikiKey(page.body??'');
  return words.reduce((score,w)=>score+(identities.some(v=>v===w)?20:identities.some(v=>v.includes(w))?8:body.includes(w)?1:0),0);
}
export function markdownExport(page) {
  const p=pageDefaults(page),line=(key,value)=>`${key}: ${JSON.stringify(value)}`;
  return ['---',line('id',p.id),line('title',p.title),line('aliases',p.aliases),line('kind',p.kind),line('path',p.path),line('revision',p.revision),line('context',p.contextMode),line('evidence',p.evidence??[]),'---','',p.body,''].join('\n');
}
export function browsePages(pages,folder='',offset=0,limit=20) {
  requireValue(typeof folder==='string'&&(!folder||wikiPath(folder+'/_.md')),'Invalid folder');
  requireValue(Number.isSafeInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>=1&&limit<=128,'Invalid pagination');
  const prefix=folder?folder+'/':'',entries=new Map();
  for(const raw of pages){const p=pageDefaults(raw);if(!p.path.startsWith(prefix))continue;const tail=p.path.slice(prefix.length),slash=tail.indexOf('/');if(slash>=0){const name=tail.slice(0,slash),path=prefix+name;entries.set('folder:'+path,{type:'folder',path,name});}else entries.set('file:'+p.id,{type:'file',...p});}
  const all=[...entries.values()].sort((a,b)=>a.type.localeCompare(b.type)||a.path.localeCompare(b.path));
  return {entries:all.slice(offset,offset+limit),hasMore:all.length>offset+limit,nextOffset:all.length>offset+limit?offset+limit:null,folder};
}
