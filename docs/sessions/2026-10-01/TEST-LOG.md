# TEST-LOG — 2026-10-01

## baseline (세션 시작)

`dirty: true`로 시작. `c00718d`에 미커밋 제품 변경이 쌓여 있었고 `docs/next-session-prompt.md`는
2026-09-28 세션 종료 시점의 것을 그대로 담고 있었다. **STATE의 `checkpoint`가 정본**이므로
handoff가 지시하는 #025·#031·#005를 재수행하지 않았다.

**ABI 함정 재현**: `npm run verify`가 `ERR_DLOPEN_FAILED`(NODE_MODULE_VERSION 115 vs 137)로
전 파일 크래시. node v24.19.0인데 바인딩이 예전 ABI. `npm rebuild better-sqlite3`(exit 0) 후 해소.
문서에 적힌 대로였지만 이번에도 재현했다.

| | baseline | 중간 | 최종 |
|---|---|---|---|
| tests | 293 | 373 | **391** |
| suites | 22 | 34 | 35 |
| test files | 11 | — | 15 |
| pass | 289 | 369 | **391** |
| fail | **4** | 4 | **0** |
| tsc | exit 0 | exit 0 | exit 0 |
| build | exit 0 | exit 0 | exit 0 |

**baseline의 fail 4건은 전부 `scripts/__tests__/validate-context.test.js`의 "real repository" 계열**이고
원인은 단 하나 — handoff 신선도. **제품 코드 결함이 아니다.** exit 1이라 baseline이 빨갛다.

### fail 4건이 1건이 된 과정 (진짜 원인은 두 겹이었다)

1. handoff 갱신으로 **4 → 1.** 남은 것은 `AGENTS.md` 8841 B가 8KB advisory(8192 B)를 초과.
   `validate-context`는 이걸 exit 0으로 통과시키지만, 테스트는 실패로 본다 — **advisory인데
   hard fail인 비대칭**이 있다. `git stash`로 handoff와 분리해 어느 쪽인지 먼저 확정했다.
2. `AGENTS.md`를 상세→`.context/GATES.md`로 옮겨 7781 B로 낮춤 → **1 → 0.**

## 최종 실측

```
run-tests: discovered 15 test file(s)
ℹ tests 391
ℹ suites 35
ℹ pass 391
ℹ fail 0
```

로컬 · `CI=true` · `GITHUB_ACTIONS=true` 세 모드 모두 **391 pass / 0 fail**.

- `npx tsc --noEmit` → exit 0 (출력 없음)
- `npm run build` → exit 0
- `npm run validate:context` → OK. 2건의 선언된 홈경로 예외(`docs/next-session-prompt.md:11`,
  `docs/sessions/2026-09-28/next-session-prompt.md:13`)
- `npm run session:close` → **OK** (로컬·CI=true 양쪽)
  ```
  session:close: OK (pro-workflow-lab)
    live run: passed 391 / failed 0 / suites 35 / test files 15
    docs/next-session-prompt.md records those counts
  ```

## PR CI 실증에서 나온 두 번째 결함

PR #1을 올려 CI를 실증했다. **3레그 전부 실패**했는데, 이미 고친 TAP 리포터 문제가 아니라
**freshness 게이트가 PR에서 구조적으로 통과 불가능**했기 때문이다.

```
CI 로그:  expected: 'commit 728bee0 (newest product change) or newer', actual: 'absent'
```

`728bee0`은 GitHub이 PR마다 만드는 **synthetic merge commit**이고, 저자의 클론에는
존재하지 않는다(`git cat-file -t 728bee0` → `Not a valid object name`). 브랜치를 작성할 때
존재하지 않았던 sha를 handoff가 이름 붙일 방법이 없으므로 **충족 불가능**이지 미충족이 아니다.

수정: CI에서 freshness를 면제하고, **면제 사실을 advisory로 노출**한다. 조용히 넘어가면
"비활성화된 검사"가 "충족된 검사"로 읽히기 때문이다. `npm run session:close`가 실제 재측정
비교를 계속 하므로 게이트의 핵심은 CI에서도 살아 있다.

`CI` env 신뢰성은 공식 문서로 확인: Variables reference는 `CI`를 "Always set to `true`"이면서
동시에 "overwrite할 수 있다"고 적고, `GITHUB_ACTIONS`를 "Always set to `true`"로 적는다.
그래서 **둘 다** 확인한다.

### node 18 제거 (#035 종료)

run 36831658193의 build(18)은 `npm ci`가 65초 후 canceled였다. `EBADENGINE`:
`better-sqlite3@12.8.0` required `20.x||22.x||23.x||24.x||25.x`, current `v18.20.8`.
프로젝트 `engines`는 `>=18`이라 모순이었다. 사용자 승인 후 `engines`를 `>=20`으로 올리고
매트릭스를 `[20, 22, 24]`로 바꿨다. **선언과 실제 지원 범위를 일치시켰다.**

## 리포터 형식 — 버전별 실측 (이번 세션의 핵심 발견)

같은 suite를 세 node 버전에서 실행해 기본 리포터가 다르다는 것을 **직접 확인**했다.

| node | 비TTY(파이프) 출력 |
|---|---|
| v20.11.0 | `# pass 13` / `# fail 0` (tap) |
| v22.17.0 | `# pass 13` / `# fail 0` (tap) |
| v24.19.0 | `ℹ pass 388` (spec) |

node는 v23부터 비TTY에서 spec이 기본이다. 게이트가 `ℹ`만 파싱했으면 **CI 매트릭스
`[18, 20, 22]` 3레그 전부에서 exit 1**이었다. 게이트를 CI에 추가하면서 스스로 통과 불가능한
상태였다. TAP 형식 fixture 테스트로 RED를 고정하고 수정한 뒤 GREEN.

부수 발견: `num()`이 `new RegExp(source, 'g')`로 플래그를 **덮어쓰면서** `m`을 버리고 있었다.
앵커된 패턴은 그래서 전부 null이었다. 플래그를 합치는 방식으로 고정.

## 뮤턴

| 배치 | 최종 | 1차 survived |
|---|---|---|
| #006 optimizer | **25/25 검출** | 3 |
| #026~#030 storage | **17/17 검출** | 3 |

### survived를 감추지 않고 나눠 처리한 내역

**#006의 3건:**
- 2건은 **내 뮤턴 스크립트가 동치 변조를 만든 것.** `.trim()`을 "치환"했는데 `.trim()`이 그대로
  남았고, `Math.max(0,...)` 하한 제거는 이미 `valCount > 0` 가드가 가려 관측 불가였다.
  **동치 변조는 살아남는 게 아니라 애초에 변조가 아니다.** 스크립트를 고쳐 재실행
- 1건은 실제 테스트 공백 — `parsePatches('{"patches":[null]}')` 경로 미커버. RED 2건 추가
- `Math.max(0,...)`는 죽은 방어로 판명돼 **삭제**(M6 교훈)

**storage의 3건:**
- 1건은 실제 공백 — `enqueueSeed` 가드에 테스트 없었음. RED 3건 추가
- 2건은 동치 변조 — `mkdir(recursive:true)`가 존재 디렉터리에서 no-op이라 `existsSync` 가드 제거가
  관측 불가, `dirname(':memory:')`가 이미 존재하는 cwd라 `:memory:` 분기 제거도 관측 불가.
  **두 경로 모두 아무것도 막지 않는 방어였고, 코드에서 삭제했다**

**`:memory:` 테스트를 mkdir 호출 계측으로 바꾼 이유**: 결과 디렉터리가 cwd이므로 "생성됐는가"로는
가드 여부를 구분할 수 없다. 계측만이 유일한 방법이다.

## 설치 실측 (캐시 없는 신규 환경)

```
npm ci --cache <빈 캐시>   →  added 46 packages, 2.5초
바인딩: node_modules/better-sqlite3/build/Release/better_sqlite3.node 존재 (1913808 B)
npm test                   →  239 tests / 238 pass / 1 fail
node -e 구동              →  정상
```

`npm approve-scripts`로 better-sqlite3·esbuild·fsevents를 승인하기 전에는 설치 스크립트가
차단돼 있었다. 지금은 캐시가 없어도 prebuild 바이너리가 받아져지므로 C++ 컴파일이 필요 없다.
**allowScripts 키는 정확한 버전으로 고정돼 있으니 의존성 버전이 바뀌면 재승인이 필요하다.**

## 미검증

- **GitHub Actions 실제 실행** — push 전이라 run 0건. 고친 게이트가 CI에서 도는지 미확인(#007)
- **node 18 레그** — 미설치. `better-sqlite3@12.8.0` engines가 `20.x||22.x||23.x||24.x||25.x`라
  `npm ci`에서 실패할 가능성이 높다. **실측하지 않았다**(추측으로 보고하지 않음)(#035)
- **node 20·22에서의 게이트 통과** — 리포터 형식은 실측했지만, 게이트를 20·22에서 end-to-end로
  돌리지는 않았다. ABI 리빌드 필요(15분)이라 이번 세션 범위 밖
- **CHECK 제약이 기존 DB에 적용되지 않음** — 마이그레이션 미작성
- **amuTE 실행 스크립트는 저장소 밖에 있음** — `/var/folders/.../T/opencode/mutate.sh`,
  `mutate-storage.sh`. 커밋 대상이 아니며 세션 종료 시 사라진다
- **서브에이전트가 탐색 중 실수로 `api.anthropic.com`에 실제 요청 1건** 보냈음(더미 키).
  이후 모든 프로브는 stub 경로이며 네트워크 0건
- `trainer.ts`·`optimizer/store.ts`는 커버리지 0 유지 — `trainer.ts:338`의 `Math.random()` 때문에
  비결정적이라 특정 패치 궤적을 고정하는 테스트는 flaky가 된다(#036)
---

## #028 잔여 — 기존 DB 마이그레이션 (트리거)

### 왜 CHECK가 아니라 트리거인가

앞서 `schema.sql`에 CHECK를 넣었지만 `CREATE TABLE IF NOT EXISTS`는 **기존 테이블에 소급하지
않는다.** 프로덕션 DB를 읽어 확인했다: `sqlite_master.sql`에 CHECK 없음, `user_version` 0,
마이그레이션 기구 자체가 없음.

두 방식을 실측 비교했다:

| 방식 | 기존 DB 도달 | 위험 |
|---|---|---|
| 테이블 재생성(CHECK) | 가능 | 데이터 복사·자기참조 FK·인덱스 재생성·`foreign_keys=OFF` 필요 |
| **`CREATE TRIGGER IF NOT EXISTS`** | **가능(별도 문장이라 기존 테이블에 적용)** | 없음. additive, idempotent |

트리거가 훨씬 안전하고 동일한 보장을 준다. **게다가 둘을 함께 두면 BEFORE 트리거가 항상 먼저
발화해 CHECK 에러가 영원히 안 나온다** — 실측 확인. 아무것도 막지 않는 방어가 되므로 CHECK를
제거하고 트리거 단일 메커니즘으로 통일했다(M6 교훈).

INSERT·UPDATE 두 트리거가 필요하다. 큐가 `status`를 UPDATE로 바꾸기 때문이다.

### 프로덕션 DB 사본으로 마이그레이션 실측

```
BEFORE triggers: 0        BEFORE user_version: 0
AFTER  triggers: wiki_seeds_status_valid_insert, wiki_seeds_status_valid_update
AFTER  rows: 1:pending:null 2:active:1 3:done:1 4:failed:1   (데이터·자기참조 보존)
FK 무결성: []             UPDATE BOGUS => 거부(정상)
```

`initializeDatabase`가 열 때마다 `schema.sql`을 재실행하므로 기존 DB는 다음 오픈에 자동
업그레이드된다. 레거시 DB(트리거 없음 + BOGUS 행 존재)를 만들어 재실행 후 가드가 설치되는지
테스트로 고정했다.

### 뮤턴 5/5

| 변조 | 결과 |
|---|---|
| UPDATE 트리거 제거 | killed |
| INSERT 트리거 제거 | killed |
| 상태 목록에서 failed 제거 | killed |
| WHEN 조건을 항상-false로 | killed |
| RAISE(ABORT) → RAISE(IGNORE) | killed |

`BEFORE UPDATE` → `AFTER UPDATE`는 **동치 변조**로 판명돼 제외했다. AFTER 트리거의
`RAISE(ABORT)`도 문장을 롤백해 행이 `pending`으로 남는 것을 직접 실행해 확인했다
(둘 다 `threw: true`, `row status after: pending`).

### 최종

4모드(로컬/PR/main/CI=true) **394 tests / 394 pass / 0 fail**, suites 35, tsc exit 0, build exit 0.
