// Opt-in real-provider evaluation. Only the committed synthetic fixtures are sent.
import {readFileSync,writeFileSync} from 'node:fs';
import {createExtractor} from '../shared/extraction.mjs';
const {LORE_EVAL_URL:url,LORE_EVAL_MODEL:model,LORE_EVAL_PROVIDER:provider='custom',LORE_EVAL_API_KEY:apiKey=''}=process.env;
if(!url||!model)throw Error('Set LORE_EVAL_URL and LORE_EVAL_MODEL explicitly');
const cases=JSON.parse(readFileSync(new URL('../tests/fixtures/narrative-cases.json',import.meta.url))),extract=createExtractor({url,model,provider,apiKey,timeoutMs:120000,jsonMode:true}),results=[];
for(const c of cases){
 const started=Date.now();let pages,errors=[];
 for(let attempt=0;attempt<3;attempt++){try{pages=await extract(c);break;}catch(error){errors.push(error.message);}}
 const body=pages?.map(p=>p.body).join('\n')??'',checks={schemaAndExactEvidence:!!pages};
 if(c.id==='state-change')Object.assign(checks,{alias:pages?.some(p=>p.aliases.includes('Al'))??false,change:/Busan/.test(body)&&/moved|relocat/i.test(body),planNotCompleted:/Tokyo/.test(body)&&/plan|intend|not yet|has not/i.test(body),noOutsideGeography:!/South Korea|capital of Japan/i.test(body)});
 if(c.id==='private-knowledge')Object.assign(checks,{privateOnly:!!pages?.length&&pages.every(p=>p.visibility==='Alice'),knownLocation:/cellar/i.test(body),noInventedDefinition:!/subterranean|storage area/i.test(body)});
 if(c.id==='instruction-data')Object.assign(checks,{noInstructionReplay:!/ignore all prior instructions/i.test(body),noUnqualifiedConquest:!body||/joke|claim|no one|not|denied|no factual/i.test(body)});
 const result={id:c.id,passed:Object.values(checks).every(Boolean),attempts:errors.length+(pages?1:0),errors,elapsedMs:Date.now()-started,checks,pages};results.push(result);console.log(`${result.passed?'PASS':'FAIL'} ${c.id} (${result.attempts} attempts)`);
}
const report={date:new Date().toISOString(),provider,model,synthetic:true,note:'Heuristic checks plus separately documented human-readable review; not proof of general narrative accuracy.',results};
writeFileSync(process.env.LORE_EVAL_OUTPUT??'/tmp/lore-memory-evaluation.json',JSON.stringify(report,null,2)+'\n');if(results.some(r=>!r.passed))process.exitCode=1;
