import {wikiSegments,markdownExport} from '../shared/wiki.mjs';
export function renderWiki(element,body,navigate){
  element.replaceChildren();let fence=null,code=null;
  for(const line of body.split('\n')){
    const marker=line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1];
    if(marker){if(!fence){fence=marker;code=document.createElement('pre');element.append(code);}else if(marker[0]===fence[0]&&marker.length>=fence.length){fence=null;code=null;}else code.append(document.createTextNode(line+'\n'));continue;}
    if(fence){code.append(document.createTextNode(line+'\n'));continue;}
    const heading=line.match(/^(#{1,4})\s+(.*)$/),item=line.match(/^\s*[-*+]\s+(.*)$/),quote=line.match(/^>\s?(.*)$/);
    const node=document.createElement(heading?'h'+heading[1].length:quote?'blockquote':'div'),text=heading?.[2]??item?.[1]??quote?.[1]??line;
    if(item)node.append(document.createTextNode('• '));
    for(const segment of wikiSegments(text)){
      if(segment.target){const link=document.createElement('button');link.className='wikilink';link.textContent=segment.text;link.onclick=()=>navigate(segment.target);node.append(link);}
      else node.append(document.createTextNode(segment.text));
    }
    if(!text)node.append(document.createElement('br'));element.append(node);
  }
}
export function openUI({edition,host,connect,automation,onClose}) {
  let alive=true,store=null,page=null,offset=0,working=false,folder='',tree=false,connectionOptions=null;
  const root=document.createElement('section');root.setAttribute('aria-label',`LORE ${edition}`);
  root.innerHTML=`<style>
  body{margin:0;background:#111922;color:#e4e9ed;font:16px/1.5 system-ui}*{box-sizing:border-box}
  .lore{max-width:960px;margin:auto;padding:24px 16px}header,.tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  header{justify-content:space-between}h1{letter-spacing:.08em}small{color:#b0c1d0}
  input,textarea,select,button{font:inherit;color:inherit;background:#1d2a37;border:1px solid #526778;border-radius:6px;padding:10px;min-height:44px}
  button{cursor:pointer}button:disabled{opacity:.5}input,textarea{width:100%}textarea{min-height:240px;resize:vertical}
  label{display:block;margin:12px 0}section[aria-label]{padding-bottom:30px}.tools{margin:16px 0}.list{display:grid;gap:8px}.list button{text-align:left}
  pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto}output{display:block;white-space:pre-wrap;margin:12px 0;color:#afdcca}
  .wiki-view{overflow-wrap:anywhere;border:1px solid #526778;padding:16px;margin:16px 0}.wikilink{border:0;background:none;color:#99d3f2;text-decoration:underline;padding:0 4px;min-height:32px}
  details{border-bottom:1px solid #526778;padding:12px 0}summary{cursor:pointer}code{overflow-wrap:anywhere}
  :focus-visible{outline:2px solid #9ecde9;outline-offset:3px}
  </style><main class="lore"><header><h1>LORE ${edition}</h1><button data-stop>자동 기억 중지</button><button data-close>닫기</button></header>
  <p>대화에서 이어지는 인물 · 사건 · 장면의 위키</p>
  <button data-host-scope>현재 채팅 ID 확인</button><div data-connect></div><output role="status"></output><div data-work hidden>
  <details><summary>자동 기억 설정 · 작업 상태</summary><p>현재 채팅의 확정된 메시지를 수집하고 관련 기억을 생성 요청에 넣습니다. 처음 시작하면 이전 대화도 순서대로 처리합니다.</p>
  <small>자동 연결에는 PocketRisu LORE API 확장이 필요합니다. 설치: docs/automation.md · 탭 종료 전 전달되지 않은 메시지는 다시 연결할 때 수집합니다.</small>
  <div data-llm></div><label>기억 토큰 예산<input data-memory-budget type="number" value="1024" min="128" max="4096"></label>
  <div class="tools"><button data-auto>자동 기억 시작</button><button data-jobs>상태 · 작업 · 충돌 새로고침</button></div><pre data-auto-status></pre><div data-job-list></div><div data-conflicts></div></details>
  <label>위키 검색<input data-search maxlength="200" placeholder="${edition==='Lite'?'제목 · 별칭 · 경로':'제목 · 별칭 · 경로 · 본문'}"></label>
  <div class="tools"><button data-find>검색</button><button data-tree>폴더 탐색</button><button data-up>상위 폴더</button><button data-new>새 문서</button><button data-prev>이전</button><button data-next>다음</button><button data-context>컨텍스트 미리보기</button></div>
  <small data-folder></small><div class="list"></div><div data-editor hidden>
  <label>제목<input data-title maxlength="160"></label><label>문서 경로<input data-path maxlength="240" placeholder="인물/동료/캐릭터1.md"></label>
  <label>별칭 (쉼표로 구분)<input data-aliases maxlength="5152" placeholder="캐릭터1, 다른 이름, 애칭"></label>
  <label>종류<select data-kind><option value="person">인물</option><option value="event">사건</option><option value="scene">현재 장면</option><option value="location">장소</option><option value="faction">집단</option><option value="item">물건</option><option value="concept">개념</option><option value="note">메모</option></select></label>
  <label>본문 (Markdown)<textarea data-body maxlength="16384" placeholder="관련 인물: [[캐릭터1]] [[캐릭터2]]"></textarea></label>
  <label>공개 범위<select data-visibility><option value="public">공개</option></select></label>
  <label>기억에 포함<select data-mode><option value="auto">검색에 관련될 때</option><option value="always">항상 (필수 기억)</option><option value="never">주입하지 않음</option></select></label>
  <div class="tools"><button data-save>저장</button><button data-render>본문 미리보기</button><button data-links>관련 문서 · 역링크</button><button data-history>변경 이력</button><button data-export>Markdown 내보내기</button></div>
  <small>저장한 교정은 자동 추출이 덮어쓰지 않습니다. 제목을 바꾸면 이전 제목을 별칭으로 보존합니다.</small>
  <div data-rendered class="wiki-view"></div><div data-linked></div><pre data-evidence></pre></div>
  <label>컨텍스트 미리보기 한도 (UTF-8 bytes)<input data-budget type="number" value="4096" min="0" max="16384"></label>
  <pre data-preview></pre><small>이 미리보기는 저장된 기억만 보여 줍니다. 자동 주입은 현재 채팅 범위와 전체 요청의 토큰 예산도 검사합니다.</small></div></main>`;
  document.body.append(root);
  const $=selector=>root.querySelector(selector),status=$('output'),workspace=$('[data-work]');
  const say=value=>{if(alive)status.textContent=value;};
  const run=async fn=>{if(working||!alive)return;working=true;try{await fn();}catch(e){say(e.message);}finally{working=false;}};
  const action=(selector,fn)=>{$(selector).onclick=()=>run(fn);};
  const load=async id=>{const value=await store.page(id);if(alive)edit(value);};
  const pageButton=(container,row)=>{const button=document.createElement('button');button.textContent=`${row.title} · ${row.path} · r${row.revision}`;button.onclick=()=>run(()=>load(row.id));container.append(button);};
  async function list(){
    const result=tree?await store.browse({folder,offset}):await store.list({query:$('[data-search]').value,offset,limit:20});if(!alive)return;
    $('.list').replaceChildren();const entries=result.entries??result.pages;
    for(const row of entries){if(row.type==='folder'){const button=document.createElement('button');button.textContent='📁 '+row.name;button.onclick=()=>run(async()=>{folder=row.path;offset=0;await list();});$('.list').append(button);}else pageButton($('.list'),row);}
    $('[data-folder]').textContent=tree?'/'+folder:'';$('[data-up]').disabled=!tree||!folder;
    $('[data-prev]').disabled=offset===0;$('[data-next]').disabled=!result.hasMore;
    say(`${offset+1}부터 ${entries.length}개 문서${tree?' / 폴더':''}. ${edition==='Lite'?'기기 로컬 저장 · 최대 128개':'서버 저장'}`);
  }
  async function follow(target){await run(async()=>{const result=await store.resolve(target);if(!alive)return;if(result.status==='resolved')await load(result.candidates[0].id);else{const linked=$('[data-linked]');linked.replaceChildren();say(result.status==='missing'?`연결할 문서가 없습니다: ${target}`:`별칭이 겹칩니다. 문서를 선택하세요: ${target}${result.hasMore?' (정확한 경로나 id:ID 링크로 좁히세요.)':''}`);for(const row of result.candidates)pageButton(linked,row);}});}
  function edit(value){
    page=value;$('[data-editor]').hidden=false;for(const key of ['title','kind','body','visibility'])$(`[data-${key}]`).value=value[key];
    $('[data-path]').value=value.path??'';$('[data-aliases]').value=(value.aliases??[]).join(', ');$('[data-mode]').value=value.contextMode??'auto';$('[data-linked]').replaceChildren();
    const readonly=value.origin==='source-quote';for(const key of ['title','path','aliases','mode','kind','body','visibility','save'])$(`[data-${key}]`).disabled=readonly;
    $('[data-history]').disabled=!value.revision;$('[data-links]').disabled=!value.revision;
    $('[data-evidence]').textContent=(value.evidence??[]).map(e=>`근거 ${e.messageId} · r${e.revision}\n${e.quote}`).join('\n\n');
    renderWiki($('[data-rendered]'),value.body,follow);
    say(`${value.origin==='llm'?'LLM 추출 · 내용 검토 필요':readonly?'원문 인용 (읽기 전용)':'수동 문서'} · r${value.revision}${value.active===false?' · 원문 변경으로 기억에서 제외됨':''}`);
  }
  action('[data-find]',async()=>{tree=false;offset=0;await list();});action('[data-tree]',async()=>{tree=true;folder='';offset=0;await list();});
  action('[data-up]',async()=>{folder=folder.split('/').slice(0,-1).join('/');offset=0;await list();});
  action('[data-prev]',async()=>{offset=Math.max(0,offset-20);await list();});action('[data-next]',async()=>{offset+=20;await list();});
  action('[data-new]',()=>edit({id:crypto.randomUUID(),title:'',kind:'event',body:'',visibility:'public',revision:0,origin:'manual'}));
  action('[data-save]',async()=>{const saved=await store.put(page.id,{title:$('[data-title]').value,kind:$('[data-kind]').value,body:$('[data-body]').value,visibility:$('[data-visibility]').value,pinned:true,aliases:$('[data-aliases]').value,path:$('[data-path]').value||undefined,contextMode:$('[data-mode]').value},page.revision);if(!alive)return;edit(saved);await list();say('저장했습니다.');});
  action('[data-render]',()=>renderWiki($('[data-rendered]'),$('[data-body]').value,follow));
  action('[data-links]',async()=>{const links=await store.links(page.id);if(!alive)return;const linked=$('[data-linked]');linked.replaceChildren();for(const row of links.outgoing){const button=document.createElement('button');button.textContent=`→ ${row.target} · ${row.status}`;button.onclick=()=>follow(row.target);linked.append(button);}const label=document.createElement('p');label.textContent='이 문서를 가리키는 문서';linked.append(label);for(const row of links.backlinks)pageButton(linked,row);});
  action('[data-history]',async()=>{const history=await store.history(page.id);if(alive)$('[data-preview]').textContent=history.map(p=>`r${p.revision} · ${p.origin}\n${p.title}\n${p.body}`).join('\n\n');});
  action('[data-context]',async()=>{const result=await store.context({query:$('[data-search]').value,budgetBytes:Number($('[data-budget]').value)});if(!alive)return;$('[data-preview]').textContent=result.text+'\n'+result.excluded.map(p=>`${p.id}: ${p.reason}`).join('\n');say(`${result.usedBytes}/${result.budgetBytes} bytes · 포함 ${result.included.length} · 제외 ${result.excluded.length}${result.requiredOverflow?' · 필수 기억 초과: 전체 주입 생략':''}${result.fresh?'':' · 미완료/실패 작업 있음'}${result.candidateLimitReached?' · 후보 한도 도달':''}`);});
  const urls=new Set();
  action('[data-export]',()=>{if(!page)return;const url=URL.createObjectURL(new Blob([markdownExport(page)],{type:'text/markdown;charset=utf-8'}));urls.add(url);const a=document.createElement('a');a.href=url;a.download=page.path?.split('/').at(-1)??'lore.md';root.append(a);a.click();a.remove();URL.revokeObjectURL(url);urls.delete(url);});
  const connection=$('[data-connect]');
  if(edition==='Full')connection.innerHTML='<label>Full 서버 URL<input data-url type="url" placeholder="https://lore.example.com"></label><label>위키 scope token<input data-token type="password" autocomplete="off"></label><button data-start>연결</button><small>토큰은 저장하지 않습니다. 자동 기억을 켜면 중지하거나 플러그인을 해제할 때까지 메모리에서 사용합니다.</small>';
  else{connection.innerHTML='<label>노트북 ID<input data-notebook value="default" maxlength="160"></label><button data-start>노트북 열기</button><small>자동 기억 시작 시 현재 채팅에 연결됩니다. 다른 채팅은 다른 노트북을 사용하세요.</small>';$('[data-llm]').innerHTML='<label>LLM chat/completions URL<input data-llm-url type="url" placeholder="https://your-provider.example/v1/chat/completions"></label><label>모델<input data-model maxlength="160"></label><label>API key<input data-api-key type="password" autocomplete="off"></label><small>키는 저장하지 않습니다. 원문 최대 128개, 미완료 작업 최대 4개. 탭을 닫으면 Lite 작업은 중단됩니다.</small>';}
  action('[data-start]',async()=>{store?.close();workspace.hidden=true;page=null;offset=0;tree=false;$('[data-editor]').hidden=true;$('[data-preview]').textContent='';connectionOptions=edition==='Full'?{url:$('[data-url]').value,token:$('[data-token]').value}:{notebook:$('[data-notebook]').value};store=await connect(connectionOptions);const identity=await store.identity();if(!alive){store.close();return;}workspace.hidden=false;const visibility=$('[data-visibility]');visibility.replaceChildren();for(const value of new Set(['public',identity.audience])){const option=document.createElement('option');option.value=value;option.textContent=value;visibility.append(option);}await list();say('열린 범위: '+JSON.stringify(identity.scope));$('[data-auto-status]').textContent=automation?.status().message??'자동 기억 꺼짐';});
  action('[data-auto]',async()=>{await automation.start({...connectionOptions,memoryBudget:Number($('[data-memory-budget]').value),llm:edition==='Lite'?{url:$('[data-llm-url]').value,model:$('[data-model]').value,apiKey:$('[data-api-key]').value,jsonMode:false}:undefined});if(alive){$('[data-auto-status]').textContent=automation.status().message;say('자동 기억을 시작했습니다. 창을 닫아도 현재 탭에서는 계속 동작합니다.');}});
  action('[data-host-scope]',async()=>say('현재 채팅 ID: '+JSON.stringify(await automation.scope())));
  action('[data-stop]',async()=>{await automation.stop();if(alive)$('[data-auto-status]').textContent=automation.status().message;});
  action('[data-jobs]',async()=>{const jobs=await store.jobs(),conflicts=await store.conflicts();if(!alive)return;$('[data-auto-status]').textContent=JSON.stringify(automation.status(),null,2);const list=$('[data-job-list]');list.replaceChildren();for(const j of jobs){const row=document.createElement('div');row.textContent=`${j.state} · 시도 ${j.attempts} ${j.error??''} `;if(['queued','running','failed'].includes(j.state)){const button=document.createElement('button');button.textContent='취소';button.onclick=()=>run(async()=>{await store.cancel(j.id);say('작업을 취소했습니다.');});row.append(button);}if(['failed','cancelled'].includes(j.state)){const retry=document.createElement('button');retry.textContent='재시도';retry.onclick=()=>run(async()=>{await store.retry(j.id);say('작업을 다시 대기열에 넣었습니다.');});row.append(retry);}list.append(row);}const out=$('[data-conflicts]');out.replaceChildren();for(const c of conflicts){const detail=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='교정과 충돌: '+c.proposal.title;pre.textContent=JSON.stringify(c.proposal,null,2);const dismiss=document.createElement('button');dismiss.textContent='검토 완료 · 제안 제거';dismiss.onclick=()=>run(async()=>{await store.dismissConflict(c.id);detail.remove();});detail.append(summary,pre,dismiss);out.append(detail);}});
  const close=()=>{if(!alive)return;alive=false;store?.close();store=null;page=null;connectionOptions=null;for(const url of urls)URL.revokeObjectURL(url);urls.clear();root.remove();onClose?.();};
  $('[data-close]').onclick=()=>{close();host.hideContainer?.();};
  return {close,root};
}
