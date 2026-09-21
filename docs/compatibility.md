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

초기 플러그인은 수동 위키와 컨텍스트 미리보기/복사만 제공한다. 자동 주입·대화 수집·LLM 사실 추출은 후속 연결 작업이다. 이 경계는 잘못된 채팅이나 분기로 기억을 주입하는 것을 방지한다.

## RisuBard 재사용 판단

`packages/risubard-core/`에는 자체 package.json이 없으며 context compiler, MemoryDelta reducer 및 narrative graph 계약이 들어 있다. UI 독립 핵심은 유용한 참고이나 위키 서비스·LLM 작업·호스트 저장 연결 전체를 독립 배포하는 패키지가 아니다. 이번에는 코드를 가져오지 않고 작은 독립 계약으로 시작한다. 재사용 전 해당 파일의 라이선스와 `docs/architecture/code-boundaries.md`를 다시 검토한다.

## 검증 수준

소스 검토 및 합성 데이터 테스트 대상이다. 실제 PocketRisu 설치/모바일 Safari에서 동작 확인한 버전 목록을 뜻하지 않는다. 서버 이벤트 연결에는 저장 트랜잭션과 함께 기록하는 outbox, 안정된 message ID/revision, 수정/삭제/분기 및 재접속 재조정이 필요하다.
