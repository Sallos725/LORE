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
- `getCurrentCharacterIndex()` 구현은 selectedCharID를 반환하므로 타입 정의의 number와 동일하다고 가정하지 않는다. 배열 인덱스를 영속 식별자로 사용하지 않는다.
- 호스트에 LORE 전용 인증 프록시, revision 기반 확정 delta/outbox 및 삭제/분기 전달 계약은 확인되지 않았다. 기존 NodeOnly 프로토타입을 근거로 존재한다고 주장하지 않는다.

alpha.2에는 원본 호스트에 없던 `getLoreChatDelta`/`checkLoreBudget`을 추가하는 독립 작성 설치 스크립트를 제공한다. 자동 주입·수집은 이 확장과 일치하는 scope를 요구한다. `Chat.svelte`의 채팅 분기는 새 `chat.id`를 부여한다. 안정된 ID 없이 큰 snapshot으로 우회하지 않는다. [설치 및 제한](automation.md)을 참고한다.

## RisuBard 재사용 판단

`packages/risubard-core/`에는 자체 package.json이 없으며 context compiler, MemoryDelta reducer 및 narrative graph 계약이 들어 있다. UI 독립 핵심은 유용한 참고이나 위키 서비스·LLM 작업·호스트 저장 연결 전체를 독립 배포하는 패키지가 아니다. 이번에는 코드를 가져오지 않고 작은 독립 계약으로 시작한다. 재사용 전 해당 파일의 라이선스와 `docs/architecture/code-boundaries.md`를 다시 검토한다.

## 검증 수준

소스 검토 및 합성 데이터 테스트 대상이다. 실제 PocketRisu 설치/모바일 Safari에서 동작 확인한 버전 목록을 뜻하지 않는다. 서버 이벤트 연결에는 저장 트랜잭션과 함께 기록하는 outbox, 안정된 message ID/revision, 수정/삭제/분기 및 재접속 재조정이 필요하다.

## RisuBard 위키 재확인과 개선 (alpha.2)

같은 upstream 커밋에서 다음 구현을 다시 확인했다. 로컬 참조 체크아웃의 origin/main과 대상 SHA가 일치했다.

- [wikiLink.ts](https://github.com/rpaddict/RisuBard/blob/92ad4e292355543817100058bbc547602f4bad75/src/ts/risubard/wikiLink.ts): NFKC 이름 정규화, 별칭 조회, 모호한 링크 거부, 코드 영역을 제외하는 파싱.
- [wikiFileTree.ts](https://github.com/rpaddict/RisuBard/blob/92ad4e292355543817100058bbc547602f4bad75/src/ts/risubard/wikiFileTree.ts): 경로를 폴더로 묶는 탐색 구성.
- [risubard-markdown-wiki.ts](https://github.com/rpaddict/RisuBard/blob/92ad4e292355543817100058bbc547602f4bad75/server/node/risubard-markdown-wiki.ts): stable ID, relativePath, aliases, frontmatter, 변경 이력, context mode와 근거.
- [RisuBardWikiEditor.svelte](https://github.com/rpaddict/RisuBard/blob/92ad4e292355543817100058bbc547602f4bad75/src/lib/Others/RisuBardWikiEditor.svelte): 문서 편집과 쉼표로 구분하는 별칭 입력.

LORE는 코드를 가져오지 않고 같은 사용 의도를 독립 구현했다. 임의의 여러 단계 폴더를 20개씩 탐색하고, 링크가 겹치면 후보를 선택하며, audience를 넘는 링크/역링크 후보는 노출하지 않는다. 제목을 바꿔도 기존 별칭과 ID를 보존한다. 경로 탈출을 거부하고 HTML 실행 없는 미리보기를 사용한다. 문서의 근거 revision이 바뀌면 주입에서 즉시 제외하고, 수동 교정과 LLM 제안의 충돌을 별도로 남긴다.

검증된 것은 설치 스크립트의 고정 커밋 적용과 수정된 V3 TypeScript 구문, delta helper·독립 엔진 자동 테스트 및 모의 V3 호스트에서의 Chromium/WebKit 동작이다. 실제 PocketRisu 전체 프로덕션 빌드/로그인 세션/iPhone에서의 종합 설치 검증과 의미적 기억 품질 평가는 아직 별도다.
