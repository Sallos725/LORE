# 인수인계 — 0.1.0-alpha.1 (2026-09-21)

## 구현됨

- LORE 독립 Git 저장소; origin=GitHub Sallos725/lore, gitea=M1NDB3ND3R/lore. 상위 서비스/Compose는 수정하지 않았다.
- 사용자 요청에 따라 Lite 범위를 추가했다. Lite는 기기 로컬 위키, Full은 브라우저 UI + 사이드카다.
- 문서별 저장, 인물/사건/장면 종류, 검색/편집/이력/Markdown 내보내기/byte 제한 컨텍스트 미리보기.
- Full 토큰별 scope/audience, SQLite 원문 revision 보존과 근거 조회, 원자적 이벤트 수락, 중복 방지, 수정·삭제 후 무효화, 영속 source-quote 작업 및 재시작 복구.
- GitHub/Gitea 별도 CI와 태그 릴리스, 공통 패키징/게시 스크립트, 체크섬, draft 업로드 후 공개, 두 아키텍처 컨테이너 구성.

## 검증됨

- Node 자동 테스트: HTTP 인증/범위/요청 제한, Lite 키별 저장/실패 시 기존 revision 유지/상한, Full 원문 수정·삭제·늦은 작업/분기·audience/수동 수정 충돌/작업 실패 원자성·최대 재시도/재시작 복구.
- Python 게시 스크립트 테스트: draft → 첨부 6개 → 공개, 실패 시 draft 유지, 공개 릴리스 불변, checksum/tag 불일치 시 네트워크 작업 전 거부. 실제 원격 API 호출이 아닌 모의 테스트다.
- 공식 Playwright 1.58.2 noble 컨테이너에서 Chromium/WebKit 각각 Lite/Full UI 통과. 호스트에서 Chromium은 통과했으나 WebKit은 시스템 라이브러리 부족으로 컨테이너를 사용했다.
- tar.gz/ZIP을 임시 디렉터리에 설치하여 실제 Node 서버 health, 쓰기, 조회 성공.
- 로컬 Linux amd64 컨테이너 빌드, UID 1000, 읽기 전용 root, 외부 네트워크/공개 포트 없이 실행, 전용 볼륨의 재시작 후 데이터 보존.
- GitHub workflow actionlint 검증. Gitea는 같은 스크립트와 별도 transport를 구성했으며 실제 runner 실행은 미검증이다. ARM64 이미지는 Actions 대상으로 설정했지만 로컬 실행은 미검증이다.

## 미구현 / 다음 순서

1. 수동 위키를 실제 PocketRisu/iPhone에서 설치 검증. 현재는 고정 upstream 소스 조사 + mock V3 host UI 검증이다.
2. 작은 확정 메시지 delta와 revision/삭제/분기/outbox를 제공하는 PocketRisu 서버 연결 설계. 전체 char/chat을 전달하는 출력 리스너는 사용하지 않는다.
3. scope를 호스트 세션에 연결한 인증 프록시 및 활성 쓰기 세션 검증. 현재는 별도 scoped bearer token 연결이다.
4. source-quote 엔진 위에 근거가 검증되는 LLM 인물·사건·현재 장면 변경 제안, 충돌 검토, 비밀/인물별 지식 정책, 호출 timeout/cancel 추가.
5. 전체 프롬프트 예산을 포함한 안전한 자동 컨텍스트 주입, 최근 미처리 대화 경계 및 실제 기억 품질 검증.
6. Lite 전체 노트북 백업/import/delete와 여러 탭 동시 쓰기, Full 이력/실패 작업 관리 UI 및 보존 정책.

원격 push/태그/Actions/registry 발행은 아직 하지 않았다. GitHub 원격 조회에는 기존 ref가 없었고, Gitea HTTPS Git 조회는 현재 자격 증명 없이 실패했다. Gitea 접근 권한 및 Actions secrets/runner 확인이 필요하다. 다음 작업은 현재 alpha를 자동 장기기억 완성판으로 설명하거나 미검증한 배포를 완료했다고 기록하면 안 된다.
