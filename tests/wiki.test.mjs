import test from 'node:test';import assert from 'node:assert/strict';
import {aliasesOf,wikiPath,resolveLink,wikiSegments,browsePages,markdownExport} from '../shared/wiki.mjs';
import {Store} from '../server/store.mjs';
const scope={installationId:'i',userId:'u',characterId:'c',chatId:'t',branchId:'b'};
test('aliases normalize, nested paths reject traversal, ambiguous links never guess',()=>{
 assert.deepEqual(aliasesOf(' Alice, Ａlice, 앨리스, ','앨리스'),['Alice']);assert.throws(()=>wikiPath('../secret.md'));
 const pages=[{id:'1',title:'A',aliases:['대장'],path:'people/north/a.md'},{id:'2',title:'B',aliases:['대장'],path:'people/south/b.md'}];
 assert.equal(resolveLink('대장',pages).status,'ambiguous');assert.equal(resolveLink('id:1',pages).status,'resolved');assert.equal(resolveLink('people/north/a.md',pages).status,'resolved');
 assert.deepEqual(browsePages(pages,'people').entries.map(p=>p.path),['people/north','people/south']);
});
test('links skip code and escapes; exports include aliases and stable ID',()=>{
 assert.deepEqual(wikiSegments('[[A|인물]] `[[B]]`\n```\n[[C]]\n```\n\\[[D]]').filter(p=>p.target).map(p=>p.target),['A']);
 assert.match(markdownExport({id:'1',title:'A',body:'[[B]]',kind:'person',aliases:['가']}),/aliases: \["가"\]/);
});
test('server aliases, rename, paths, links and private backlinks',t=>{
 const s=new Store(':memory:');t.after(()=>s.close());
 s.put(scope,'a',{title:'앨리스',aliases:'Alice, 대장',path:'people/crew/alice.md',body:'안녕'},0);
 s.put(scope,'b',{title:'사건',body:'관련 인물: [[Alice]]'},0);
 assert.equal(s.resolve(scope,'Alice').candidates[0].id,'a');assert.equal(s.links(scope,'a').backlinks.length,1);
 s.put(scope,'a',{title:'새 이름',aliases:'Alice',body:'수정',path:'people/alice.md'},1);
 assert.equal(s.resolve(scope,'앨리스').status,'resolved');assert.equal(s.list(scope,{query:'Alice'}).pages.length,2);
 s.put(scope,'secret',{title:'비밀',visibility:'Alice',body:'[[Alice]]'},0,'Alice');assert.equal(s.links(scope,'a').backlinks.length,1);
});
