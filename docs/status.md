# 인수인계 — 0.1.0-alpha.2 (2026-09-21)

## 구현됨

- 작은 변경마다 독립 LORE 저장소에 커밋. GitHub/Gitea 양쪽 SSH 인증과 main push 성공. 실행 중인 상위 서비스·Compose는 수정하지 않았다.
- Lite/Full 계층형 Markdown 위키, 경로·제목·쉼표 별칭 편집, 이름 변경 별칭 보존, 위키 링크·역링크·모호한 후보 선택, 안전한 미리보기와 frontmatter 내보내기.
- OpenAI 호환 LLM 추출, JSON 스키마·정확한 원문 인용·audience·revision 검증, 원자적 적용, 수동 교정/고정 충돌 보존, timeout·3회 재시도·재시작 복구. 실제 의미적 사실 정확도는 사용자 검토 대상이다.
- 고정 PocketRisu 커밋용 V3 확장 installer. 전체 char/chat RPC 없이 최대 32 위치/60KB delta를 수집한다. ID/기존 prefix hash로 수정·삭제·되돌림을 확인하고 근거 기억을 무효화한 뒤 재수집한다.
- Lite 기기 저장 원문·추출 큐 및 한도, Full 영속 수집 API와 worker. beforeRequest와 최종 body 단계의 scope/예산 검사, 지연/장애 시 일반 채팅 계속, unload 해제.
- 작업 상태·실패/취소 재시도·충돌 검토/제거 UI. 모델·토큰은 명시적으로 입력하며 브라우저 비밀 값을 영구 저장하지 않는다.
- 양쪽 v* 태그 릴리스 설정, 공통 패키지·checksum 검증, draft 첨부 완료 후 공개, amd64/arm64 컨테이너 구성. Lite 사용자용 호스트 확장 ZIP도 포함한다.

## 검증과 배포 기록

Node 합성 대화/저장/API/추출/주입 회귀 테스트, Python 릴리스 모의 테스트, Chromium/WebKit의 Lite/Full UI 및 모의 LLM 자동 흐름을 사용한다. 패키지는 임시 폴더에 설치해 서버 실행을 확인하고, 컨테이너는 격리된 테스트 볼륨에서 재시작 보존을 검사한다. 실제 유료 LLM이나 사용자의 실제 대화는 테스트에 보내지 않았다.

고정 PocketRisu의 별도 임시 체크아웃에 installer를 적용하고 생성된 V3 TypeScript 구문을 검증했다. 이는 PocketRisu 전체 빌드/실제 로그인 호스트/iPhone 종합 검증을 뜻하지 않는다.

GitHub 최초 CI는 [35589082958](https://github.com/Sallos725/LORE/actions/runs/35589082958)에서 성공했다. 새 버전 검증·실제 산출물 발행 결과는 [Actions](https://github.com/Sallos725/LORE/actions)와 [Releases](https://github.com/Sallos725/LORE/releases)에 남는다. 로컬 패키지 생성만으로 원격 발행을 완료했다고 해석하지 않는다.

Gitea 첫 CI는 실패했다. 사용자 승인으로 기존 tea 로그인에서 같은 저장소의 `RELEASE_TOKEN`, `REGISTRY_TOKEN`, `REGISTRY_USERNAME`을 등록했다. 비밀 값은 파일·로그·커밋에 넣지 않았다. 이후 사용자 지시대로 Gitea runner 실패 진단과 태그 발행을 보류하고 GitHub를 우선한다.

## 남은 범위

1. 실제 PocketRisu 빌드·설치 및 iPhone Safari에서 장시간 데이터/화면 잠금/재접속의 메모리·전송량 측정.
2. PocketRisu 채팅 저장과 원자적인 서버 outbox, 인증 프록시·활성 세션의 서버 측 검증. 현재 브라우저 전달 이전 종료는 재접속해야 복구된다.
3. 최초 이력 가져오기와 수정 재추출의 서버 전용/부분 변경 최적화. 현재 호스트 O(n) prefix 재검증과 변경 시 범위 전체 재수집이다.
4. Lite 여러 탭 동시 쓰기·노트북 일괄 백업/import·전체 정리, Full 보존 정책과 많은 작업/충돌의 관리 화면 확대.
5. 텍스트 OpenAI 호환 외 provider/이미지/tool 호출의 정확한 예산 계약, 후속 플러그인까지 포함한 최종 host-level 예산 검증.
6. 사용자 승인 합성/실대화 평가로 장기 기억의 의미 정확도·현재/과거 상태·인물별 비밀 정책 품질 개선. 지금은 public 또는 단일 audience를 보수적으로 적용한다.

자세한 실행 절차는 [automation.md](automation.md), 소스 근거는 [compatibility.md](compatibility.md)에 있다.

## alpha.2 발행 확인

- [GitHub CI 35597067484](https://github.com/Sallos725/LORE/actions/runs/35597067484) 성공. 브라우저 테스트의 비동기 폴더 선택을 수정한 뒤 재검증했다.
- [태그 Release 35597337104](https://github.com/Sallos725/LORE/actions/runs/35597337104) 성공. `v0.1.0-alpha.2`는 `0eebbea6ca4d326e76188ccd903ad029f3e3547b`를 가리킨다.
- [GitHub prerelease](https://github.com/Sallos725/LORE/releases/tag/v0.1.0-alpha.2)에 Lite/Full JS, Full ZIP, 서버 tar.gz, 호스트 확장 ZIP 및 manifest/checksum 파일 총 7개가 게시됐다. 실제 다운로드의 모든 체크섬과 최종 호스트 helper/installer 일치를 확인했다.
- `ghcr.io/sallos725/lore:v0.1.0-alpha.2` 발행 성공. Actions에서 원격 manifest의 linux/amd64와 linux/arm64를 검증했다. manifest digest: `sha256:de78ec428dda85b2d60ac99f2246cf857d5b57191b10ee47d87e9404cc3d6a6e`.
- 태그 실행에서 Node 테스트 30개, Python 테스트 5개, Chromium/WebKit 각각 Lite/Full UI, 패키지 설치 및 격리 컨테이너 데이터 보존 검사가 통과했다.
- GitHub 저장소의 PRIVATE 설정은 유지했다. Gitea에는 main만 동기화하고 태그를 보내지 않았다.
