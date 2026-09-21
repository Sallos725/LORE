# 호환성 조사 (2026-09-21)

## 확인한 소스

- PocketRisu [`a14c911fd927a2bf63c8665bae202f29643920b4`](https://github.com/PocketRisu/PocketRisu/tree/a14c911fd927a2bf63c8665bae202f29643920b4), `version.json`: `2026.2.291`, GPL-3.0.
- RisuBard [`92ad4e292355543817100058bbc547602f4bad75`](https://github.com/rpaddict/RisuBard/tree/92ad4e292355543817100058bbc547602f4bad75), package version `0.9.39`, GPL-3.0-only.
- MARP 로컬 `README.md`, V3 플러그인 및 양쪽 Actions: Lite JS / Full ZIP 구분 참고. 소스 코드를 복사하지 않았다. 특히 로컬 Gitea 워크플로는 과거 Python 패키지를 가리키므로 그대로 재사용하지 않는다.

## PocketRisu 연결 경계

`docs/en/plugin-storage.md`와 `src/ts/plugins/apiV3/{risuai.d.ts,v3.svelte.ts}`를 확인했다.

- V3 `pluginStorage.getItem`은 키별 비동기 조회. V2는 전체 사전 로드, V3 `getDatabase`의 전체 플러그인 데이터 옵션은 큰 복사를 유발한다.
- `getLocalPluginStorage()`는 기기 로컬 저장소를 제공한다. Lite 위키는 여기에 문서별 저장하고 전역 pluginStorage에는 넣지 않는다. 기기 간 자동 동기화는 없다.
- `beforeRequest`는 준비된 요청 메시지를 수정한다. `afterRequest`는 확정 저장 이벤트가 아니다.
- `addRisuChatListener('output')`은 출력 트리거·inlay 반영 뒤 호출되지만 **전체 char/chat 스냅샷**을 전달한다. 구독 자체가 큰 RPC 복사를 만들 수 있어 초기 LORE는 구독하지 않는다.
- `getCharacter()`는 hydrated snapshot, `getChatFromIndex()`는 전체 chat snapshot이다. 경량 메타데이터 API로 취급하지 않는다.
- `getCurrentCharacterIndex()`는 selectedCharID의 숫자 인덱스를 반환한다. 배열 인덱스를 영속 식별자로 사용하지 않는다.
- 호스트에 LORE 전용 인증 프록시, revision 기반 확정 delta/outbox 및 삭제/분기 전달 계약은 확인되지 않았다. 기존 NodeOnly 프로토타입을 근거로 존재한다고 주장하지 않는다.

alpha.3은 호스트 확장 의존성과 설치기를 제거했다. 기존 API만 사용한다.

- `getDatabase(includeOnly)`는 선택하지 않은 키를 snapshot 전에 제외한다. 예산용 maxContext/maxResponse만 읽는다.
- `getCurrentCharacterIndex()`는 실제 원본 호스트에서 숫자 인덱스를 반환한다. 기존 `/api/db/stats/characters`가 내보내는 DB 배열 순서의 메타데이터로 안정 chaId를 찾는다. archived 행은 뒤에 붙으며 해당 행은 선택 대상으로 거부한다. `getCurrentChatIndex()`도 임시 위치이며 실제 저장 chat.id로 위키를 구분한다. alpha.3의 문자열 반환 가정은 실제 설치 시험에서 발견해 수정했다.
- `server/node/server.cjs`의 `/api/test_auth`는 기존 HttpOnly 세션 쿠키를 확인하고 짧은 JWT를 반환한다. host nativeFetch의 같은 origin GET을 사용한다. `/api/chat-content/:chaId/:chatIndex`는 인증 후 no-compression RISUSAVE + no-records MessagePack 채팅을 반환한다.
- `src/ts/process/index.svelte.ts`가 원문 message.chatId를 OpenAIChat.memo에 연결한다. 요청의 이전 확정 anchor를 저장된 chat.id와 함께 검증한다.
- `globalApi.svelte.ts`의 body interceptor는 JSON 문자열을 받는다. 선택적 최종 검사 방식은 `openai_basic`/`openai_streaming`만 지원한다. 기본은 모델 프리셋에도 호출되는 공통 beforeRequest 주입이다. 원본 호스트의 Gemini 요청까지 전달되는 것을 확인한다.
- V3 factory는 Response body를 backpressure/cancel 가능한 스트림으로 전달한다. Lite는 1 MiB 제한 후 decode하고 Full은 사이드카에서만 원문을 읽는다. decoder는 공개 MessagePack 형식에 따라 독립 작성했으며 지원하지 않는 압축/extension은 거부한다.


## RisuBard 재사용 판단

`packages/risubard-core/`에는 자체 package.json이 없으며 context compiler, MemoryDelta reducer 및 narrative graph 계약이 들어 있다. UI 독립 핵심은 유용한 참고이나 위키 서비스·LLM 작업·호스트 저장 연결 전체를 독립 배포하는 패키지가 아니다. 이번에는 코드를 가져오지 않고 작은 독립 계약으로 시작한다. 재사용 전 해당 파일의 라이선스와 `docs/architecture/code-boundaries.md`를 다시 검토한다.

## 검증 수준

원본 서버 파일 SHA-256 `1d87bb68ba99ec67eed1892efb65ec4d38493f8994d199033459acaaa5098c1d`가 조사 커밋과 같은 공식 컨테이너에서 설치를 검증한다. 상세 실행 결과는 public-readiness.md를 확인한다. 이것은 iPhone 실기기 검증을 뜻하지 않는다. 서버 이벤트 연결에는 저장 트랜잭션과 함께 기록하는 outbox, 안정된 message ID/revision, 수정/삭제/분기 및 재접속 재조정이 필요하다.

## RisuBard 위키 재확인과 개선 (alpha.2)

같은 upstream 커밋에서 다음 구현을 다시 확인했다. 로컬 참조 체크아웃의 origin/main과 대상 SHA가 일치했다.

- [wikiLink.ts](https://github.com/rpaddict/RisuBard/blob/92ad4e292355543817100058bbc547602f4bad75/src/ts/risubard/wikiLink.ts): NFKC 이름 정규화, 별칭 조회, 모호한 링크 거부, 코드 영역을 제외하는 파싱.
- [wikiFileTree.ts](https://github.com/rpaddict/RisuBard/blob/92ad4e292355543817100058bbc547602f4bad75/src/ts/risubard/wikiFileTree.ts): 경로를 폴더로 묶는 탐색 구성.
- [risubard-markdown-wiki.ts](https://github.com/rpaddict/RisuBard/blob/92ad4e292355543817100058bbc547602f4bad75/server/node/risubard-markdown-wiki.ts): stable ID, relativePath, aliases, frontmatter, 변경 이력, context mode와 근거.
- [RisuBardWikiEditor.svelte](https://github.com/rpaddict/RisuBard/blob/92ad4e292355543817100058bbc547602f4bad75/src/lib/Others/RisuBardWikiEditor.svelte): 문서 편집과 쉼표로 구분하는 별칭 입력.

LORE는 코드를 가져오지 않고 같은 사용 의도를 독립 구현했다. 임의의 여러 단계 폴더를 20개씩 탐색하고, 링크가 겹치면 후보를 선택하며, audience를 넘는 링크/역링크 후보는 노출하지 않는다. 제목을 바꿔도 기존 별칭과 ID를 보존한다. 경로 탈출을 거부하고 HTML 실행 없는 미리보기를 사용한다. 문서의 근거 revision이 바뀌면 주입에서 즉시 제외하고, 수동 교정과 LLM 제안의 충돌을 별도로 남긴다.

alpha.3 검증은 원본 커밋의 API 소스 계약 확인, 합성 저장 응답/원문·분기/LLM 프로토콜/최종 문자열 요청 테스트, 모의 V3 호스트에서 Chromium/WebKit의 배포용 JS 동작이다. 실제 로그인 호스트의 전체 설치와 iPhone 장시간 검증, 의미적 기억 품질 평가는 별도다. 임시 체크아웃에 남아 있는 alpha.2 패치는 원본 API 증거로 사용하지 않는다.

alpha.4는 공식 원본 이미지 `ghcr.io/pocketrisu/pocketrisu@sha256:502116cc2007a924c189fad4df6ae13b25c01d0e26538a80d9e25de82b5b05d8`를 격리 실행해 Lite/Full 설치부터 실제 Gemini 요청까지 검사한다. `python3 scripts/check-host.py`는 새 컨테이너만 만들며 종료 시 제거한다. 합성 채팅은 원본 서버에 저장된 것을 확인한 뒤 다음 요청을 보낸다. HTTP 저장 재전송은 requestId로 중복 반영을 방지한다.
