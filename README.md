# LORE

PocketRisu용 위키 기억 플러그인. 현재 **0.1.0-alpha.1**은 수동 위키와 서버 기억 저장 기반을 제공한다.

| | Lite | Full |
|---|---|---|
| 설치 | 플러그인 JS 하나 | 플러그인 JS + 사이드카 |
| 위키 저장 | 기기 로컬, 문서별 키 | 서버 SQLite |
| 상한 | 노트북당 128개, 문서 16 KiB, 이력 최근 5개 | 문서 16 KiB, 목록 20개씩 |
| 제공 | 인물·사건·장면 문서, 제목 검색, 수정, 이력, Markdown 내보내기, 컨텍스트 미리보기 | Lite 기능 + 본문 검색, scope/audience 접근 제어, 영속 이벤트 큐 |
| 대화 연결 | 수동 노트북 선택 | 토큰에 고정된 범위 |

**아직 자동 장기기억 플러그인은 아니다.** LLM 사실 추출, 자동 대화 수집·주입, 호스트 인증 프록시·활성 세션·outbox 연결은 미구현이다. Full의 이벤트 엔진은 전달받은 확정 원문을 인용 페이지로 만들며 요약·추론과 구분한다. 탭 종료 전 이벤트 전달 및 iPhone Safari OOM 해결을 보장하지 않는다.

## 설치

[GitHub Releases](https://github.com/Sallos725/lore/releases) / [Gitea Releases](https://gitea.grantos.m1ndb3nd3r.com/M1NDB3ND3R/lore/releases)에 버전 태그 Actions가 산출물을 발행한다. 워크플로 구성과 실제 발행 여부는 별개이며 첫 태그 전에는 다운로드가 없다.

### Lite

`lore-lite-v<VERSION>.js`를 PocketRisu 플러그인에 가져온다. 개발 소스에서는 `lite/lore-lite.js`를 사용한다. 플러그인 설정 또는 채팅 메뉴의 **LORE Lite**를 연다. 캐릭터·채팅·분기마다 별도 노트북 ID를 입력한다. 위키 문서는 사용자가 직접 기록한다.

위키는 기기 로컬이다. PocketRisu `.bin` 백업이나 다른 기기로 자동 이동하지 않으므로 중요한 문서는 Markdown으로 내보낸다. 전체 노트북 import/export는 아직 없다. 플러그인 전체 데이터 제공 옵션은 필요 없다.

### Full / Docker

`lore-full-v<VERSION>.zip`을 풀고 `.env.example`을 `.env`로 복사한다. 무작위 토큰과 실제 안정된 scope ID를 설정한다. 예제 토큰은 일부러 시작 검증을 통과하지 못한다.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
docker compose --env-file .env up -d --build
```

발행된 이미지 사용 시 `docker compose pull` 후 `docker compose up -d --no-build`를 실행한다. 기본 이미지 저장소는 `ghcr.io/sallos725/lore`, Gitea는 `LORE_IMAGE=gitea.grantos.m1ndb3nd3r.com/m1ndb3nd3r/lore`로 선택한다. `LORE_VERSION`은 `v0.1.0-alpha.1`처럼 태그와 일치시킨다.

기본 Compose는 **호스트 포트를 공개하지 않는다**. 운영자가 같은 Docker 네트워크의 TLS 프록시를 `lore:6011`에 연결해야 한다. 기존 PocketRisu 스택은 자동 변경하지 않는다. 인증은 LORE bearer token이며 PocketRisu 활성 세션 정책은 아직 적용되지 않는다. 인터넷 노출을 기본값으로 만들지 않는다.

`lore-full-v<VERSION>.js`(ZIP에서는 `full/plugin/lore-full.js`)를 설치한다. **LORE Full**에서 HTTPS URL과 위키 scope token으로 연결한다. 토큰은 현재 UI에서만 사용하며 영구 저장하지 않는다. `ingest:true` 서버 연동용 토큰을 플러그인에 입력하지 않는다.

### Full / 서버 패키지

`lore-server-v<VERSION>.tar.gz`는 실행 가능한 Node 소스 패키지이며 네이티브 단일 바이너리가 아니다. **Node.js 22.23.0 이상**이 필요하다. 추가 npm 설치는 필요 없다. 22 계열의 내장 SQLite는 experimental 경고를 출력한다.

```sh
export LORE_CREDENTIALS_FILE=/absolute/path/credentials.json
export LORE_DATA_DIR=./data
sh ./run.sh
```

credentials 파일은 `.env.example`의 JSON 배열 형식이다. 쉘 실행은 `.env`를 자동 로드하지 않는다. 직접 실행 기본 주소는 `127.0.0.1:6011`, 컨테이너는 내부 `0.0.0.0:6011`이다.

## 사용 및 복구

- 새 문서 → 인물/사건/장면 선택 → 저장. 수정은 expected revision을 검증하므로 충돌 시 다시 조회한 뒤 내용을 합친다.
- 본문은 실행하지 않는 일반 텍스트로 표시한다. Markdown/HTML 렌더링은 하지 않는다.
- 컨텍스트 미리보기는 UTF-8 byte 상한을 적용하고 포함·제외 수를 표시한다. **모델 토큰 수나 전체 프롬프트 예산 검증이 아니다.** 채팅에 자동 주입하지 않는다.
- Full 백업은 서비스를 정지한 뒤 데이터 볼륨 전체를 복사한다. SQLite WAL 파일을 제외한 실행 중 DB 단독 복사는 사용하지 않는다. 복원은 같은 버전에서 정지 상태의 볼륨 전체를 교체한 뒤 수행한다. credentials는 별도 안전하게 보관한다.
- Full 작업은 재시작 시 running → queued로 복구하고 최대 3회 시도한다. 수정/삭제 원문은 즉시 검색에서 제외된다. 실패·취소 작업이 있으면 컨텍스트 freshness가 보수적으로 false로 남는다. 자동 정리/재시도 관리 UI는 후속 범위다.
- Lite는 단일 플러그인 UI에서 저장을 직렬화한다. 여러 탭의 동시 쓰기, 노트북 전체 백업·복구는 지원하지 않는다. Full 단일 사이드카 프로세스만 같은 DB를 열어야 한다.

## 개발

```sh
npm ci
npm run build
npm test
npx playwright install --with-deps chromium webkit
npm run test:browser
npm run package
```

플러그인 번들은 커밋하며 CI에서 재빌드 결과의 차이를 검사한다. 빌드는 작은 named import 모듈을 묶는 전용 스크립트이며 범용 JS bundler가 아니다. 런타임 외부 npm 의존성은 없다.

[호환성 조사](docs/compatibility.md) · [설계 결정](docs/design.md) · [API](docs/api.md) · [배포](docs/releasing.md) · [모바일 검증](docs/mobile-testing.md)

검토 기준은 PocketRisu `a14c911f` (`2026.2.291`)이다. 실제 설치·iPhone 검증 완료를 뜻하지 않는다. LORE의 독립 작성 코드는 MIT이며 PocketRisu/RisuBard 코드를 포함하지 않는다.
