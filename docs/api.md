# Full API

`GET /health` 외에는 기존 PocketRisu 로그인의 `Authorization: Bearer <PocketRisu JWT>`가 필요하다. 플러그인이 자동 발급·전달하며 별도 LORE scope token은 없다. 사이드카는 운영자가 지정한 `LORE_POCKETRISU_URL` 한 곳에서 로그인을 검증한다. PocketRisu의 단일 비밀번호 계정을 같은 설치 사용자로 취급하며 다중 사용자 인증을 주장하지 않는다.

먼저 `POST /connect`에 `{selector:{characterIndex:0,index:0}}`를 보내면 서버가 저장 캐릭터·채팅의 안정 ID를 확인하고 scope를 반환한다. 안정 characterId를 제공하는 호스트는 `{selector:{characterId,index}}`도 지원한다. 이후 URL-encoded `X-Lore-Character`, `X-Lore-Chat` 헤더를 사용한다. 해당 설치에서 확인된 범위만 접근할 수 있고 요청 JSON의 scope/audience 재정의는 거부한다. 다른 origin의 설치는 분리한다. 로그인 검증 캐시는 최대 5초·256개이고 원본 JWT를 저장하지 않는다.

| 경로 | 기능 |
|---|---|
| POST /connect | 현재 저장 채팅 확인·범위 반환 |
| GET /identity | 범위·scopeRevision·모델/수집 사용 가능 여부 |
| GET /wiki?q=&offset=0&limit=20 | 제목·별칭·경로·본문 검색, 본문 없는 목록 |
| GET /browse?folder=&offset=0 | 하위 폴더·문서 20개, 무효화 문서도 교정 검토용 표시 |
| GET /resolve?target= | 제목·경로·별칭·id:ID 해석, 모호한 후보 선택 |
| GET /wiki/:id | 본문·근거·별칭·path·active·contextMode |
| PATCH /wiki/:id | `{requestId,expectedRevision,page:{title,kind,body,aliases,path,visibility,pinned,contextMode}}` |
| GET /wiki/:id/links | 링크와 역링크 |
| GET /wiki/:id/history?offset=0 | 최신순 revision 5개 |
| POST /context | `{query,budgetBytes}` → text·근거·포함/제외·fresh·requiredOverflow |
| POST /capture | `{selector,boundaries:[messageId]}` → 서버에서 저장 원문 조회·재조정; identity/cursor/complete만 반환 |
| GET/POST/DELETE /llm | `{provider,url,model,apiKey,jsonMode}` 설정. 현재 채팅 설정과 새 채팅 기본값은 영속 저장; 응답에는 키 없음 |
| GET /sync | 수락한 cursor 조회 |
| GET /jobs | 최근 작업 상태 최대 20개 |
| GET /jobs/:id | 표시된 작업 상태 |
| POST /jobs/:id/cancel | 작업 취소, 원문은 유지 |
| POST /jobs/:id/retry | 실패·취소 작업 재시도, 근거 freshness 재검사 |
| GET /conflicts | 교정과 충돌한 변경 제안 |
| DELETE /conflicts/:id | 제안 검토 완료, 문서 변경 없음 |
| GET /sources/:messageId/:revision | 보존한 원문 revision |

브라우저는 `/capture`만으로 원문을 전달한다. `/events`, `POST /sync`는 독립 엔진 시험/명시적 서버 통합의 ingest 권한 전용이며 기본 PocketRisu 로그인에는 허용하지 않는다. 임의 대화 텍스트를 확정 원문처럼 전송할 수 없다.

경로는 최대 8단계의 상대 `.md`, 별칭은 최대 32개, 문서/원문은 각각 16 KiB다. 수동 저장은 논리적 요청마다 requestId를 생성한다. 같은 범위·요청 ID·본문의 재전송에는 최초 revision을 반환한다. 서버는 최근 512개의 저장 영수증을 원자적으로 보존하며, ID 재사용/다른 편집의 오래된 revision은 409다. 수동 편집은 revision을 비교하고 자동 갱신과 충돌하면 제안으로 보존한다. 근거가 무효화된 교정도 제외 상태를 유지한다. 채팅·분기별 원문, 작업, 문서, 이력과 검색은 독립적이다.

컨텍스트의 예산 단위는 UTF-8 bytes다. 필수 문서가 넘으면 빈 text와 requiredOverflow를 반환한다. 전체 모델 요청 예산은 플러그인에서 별도로 추정한다. 모델 미설정 작업은 대기하되 다른 채팅의 실행 가능한 작업을 막지 않는다.

요청 128 KiB, 동시 API 16개, 대기 작업 1,000개, LLM 응답 64 KiB, 변경 제안 8개·근거 32개/문서, 기본 추출 제한 45초·최대 120초·3회 시도다. 로그에 키나 전체 원문을 출력하지 않는다. Full 데이터 볼륨 백업에는 저장된 추출 API 키가 포함된다.
