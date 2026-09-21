# LORE

PocketRisu용 위키 기반 장기 기억 플러그인. **0.1.0-alpha.2**는 LLM 기억 추출, 제한된 채팅 수집과 기억 주입, 계층형 Markdown 위키를 제공한다.

| | Lite | Full |
|---|---|---|
| 구성 | 브라우저 플러그인 | 얇은 플러그인 + 서버 사이드카 |
| 저장 | 기기 로컬, 문서·원문별 키 | 서버 SQLite, 원문 revision·전체 이력 |
| LLM 추출 | 브라우저에서 설정한 OpenAI 호환 API | 사이드카에서 설정한 OpenAI 호환 API |
| 복구 | 다시 시작하면 저장된 작업 재개 | 서버 재시작 복구, 수락된 작업은 탭 종료 후에도 진행 |
| 한도 | 문서/원문 각각 128개, 문서 이력 최근 5개 | 문서·원문 16 KiB, 목록 페이지 단위 조회 |

자동 기능에는 **PocketRisu LORE V3 확장을 설치하고 호스트를 다시 빌드**해야 한다. 미설치 호스트에서도 수동 위키를 사용할 수 있다. 지원 조사 대상은 PocketRisu `2026.2.291` (`a14c911f`)이다. [자동 기억 설치 안내](docs/automation.md)에 적용 방법과 지원 요청 형식을 정리했다.

## 설치

[GitHub Releases](https://github.com/Sallos725/LORE/releases)의 버전별 첨부 파일을 사용한다. `v*` 태그가 package.json 버전과 일치하면 Actions가 플러그인·서버 패키지·amd64/arm64 컨테이너를 발행한다. Gitea는 소스를 함께 보관하며 Actions 오류 조사는 사용자 요청으로 보류했다.

### Lite

`lore-lite-v0.1.0-alpha.2.js`를 PocketRisu 플러그인에 가져온다. 개발 소스에서는 `lite/lore-lite.js`를 사용한다. **LORE Lite** 설정/채팅 버튼으로 노트북을 연다. 자동 기능은 `lore-pocketrisu-host-v0.1.0-alpha.2.zip`의 설치 안내를 따라 호스트를 준비한 뒤, 모델 URL·모델·API key를 입력하고 켠다.

Lite는 별도 LORE 서버가 필요 없다. 자동 시작 시 노트북을 현재 채팅에 연결한다. 기기 간 동기화·여러 탭 동시 쓰기·노트북 일괄 import/export는 지원하지 않는다. PocketRisu `.bin` 백업에 위키가 포함된다고 가정하지 말고 중요한 문서를 Markdown으로 내보낸다. API key는 저장하지 않는다.

### Full / Docker

`lore-full-v0.1.0-alpha.2.zip`을 풀고 `.env.example`을 `.env`로 복사한다. 토큰, 안정된 scope ID, LLM 설정을 채운다. 예제 토큰은 시작 검증을 통과하지 못하는 자리표시자다.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
docker compose --env-file .env up -d --build
```

발행된 이미지라면 `docker compose pull` 후 `docker compose up -d --no-build`를 사용한다. 기본 저장소는 `ghcr.io/sallos725/lore`, 기본 태그는 `v0.1.0-alpha.2`다. 비공개 레지스트리라면 pull 인증이 필요하다.

기본 Compose는 **호스트 포트를 공개하지 않는다**. 운영자가 같은 Docker 네트워크에서 TLS 프록시를 `lore:6011`로 연결한다. 기존 PocketRisu 스택을 자동 변경하지 않는다. 인증은 범위가 고정된 LORE bearer token이며 PocketRisu 인증 프록시는 아직 없다.

`lore-full-v0.1.0-alpha.2.js` 또는 ZIP의 `full/plugin/lore-full.js`를 설치한다. HTTPS URL과 `collect:true`인 scope token으로 연결한다. `ingest:true`는 서버 연결용이며 브라우저에 넣지 않는다. 자동 시작은 현재 채팅 ID와 토큰 scope가 일치하는지 확인한다. 토큰은 켜진 세션 메모리에서만 사용하며 영구 저장하지 않는다.

### Full / Node 서버

`lore-server-v0.1.0-alpha.2.tar.gz`는 실행 가능한 Node 소스 패키지다. **Node.js 22.23.0 이상**, 추가 npm 설치 없이 실행한다. Node 22의 내장 SQLite는 experimental 경고를 출력한다.

```sh
export LORE_CREDENTIALS_FILE=/absolute/path/credentials.json
export LORE_DATA_DIR=./data
sh ./run.sh
```

credentials는 `.env.example`의 JSON 배열 형식이다. 쉘 실행은 `.env`를 자동 로드하지 않으므로 LLM 환경 변수도 별도로 설정한다. 직접 실행 기본 주소는 `127.0.0.1:6011`, 컨테이너는 내부 `0.0.0.0:6011`이다.

## 위키와 자동 기억

- 경로: `인물/동료/캐릭터1.md`처럼 계층화한다. 별칭은 `캐릭터1, 애칭, 다른 이름`처럼 편집한다.
- 본문: `관련 인물: [[캐릭터1]] [[캐릭터2]]`. 경로·별칭·안정된 ID 링크, 역링크, 중복 이름 후보 선택을 지원한다. HTML은 실행하지 않고 제한된 Markdown을 표시한다.
- 교정: 제목·본문·경로·별칭·포함 정책을 편집한다. 수동 수정은 자동 갱신이 덮어쓰지 않는다. 원문이 바뀐 기억은 제외하고 수정 제안과 근거를 검토할 수 있다.
- 자동 기억: 확정 대화를 제한된 delta로 수집하고 근거를 검증한 LLM 제안을 적용한다. 작업 목록에서 실패/취소 재시도와 충돌 검토가 가능하다. 임의의 LLM 추론을 확정 사실로 검증했다고 주장하지 않는다.
- 주입: 관련 문서와 필수 문서를 byte 예산에 맞춰 고른 뒤, 호스트 tokenizer로 기억 토큰·전체 요청·응답 예약량을 검사한다. 일반 텍스트 OpenAI 호환 요청을 지원하며 초과·장애·범위 불일치는 상태를 표시하고 일반 채팅을 계속한다.

## 백업과 한계

Full은 서비스를 정지한 상태에서 SQLite WAL을 포함한 데이터 볼륨 전체를 백업한다. 같은 버전에서 정지한 볼륨을 통째로 복원하고 credentials는 별도 보관한다. 여러 사이드카가 같은 SQLite를 동시에 열지 않는다. Lite 문서 이력과 UI에서 조회하는 Full 이력은 최근 5개이며 Full API는 offset으로 과거 이력을 계속 조회할 수 있다.

브라우저가 보내기 전에 종료한 대화는 재접속 전까지 처리되지 않는다. 서버의 채팅 저장 outbox·인증 프록시, 자동 분기/토큰 발급, 실기기 Safari 검증은 후속 범위다. 초기 전체 채팅 가져오기도 호스트 브라우저 배열에서 제한된 페이지로 수행한다. Full 사이드카만으로 Safari OOM이 해결됐다고 보장하지 않는다.

## 개발

```sh
npm ci
npm run build
npm test
npx playwright install --with-deps chromium webkit
npm run test:browser
npm run package
python3 scripts/check-package.py
```

번들을 커밋하며 CI에서 재빌드 차이를 검사한다. 런타임 외부 npm 의존성은 없다. 합성 대화와 모의 LLM으로 검증하며 실제 대화의 유료 일괄 추출은 기본 테스트에 포함하지 않는다.

[자동 기억](docs/automation.md) · [호환성·RisuBard 조사](docs/compatibility.md) · [설계](docs/design.md) · [API](docs/api.md) · [배포](docs/releasing.md) · [현재 상태](docs/status.md) · [모바일 검증](docs/mobile-testing.md)

LORE의 독립 작성 코드는 MIT다. PocketRisu/RisuBard 코드를 복사하지 않았으며 별도 호스트 확장 설치 시 PocketRisu 자체 라이선스가 적용되는 프로젝트와 함께 빌드된다.
