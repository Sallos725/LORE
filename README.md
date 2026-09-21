# LORE

PocketRisu용 위키 기반 장기 기억 플러그인. **0.1.0-alpha.3은 PocketRisu 수정·재빌드 없이 설치한다.** 기억 추출 모델은 대화용 모델과 별도로 선택한다.

| | Lite | Full |
|---|---|---|
| 구성 | 브라우저 플러그인 하나 | 플러그인 + 독립 사이드카 |
| 통신 | 선택한 LLM에 직접 요청 | 플러그인 ↔ HTTP(S) ↔ 사이드카 ↔ 선택한 LLM |
| 원문 읽기 | 기존 PocketRisu HTTP API, 1 MiB·128개 이하 | 사이드카에서 기존 API 조회, 브라우저로 원문 복사 없음 |
| 저장 | 기기별 문서·원문 키, 문서/원문 각각 128개 | 서버 SQLite, 원문 revision·전체 이력·영속 작업 |
| 탭 종료 후 | 추출 중단, 다시 시작해 재개 | 이미 수락한 작업 계속 처리 |

공급자는 OpenAI, OpenRouter, Anthropic, Google Gemini, Ollama, 사용자 지정 OpenAI 호환 API를 지원한다. 두 판 모두 플러그인에서 **공급자·API 주소·모델 ID·키**를 설정한다. Full은 서버 환경 변수의 모델을 사용할 수도 있다.

## 설치

[GitHub Releases](https://github.com/Sallos725/LORE/releases)의 최신 버전 파일을 사용한다. Lite와 Full 중 하나를 설치한다. 두 판을 같은 채팅에서 동시에 활성화하지 않는다.

- **Lite:** `lore-lite-v0.1.0-alpha.3.js`를 PocketRisu 플러그인에 가져온다. LORE Lite → 노트북 열기 → 자동 기억 설정에서 공급자를 선택하고 자동 기억을 켠다. LORE 서버는 필요 없다.
- **Full:** 사이드카를 실행하고 `lore-full-v0.1.0-alpha.3.js`를 가져온다. LORE Full에서 사이드카 HTTP(S) 주소와 범위 토큰을 입력한다. 자동 기억 설정에서 서버 모델을 쓰거나 공급자·모델을 직접 지정한다.

자동 연결 조사 대상은 **수정하지 않은 PocketRisu 2026.2.291 (`a14c911f`)**의 V3 API와 Node HTTP API다. PocketRisu 로그인 세션이 필요하다. 소스 계약·합성 API·Chromium/WebKit 검증과 실제 iPhone 설치 검증은 구분한다. [설정 절차와 지원 범위](docs/automation.md)를 확인한다.

### Full 사이드카

`lore-full-v0.1.0-alpha.3.zip`을 풀고 `.env.example`을 `.env`로 복사한다. 무작위 LORE 토큰과 scope, 사이드카가 접근할 기존 PocketRisu 주소를 설정한다.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
docker compose --env-file .env pull
docker compose --env-file .env up -d --no-build
```

기본 Compose는 Docker 내부 `lore:6011`을 제공한다. 기존 프록시를 연결하거나, 제공한 HTTP 설정을 함께 사용한다.

```sh
docker compose -f docker-compose.yml -f docker-compose.http.yml --env-file .env up -d --no-build
```

컨테이너의 기본 태그는 `latest`다. 성공적으로 발행한 최신 릴리스를 따라가며 **현재는 알파 버전**이다. 고정하려면 `.env`에서 `LORE_VERSION=v0.1.0-alpha.3`을 사용한다. 기존 설치가 버전 태그로 고정되어 있다면 `LORE_VERSION=latest`로 바꾼 뒤 `docker compose pull`과 `docker compose up -d --no-build`를 실행한다. 이미지 pull만으로 실행 중인 컨테이너가 교체되지는 않는다.

```sh
docker pull ghcr.io/sallos725/lore:latest
```

HTTP 설정의 기본 연결 주소는 `http://127.0.0.1:6011`이다. 휴대폰에서는 `.env`의 `LORE_BIND_ADDRESS`를 서버의 내부망 주소로 지정하고 그 주소로 접속한다. `LORE_POCKETRISU_URL`은 사이드카에서 접근할 PocketRisu origin이다. 예: 동일 Docker 네트워크의 `http://pocketrisu:6001`. 기존 앱·Compose를 자동 수정하지 않는다. 외부 인터넷 연결에는 HTTPS를 사용한다. 비공개 GHCR 이미지는 pull 인증이 필요하다.

Node로 실행하려면 `lore-server-v0.1.0-alpha.3.tar.gz`를 푼다. Node.js 22.23.0 이상이면 추가 npm 설치 없이 실행한다.

```sh
export LORE_CREDENTIALS_FILE=/absolute/path/credentials.json
export LORE_POCKETRISU_URL=http://your-pocketrisu:6001
export LORE_DATA_DIR=./data
sh ./run.sh
```

`.env`는 Node 실행 시 자동으로 읽지 않는다. 모델·키를 유지하려면 환경 변수도 지정한다. UI에서 입력한 Lite 키는 브라우저 메모리에, Full 키는 사이드카 메모리에만 두며 재시작 후 다시 입력한다. Full의 수락된 작업·원문은 키와 별개로 영속 저장한다.

## 위키와 기억

문서는 `인물/동료/캐릭터1.md`처럼 계층화하고, 제목·경로·본문·쉼표 별칭을 편집한다. `관련 인물: [[캐릭터1]] [[캐릭터2]]`, 별칭·경로·ID 링크, 역링크와 이름 중복 후보 선택을 지원한다. 제목 변경은 이전 이름을 별칭에 보존한다. 수동 교정·고정은 자동 추출이 덮어쓰지 않고 충돌을 남긴다. HTML은 실행하지 않는다.

다음 대화 요청에 포함된 **이전 확정 메시지 ID**를 기준으로 저장된 원문을 수집한다. 이번 생성 중인 답변은 다음 요청에서 수집한다. LLM 추출은 별도 작업으로 실행하므로 일반 답변이 긴 추출을 기다리지 않는다. 수정·삭제·재생성·되돌림은 다음 수집에서 근거 기억을 무효화한다. 분기는 별도 범위이며 자동으로 합치지 않는다.

기억 주입은 최종 body interceptor를 통과하는 **기존 OpenAI 호환 일반 텍스트 요청**을 지원한다. Responses API, model-preset/job 우회 경로, 이미지·도구 요청은 현재 주입하지 않는다. 원문·범위·전체 요청과 응답 예약량을 재확인한다. 기존 API에 tokenizer가 없어 UTF-8 기반의 보수적 예산 추정을 사용하며 정확한 token count를 보장하지 않는다. 실패·초과 시 이유를 표시하고 일반 채팅을 계속한다.

## 백업과 제약

Full은 서비스를 멈춘 뒤 SQLite WAL을 포함한 데이터 볼륨 전체와 credentials를 별도 백업한다. 같은 버전의 정지한 볼륨으로 복원한다. Lite는 문서별 Markdown 내보내기와 최근 5개 이력을 제공한다. 전체 노트북 import/export·다중 탭 동시 쓰기·기기 간 동기화는 아직 없다.

전달 전에 탭을 닫은 대화는 다음 요청 전까지 처리되지 않는다. 저장 outbox·자동 분기 토큰 발급은 없다. 실제 iPhone Safari 메모리/OOM 개선과 유료 LLM의 장기 기억 품질은 별도 평가가 필요하다.

## 개발·배포

```sh
npm ci
npm run build
npm test
npx playwright install --with-deps chromium webkit
npm run test:browser
npm run package
python3 scripts/check-package.py
```

작은 변경마다 커밋한다. 두 원격의 main은 소스를 동기화하며 `v*` 태그와 package.json 버전이 일치하면 Actions가 JS·서버 패키지·amd64/arm64 컨테이너를 발행한다. 현재 Gitea 실패 조사는 보류하고 GitHub를 우선한다. 실제 배포 결과는 [Actions](https://github.com/Sallos725/LORE/actions)에서 확인한다.

[자동 기억](docs/automation.md) · [호환성·RisuBard 조사](docs/compatibility.md) · [설계](docs/design.md) · [API](docs/api.md) · [배포](docs/releasing.md) · [현재 상태](docs/status.md) · [모바일 검증](docs/mobile-testing.md)

LORE의 독립 작성 코드는 MIT다. PocketRisu/RisuBard 코드를 복사하지 않았다. 런타임 외부 npm 의존성은 없다.
