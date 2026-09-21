# 초기 설계 결정

- Lite: 별도 LORE 서버가 없는 V3 플러그인. 기기 로컬 저장소, 문서별 키, 최대 128개 문서. 수동 위키만 지원하며 서버 작업 복구를 제공하지 않는다.
- Full: 같은 경량 UI + Node.js 22.23 이상 사이드카. 내장 `node:sqlite` 사용(22 계열에서는 experimental 경고가 있음). 외부 npm 런타임 의존성을 두지 않고 단일 프로세스로 운영한다.
- SQLite가 Full 정본이다. Markdown은 문서 내보내기 형식이며 편집 원본 DB와 이중 동기화하지 않는다.
- scope는 installation/user/character/chat/branch의 안정된 ID 조합이다. Full 토큰은 서버 구성의 한 scope에 고정한다. 클라이언트는 scope를 바꿀 수 없다.
- 초기 Full 연결은 명시적 URL + scope별 bearer token의 독립 연결이다. Docker는 포트를 공개하지 않는다. 별도 인증 TLS 프록시를 운영자가 준비해야 원격에서 접근 가능하다. PocketRisu 활성 세션 검증은 아직 연결하지 않았으며 이 배포를 호스트 통합이라고 부르지 않는다.
- 이벤트는 확정 원문 upsert/delete와 baseRevision을 받는다. scope revision을 원자적으로 올리고 무효 근거를 즉시 검색에서 제외한다. 작업 큐는 파생 quote 페이지를 만든다. quote는 요약이나 LLM 추론이 아니며 페이지의 origin으로 구분한다.
- 첫 엔진은 LLM을 호출하지 않는다. 원문과 사용자 메모의 검색, revision, 증거 및 복구를 먼저 검증한다. 인물별 지식은 public 또는 특정 audience로 필터링한다. 인물/사건/장면 페이지 종류를 지원한다.
- 수정된 원문, 늦은 작업, pinned/manual 페이지는 자동 처리로 덮어쓰지 않는다. 별도 분기는 빈 상태에서 시작하며 암묵적 복제를 하지 않는다.
- 컨텍스트는 UTF-8 byte 상한으로 보수적으로 제한한다. 정확한 모델 토큰 수나 전체 요청 예산 검증은 아니므로 API가 token budget이라고 부르지 않는다. 포함/제외 사유를 반환한다.
- 자동 prompt injection은 하지 않는다. 호스트의 범위 및 전체 프롬프트 예산을 확인할 수 있는 서버 연결이 먼저다.
- GitHub/Gitea는 같은 검증·패키징 스크립트를 실행한다. 버전 태그는 package.json과 일치해야 한다. 컨테이너는 버전 태그만 발행하며 latest는 사용하지 않는다. 배포란 release asset/registry 발행이며 운영 스택 자동 교체는 포함하지 않는다.
