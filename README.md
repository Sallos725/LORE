# LORE

PocketRisu용 위키 기반 장기 기억 플러그인. **0.1.0-alpha.4는 PocketRisu 수정·재빌드 없이 설치한다.** 기억 추출 모델은 대화용 모델과 별도로 선택한다.

| | Lite | Full |
|---|---|---|
| 구성 | 브라우저 플러그인 하나 | 플러그인 + 독립 사이드카 |
| 통신 | 선택한 LLM에 직접 요청 | 플러그인 ↔ HTTP(S) ↔ 사이드카 ↔ 선택한 LLM |
| 원문 읽기 | 기존 PocketRisu HTTP API, 1 MiB·128개 이하 | 사이드카에서 기존 API 조회, 브라우저로 원문 복사 없음 |
| 저장 | 기기별 문서·원문 키, 문서/원문 각각 128개 | 서버 SQLite, 원문 revision·전체 이력·영속 작업 |
| 탭 종료 후 | 추출 중단, 다시 시작해 재개 | 이미 수락한 작업 계속 처리 |

**공개 상태: 테스트 배포.** 실제 원본 PocketRisu에서 Lite/Full 설치·추출·주입을 검증했고, 확인된 인증·작업 정체·주입 상태 결함을 수정했다. iPhone 실기기에서 장시간 OOM이 개선됐다는 보장은 아직 하지 않는다. [검증 결과와 공개 준비도](docs/public-readiness.md)를 확인한다.

공급자는 OpenAI, OpenRouter, Anthropic, Google Gemini, Ollama, 사용자 지정 OpenAI 호환 API를 지원한다. 두 판 모두 플러그인에서 **공급자·API 주소·모델 ID·키**를 설정한다. Full은 서버 환경 변수의 모델을 사용할 수도 있다.

## 설치

[GitHub Releases](https://github.com/Sallos725/LORE/releases)의 최신 버전 파일을 사용한다. Lite와 Full 중 하나를 설치한다. 두 판을 같은 채팅에서 동시에 활성화하지 않는다.

- **Lite:** `lore-lite-v0.1.0-alpha.4.js`를 PocketRisu 플러그인에 가져온다. 채팅 메뉴 → LORE Lite → 현재 채팅 위키 열기 → 자동 기억 설정에서 공급자를 선택하고 자동 기억을 켠다. LORE 서버는 필요 없다.
- **Full:** 사이드카를 실행하고 `lore-full-v0.1.0-alpha.4.js`를 가져온다. 채팅 메뉴 → LORE Full에서 사이드카 HTTP(S) 주소만 입력한다. PocketRisu 로그인으로 자동 인증하며 별도 scope token은 없다. 자동 기억 설정에서 서버 모델을 쓰거나 공급자·모델을 직접 지정한다.

자동 연결 조사 대상은 **수정하지 않은 PocketRisu 2026.2.291 (`a14c911f`)**의 V3 API와 Node HTTP API다. PocketRisu 로그인 세션이 필요하다. 원본 호스트에서 숫자 캐릭터 인덱스·안정 ID 매핑과 저장 채팅을 확인한다. 자동 브라우저 검증과 실제 iPhone 검증은 구분한다. [설정 절차와 지원 범위](docs/automation.md)를 확인한다.

### Full 사이드카

`lore-full-v0.1.0-alpha.4.zip`을 풀고 `.env.example`을 `.env`로 복사한다. 사이드카가 접근할 기존 PocketRisu 주소 `LORE_POCKETRISU_URL`을 설정한다. ID나 토큰을 만들 필요는 없다.

```sh
docker compose --env-file .env pull
docker compose --env-file .env up -d --no-build
```

기본 Compose는 Docker 내부 `lore:6011`을 제공한다. 기존 프록시를 연결하거나, 제공한 HTTP 설정을 함께 사용한다.

```sh
docker compose -f docker-compose.yml -f docker-compose.http.yml --env-file .env up -d --no-build
```

컨테이너의 기본 태그는 `latest`다. 성공적으로 발행한 최신 릴리스를 따라가며 **현재는 알파 버전**이다. 고정하려면 `.env`에서 `LORE_VERSION=v0.1.0-alpha.4`을 사용한다. 기존 설치가 버전 태그로 고정되어 있다면 `LORE_VERSION=latest`로 바꾼 뒤 `docker compose pull`과 `docker compose up -d --no-build`를 실행한다. 이미지 pull만으로 실행 중인 컨테이너가 교체되지는 않는다.

```sh
docker pull ghcr.io/sallos725/lore:latest
```

HTTP 설정의 기본 연결 주소는 `http://127.0.0.1:6011`이다. 휴대폰에서는 `.env`의 `LORE_BIND_ADDRESS`를 서버의 내부망 주소로 지정하고 그 주소로 접속한다. `LORE_POCKETRISU_URL`은 사이드카에서 접근할 PocketRisu origin이다. 예: 동일 Docker 네트워크의 `http://pocketrisu:6001`. 기존 앱·Compose를 자동 수정하지 않는다. 외부 인터넷 연결에는 HTTPS를 사용한다. 비공개 GHCR 이미지는 pull 인증이 필요하다.

Node로 실행하려면 `lore-server-v0.1.0-alpha.4.tar.gz`를 푼다. Node.js 22.23.0 이상이면 추가 npm 설치 없이 실행한다.

```sh
export LORE_POCKETRISU_URL=http://your-pocketrisu:6001
export LORE_DATA_DIR=./data
sh ./run.sh
```

`.env`는 Node 실행 시 자동으로 읽지 않는다. 서버 기본 추출 모델은 환경 변수로 지정할 수 있다. Lite API 키는 브라우저 메모리에만 두며 새 탭에서 다시 입력한다. Full 모델 설정과 키는 private 서버 볼륨에 저장되어 재시작 뒤에도 유지된다. Full의 수락된 작업·원문은 키와 별개로 영속 저장한다.

## 위키와 기억

문서는 `인물/동료/캐릭터1.md`처럼 계층화하고, 제목·경로·본문·쉼표 별칭을 편집한다. `관련 인물: [[캐릭터1]] [[캐릭터2]]`, 별칭·경로·ID 링크, 역링크와 이름 중복 후보 선택을 지원한다. 제목 변경은 이전 이름을 별칭에 보존한다. 수동 교정·고정은 자동 추출이 덮어쓰지 않고 충돌을 남긴다. HTML은 실행하지 않는다.

다음 대화 요청에 포함된 **이전 확정 메시지 ID**를 기준으로 저장된 원문을 수집한다. 이번 생성 중인 답변은 다음 요청에서 수집한다. LLM 추출은 별도 작업으로 실행하므로 일반 답변이 긴 추출을 기다리지 않는다. 수정·삭제·재생성·되돌림은 다음 수집에서 근거 기억을 무효화한다. 분기는 별도 범위이며 자동으로 합치지 않는다.

같은 봇 카드에 채팅이 여러 개 있어도 **채팅 ID별로 별도 위키**를 자동 생성한다. 채팅 A/B의 문서·근거·작업·주입 기억은 섞이지 않으며, 새 채팅이나 분기는 새 문서 군집을 사용한다. 기존 채팅으로 돌아오면 그 위키를 다시 연다.

자동 검색은 현재 질문과 최근 두 대화의 제한된 텍스트로 관련 제목·별칭·본문을 찾는다. “그녀의 직업은?”처럼 이름이 빠진 후속 질문도 최근 인물을 검색에 활용한다. 같은 채팅의 활성 문서만 예산 안에서 주입하고 포함·제외 이유를 확인할 수 있다.

기본 기억 주입은 공급자 변환 전 공통 요청 훅을 사용하므로 모델 프리셋을 포함한 텍스트 요청에 적용한다. 기존 OpenAI 호환 최종 body 검사도 선택할 수 있다. 이미지·도구 요청은 예산을 확인할 수 없어 주입을 건너뛴다. 기억·전체 요청·응답 예약량을 UTF-8 기반으로 보수적으로 추정하며 정확한 토큰 수는 보장하지 않는다. 후속 플러그인·트리거가 내용을 추가할 수 있다. 실패·초과 시 이유를 표시하고 일반 채팅을 계속한다.

## 백업과 제약

Full은 서비스를 멈춘 뒤 SQLite WAL을 포함한 데이터 볼륨 전체를 백업하고 같은 버전의 정지한 볼륨으로 복원한다. 설치 ID·위키·원문·이력·작업·LLM 키가 함께 복원되므로 백업을 비밀 파일로 관리한다. 로그인 JWT는 백업에 없다. 이전 알파의 수동 scope 데이터는 자동 이동하지 않는다.

Lite는 **노트북 전체 백업** JSON과 빈 노트북에 복원을 지원한다. 문서·최근 5개 이력·원문 근거·작업·충돌을 포함하며 최대 16 MiB다. 다른 채팅의 연결된 위키를 덮어쓰지 않는다. 문서별 Markdown 내보내기도 제공한다. 다중 탭 동시 쓰기와 기기 간 자동 동기화는 지원하지 않는다.

전달 전에 탭을 닫은 대화는 다음 요청 전까지 처리되지 않는다. 저장 outbox는 없다. 실제 iPhone Safari 메모리/OOM 및 장기간의 서사 기억 품질은 [별도 검증 범위](docs/public-readiness.md)다.

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
