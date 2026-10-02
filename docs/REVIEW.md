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

---

## 3차 리뷰 (세션 종료, 전체 범위) — 2026-10-01

REVIEW_MODEL: opencode-go/deepseek-v4.1-flash
REVIEW_SCOPE: `c00718d..HEAD` (세션 전체). #028 트리거 마이그레이션이 미리뷰 상태였음
REVIEW_RESULT: blocker 0, major 1(수정), minor 2(수정), nit 0

### [major] `isSyntheticMergeCheckout`의 부모 수 fallback이 너무 넓음 — **수정**

리뷰어 지적: `GITHUB_REF`가 pull이 아니어도 `isCI()`이고 HEAD가 2-부모면 면제한다. main push가
merge commit을 가질 수 있으므로(GitHub 기본 merge 전략), main에서 freshness가 조용히 꺼진다.
커밋과 코드 주석은 "main은 검사한다"고 반대로 적혀 있었다.

**메인이 직접 재현했다.** 2-부모 merge HEAD + `GITHUB_REF=refs/heads/main`에서 freshness가
면제되는 것을 확인 — 의도와 정반대. 수정: `GITHUB_REF`가 설정돼 있고 pull이 아니면 **부모 수
fallback을 쓰지 않는다.** fallback은 `GITHUB_REF`가 없을 때만이다.

수정 검증: 같은 재현 fixture에서 `refs/heads/main`은 **검사함**, `refs/pull/`은 면제,
`GITHUB_REF` 없음+CI+merge는 면제, 로컬은 검사함. RED 테스트(2-부모 merge repo + main ref →
stale handoff 보고)를 추가하고, 수정을 되돌리면 그 테스트가 RED가 되는 것까지 확인했다.

### [minor] 트리거 write-path 테스트 공백 — **수정**

핵심 주장("두 BEFORE 트리거가 모든 write path를 닫는다")이 SQLite 시맨틱 추론에만 의존하고
테스트가 없었다. `INSERT OR REPLACE`·`REPLACE INTO`·`ON CONFLICT DO UPDATE` 세 경로를 실측해
모두 거부됨을 확인하고 테스트로 고정했다.

### [minor] 두 계층의 에러 메시지 어구 불일치 — **수정(판정 근거 기록)**

트리거는 `must be one of ...`, 앱 가드는 `is not one of ...`. 리뷰어는 어느 계층이 거부했는지
식별 불가라고 봤다. **실측 결과 두 메시지 모두 `one of pending, active, done, failed`를
포함한다** — 공유 패턴으로 양쪽 모두 인식 가능하고, 접두사가 달라 어느 계층인지는 오히려
구분된다. 리뷰어 지적이 실제보다 강했다. 공유 어구가 유지되도록 테스트로 고정했다.

### 리뷰어가 검증하지 못한 것 (샌드박스 거부)

리뷰어는 `GITHUB_ACTIONS=... npm test`, `CI=true npm test`, `node -e`, `sqlite3`을 거부당했다.
따라서 UPSERT 트리거 동작과 CI 모드 숫자는 INFERENCE였다. **메인이 4모드 전부와 UPSERT 경로를
직접 실측**해 대체 검증했다(397 tests / 0 fail, 세 경로 모두 거부).

---

## 4차 리뷰 (직전 수정분 `d7af03f..HEAD`) — 2026-10-01

REVIEW_MODEL: opencode-go/deepseek-v4.1-flash
REVIEW_SCOPE: `d7af03f..HEAD` — 3차 리뷰의 major 수정(`f3f42e0`)이 대상
REVIEW_RESULT: blocker 0, major 1(수정), minor 1(포섭), nit 1(수정)

### [major] 수정이 조용한 건너뛰기를 hard failure로 바꿨다 — **수정**

리뷰어 지적: 이전 술어 "non-pull ref ⇒ HEAD는 이름 붙일 수 있다"는 **거짓**이다. main으로
들어오는 merge commit 중 productHead가 **그 merge 자신**인 경우(양쪽 부모가 product 경로를
건드림), handoff는 존재하지 않던 커밋을 이름 붙일 수 없다. 이전 수정 전에는 부모 수 fallback이
면제했는데(advisory), 수정 후에는 **충족 불가능한 hard failure**가 된다.

**메인이 end-to-end로 재현했다.** 양쪽 부모가 product 파일을 건드리는 merge를 만들어
`GITHUB_REF=refs/heads/main`으로 검사 → freshness 실패 확인. dependabot merge가 main에
들어오는 실제 경로다.

**진짜 참 조건은 "non-pull ref"가 아니라 "HEAD가 이름 붙일 수 없는 merge"다.** 술어를
`isUnnameableHead`로 교체: `refs/pull/`이거나, HEAD가 merge이고 `productHead === gitHead`일 때
면제. TREESAME한 merge는 `productHead`가 부모로 해소되어 **이름 붙일 수 있으므로 계속 검사**한다.

양방향 검증:
- 이전 over-fix로 되돌리면 → "unnameable merge 면제" 테스트 RED
- 원래 버그로 되돌리면 → "nameable merge 검사" 테스트 RED

**교훈: 면제 조건을 세울 때 "그 조건이 참인 다른 경우"를 먼저 열거한다.** 3차 리뷰의 실수는
`refs/heads`를 "이름 붙일 수 있음"과 동일시한 것이었다. main merge가 반례다.

### [minor] merge queue ref — **새 술어가 포섭**

`refs/heads/gh-readonly-queue/...`도 synthetic merge를 가진다. 새 술어는 ref가 아니라
"merge + productHead===HEAD"로 판정하므로 이 경우도 면제된다. 이 리포는 `merge_group` 트리거가
없어 현재는 잠복이었지만, 술어 교체로 함께 해결됐다.

### [nit] fixture의 env/branch 불일치 — **수정**

테스트 헬퍼가 env에 `refs/heads/main`을 선언하면서 fixture 브랜치는 `git init` 기본값이었다.
그리고 merge fixture가 중복이었다. 다시 쓰면서 `base`를 실제로 읽도록 했고, 양쪽 부모가
product를 건드리는 fixture(`unnameableMergeRepo`)와 TREESAME fixture(`mergeCommitRepo`)를
의도적으로 분리했다.

### 검증

4모드 **398 tests / 398 pass / 0 fail**, tsc exit 0, build exit 0, session:close OK.
뮤턴 A/B 양방향 RED 확인.
