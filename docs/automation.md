# 자동 기억 설정 — alpha.2

Lite는 별도 LORE 서버 없이 브라우저에서 저장·LLM 추출을 수행한다. Full은 수집한 원문을 사이드카로 보내고 서버에서 영속 작업을 처리한다. 두 판의 자동 기능에는 아래 **PocketRisu V3 확장**이 필요하다. 미설치 호스트에서는 수동 위키를 사용할 수 있고 자동 시작은 오류를 표시한다. 큰 `getCharacter()` 호출로 우회하지 않는다.

## 1. 호스트 확장 설치

대상은 PocketRisu `2026.2.291`, 커밋 `a14c911fd927a2bf63c8665bae202f29643920b4`다. `lore-pocketrisu-host-v0.1.0-alpha.2.zip`을 풀거나 LORE 소스 체크아웃에서 실행한다. Full ZIP과 서버 tar.gz에도 같은 설치 파일이 들어 있다.

```sh
python3 scripts/install-host.py /absolute/path/to/PocketRisu
python3 scripts/install-host.py /absolute/path/to/PocketRisu --apply
```

첫 명령은 대상 커밋·삽입 지점을 검사한다. `--apply`는 깨끗한 대상 저장소에 `lore-bounded-plugin-api` 브랜치를 만들고 V3 API 두 개와 helper를 추가한다. 다른 커밋이나 기존 수정이 있으면 중단한다. 이후 **PocketRisu 자체 빌드·설치 절차로 수정된 호스트를 배포**해야 한다. 이 스크립트는 실행 중인 서비스를 교체하지 않는다. 두 번째 적용은 중복 삽입하지 않는다.

- `getLoreChatDelta(cursor, mode)`: 열린 hydrated chat, writer lock의 active/free 상태를 확인한다. identity / delta / state 모드. 캐릭터 `chaId`, 채팅 `id`, 메시지 `chatId`를 사용한다. 한 채팅 ID를 하나의 분기 범위로 취급한다.
- `checkLoreBudget(messages, memory, memoryBudget, responseReserve)`: 현재 호스트의 `ChatTokenizer`로 계산하고 응답 예약량과 framing 여유 32 tokens를 더한다.

호스트 권한 요청은 PocketRisu의 기존 db/replacer 정책을 따른다. 연결 확인 후 플러그인의 **현재 채팅 ID 확인** 버튼으로 작은 ID 정보만 읽을 수 있다.

## 2. Lite

1. Lite JS를 설치하고 노트북 ID를 정해 연다. 자동 시작 시 현재 캐릭터·채팅·분기에 영구 연결된다. 다른 채팅에는 다른 노트북을 사용한다.
2. **자동 기억 설정**에서 OpenAI 호환 `chat/completions` 전체 URL, 모델, 필요한 API key를 입력한다. 예: `https://your-provider.example/v1/chat/completions`.
3. 기억 토큰 예산을 설정하고 **자동 기억 시작**을 누른다. 이전 대화도 첫 메시지부터 순서대로 처리하므로 원하는 테스트 채팅에서 먼저 확인한다. 일반 채팅 생성과 별도의 추출 호출이 발생한다.
4. 창을 닫아도 현재 플러그인 탭에서는 계속 수집한다. 탭/플러그인을 다시 열면 설정을 입력하고 다시 시작한다. 원문과 대기 작업은 기기 저장소에서 복구한다. 키는 저장하지 않는다.

노트북당 문서 128개, 원문 128개, 문서/원문 각각 16 KiB, 미완료 추출 작업 4개, 충돌 제안 32개다. 한도에서 멈추고 알린다. 오래된 원문을 조용히 버리지 않는다. 문서·원문·충돌은 각각 별도 키, 작은 index는 immutable revision을 가리킨다. 탭을 닫으면 LLM 호출과 실행 중 작업은 지속되지 않는다. 여러 탭 동시 쓰기는 지원하지 않는다. 중요한 내용은 Markdown으로 내보내고 긴 채팅에는 Full을 사용한다.

## 3. Full

`.env.example`의 실제 scope ID와 무작위 bearer token을 설정한다. `installationId`/`userId`는 운영자가 정한 안정된 값, character/chat/branch는 위 버튼이 반환한 값이다. 한 토큰은 이 범위를 변경할 수 없다. 자동 수집용 `collect:true`, 서버의 임의 revision 이벤트 연동용 `ingest:false`를 사용한다.

```dotenv
LORE_LLM_URL=https://your-provider.example/v1/chat/completions
LORE_LLM_MODEL=your-model
LORE_LLM_API_KEY=your-key
LORE_LLM_TIMEOUT_MS=45000
LORE_LLM_JSON_MODE=false
```

JSON mode를 지원하는 제공자에서만 `true`로 설정한다. URL은 서버가 접근할 수 있어야 한다. localhost는 컨테이너 자체다. Docker 외부 공개 포트는 기본 제공하지 않는다. 운영자의 TLS 프록시를 거쳐 접근하고 플러그인에 URL과 해당 scope token을 입력한다. **자동 기억 시작**은 서버의 모델 설정 및 열린 채팅의 scope 일치를 확인한다. 키는 사이드카 환경에만 있다.

서버는 수락한 원문과 작업을 SQLite에 원자적으로 기록한다. 이후 탭이 닫혀도 작업을 계속하고, 서비스 재시작 시 running 작업을 복구한다. 실패는 최대 3회 시도한다. 상태 화면은 최근 작업 20개와 충돌 제안 10개를 보여 준다. 설정을 고친 뒤 실패·취소 작업을 재시도하거나, 충돌 제안을 읽고 문서를 직접 교정한 뒤 제안을 제거할 수 있다. 실패/취소해 반영되지 않은 원문은 최신으로 표시하지 않는다.

## 데이터·주입 동작

- 스트리밍 중에는 수집하지 않는다. 호스트가 생성/후처리를 마친 뒤 열린 채팅 배열에서 확정한 user/char 메시지만 읽는다. isComment/disabled 메시지와 마지막 allBefore marker 이전은 제외한다. 채팅 배열 밖에서 동적으로 생성하는 첫 인사는 수집하지 않는다. `afterRequest` 및 전체 snapshot output listener를 사용하지 않는다. 디스크 저장과 원자적인 outbox 확정은 아니다.
- delta는 최대 32개 위치/60,000 UTF-8 bytes다. message ID가 없거나 한 원문이 너무 크면 잘라내지 않고 중지한다. hash는 호스트의 기존 배열을 순회하며 점진적으로 계산하고 iframe에는 작은 delta만 복사한다. 검증 비용은 채팅 길이에 비례하며 서버 전용 수집의 대체물은 아니다.
- 수정·삭제·재생성·되돌림은 이전 prefix hash 불일치로 감지한다. 해당 범위의 근거 기반 기억을 즉시 무효화하고 처음부터 제한된 페이지 단위로 재수집한다. 부분 변경만 재추출하는 최적화는 아직 없다. 수동 독립 문서는 유지한다. 근거를 가진 수동 교정은 원문이 바뀌면 제외 상태로 남고 자동으로 덮어쓰지 않는다.
- LLM은 JSON 변경 제안을 반환한다. 경로·타입·revision·공개 범위와 정확한 원문 인용을 검증한 후 한 트랜잭션으로 적용한다. private 입력은 같은 audience의 출력만 허용한다. 의미적으로 모든 문장이 참인지까지 검증하지는 않으므로 추출 문서는 **내용 검토 필요**로 표시한다.
- `[[제목]]`, `[[별칭]]`, `[[폴더/문서.md|표시 이름]]`, `[[id:안정된ID]]`를 지원한다. 제목 변경은 이전 이름을 별칭에 보존한다. 별칭 중복은 후보 선택을 요구한다. 코드 영역과 HTML은 실행하지 않는다. Markdown 미리보기는 제목·목록·인용·코드·위키 링크의 작은 부분집합이다.
- 주입은 main `model` 요청에만 한다. query는 마지막 user 메시지의 제한된 부분이다. 서버/Lite의 byte 예산과 호스트의 실제 tokenizer 기반 기억 토큰·전체 요청 예산을 각각 확인한다. 항상 포함 문서가 넘치면 주입 전체를 생략하고 사유를 표시한다.
- 지원 주입 형식은 **OpenAI 호환 일반 텍스트 요청**이다. 이미지·도구 호출·thoughts·다른 provider 형식에서는 기억을 생략한다. 최종 body interceptor에서 응답 예약량까지 다시 검사한다. 이후 실행되는 다른 플러그인의 변환이나 제공자 내부 token accounting까지 보증하지 않는다.
- scope/prefix가 바뀌거나 조회가 2.5초를 넘기거나 서버가 실패하면 일반 채팅은 계속된다. 상태 화면에서 지연·제외 사유를 확인한다. 오래된 메모리를 최신이라고 표시하지 않는다.

## 남아 있는 한계

PocketRisu 서버의 인증 프록시와 저장 트랜잭션 outbox는 미구현이다. 직접 LORE API의 bearer token 검증은 호스트 활성 세션의 서버 측 검증과 다르다. 브라우저가 보내기 전에 종료한 이벤트는 재접속 전까지 처리되지 않는다. 새 채팅/분기는 기존 범위를 자동 복제하거나 토큰을 자동 발급하지 않는다. 해시 재검증과 `beforeRequest`의 준비된 프롬프트 RPC도 브라우저 비용이 있으므로 실제 iPhone Safari OOM 개선은 별도 측정이 필요하다.
