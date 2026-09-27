# REVIEW — 2026-09-28 (종료 게이트 최종)

TOOL_LABEL: opencode
REVIEW_MODEL: opencode-go/deepseek-v4.1-flash
REVIEW_SCOPE: 3767650..HEAD — 문서 하네스 정렬 커밋 4efbdf9 및 종료 게이트 규칙
REVIEW_METHOD: `opencode run --model opencode-go/deepseek-v4.1-flash` 별도 프로세스. 파일 생성 금지.
REVIEW_RESULT: majors-fixed, minors-deferred

## 실행 기록 (총 4회)

| # | 대상 | 완주 | 출력 | blocker | major | minor | nit |
|---|------|------|------|---------|-------|-------|-----|
| 1 | `dc94a71` | **미완** | 권한 거부로 중단 | — | — | — | — |
| 2 | 하네스 작업분 | 완주 | 688줄 | 0 | 1 | 7 | 3 |
| 3 | 세션 중간 전체 | 완주 (마커 확인) | 1390줄 | 0 | 2 | 9 | 0 |
| 4 | 문서 하네스 + 종료 게이트 | 완주 (마커 확인) | 1045줄 | 0 | 4 | 8 | 2 |

1회는 **완료된 리뷰가 아니다.** 부분 결과를 완료처럼 취급하지 않고 재실행했다.

## major 4건 — 전부 수정 (게이트 규칙상 필수)

| finding | 메인 재현 | 수정 | 고정 증거 |
|---------|-----------|------|---------|
| 판정 정규식이 교집합이 아니라 **대안** — `REVIEW_MODEL`만 있어도 통과 | `node -e`로 `REVIEW_MODEL: m` 단독 → true | 두 라벨을 각각 요구 | 뮤테이션 시 1 fail |
| 날짜 폴더 검사와 REVIEW 내용 검사가 `existsSync` 안에 있어 **조건부** — 폴더가 없으면 검사 자체가 안 돔. root `docs/REVIEW.md` 내용은 아예 안 읽음 | 폴더 없는 임시 트리 + REVIEW.md 1줄 → **exit 0** | 폴더 부재를 실패로, root REVIEW.md 내용도 동일 규칙으로 | 뮤테이션 시 2 fail |
| AGENTS.md 3곳이 "8KB 캡을 검사한다"고 서술하나 코드는 8KB를 advisory로 강등하고 150줄 하드·12KB 절대를 추가 | `bytes 7866`에서 failures 0 | 문구를 실제 강제에 맞춤. advisory가 다시 울려 8KB 아래로 압축 | `violations 0 / advisories 0` |
| freshness의 **pathspec 제외가 테스트로 고정되지 않음** — 모든 fixture에서 `productHead === gitHead`여서 제외가 구별되지 않음 | 리뷰어 실행으로 확인 | 제품 커밋 후 docs-only 커밋 fixture 3건 추가 | 뮤테이션(제외 제거) 시 **6 fail** |

## 이번 리뷰가 가르친 것

- **교집합을 대안으로 쓰면 게이트가 구멍이 된다.** `A|B`는 "둘 중 하나"인데 문서에는 "둘 다"라 적혀 있었다.
- **검사가 조건부이면 없는 게 통과가 된다.** 폴더가 없으면 REVIEW 규칙이 아예 실행되지 않는다.
- **테스트는 규칙의 코드가 아니라 차이를 재야 한다.** freshness 규칙의 핵심인 pathspec 제외가 테스트에서
  관측되지 않고 있었다. 규칙이 "있다"고 믿는 것과 "검증된다"는 다른 말이다.
- 문서와 코드가 어긋난 채로는 규칙이 없는 것보다 나쁘다. 유지자가 존재하지 않는 8KB 캡을 믿고
  12KB까지 키울 수 있다.

## minor / nit (미수정, 사유)

`session:close` 게이트가 `docs/REVIEW.md`의 `REVIEW_MODEL` 값을 형식 검증하지 않는다(무슨 문자열이든 통과).
도구 라벨 값의 화이트리스트는 일부 프로젝트만 두므로 범위를 넓히지 않았다. `validate-context`가
advisory를 별도 배열로 돌려주는 구조라 이를 main 출력과 분리하는 것은 검토 대상.
나머지 minor/nit는 사유와 함께 `.context/TODO.md`에 남김.

## 미검증 (리뷰어가 못 한 것)

- GitHub Actions 실제 실행 — fork의 push 트리거 비활성이라 run 0건
- Node 18 레그 — 이 환경에 미설치
- TOOL_LABEL 값의 실제 허용 목록 — 전역 설정과 프로젝트 규칙이 갈리는 지점이 있어 단일 진본이 없음
