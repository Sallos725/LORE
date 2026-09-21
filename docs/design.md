# 설계 결정

- Lite는 별도 LORE 서버 없이 기기 저장·추출을 수행한다. Full은 얇은 UI와 Node.js 22.23+ 사이드카다. 내장 HTTP/SQLite로 외부 런타임 npm 의존성을 두지 않는다. 서버는 단일 프로세스로 운영한다.
- Full의 정본은 SQLite, Lite는 문서별 immutable revision과 작은 index다. Markdown은 id/path/aliases/evidence frontmatter를 포함하는 내보내기 형식이며 디렉터리 파일과 DB를 이중 정본으로 운영하지 않는다.
- 원문은 파생 위키와 별도 저장한다. Full은 모든 source revision을 보존한다. Lite는 제한된 현재 원문과 문서별 최근 5개 revision 및 인용 근거를 보존한다. 원문 변경은 의존 문서를 즉시 제외한다.
- scope는 installation/user/character/chat/branch의 안정된 ID다. 자동 수집에는 host chaId/chat.id/message.chatId를 사용하고 count는 검증용 cursor로만 사용한다. Full bearer token은 서버가 scope/audience를 고정한다. collect 권한은 해당 범위의 cursor 수집에 한정되고 임의 revision events용 ingest와 분리한다.
- 호스트 연결부는 전체 char/chat snapshot 대신 최대 32 위치/60KB delta를 반환한다. 기존 prefix는 incremental SHA-256으로 검증한다. 큰 문자열 전체 복사는 없지만 호스트에서 O(n) 재검증하므로 서버 outbox로 발전시킬 여지가 있다.
- 문서 경로는 상대 .md 경로, 최대 8단계다. aliases는 NFKC/공백/대소문자를 정규화하며 제목 변경 시 옛 이름을 보존한다. 모호한 링크는 선택 후보를 표시한다. Markdown 렌더링에 innerHTML을 사용하지 않는다.
- Full 추출은 DB 잠금 밖에서 호출하고 근거 revision/작업 상태를 다시 확인한 뒤 원자적으로 적용한다. 제출 순서대로 작업하고 타임아웃·3회 재시도·재시작 복구를 지원한다. Lite는 동일한 제안 검증과 index 발행으로 부분 갱신을 방지하며 실행은 탭 생명주기에 묶인다.
- pinned/manual 문서는 자동 변경하지 않고 별도 충돌 제안으로 보존한다. 무효 문서는 일반 기억 검색에서 빠지며 Full 폴더 탐색에서 검토할 수 있다. 재추출은 무효 문서의 ID/revision을 이어받아 복구할 수 있다.
- 컨텍스트 byte 상한과 호스트 tokenizer의 기억/전체 요청 예산은 별개다. 필수 문서 초과는 전체 주입을 중지한다. beforeRequest와 최종 OpenAI 호환 text body에서 검사하며 응답 예약량도 포함한다. 다른 플러그인의 후속 변환과 provider의 내부 계산은 별도 한계다.
- 모델 미설정 시 기존 Full events는 결정적인 원문 인용 작업을 수행한다. 자동 수집 시작은 모델 설정을 요구해 인용과 LLM 기억을 혼동하지 않는다.
- 초기 Full은 명시적 URL + scoped bearer 연결이다. Docker 기본 포트는 내부 전용이며 호스트 인증 프록시·서버 outbox·영속 서버 측 채팅 연결은 다음 범위다. 서비스 스택을 자동 교체하지 않는다.
- GitHub/Gitea는 같은 검증·패키징을 사용하고 package.json과 일치하는 v* 태그로 버전 이미지/첨부 파일을 발행한다. 사용자 지시에 따라 Gitea runner 실패 조사는 보류한다.
