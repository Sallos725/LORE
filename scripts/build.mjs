import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const {version}=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
// Deliberately dependency-free bundling: only named relative imports and exports
// are allowed in these small source modules. Verify output syntax in CI.
const modules=['shared/core.mjs','shared/wiki.mjs','shared/sync.mjs','shared/pocketrisu.mjs','shared/chat-delta.mjs','shared/providers.mjs','shared/extraction.mjs','plugin/lite-store.mjs','plugin/full-store.mjs','plugin/ui.mjs','plugin/pocketrisu.mjs','plugin/runtime.mjs','plugin/main.mjs'];
const body=modules.map(path=>readFileSync(path,'utf8').replace(/^import .* from .*;\n/gm,'').replace(/^export /gm,'')).join('\n');
for(const edition of ['Lite','Full']){
  const path=edition==='Lite'?'lite/lore-lite.js':'full/plugin/lore-full.js';mkdirSync(path.slice(0,path.lastIndexOf('/')),{recursive:true});
  writeFileSync(path,`//@name lore_${edition.toLowerCase()}\n//@display-name LORE ${edition}\n//@version ${version}\n//@api 3.0\n// Source: https://github.com/Sallos725/lore\n(async()=>{\n${body}\nawait install(Risuai,${JSON.stringify(edition)});\n})().catch(()=>console.error('LORE 초기화 실패'));\n`);
}
