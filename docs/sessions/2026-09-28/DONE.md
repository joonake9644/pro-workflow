# DONE — 2026-09-28 세션 완료 항목

## 생성·수정된 파일
| 파일 | 변경 내용 |
|------|-----------|
| scripts/run-tests.js | 신규. `src/`·`scripts/` 깊이 무관 재귀 탐색. 0건이면 exit 1. `__tests__/` 안의 비실행 파일 제외 |
| scripts/validate-context.js | 신규. 결정론적 세션 컨텍스트 센서 (AI·네트워크 0, 읽기 전용) |
| scripts/__tests__/validate-context.test.js | 신규. 81 fixture |
| scripts/__tests__/run-tests.test.js | 신규. 4 fixture (탐지 규칙 단위) |
| src/__tests__/ci.test.ts | 신규→확장. 9 fixture. 게이트가 matrix job 소속인지 실제 검증 |
| src/db/__tests__/index.test.ts | 신규. 3 fixture |
| src/db/__tests__/store.test.ts | 신규. 57 fixture. Storage 도메인 전수 |
| AGENTS.md | 신규. 규칙 유일 원본 |
| CLAUDE.md | 신규. `@AGENTS.md` 얇은 어댑터 |
| package.json | test → run-tests.js, check·validate:context·verify 추가 |
| .github/workflows/ci.yml | `Run tests`·`Validate session context` 스텝 추가 |
| skills/safe-mode/SKILL.md | 문서 예시 경로 `$HOME/...`로 포터블화 |
| .context/{STATE,CONTEXT,TODO,glossary}.md | 신규. 세션 연속성 기록 |

## 마지막 일감 (session-wrap 이후에 추가된 것)
| 파일 | 변경 내용 |
|------|-----------|
| CLAUDE.md | 신규. `@AGENTS.md` 얇은 어댑터 |
| scripts/validate-context.js | `session:close` 게이트 + 규칙 파일 불변식(CLAUDE.md import·제목 중복) 추가 |
| scripts/run-tests.js | `__tests__/` 안의 비실행 파일 제외 (리뷰 major 1) |
| src/db/__tests__/store.test.ts | rank 정렬·snippet 컬럼·WAL·기본 limit·category COALESCE 단언 추가 (리뷰 major 2) |
| scripts/__tests__/run-tests.test.js | 신규 4 fixture |
| AGENTS.md | 모델 비의존성 4원칙 + session:close 강제 장치 행 |
| 커밋 | 3767650 |

## 결정사항
- **테스트 스크립트를 자체 runner로 대체** — 이유: node 자체 `--test` glob은 node 20에서 실패实测(`globPatterns`는 v22.6.0+), `engines: >=18`과 충돌. 셸 glob은 깊이 1단계 고정이라 동일한 false-green 결함 재발.
- **하네스는 `somatlas` 패턴만 채택** — 8KB 얕은 지도 + 결정론적 센서 + 전역 `session-wrap`. `planning-continuity-harness`의 `.harness/*.json` 전체 구조는 이 리포(소스 2,544줄)에 과중.
- **규칙을 `AGENTS.md` 한 곳에 두고 `CLAUDE.md`는 import만** — 센서가 존재·import·제목 중복을 검사. 모델을 바꿔도 동일 작동하는 것을 약속이 아니라 기계로 만든다.
- **Storage 결함 6건은 특성화만 하고 미수정** — TODO #025~#030. 테스트 추가로 드러났으나 이번 세션 범위는 커버리지 확보였다.

## 주요 발견
- `better_sqlite3.node`는 **단일 ABI로만 빌드**된다. 공유 `node_modules`에서 node를 전환하면 20/22에서 49건 실패. 버전별 `npm rebuild` 후 전부 통과. CI는 레그마다 `npm ci`라 영향 없음.
- **변조 통과 = 통과가 아니다.** 내가 "뮤테이션 8/8"이라 적었으나 그 8건은 손으로 고른 목록이었고 커버리지 측정이 아니었다. 독립 리뷰어가 내가 *안 한* 뮤턴 5건이 통과함을 찾아냈다. 해당 5건을 모두 테스트로 고치고 지금은 검출된다.
- `__tests__/` 안에 `.md` 한 장을 두면 `npm test` 전체가 `ERR_UNKNOWN_FILE_EXTENSION`로 죽는다(리뷰어 발견, 수정 완료).
- 독립 리뷰는 첫 시도에서 권한 거부로 **미완료**였다. 완료 리포트가 나온 경우에만 완료로 취급한다.

---
_생성: 2026-09-28 세션 종료 시_
