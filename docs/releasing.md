# GitHub / Gitea 배포

## 저장소와 이미지

- GitHub: `https://github.com/Sallos725/lore`, 이미지 `ghcr.io/sallos725/lore:v<VERSION>`
- Gitea: `https://gitea.grantos.m1ndb3nd3r.com/M1NDB3ND3R/lore`, 이미지 `gitea.grantos.m1ndb3nd3r.com/m1ndb3nd3r/lore:v<VERSION>`
- 컨테이너는 Linux amd64/arm64를 발행한다. 버전 태그를 보존하고, 릴리스 첨부 파일 발행까지 성공하면 같은 다중 아키텍처 이미지에 `latest`를 붙인다. `latest`는 알파를 포함해 가장 최근 발행한 릴리스이며 안정판 보증을 뜻하지 않는다.
- 변경마다 로컬 커밋, 브랜치 push/PR은 CI, `v*` 태그 push는 릴리스를 실행한다. 태그 버전은 package.json과 정확히 일치해야 한다. Actions는 운영 서비스에 SSH하거나 실행 중인 스택을 교체하지 않는다.

## 최초 설정

GitHub Actions에서 packages/contents 쓰기를 허용한다. 기본 `GITHUB_TOKEN`을 사용하며 처음 발행한 GHCR 패키지의 visibility는 운영자가 확인한다. 비공개 이미지는 pull하는 서버에도 인증이 필요하다.

Gitea는 Actions를 활성화하고 `ubuntu-latest` 라벨 runner를 등록한다. runner는 Node action 실행, Python 설치, Playwright 시스템 의존성 설치, Docker Buildx/QEMU와 레지스트리 접근이 가능해야 한다. privileged 빌드가 필요한 runner는 신뢰한 저장소만 실행하도록 격리한다. **LORE 서비스 컨테이너 자체에는 Docker socket을 마운트하지 않는다.**

Gitea 저장소 Actions secrets:

| secret | 용도 |
|---|---|
| `RELEASE_TOKEN` | M1NDB3ND3R/lore release 읽기/쓰기 권한 PAT |
| `REGISTRY_USERNAME` | 이미지 소유자에 쓰기 가능한 사용자 |
| `REGISTRY_TOKEN` | 해당 소유자의 package 읽기/쓰기 권한 PAT |

Gitea job token의 패키지 권한은 GitHub와 다르므로 별도 PAT를 사용한다. 외부 action은 절대 GitHub URL로 명시하고 GitHub 전용 artifact upload는 Gitea에서 사용하지 않는다. [Gitea Actions 차이](https://docs.gitea.com/usage/actions/comparison/)와 [컨테이너 레지스트리](https://docs.gitea.com/usage/packages/container/) 참고.

## 태그 발행 절차

1. package.json 버전과 README의 고정 버전 예시를 갱신하고 `npm install --package-lock-only --ignore-scripts`를 실행한다.
2. `npm run build`, `sh scripts/validate.sh`, `npm run package`, `python3 scripts/check-package.py`를 통과시킨다.
3. 번들 포함 변경을 커밋한다. `main`을 두 원격에 push하여 GitHub CI를 확인한다. Gitea 실패 조사는 현재 보류한다.
4. 같은 커밋의 annotated `v<VERSION>` 태그를 GitHub에 push한다. Gitea는 runner 복구 후 별도로 발행한다. **이 단계가 실제 발행을 시작한다.**
5. 각각의 Actions 결과, release 첨부 파일, SHA256SUMS, amd64/arm64 이미지 manifest를 확인한다.

산출물은 실행 파일 4개와 manifest/checksum 총 6개다. Lite JS, Full JS, Full ZIP, Node 서버 tar.gz, release.json 및 SHA256SUMS다. 파일 목록은 명시적 allowlist로 만들며 `.env`, credentials, data, .git, node_modules는 포함하지 않는다. 파이썬 표준 라이브러리만 사용해 두 플랫폼에서 같은 패키지를 만든다.

검증/브라우저 테스트/설치 smoke test가 성공한 뒤 이미지를 push하고, draft release에 모든 첨부 파일을 업로드한 다음 공개한다. 실패한 draft는 재실행 시 첨부 파일을 다시 올릴 수 있다. 이미 공개된 release는 덮어쓰지 않고 새 버전으로 수정한다. 이미지 push 성공 후 release 업로드가 실패하면 이미지가 먼저 존재할 수 있다. 릴리스 프로세스 전체가 두 서비스에 걸친 원자적 트랜잭션은 아니다.

## 현재 상태

GitHub/Gitea 양쪽 SSH main push가 성공했고 GitHub 최초 CI도 성공했다. Gitea에는 사용자 승인으로 현재 tea 로그인 자격 증명을 RELEASE_TOKEN/REGISTRY_TOKEN/REGISTRY_USERNAME secret으로 등록했다. 첫 Gitea CI 실패 후 사용자 지시로 추가 진단을 보류했다. 릴리스는 GitHub를 우선하며 실제 태그 발행 결과는 Actions와 Releases에서 확인한다. 로컬 산출물 생성과 원격 게시 성공을 구분한다.

2026-09-21: [v0.1.0-alpha.2](https://github.com/Sallos725/LORE/releases/tag/v0.1.0-alpha.2) 실제 발행과 다운로드 체크섬 검증을 완료했다. 두 아키텍처 GHCR manifest도 Release Actions에서 확인했다. 상세 기록은 [status.md](status.md)에 있다.

2026-09-21: [v0.1.0-alpha.3](https://github.com/Sallos725/LORE/releases/tag/v0.1.0-alpha.3)을 PocketRisu 패치 없이 배포했다. [Release Actions](https://github.com/Sallos725/LORE/actions/runs/35603398635), 실제 첨부 파일 6개의 checksum·로컬 재현 일치와 amd64/arm64 manifest 확인을 완료했다. 새 설치는 alpha.3 이후를 사용한다.

## 기존 이미지에 latest 추가 또는 재시도

GitHub **Promote latest** workflow_dispatch에 `release_tag`를 입력한다. 공개된(비-draft) 릴리스이고 현재 package.json 버전과 일치해야 한다. 저장소가 PRIVATE여도 실행할 수 있다. 이미지 재빌드와 기존 릴리스 첨부 파일 교체 없이 amd64/arm64 manifest 전체를 복사한다. 승격 후 원본/최신 index 일치와 실제 pull을 확인한다.

```sh
gh workflow run promote-latest.yml --repo Sallos725/LORE -f release_tag=v0.1.0-alpha.3
```

자동 Release와 수동 승격은 같은 concurrency group을 사용한다. Gitea의 다음 Release에도 성공 후 latest 갱신 단계를 넣었지만, 현재 Gitea Actions 실행은 계속 보류한다. [Docker imagetools create](https://docs.docker.com/reference/cli/docker/buildx/imagetools/create/)의 단일 index 복사 기능을 사용한다.

## alpha.4 발행 결과

2026-09-22(KST): [v0.1.0-alpha.4](https://github.com/Sallos725/LORE/releases/tag/v0.1.0-alpha.4), 태그 커밋 `29f80b1a06d86cf913c16a268c6d630866905fc2`를 발행했다. [CI](https://github.com/Sallos725/LORE/actions/runs/35616932756)와 [Release](https://github.com/Sallos725/LORE/actions/runs/35617271733)가 모두 성공했다. 순정 PocketRisu에서 Lite/Full 설치·독립 추출·실제 Gemini 요청 주입을 배포 조건으로 검사한다. 공개 첨부 6개를 다운로드해 SHA256SUMS와 로컬 재현 빌드 일치를 확인했다.

- `latest` = `v0.1.0-alpha.4` index: `sha256:615da22920c742bf3e92c109d612d3680c850a45a07844ca61c165f6704b7e31`
- amd64: `sha256:971d3bbb363376d10b3a01c2d5180044eda8ce63f58a8953036dbd5ab712f6de`
- arm64: `sha256:207b5a3767fc1ce65ba7406e93384ec14376c01c3d874543cbda22f9f46bf3b3`

로그인 없는 GHCR manifest 조회로 두 버전과 플랫폼을 대조했다. 빈 Docker 인증 설정으로 latest pull도 성공했다. Gitea에는 main 소스만 동기화했고 배포 태그/Actions 조사는 보류했다. 실행 중인 사용자 스택은 교체하지 않았다.
