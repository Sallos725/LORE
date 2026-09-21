export function openUI({edition,host,connect,onClose}) {
  let alive=true,store=null,page=null,offset=0,working=false;
  const root=document.createElement('section'); root.setAttribute('aria-label',`LORE ${edition}`);
  root.innerHTML=`<style>
  body{margin:0;background:#111922;color:#e4e9ed;font:16px/1.5 system-ui}*{box-sizing:border-box}
  .lore{max-width:900px;margin:auto;padding:24px 16px}header,.tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  header{justify-content:space-between}h1{letter-spacing:.08em}small{color:#b0c1d0}
  input,textarea,select,button{font:inherit;color:inherit;background:#1d2a37;border:1px solid #526778;border-radius:6px;padding:10px;min-height:44px}
  button{cursor:pointer}button:disabled{opacity:.5}input,textarea{width:100%}textarea{min-height:240px;resize:vertical}
  label{display:block;margin:12px 0}section[aria-label]{padding-bottom:30px}.tools{margin:16px 0}.list{display:grid;gap:8px}.list button{text-align:left}
  pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto}output{display:block;white-space:pre-wrap;margin:12px 0;color:#afdcca}
  :focus-visible{outline:2px solid #9ecde9;outline-offset:3px}
  </style><main class="lore"><header><h1>LORE ${edition}</h1><button data-close>닫기</button></header>
  <p>인물 · 사건 · 장면을 기록하는 수동 위키</p><small>자동 대화 수집·자동 기억 주입은 아직 연결되지 않았습니다.</small>
  <div data-connect></div><output role="status"></output><div data-work hidden>
  <label>위키 검색<input data-search maxlength="200" placeholder="${edition==='Lite'?'제목 검색':'제목 · 본문 검색'}"></label>
  <div class="tools"><button data-find>검색</button><button data-new>새 문서</button><button data-prev>이전</button><button data-next>다음</button><button data-context>컨텍스트 미리보기</button></div>
  <div class="list"></div><div data-editor hidden>
  <label>제목<input data-title maxlength="160"></label><label>종류<select data-kind><option value="person">인물</option><option value="event">사건</option><option value="scene">현재 장면</option></select></label>
  <label>본문<textarea data-body maxlength="16384"></textarea></label>
  <label>공개 범위<select data-visibility><option value="public">공개</option></select></label>
  <div class="tools"><button data-save>저장</button><button data-history>변경 이력</button><button data-export>Markdown 내보내기</button></div></div>
  <label>컨텍스트 한도 (UTF-8 bytes)<input data-budget type="number" value="4096" min="0" max="16384"></label>
  <pre data-preview></pre><small>미리보기 텍스트는 직접 복사할 수 있습니다. 전체 프롬프트 토큰 예산은 별도로 확인해야 합니다.</small></div></main>`;
  document.body.append(root);
  const $=selector=>root.querySelector(selector),status=$('output'),workspace=$('[data-work]');
  const say=value=>{if(alive)status.textContent=value;};
  const action=(selector,fn)=>{$(selector).onclick=async()=>{if(working)return;working=true;try{await fn();}catch(e){say(e.message);}finally{working=false;}};};
  async function list(){const result=await store.list({query:$('[data-search]').value,offset,limit:20});if(!alive)return;
    $('.list').replaceChildren();for(const row of result.pages){const button=document.createElement('button');button.textContent=`${row.title} · ${row.kind} · r${row.revision}`;button.onclick=async()=>{if(working)return;working=true;try{const value=await store.page(row.id);if(alive)edit(value);}catch(e){say(e.message);}finally{working=false;}};$('.list').append(button);}
    $('[data-prev]').disabled=offset===0;$('[data-next]').disabled=!result.hasMore;
    say(`${offset+1}부터 ${result.pages.length}개 문서. ${edition==='Lite'?'기기 로컬 저장 · 최대 128개':'서버 저장'}`);
  }
  function edit(value){page=value;$('[data-editor]').hidden=false;$('[data-title]').value=value.title;$('[data-kind]').value=value.kind;$('[data-body]').value=value.body;$('[data-visibility]').value=value.visibility;
    const readonly=value.origin==='source-quote';for(const key of ['title','kind','body','visibility','save'])$(`[data-${key}]`).disabled=readonly;
    $('[data-history]').disabled=!value.revision;say(readonly?'원문 인용은 읽기 전용입니다. 교정은 별도의 수동 문서로 기록하세요.':`수동 문서 · r${value.revision}`);
  }
  action('[data-find]',async()=>{offset=0;await list();});action('[data-prev]',async()=>{offset=Math.max(0,offset-20);await list();});action('[data-next]',async()=>{offset+=20;await list();});
  action('[data-new]',()=>edit({id:crypto.randomUUID(),title:'',kind:'event',body:'',visibility:'public',revision:0,origin:'manual'}));
  action('[data-save]',async()=>{const saved=await store.put(page.id,{title:$('[data-title]').value,kind:$('[data-kind]').value,body:$('[data-body]').value,visibility:$('[data-visibility]').value,pinned:true},page.revision);if(!alive)return;edit(saved);await list();say('저장했습니다.');});
  action('[data-history]',async()=>{const history=await store.history(page.id);if(alive)$('[data-preview]').textContent=history.map(p=>`r${p.revision} · ${p.origin}\n${p.title}\n${p.body}`).join('\n\n');});
  action('[data-context]',async()=>{const result=await store.context({query:$('[data-search]').value,budgetBytes:Number($('[data-budget]').value)});if(!alive)return;$('[data-preview]').textContent=result.text;say(`${result.usedBytes}/${result.budgetBytes} bytes · 포함 ${result.included.length} · 예산 제외 ${result.excluded.length}${result.fresh?'':' · 미완료/실패 작업 있음'}${result.candidateLimitReached?' · 후보 128개까지만 평가':''}`);});
  const urls=new Set();
  action('[data-export]',()=>{if(!page)return;const url=URL.createObjectURL(new Blob([`# ${page.title}\n\n${page.body}\n`],{type:'text/markdown;charset=utf-8'}));urls.add(url);const a=document.createElement('a');a.href=url;a.download=`lore-${page.id.replace(/[^a-zA-Z0-9_-]/g,'_')}.md`;root.append(a);a.click();a.remove();URL.revokeObjectURL(url);urls.delete(url);});
  const connection=$('[data-connect]');
  if(edition==='Full')connection.innerHTML='<label>Full 서버 URL<input data-url type="url" placeholder="https://lore.example.com"></label><label>위키 scope token<input data-token type="password" autocomplete="off"></label><button data-start>연결</button><small>토큰은 현재 UI에서만 사용하며 저장하지 않습니다.</small>';
  else connection.innerHTML='<label>노트북 ID<input data-notebook value="default" maxlength="160"></label><button data-start>노트북 열기</button><small>캐릭터·채팅·분기별로 다른 ID를 사용하세요. 자동 연결되지 않습니다.</small>';
  action('[data-start]',async()=>{store?.close();workspace.hidden=true;page=null;offset=0;$('[data-editor]').hidden=true;$('[data-preview]').textContent='';store=await connect(edition==='Full'?{url:$('[data-url]').value,token:$('[data-token]').value}:{notebook:$('[data-notebook]').value});const identity=await store.identity();if(!alive){store.close();return;}workspace.hidden=false;const visibility=$('[data-visibility]');visibility.replaceChildren();for(const value of new Set(['public',identity.audience])){const option=document.createElement('option');option.value=value;option.textContent=value;visibility.append(option);}await list();say('열린 범위: '+JSON.stringify(identity.scope));});
  const close=()=>{if(!alive)return;alive=false;store?.close();store=null;page=null;for(const url of urls)URL.revokeObjectURL(url);urls.clear();root.remove();onClose?.();};
  $('[data-close]').onclick=()=>{close();host.hideContainer?.();};
  return {close,root};
}
