# 인수인계 — 0.1.0-alpha.3 (2026-09-21)

## 현재 구현

사용자가 PocketRisu 수정·재빌드를 거부하여 alpha.2의 호스트 확장 설치기와 전용 API 의존성을 제거했다. 실행 중인 PocketRisu·상위 Compose는 수정하지 않았다. 작은 변경 단위로 독립 LORE 저장소에 커밋한다.

- Lite: 기존 V3/HTTP API로 제한된 원문 조회, 기기 저장, 공급자·모델을 선택해 직접 LLM 호출.
- Full: 플러그인과 HTTP(S) 통신, 기존 PocketRisu HTTP 원문을 서버에서만 조회, SQLite·영속 추출 큐, scope/audience별 공급자 설정. 내부망 HTTP 주소 지원.
- OpenAI/OpenRouter/Ollama/custom 호환, Anthropic Messages, Gemini Generate Content 독립 호출. UI 키는 메모리에만 보존하고 영구 설정은 운영자 환경 변수다.
- 확정 anchor 이전 원문만 수집, prefix 변경 시 근거 기억 무효화, revision·근거·audience 검증, 수동 교정 충돌 보존. 추출은 생성 요청과 별도 비동기 작업.
- 기존 OpenAI 호환 최종 JSON 문자열 body에서 관련 기억 주입. UTF-8 기반 보수적 예산 추정·응답 예약량·원문/범위 재검사. 지원하지 않는 형식과 실패는 일반 채팅을 계속한다.
- 계층형 Markdown 위키, 문서·쉼표 별칭 편집, 이름 변경 별칭 보존, 링크·역링크·모호한 후보 선택, 안전한 미리보기·frontmatter 내보내기는 유지한다.
- 배포 산출물은 Lite JS, Full JS, Full ZIP, 서버 tar.gz 및 manifest/checksum 총 6개. 호스트 패치 ZIP은 폐지했다.

## 로컬 검증

Node 테스트 42개: 원문·revision·범위·분기·큐 복구, 공급자별 요청 형식, Full HTTP 설정·독립 LLM 호출, 최종 문자열 주입, 예산·장애 처리. Python 릴리스 모의 테스트, Chromium/WebKit 각각 Lite/Full의 모바일 폭 UI와 자동 흐름도 사용한다. Full 브라우저 테스트는 원문 본문이 브라우저로 들어오면 실패한다.

실제 유료 LLM이나 사용자 대화를 테스트에 보내지 않았다. 원본 PocketRisu 커밋의 API 계약을 확인했으나 실제 로그인 호스트 전체 설치·iPhone 장시간 검증과 의미적 기억 품질 평가는 별도다. 기존 API 자체의 전체 선택 채팅 응답과 재검증 비용은 남는다. Full은 서버 16 MiB, Lite는 브라우저 1 MiB/128개 상한이다.

## 발행 상태

alpha.3 로컬 구현·패키징을 진행 중이다. 원격 push/CI/태그 Release와 다운로드 체크섬 결과가 아래에 기록되기 전에는 원격 발행 완료로 해석하지 않는다.

이전 [alpha.2](https://github.com/Sallos725/LORE/releases/tag/v0.1.0-alpha.2)는 GitHub에서 실제 발행했다. 이 버전은 호스트 패치를 요구하므로 새 설치에는 alpha.3 이후를 사용한다. 이전 게시 파일과 태그는 덮어쓰지 않는다. GitHub PRIVATE 설정은 유지한다.

Gitea는 SSH main 소스 동기화만 유지한다. 사용자 승인으로 기존 tea 자격 증명을 배포 secrets에 등록했지만, 사용자 지시에 따라 실패 조사와 태그 배포를 보류했다.

## 알려진 한계

1. 새 답변은 다음 생성 요청에서 수집한다. 탭 종료 동안 새 대화 자동 발견·호스트 저장 outbox·원자적 활성 writer lock 검증은 없다. 앱 개조를 필수 설치로 다시 도입하지 않는다.
2. 새 분기는 별도 토큰/노트북이다. configure 토큰의 ID 발견은 같은 캐릭터 메타데이터만 반환하고 수집 scope를 변경하지 않는다.
3. 정확한 호스트 tokenizer API가 없어 보수적 추정이다. Responses API, model-preset/job 경로, 이미지/tool·다른 대화 provider의 주입은 미지원이다. 기억 추출 공급자는 별도 선택 가능하다.
4. Full UI 키는 서버 재시작 후 재입력이 필요하다. 모델이 없는 작업은 큐에서 대기한다. Lite 다중 탭 쓰기·노트북 일괄 이전·기기 동기화는 미지원이다.
5. 수정은 전체 범위를 재조정한다. 부분 변경 최적화·대형 위키 관리·실기기 메모리 및 장기 의미 품질 평가가 남는다.

[설정](automation.md) · [소스 계약](compatibility.md) · [모바일 검증](mobile-testing.md)
