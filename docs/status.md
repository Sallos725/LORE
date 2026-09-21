# 인수인계 — 0.1.0-alpha.4

## 현재 구현

PocketRisu 수정·재빌드가 필요 없는 Lite/Full 플러그인이다. Full은 기존 PocketRisu 로그인으로 자동 인증하며 별도 scope token 설정은 제거했다. 봇 카드의 각 저장 chat.id마다 별도의 위키·원문·이력·작업·주입 범위를 사용한다. Lite는 채팅 ID에서 자동 노트북 키를 만든다. 기본 주입은 모델 프리셋에도 적용되는 공통 beforeRequest이며, 기존 OpenAI 최종 body 검사를 선택할 수 있다. 이미지/tool 요청은 건너뛴다.

계층형 Markdown 위키·쉼표 별칭·링크·역링크·교정 충돌, 원문 revision·동기화 cursor·비동기 LLM·큐 복구가 있다. Full 모델/키는 private SQLite에 저장되어 서버 재시작 뒤 복구된다. 새 채팅은 같은 설치에서 마지막 지정한 추출 설정을 기본으로 사용한다. Lite 전체 백업/빈 노트북 복원은 원문·최근 이력·작업·충돌을 보존하며 설정 URL/모델/예산은 다음 UI 열기에 유지한다. Lite API 키는 메모리에만 있다.

## 실제 호스트에서 발견해 수정한 점

`getCurrentCharacterIndex()`는 안정 문자열 ID가 아니라 숫자 인덱스다. `/api/db/stats/characters`의 DB 배열 순서 메타데이터(최대 256 KiB)에서 안정 chaId를 구한다. 전체 DB·getCharacter·getChatFromIndex는 호출하지 않는다. Full은 이 메타데이터와 원문을 서버에서 읽는다. 원본 stats API는 서버에서 DB를 디코드하므로 큰 데이터에서 비용을 측정해야 한다.

기존 alpha.3의 큐 128개 선택 정체, 늦은 주입 완료 표시, 설정 복원 키 오류를 수정했다. 실제 호스트의 중복 HTTP 저장 요청은 requestId로 멱등 처리한다. 후속 질문에 이름이 없어도 현재 질문과 최근 두 대화로 관련 기억을 검색한다. 최초 예산 조회 권한은 자동 시작 단계에서 요청한다. 호스트의 경고 문구가 “전체 DB”여도 요청 데이터는 maxContext/maxResponse 두 스칼라뿐이다.

## 검증

Node 53개, Python 8개. Chromium/WebKit 양쪽 Lite/Full UI·백업/복원·자동 흐름. 독립 패키지 설치와 컨테이너 재시작. 실제 원본 호스트에서 Lite/Full 모두 설치/로그인/수집/추출/Gemini 요청 주입을 통과했다. 재실행은 python3 scripts/check-host.py이며 tests/host.mjs를 실행한다. 이미 초기화된 호스트에 시험 데이터를 쓰지 않도록 거부한다. 고정 공식 이미지 digest는 해당 시험/문서에 기록한다.

`npm run test:memory`는 명시적인 LORE_EVAL_URL/MODEL로만 실행하는 실제 LLM 합성 평가다. 기본 CI는 외부 유료 LLM을 호출하지 않는다. 2026-09-21 기존 Ollama/gpt-oss:120b-cloud에서 3개 시나리오를 검증한 기록은 docs/memory-evaluation.json이다.

## 배포 상태

2026-09-22(KST): [alpha.4](https://github.com/Sallos725/LORE/releases/tag/v0.1.0-alpha.4)를 발행했다. 태그 커밋은 `29f80b1a06d86cf913c16a268c6d630866905fc2`다. [CI](https://github.com/Sallos725/LORE/actions/runs/35616932756)와 [Release](https://github.com/Sallos725/LORE/actions/runs/35617271733) 모두 성공했다. 다운로드한 6개 파일이 SHA256SUMS 및 로컬 재현 빌드와 모두 일치한다. `latest`와 `v0.1.0-alpha.4`는 같은 amd64/arm64 index `sha256:615da22920c742bf3e92c109d612d3680c850a45a07844ca61c165f6704b7e31`다. 빈 Docker 인증 설정의 실제 latest pull도 성공했다. 기존 alpha.3 기록은 docs/releasing.md에 보존한다.

main 소스는 GitHub/Gitea 양쪽 SSH로 동기화했다. Gitea Actions 실패 조사는 사용자 지시에 따라 보류하며 alpha.4 배포 태그는 GitHub에만 보냈다. 태그 이후 커밋은 릴리스 설명 생성 문구와 실제 배포 기록 갱신이다. 기존 릴리스 첨부 파일과 태그는 교체하지 않았다.

## 남은 범위

실제 iPhone Safari 장시간·잠금·재접속·OOM, 대규모 장기 서사 품질, 실제 모든 공급자/프리셋 조합은 미검증이다. 정확한 tokenizer·이미지/tool 주입·호스트 저장 outbox·다중 탭 Lite 동시 쓰기는 현재 지원하지 않는다. 공개 준비도는 docs/public-readiness.md에 근거와 한계를 함께 기록한다.
