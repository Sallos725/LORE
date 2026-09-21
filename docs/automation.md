# 자동 기억 설정 — alpha.3

PocketRisu 소스 수정·패치·재빌드는 필요 없다. Lite는 브라우저에서, Full은 HTTP(S)로 연결한 사이드카에서 별도 기억 추출 LLM을 호출한다. 대화 모델과 기억 모델은 서로 독립적이다.

## Lite

1. PocketRisu에 로그인하고 저장된 채팅을 연다. Lite JS를 플러그인으로 설치한다.
2. LORE Lite에서 노트북 ID를 정해 연다. 자동 시작 때 현재 캐릭터·채팅 ID에 연결되며 다른 채팅은 다른 노트북을 쓴다.
3. 공급자, API 주소, 모델 ID와 키를 설정한다. API 주소는 완전한 호출 주소이고 Gemini만 `https://generativelanguage.googleapis.com/v1beta` 형태의 기본 주소다. 공급자를 선택하면 기본 주소를 채운다. Ollama/custom은 주소를 수정할 수 있다.
4. JSON 응답 모드는 해당 모델이 지원할 때만 켠다. 자동 기억을 켜고 대화를 계속한다. 다음 요청부터 이전 확정 메시지를 수집한다. 처음에는 이전 기록도 수집하므로 작은 테스트 채팅으로 시작할 수 있다.

브라우저에 키를 영구 저장하지 않는다. UI를 닫아도 같은 탭의 추출은 계속되지만 탭 종료 후에는 다시 설정하고 시작한다. 원문·작업은 기기 로컬 키로 복구한다. 저장된 채팅 응답 최대 1 MiB·128개 메시지, 문서 128개, 원문/문서 16 KiB, 미완료 작업 4개, 충돌 32개, 문서 이력 5개다. 한도를 넘으면 원문을 잘라내지 않고 중지한다.

## Full

플러그인 ↔ 사이드카는 일반 HTTP(S) JSON API다. MARP·VEIL처럼 URL을 직접 지정한다. 로그인된 PocketRisu 세션의 짧은 JWT를 사이드카로 전달하고, 사이드카가 **설정된 PocketRisu origin 한 곳**에서 저장된 채팅을 읽는다. 임의 URL 프록시를 제공하지 않는다. JWT는 원문 DB나 작업에 저장하지 않는다. 자신이 운영하는 사이드카에 연결한다.

`.env` 예:

```dotenv
LORE_POCKETRISU_URL=http://pocketrisu:6001
LORE_LLM_PROVIDER=custom
LORE_LLM_URL=http://ollama:11434/v1/chat/completions
LORE_LLM_MODEL=your-installed-model
LORE_LLM_API_KEY=
LORE_LLM_TIMEOUT_MS=45000
LORE_LLM_JSON_MODE=false
```

PocketRisu origin과 LLM URL은 사이드카에서 접근할 주소다. localhost는 컨테이너 자신이다. 같은 Docker 네트워크에 연결하거나 내부망 주소를 사용한다. 기본 Compose는 내부 포트만 제공하며 `docker-compose.http.yml`을 함께 쓰면 지정한 인터페이스에 HTTP 포트를 연다. 기존 PocketRisu 앱·서비스는 교체하지 않는다.

범위 토큰 설정 순서:

1. 플러그인의 **현재 채팅 ID 확인**을 누르면 최소한 `characterId`와 현재 선택 index를 표시한다. index는 영속 ID가 아니다.
2. `.env.example`에서 무작위 token과 운영자가 정한 installationId/userId, 위 characterId를 설정한다. 최초 chatId/branchId는 자리표시자여도 서버를 시작할 수 있다. `collect:true, configure:true`를 설정한다.
3. Full URL·토큰을 입력하고 ID 확인을 다시 누른다. configure 권한은 같은 캐릭터의 실제 chat/branch ID를 조회할 수 있다. 원문이나 다른 범위의 기억을 반환하지 않는다.
4. 해당 chatId/branchId를 credentials에 넣고 LORE 사이드카를 다시 시작한다. 이후 자동 기억은 이 범위를 벗어나면 중지한다. PocketRisu 재빌드/재시작은 필요 없다.
5. Full에 연결하고 자동 기억을 켠다. **서버에 설정된 추출 모델 사용**을 끄면 플러그인에서 공급자·주소·모델·키를 전송한다. 이 설정은 해당 scope/audience에만 적용한다. configure 권한 없는 토큰은 서버 모델만 사용한다.

UI에서 전달한 LLM 키는 사이드카 메모리에만 보존한다. 탭 종료 뒤에도 수락한 작업을 처리하지만 사이드카 재시작 후 키를 다시 입력해야 한다. 환경 변수로 설정한 모델은 재시작 후에도 이용한다. 미설정 작업은 큐에 남고 임의 모델을 호출하지 않는다. 작업 데이터와 running 재시작 복구는 SQLite에 영속 저장한다. 최대 3회 시도 후 실패하며 UI에서 재시도·취소할 수 있다.

## 수집과 주입

- 기존 `beforeRequest`에서 user/assistant의 안정된 `memo`(원문의 message.chatId)를 가져온다. 이번 user 메시지를 제외한 최근 32개 anchor를 저장된 채팅과 순서대로 대조한다. 저장이 지연되거나 분기/삭제로 anchor가 없으면 주입을 생략한다. 준비된 프롬프트의 변환된 텍스트나 MARP 분석을 원문으로 저장하지 않는다.
- 원문 조회는 기존 `/api/test_auth`와 `/api/chat-content/:characterId/:index`를 사용한다. 실제 chat.id를 확인하며 배열 index를 영속 식별자로 쓰지 않는다. `getCharacter()`, 전체 DB, output listener의 전체 스냅샷을 요청하지 않는다. 마지막 확인된 anchor 뒤의 출력은 수집하지 않는다.
- Full은 저장 채팅 최대 16 MiB를 서버에서만 읽는다. 한 수집 요청에서 최대 8개 delta(각 32개 위치·60 KB)를 처리하고 미완료면 다음 요청에서 계속한다. Lite는 제한된 선택 채팅을 브라우저에서 읽는다. 기존 호스트 HTTP API 자체는 페이지 조회가 아니며, 재검증 비용은 채팅 길이에 비례한다.
- prefix hash가 달라지면 수정·삭제·재생성·되돌림으로 처리한다. 해당 범위의 근거 문서를 제외하고 처음부터 재수집한다. isComment/disabled와 마지막 allBefore marker 이전은 사실 입력에서 제외한다. 수동 교정은 자동으로 덮어쓰지 않고 충돌로 남긴다.
- LLM은 JSON 제안만 반환한다. 스키마·정확한 근거 인용·revision·audience를 검증한 뒤 원자적으로 적용한다. 모든 문장의 의미적 진실까지 자동 검증하지 않으므로 추출 문서는 검토 필요 상태다.
- 추출은 비동기다. 요청 시 관련 기억을 준비하고 **최종 JSON 문자열 body interceptor**에서만 주입한다. 기존 OpenAI 호환 `openai_basic`/`openai_streaming` 일반 텍스트 경로를 지원한다. 다른 공급자 형식, Responses API, model-preset/job 경로와 이미지/tool 요청은 아직 주입하지 않는다. 추출용 공급자 선택과 대화 주입 지원 범위는 별개다.
- 원문·scope를 최종 단계에서 재확인한다. 기억 UTF-8 byte 예산과 전체 프롬프트의 보수적 token 추정, maxContext/maxResponse 및 요청의 응답 예약량을 검사한다. `getDatabase(['maxContext','maxResponse'])`는 실제 구현에서 선택한 두 스칼라만 복사한다. 기존 API에 tokenizer가 없어 정확한 token count는 제공하지 않는다. 후속 플러그인의 변경은 별도 한계다.
- 기억 조회 단계당 2.5초 제한을 두고 실패 시 채팅을 계속한다. 호스트 HTTP 요청에는 별도 5초, 사이드카 요청에는 10초, LLM에는 기본 45초 timeout을 둔다. 아직 끝나지 않은 RPC를 무한히 중첩하지 않는다.

## 남은 한계

새 답변은 **다음 생성 요청**에서 수집한다. 탭이 닫힌 사이에 발생한 새 대화를 사이드카가 자동 발견하지 않는다. 호스트 저장 outbox·활성 writer lock의 원자적 검증·자동 분기 토큰 발급을 주장하지 않는다. 현재 로그인 세션 읽기 권한과 LORE의 범위 쓰기 권한을 별도로 검증한다. Safari OOM 개선·실제 기기 설치·유료 LLM 기억 품질은 아직 검증 결과가 없다.

공급자 프로토콜 근거: [Claude Messages](https://platform.claude.com/docs/en/api/overview), [Gemini Generate Content](https://ai.google.dev/api/generate-content), [OpenRouter](https://openrouter.ai/docs/quickstart), [Ollama OpenAI 호환](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx).
