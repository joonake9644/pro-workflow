# REVIEW — 2026-09-28

TOOL_LABEL: opencode
REVIEW_MODEL: opencode-go/deepseek-v4.1-flash
REVIEW_SCOPE: 7fa2872..HEAD (dc94a71, 84a1381, 45a9c75, 3767650, 이후 변경분)
REVIEW_METHOD: `opencode run --model opencode-go/deepseek-v4.1-flash` 별도 프로세스.
  리뷰어에게 "작성자를 신뢰하지 말고 동기 부여 설명도 검증 대상"을 지시하고 파일 생성을 금지했다.
REVIEW_RESULT: majors-fixed, minors-deferred

## 실행 기록 (3회)

| # | 대상 | 완주 | 출력 | blocker | major | minor | nit |
|---|------|------|------|---------|-------|-------|-----|
| 1 | `dc94a71` | **미완** | 권한 거부로 중단 | — | — | — | — |
| 2 | 하네스 작업분 | 완주 | 688줄 | 0 | 1 | 7 | 3 |
| 3 | 세션 종료 전 전체 | 완주 (`REVIEW-COMPLETE` 마커 확인) | 1390줄 | 0 | 2 | 9 | 0 |

1회는 **완료된 리뷰가 아니다.** 부분 결과를 완료처럼 취급하지 않고 재실행했다. 이것이
`AGENTS.md`의 "리뷰 실측 확인" 항목이 실제로 발동한 사례다.

## major 처리 (수정 완료)

| # | finding | 메인 재현 | 처리 |
|---|---------|-----------|------|
| 2-1 | 홈경로 정규식이 `key=/Users/<name>`·`home:/Users/<name>`·후행슬래시 없음·Windows 정슬래시 7종을 모두 놓침 | 모듈에서 추출한 정규식으로 7케이스 전부 미탐지 확인 | 구분자 클래스 → lookbehind로 교체. 엔드투엔드 13케이스: 검출 9 전부, 오탐 4건 0 |
| 3-1 | `run-tests.js`가 `__tests__/` 안의 **모든 파일**을 수집 → `NOTES.md` 한 장으로 `npm test` 전체가 `ERR_UNKNOWN_FILE_EXTENSION`로 사망 | `NOTES.md` 주입 → `npm_test_exit=1` 확인 | 실행 가능한 확장자만 수집. 회귀 테스트 4건 |
| 3-2 | `store.test.ts`가 rank 정렬·snippet 컬럼·WAL·기본 limit·category COALESCE를 검증하지 않음. 게다가 주석이 "best-first를 고정한다"고 거짓 주장 | `ORDER BY rank DESC` 주입 → 51/51 통과(미검출) 확인 | 단언 5종 추가 + 거짓 주석 제거. 리뷰어 지목 5개 뮤턴 전부 검출 확인 |

## 기록 정정

`CONTEXT.md`에 "뮤테이션 8/8 검출"이라고 적었으나, 그 8건은 손으로 고른 목록이었고
커버리지 측정이 아니었다. 리뷰어가 내가 *하지 않은* 뮤턴 5건을 찾아 통과함을 확인했다.
**변조 통과를 통과로 보고하지 않는 것**을 이 세션의 실측 교훈으로 남겼다.

## minor / nit (미수정, 사유)

- `ci.test.ts`가 `|| :`·`; true` 무음화를 잡지 못함 → TODO #023
- `package.json`의 `files`가 `scripts`를 포함해 검증 스크립트가 npm 배포물에 실림 → TODO #024
- 나머지 minor는 "감소됨(소유자에 기록)" 판단으로 TODO에 사유와 함께 남김

## 미검증 (리뷰어가 못 한 것)

- GitHub Actions 실제 실행 — fork의 push 트리거가 비활성이라 run이 0건
- Node 18 레그 — 이 환경에 미설치
- `npm pack` 산출물(nit 하나)
- 깨진 심볼릭 링크 디스크 재현 — 리뷰어에 파일 생성 금지 규칙 때문이라 INFERENCE로 남음
