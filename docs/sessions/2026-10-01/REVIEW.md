# REVIEW — 2026-10-01 (종료 게이트)

TOOL_LABEL: opencode (space-bunny-free)
REVIEW_MODEL: opencode-go/deepseek-v4.1-flash
REVIEW_SCOPE: 2026-10-01 세션 전체 작업분 — #006 [Optimizer-LLM] TDD, #026~#030 Storage 결함 5건, session-close 게이트 TAP 수정, 설치·저장소 정리
REVIEW_METHOD: `reviewer` 서브에이전트를 새 컨텍스트로 실행. 이전 대화 없음. 파일 수정 금지 지시.
REVIEW_RESULT: blocker-fixed, major-0, minor-fixed-or-deferred, nit-fixed-or-deferred

## 실행 기록

| # | 대상 | 완주 | blocker | major | minor | nit |
|---|------|------|---------|-------|-------|-----|
| 1 | 세션 전체 미커밋 작업분 | 완주 | 1 | 0 | 3 | 2 |

## blocker 1건 — 수정 완료

**`scripts/session-close.js`가 spec 리포터만 파싱 → CI 매트릭스 3레그 전부 실패**

리뷰어 판정: Node는 비TTY stdout에서 v23 미만이면 tap 리포터(`# pass N`)가 기본이고,
이 게이트는 `execFileSync`로 **파이프**를 통해 출력을 읽는다. 따라서 18/20/22 레그에서는
`ℹ pass` 정규식이 전부 null이 되고 `measurementProblem`이 exit 1을 낸다.

**실측으로 확정.** 같은 suite를 node 20.11.0과 22.17.0에서 직접 실행해 `# pass 13 / # fail 0`이
나오는 것을 확인했다. 게이트가 CI에 추가된 changeset이면서 스스로 통과 불가능한 상태였다.
`STATE` blocker #035는 원인을 "버전별 suite 수 차이"로 적었으나 **실제 기전은 마커 형식**이며
조건부가 아니라 **무조건 실패**였다.

수정: `numCounter()`가 `[#ℹ]` 두 접두사를 모두 받는다. TAP 형식 fixture를 추가해 RED로 고정한 뒤
GREEN. 관련 문구를 STATE·TODO·handoff에 정정했다.

수정 중 추가로 발견: `num()`이 `new RegExp(source, 'g')`로 플래그를 **덮어쓰면서** `m`을
버리고 있었다. 앵커된 패턴은 그래서 전부 null이었다. 플래그를 합치는 방식으로 고쳤다.

## minor 3건 — 2건 수정, 1건 기각

1. **skip/todo/cancelled 미파싱 — 수정.** Node는 skipped를 `tests`에는 세고 `pass`/`fail`엔 안
   센다. 정합성 검사가 `passed + failed == tests`라 `it.skip()` 하나만 있어도 게이트가 깨진다.
   3개 카운터 파싱 후 합산에 반영.
2. **CHECK 제약이 기존 DB에 미적용 — 수정(문서화).** `CREATE TABLE IF NOT EXISTS`는 기존
   테이블에 CHECK를 소급하지 않는다. `schema.sql`과 `store.ts` 양쪽에 한계를 주석으로 남겼다.
   마이그레이션은 미작성으로 TODO에 보존.
3. **`infix NEAR`가 FTS5 문법 에러 — 기각.** 리뷰어는 실행 없이 FTS5 BNF로 추론했다. 메인이
   같은 suite에서 `a NEAR b` → `[]`, `zebra NEAR giraffe` → 예외 없음을 실측했다. `NEAR`는
   중위에서도 독립 토큰으로 분류되고 양끝 제거 후 빈 결과가 된다. 추론이 틀렸으므로 수정하지
   않고 **실측된 동작을 테스트로 고정**했다.

## nit 2건 — 모두 수정

- `parseBaseline`이 첫 매치를 쓰는데 `num()`은 마지막 매치를 쓴다. handoff에 baseline 블록이
  둘 이상 있으면 엉뚱한 것과 비교하게 된다. `matchAll`로 마지막 매치를 쓰도록 정합.
- `NEAR(a b c, 5)`(3구문 유효 FTS5)는 검증 정규식이 2구문만 받아 조용히 버려진다. 코드 주석이
  문법 검증이 아님을 이미 밝히고 있으므로 한계로 유지하되 테스트에 기록.

## 리뷰어가 실행하지 못한 것 (밖에서 수행)

- `npm run build` — 리뷰어 샌드박스가 허용하지 않음. 메인이 exit 0 확인
- `npx tsc --noEmit` exit code — 리뷰어가 캡처 실패. 메인이 exit 0 확인
- node 18/20/22에서의 게이트 실패 — 리뷰어는 문서로 추론. 메인이 20.11.0·22.17.0으로 실측 확정

## 리뷰가 잡지 못한 것

리뷰어는 뮤턴 25/25·17/17을 재현하지 않고(스크립트가 저장소 밖에 있고 사라진 상태) 4개 변경을
추적해 "어떤 테스트가 어떤 회귀를 잡는가"를 서술했다. 이는 mutation 실행이 아니므로 **검증된
수치로 보고하지 않았다.** 뮤턴 결과는 메인이 실측한 값이다.
---

## 2차 리뷰 (게이트 자체 변경분) — 2026-10-01

1차 리뷰 이후 게이트 시맨틱을 바꿨으므로(CI freshness 면제) 그 변경만 다시 리뷰시켰다.
대상: `baab3d2`, `fae559b`, `10e636f`.

REVIEW_MODEL: opencode-go/deepseek-v4.1-flash
REVIEW_RESULT: minor 4건 발견 → **3건 수정, 1건 수용**. blocker 0, major 0.

### 수정한 것

1. **[minor] CI 신호가 너무 넓음 — 수정.** `CI`/`GITHUB_ACTIONS`만 보면 main push에서도
   freshness를 건너뛴다. main push는 실제 커밋을 체크아웃하므로 충족 가능한데도 검사가 꺼진다.
   `GITHUB_REF`가 `refs/pull/`로 시작할 때만 면제하고, `refs/heads/...`는 검사하도록 바꿨다.
   `GITHUB_REF`가 없는 CI를 위해 HEAD 부모 수(2개 이상 = merge) fallback을 둔다.
   main push에서 stale handoff가 실제로 보고되는지 테스트로 고정했다.
2. **[minor] advisory가 빨간 실행에서 사라짐 — 수정.** `main()`이 `failures.length === 0`일 때만
   advisory를 출력해, 다른 규칙이 실패하면 면제 사실이 안 보였다. "비활성 검사가 충족 검사로
   읽힌다"는 이 수정의 목적 자체를 무너뜨린다. advisory 출력을 분기 앞으로 옮겼다.
3. **[minor] `AGENTS.md`가 제품 경로로 집계 — 수정.** AGENTS.md는 진입 문서인데 pathspec
   제외 대상이 아니라, AGENTS.md와 handoff를 함께 고치는 세션 종료 커밋이 **자기 자신의 sha를
   요구**하게 되어 충족 불가능했다. `:(exclude)AGENTS.md`를 추가했다.
4. **[nit] `CI=false`가 CI로 취급 — 수정.** `isCI()`가 `'false'`/`'0'`을 제외한다.
5. **[minor] `engines: >=20`이 의존성 범위보다 넓음 — 수정.** node 21·26이 프로젝트 검사를
   통과하고 의존성에서 거부된다. `better-sqlite3`가 선언한 `20.x||22.x||23.x||24.x||25.x`를
   그대로 쓴다.

### 수용한 것 (수정하지 않음)

- 2차 리뷰어는 `CI=true npm test`, `npm run build`, `npm run validate:context`,
  `npm run session:close`를 샌드박스에서 거부당했다(env 접두사·npm run 불허). 그래서 그 모드의
  검증은 하지 못했다고 명시했다. **메인이 4모드(로컬/PR/main/CI=true) 전부를 직접 실측**해
  393 pass / 0 fail을 확인했다. 리뷰어의 미검증 항목을 메인이 대체 검증한 것이다.

### 리뷰어가 잘못 판정한 것

- 없음. 1차 리뷰의 `infix NEAR`와 달리 이번 발견은 4건 모두 재현됐다. 특히 #1·#2는 실측으로
  확인했다 — `GITHUB_REF=refs/heads/main`에서 stale handoff가 보고됨, 실패와 함께 advisory가
  출력됨.

### 메인이 추가로 발견한 것 (리뷰어 지적 밖)

`withoutCI` 헬퍼가 `GITHUB_REF`를 지우지 않아, **PR 모드에서 스위트를 돌리면 3건이 실패**했다
(면제가 여전히 활성). 로컬·CI=true에서는 통과하므로 놓치기 쉬웠다. 4모드를 모두 돌려 발견했고
헬퍼가 3개 신호를 모두 저장·복원하도록 고쳤다.
