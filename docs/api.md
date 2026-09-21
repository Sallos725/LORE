# Full API v1 — alpha.3

`GET /health` 외에는 `Authorization: Bearer <scope-token>`이 필요하다. credentials가 installation/user/character/chat/branch 및 audience를 고정한다. 요청 JSON으로 scope/audience를 재정의할 수 없다. 자동 브라우저 수집은 `collect:true`, 서버가 임의 source revision 이벤트를 전달하는 통합은 `ingest:true`다.

| 경로 | 기능 |
|---|---|
| GET /identity | 고정 scope/audience, scopeRevision, extractionEnabled, collectionEnabled, configurationEnabled |
| GET /wiki?q=&offset=0&limit=20 | 제목·별칭·경로·본문 검색, 유효 metadata만, 최대 128개 |
| GET /browse?folder=&offset=0 | 해당 폴더의 하위 폴더·문서 20개; 무효 문서도 교정 검토용으로 표시 |
| GET /resolve?target= | 제목/경로/별칭/id:ID 조회; resolved/ambiguous/missing, 후보 최대 20개 |
| GET /wiki/:id | 본문, origin, evidence, aliases, path, active, contextMode |
| PATCH /wiki/:id | `{expectedRevision,page:{title,kind,body,aliases,path,visibility,pinned,contextMode}}` |
| GET /wiki/:id/links | 접근 가능한 outgoing 링크와 역링크 최대 100개 |
| GET /wiki/:id/history?offset=0 | 최신순 5개; 과거 내용을 PATCH하면 새 revision으로 교정 가능 |
| POST /context | `{query:"",budgetBytes:4096}`; 근거, 제외 사유, pendingJobs/fresh, requiredOverflow |
| POST /capture | collect 권한. `{selector:{characterId,index},sessionToken,boundaries:[messageId]}`로 기존 PocketRisu 저장 원문을 서버에서 조회·재조정. 원문 없는 identity/cursor/complete 반환 |
| GET/POST/DELETE /llm | configure 권한. scope/audience별 추출 공급자 설정·조회·해제. 응답에 키 없음 |
| GET /sync | collect 또는 ingest 권한, 수락된 cursor |
| POST /sync | 호스트 delta 수락, cursor 비교/중복 방지, 원문·작업·cursor 원자 기록 |
| POST /events | ingest 전용, source revision 기반 upsert/delete |
| GET /jobs | audience 범위의 최근 작업 최대 20개 |
| GET /jobs/:id | collect/ingest 권한, 최근 작업 상태 |
| POST /jobs/:id/cancel | queued/running 취소; 수락한 원문은 되돌리지 않음 |
| POST /jobs/:id/retry | failed/cancelled 재시도. 무효 원문 작업은 다시 검증 후 취소됨 |
| GET /conflicts | 최근 제안 최대 10개, audience 필터 적용 |
| DELETE /conflicts/:id | 접근 가능한 제안 제거; 문서 자체는 바꾸지 않음 |
| GET /sources/:messageId/:revision | 해당 revision 원문. 삭제 전 원문도 보존하므로 완전 삭제 API가 아님 |

## 문서와 컨텍스트

`kind`: person/event/scene/location/faction/item/concept/note. `path`: 최대 8단계 상대 `.md`, traversal 거부. aliases는 배열 또는 쉼표 문자열, 최대 32개이며 Unicode 정규화로 중복 제거한다. contextMode는 auto/always/never다. 수동 수정은 기존 title을 별칭에 보존하고 자동 작업이 덮어쓰지 않는다. 근거가 무효화된 수동 교정은 제외 상태를 유지한다. 무관한 새 메모는 새 ID로 만든다.

컨텍스트는 UTF-8 byte 예산이다. 필수 문서가 넘으면 빈 text와 requiredOverflow를 반환한다. 전체 프롬프트는 플러그인이 기존 설정 스칼라와 UTF-8 기반의 보수적 token 추정으로 검사한다. 정확한 tokenizer API는 없다. 원문은 그대로지만 아직 실패/취소한 작업은 pending/fresh 상태에 반영한다. source-quote는 읽기 전용 인용이며 LLM 요약과 다르다.

## 수집

POST /sync는 `shared/chat-delta.mjs`의 결과를 받는다. characterId/chatId/branchId, 이전 cursor, 새 cursor `{count,digest}`, reset, messages `[{id,text,role}]`, hasMore를 포함한다. cursor의 count는 식별자가 아닌 위치·hash 검증용이다. count는 한 번에 최대 32 위치, 텍스트 합계 60,000 UTF-8 bytes다. scope가 다른 요청은 거부한다. reset은 scope 내 모든 기존 원문에 접근 가능한 audience만 수행한다.

기존 prefix가 달라지면 근거 기반 문서를 무효화하고 원문을 처음부터 다시 수집한다. 각 안정된 메시지 ID의 revision을 증가시킨다. 이전 작업은 취소되며 늦은 결과는 적용되지 않는다. 새 분기는 별도 chat/branch scope로 시작하고 토큰 범위를 자동 변경하지 않는다.

## 서버 이벤트

```json
{
  "eventId":"unique-delivery-id",
  "baseRevision":0,
  "changes":[
    {"id":"stable-message-id","revision":1,"op":"upsert","visibility":"public","text":"확정된 원문"}
  ]
}
```

삭제는 같은 id에 더 큰 revision과 op:delete, visibility를 보낸다. 수정/재생성은 더 큰 revision의 upsert다. 같은 eventId와 같은 payload만 멱등 수락한다. 표시 이름이나 배열 인덱스를 ID로 사용하지 않는다. public 또는 credential audience만 읽고 쓸 수 있다.

요청 128 KiB, 원문/본문 16 KiB, 이벤트당 32개 변경, 대기 작업 1,000개, 동시 API 16개를 제한한다. 오류는 400/401/403/404/409/413/415/503. 409는 최신 cursor 또는 revision을 다시 조회하고 재조정한다.

모델을 설정하면 영속 LLM worker가 처리한다. 출력 최대 64 KiB, 제안 최대 8개, 근거 최대 32개/문서다. 기본 timeout 45초, 최대 120초와 3회 시도 후 실패 상태를 적용한다. 서버에 API 키나 원문 전체를 오류 로그로 출력하지 않는다. 모델이 없으면 작업은 queued에 남으며 자동 시작은 거부한다. configure 토큰으로 POST /llm에 `{provider,url,model,apiKey,jsonMode}`를 전달하거나 서버 환경 변수로 모델을 설정한다. UI 설정은 메모리에만 있으며 재시작 후 다시 입력한다.

PocketRisu 저장 트랜잭션 outbox 및 인증 프록시는 후속 연결이다. direct bearer API를 호스트 서버의 활성 세션 검증과 혼동하지 않는다.

POST /capture의 identityOnly:true는 ID만 조회한다. configure 권한은 같은 캐릭터의 다른 chat ID도 설치 설정용으로 발견할 수 있지만 원문·기억 접근이나 수집 scope 변경은 허용하지 않는다. allowDiscovery는 서버가 결정하며 클라이언트 값은 무시한다. 세션 JWT와 원문을 capture 응답에 반환하거나 SQLite 작업에 저장하지 않는다.
