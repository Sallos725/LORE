# Full API v1

`GET /health` 외의 모든 요청은 `Authorization: Bearer <scope-token>`이 필요하다. 토큰은 credentials의 installation/user/character/chat/branch와 audience에 고정되며 요청 JSON의 scope/audience 재정의는 거부한다. 두 사용자가 같은 scope를 공유하도록 잘못 구성하지 않는다.

| 경로 | 기능 |
|---|---|
| GET /identity | 고정된 scope/audience, scopeRevision |
| GET /wiki?q=&offset=0&limit=20 | 제목·본문 검색, metadata만 반환, 최대 128개 |
| GET /wiki/:id | 본문·origin·evidence |
| PATCH /wiki/:id | `{expectedRevision:0,page:{title,kind,body,visibility:"public",pinned:true}}` 생성/교정 |
| GET /wiki/:id/history?offset=0 | 최신 revision부터 20개. 이전 버전 내용을 PATCH하면 새 revision으로 복원 가능 |
| POST /context | `{query:"",budgetBytes:4096}`; 포함 evidence, 예산 제외 이유, freshness |
| POST /events | ingest credential 전용. 확정 원문 변경과 영속 작업 수락 |
| GET /jobs/:id | ingest credential 전용 작업 상태 |
| POST /jobs/:id/cancel | 아직 queued인 파생 작업 취소. 수락된 원문 변경은 되돌리지 않음 |
| GET /sources/:messageId/:revision | 해당 revision 원문. 삭제 전 원문도 보존하므로 개인정보 완전 삭제 API가 아님 |

최대 요청 128 KiB, 원문/본문 각각 16 KiB, 이벤트당 변경 32개, pending 작업 1,000개, 동시 API 처리 16개. 오류 400/401/403/404/409/413/415/503. 409는 최신 상태를 조회하고 새 이벤트 ID/revision으로 재조정한다. 같은 eventId의 동일 JSON 재전송만 멱등 수락한다.

```json
{
  "eventId":"unique-delivery-id",
  "baseRevision":0,
  "changes":[
    {"id":"stable-message-id","revision":1,"op":"upsert","visibility":"public","text":"확정된 원문"}
  ]
}
```

삭제는 동일 id에 더 큰 revision과 `op:"delete"`, visibility를 보낸다. 수정/재생성은 동일 id + 큰 revision의 upsert다. 새 분기는 별도 branchId scope로 시작하며 이력은 자동 복제하지 않는다. 표시 이름/배열 인덱스를 영속 ID로 넣지 않는다. 공개 여부를 추측하지 말고 호스트가 검증한 visibility를 전달한다. private visibility는 해당 audience와 같은 토큰으로만 읽거나 쓸 수 있다.

source-quote 페이지는 원문 검증용 읽기 전용이며 직접 PATCH하지 않는다. 수동 페이지는 별도 id로 저장하며 자동 갱신 대상이 아니다. 원문 revision은 SQLite source_versions에 남아 evidence endpoint로 조회한다. 원문 인용이 자동 인물·사건 추출과 동등하다고 해석하지 않는다.

LLM 호출이 없는 결정적 작업만 수행하므로 현재 실행 시간은 이벤트 크기로 제한한다. LLM 단계 추가 시 별도 timeout/cancellation 및 출력 스키마 검증이 필요하다. retry 실패 시 원자적 트랜잭션을 롤백하고 원문 내용 없는 오류만 보관한다.

후속 PocketRisu 서버 연결은 인증/활성 세션 검증 → 채팅 저장과 원자적 outbox 기록 → 확정 delta 전달 → idempotent replay 순서로 구현해야 한다. UI에 ingest token을 배포하거나 afterRequest를 확정 이벤트로 사용하지 않는다.
