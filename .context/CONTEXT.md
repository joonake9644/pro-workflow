# CONTEXT.md — pro-workflow-lab

## 세션 기준선 (실측, 2026-09-27T20:15+09:00)

직전 세션(2026-09-10) 기준선을 재실측 후, 테스트 인프라 결함 remediation 완료.

| 항목 | 명령 | 실측 결과 |
|------|------|-----------|
| build | `rm -rf dist && npm run build` | exit 0 |
| typecheck | `npx tsc --noEmit` | exit 0, 출력 없음 |
| test | `npm test` | **21 pass / 0 fail**, suites 8 |
| test (다중 버전) | node v20.11.0 / v22.17.0 / v24.19.0 | 3버전 모두 **exit 0, 21pass/0fail** |
| ci.yml 들여쓰기 | 스텝 간격 6/8 스페이스, 탭 없음 | 이웃 스텝과 일치 |
| git | `git status --short` | `M ci.yml`, `M package.json`, `M package-lock.json`, 신규 3경로 |

## 이번 세션 작업 (#002·#003) — TDD 사이클 실측 기록

### #002 test glob 비재귀 → `scripts/run-tests.js` 도입

RED: `src/db/__tests__/index.test.ts` 작성 → `npm test`가 **14 pass / 0 fail** (신규 테스트 미실행 = false-green).
직접 실행 시 3 pass 확인 → 테스트 자체는 유효, 결함은 하네스.
GREEN: `scripts/run-tests.js`(CommonJS, `src/**` 재귀 walk) → 17 pass.
깊이 검증: `src/optimizer/probe/deep/__tests__/probe.test.ts` 심었을 때 신규 runner는 **18 pass(실행됨)**, 구 스크립트는 **14(미발견)**. 결함 유형 제거 확인 후 probe 제거.

### #002 설계 결정 — node 자체 glob은 채택하지 않음 (실측 근거)

`npx tsx --test "src/**/*.test.ts"`(node 자체 glob)는 node 20에서 `Could not find ...`로 **실패**实测. 문서상 `globPatterns`는 v22.6.0+.
`engines: node>=18`, CI matrix `[18,20,22]`이므로 이 방식은 CI 18/20 레그를 깨뜨림.
셸 glob(`src/*/__tests__/*.test.ts`)은 3버전 전부 통과하나 **깊이 1단계 고정** → 동일 유형 false-green 재발 위험.
→ 최종: `fs` 수동 재귀 walk 기반 자체 runner. Node 18 호환 API만 사용.

### #003 CI 테스트 게이트

RED: `src/__tests__/ci.test.ts` 작성 → **1 fail, exit 1** (ci.yml에 `run: npm test` 없음, 실측 grep 0건과 일치).
GREEN: `.github/workflows/ci.yml` `build` job에 `Run tests` 스텝(`run: npm test`) 추가 → 21 pass / exit 0.
회귀 방지 assertion: `npm test`가 node-version matrix를 쓰는 job에 속하는지, `continue-on-error: true` / `npm test ... || true` 로 실패를 은폐하지 않는지 검증.

## Domain Map (실측)

| 도메인 | 파일 | 줄 | 커버리지 |
|--------|------|-----|----------|
| [Infra] | scripts/run-tests.js | 60 | 커버됨 |
| [Optimizer-순수] | apply/aggregate/clip | 149 | 커버됨 |
| [Optimizer-순수] | trainer.ts | 362 | 부분 — `stripExistingStamp`만 |
| [Optimizer-LLM] | llm/reflect/validate/slow/parse/hash | 483 | 0건 |
| [Optimizer-Store] | store.ts | 322 | 0건 |
| [Storage] | db/index.ts, store.ts, schema.sql | 806 | 부분 — `getDefaultDbPath`만 |
| [Search] | fts.ts, embeddings.ts | 320 | 0건 |
| [Distribution] | scripts/ (기존 38 JS) | 2,459 | 0건 |

## 체크포인트 로그

- [2026-09-10] 신규 세션 초기화. 기준선 실측 완료.
- [2026-09-27] 기준선 재실측 — 드리프트 없음. 무테스트 15/18 파일, CI 테스트 미실행 실측 확정.
- [2026-09-27] #002 GREEN — test runner 도입, 3버전 검증, 깊이 결함 제거 확인.
- [2026-09-27] #003 GREEN — CI test 게이트 추가, exit 0 확인. 다음: #004 [Storage] db 도메인 TDD.

## 미검증 항목 (추측 금지 — 반드시 실측 필요)

- **CI 실제 실행 미검증**: 로컬에 YAML 파서(pyyaml/ruamel/yq/js-yaml 모두 없음)와 원격 CI 로그 접근이 없음. 들여쓰기 대조는 확인했으나 GitHub Actions 실 실행 결과는 push/PR 후 확인 필요 → TODO #007.
- Node 18 실측 미수행(nvm에 v18 미설치). runner는 fs 수동 재귀만 사용하나 18 실측은 미확인.

## [#008~#009] 경량 하네스 설치 + 자체 감사 (2026-09-27T21:35+09:00)

### 후보 비교 (실측)
| 후보 | 규모 | 판단 |
|------|------|------|
| `planning-continuity-harness-docs` | 지시서 208줄, 실제 파일 3개 | `.harness/*.json` + `docs/decisions` 구조 요구 → 이 리포(소스 2,544줄)엔 과중. **이식 원칙만 차용** |
| `somatlas/AGENTS.md` | 58줄, 8KB 캡, `validate:context` 센서 | **채택** — 얇은 지도 + 센서 + 전역 `session-wrap` |
| `docstudio` / `applygo36` | AGENTS.md 624 / 586줄 | 과중, 제외 |

15개 프로젝트가 이미 `session-wrap`을 공통 세션 종료 하네스로 사용 중(실측 grep). `session-wrap`은 전역 스킬이라 재설치 불필요.

### 설치한 것
- `scripts/validate-context.js` — 결정론적 센서(AI·네트워크 0, 읽기 전용)
- `scripts/__tests__/validate-context.test.js` — fixture 24건
- `package.json`: `check` / `validate:context` / `verify`(= check → test → validate:context)
- `ci.yml` `build` job에 `Validate session context` 스텝
- `AGENTS.md` — 세션 시작 규칙(점진적 노출) + 강제 장치 표

### 센서가 검사하는 것
AGENTS.md 존재·8KB 캡 / `.context/STATE` 필수 7필드 존재와 타입 / checkpoint 비어있지 않음 /
CONTEXT·TODO·glossary 존재·비어있지 않음 / 추적 문서 5개에 절대 홈경로 없음.
위반 시 고칠 파일·예상값·실제값을 출력하고 exit 1.

### 설치하지 않은 것과 이유
- `pre-commit` 훅 연결: 이 클론은 `core.hooksPath` 미설정이고 `scripts/commit-validate.js`는 opt-in 구조다. `AGENTS.md`에 그 사실을 명시했다.
- `.harness/*.json` 전체 구조: §6 검사 9종 중 5종만 이 리포트 규모에 맞게 구현했다. 나머지는 TODO #012~#013.

## [#009] 감사에서 발견해 수정한 결함 (서브에이전트 1건 → 메인이 재현 검증)

| 등급 | 결함 | 메인 재현 | 수정 |
|------|------|-----------|------|
| major | STATE가 `false`/`null`/`0`/`""`/배열/숫자/문자열이면 **exit 0 통과** | `node scripts/validate-context.js <dir>` 전 케이스 exit=0 확인 | 타입 가드 추가 → 9종 전부 exit 1 |
| major | truthy 비객체에서 `TypeError` 크래시, file/expected/actual 미출력 | `STATE=5` → `validate-context.js:63` TypeError 확인 | 파싱 성공 여부 별도 추적으로 교체 |
| major | `validate:context` 스텝을 지워도 아무 테스트가 RED가 되지 않음 | 스텝 삭제 후 `ci.test.ts` **4 pass / 0 fail** | `ci.test.ts`를 GATES 테이블로 일반화 → 삭제 시 **2 fail** |
| (테스트 공백) | missing-STATE 규칙에 테스트가 없음(뮤턴트 M9) | 신규 테스트 통과 확인 → 규칙은 정상, 테스트만 없었음 | 테스트 추가 |

## 하네스 자체의 한계 (설치하지 않은 것을 감추지 않음)

감사가 만든 위반 fixture 25개 중 **23개가 통과**했다. 지시서 §6의 9종 검사 중 **4종만** 구현
(진입문서 크기, STATE 스키마, 컨텍스트 파일 존재, 홈경로 정규식). 미구현 5종:
포인터 정합성, NORTH STAR 귀속, interrupt 복귀점, 승인 digest, ADR/evidence 계약, 경로 경계.
지시서 §7이 이름으로 지목한 "한 줄짜리 가짜 증거"와 "저장소 밖 symlink"는 **둘 다 통과**한다.
모두 TODO #010~#014에 근거와 함께 기록했다. 즉 설치한 것은 **컨텍스트 파일 린터이지
지시서가 요구한 연속성 하네스 전체가 아니다**.

## [#010~#015] 하네스 결함 9종 수정 (2026-09-27T22:20+09:00)

감사에서 지적된 23/25 통과 결함 중 **이 리포 구조에 해당하는 9종을 구현**했다. fixture 58건.

| 추가된 검사 | 명세 근거 | 이전 | 이후 |
|------------|----------|------|------|
| 심볼릭 링크가 저장소 밖으로 나가는지 | §6-126 | 미구현 | realpath 기반. 잎뿐 아니라 상위 디렉터리 symlink도 판정 |
| 커밋된 문서 전체의 절대 홈경로 | §2·§7 | 5개 파일만, `/Users/`만 | 전체 텍스트 문서 + `/home/`·`C:\Users\` + 확장자 무첨부 파일(NULL 검사로 이진 제외) |
| 가짜 증거 차단 | §7-134 | 미구현 | `lifecycle: complete`는 200B 이상 + 명령/결과 인용 증거를 요구. 한 단어·무언급은 실패 |
| todo_active 포인터 정합성 | §6-118 | 미구현 | STATE의 활성 ID가 TODO.md에 없으면 실패 |
| TODO.md 작업줄 존재 | §6-118 | 미구현 | `- [ ] #NNN` 형태가 하나도 없으면 실패 |
| AGENTS.md 하한 | — | 0바이트·공백도 통과 | 200B 미만 실패 (상한만으로는 stub이 지도 역할을 못함) |
| session 비어있지 않음 | — | 빈문자열 통과 | trim 후 빈 값 실패 |
| todo_stage enum | — | 미검증 | RED/GREEN/REFACTOR/POST-CHECK만 허용 |
| ADR 상태 라인 | §6-122 | 미구현 | `상태: 제안\|채택\|대체됨(ADR-N)\|폐기` 필수 |

예외 메커(`validate-context:allow-home-path`)는 **해당 줄의 첫 누출만** 면제한다. 같은 줄의
두 번째 누출은 보고하므로 면제를 경로 은닉에 쓸 수 없다. 면제된 위치는 성공 출력에 전부 노출된다.

### 작업 중 테스트가 잡은 제 결함 5건 (자기 강제的实际 성적)
1. `walk()`로 바꾸면서 확장자 없는 `.context/STATE`가 스캔에서 빠짐 — 기존 테스트가 RED로 검출.
2. macOS에서 `/var` vs `/private/var` 때문에 root를 realpath하지 않아 **전 파일이 탈출 오판**(44건 실패).
3. ADR 정규식의 `\b`가 CJK(한글) 뒤에서 성립하지 않음 — `\w=[A-Za-z0-9_]`라서.
4. 예외 마커가 줄 전체를 면제해 같은 줄의 실제 누출을 은닉할 수 있었음.
5. `check()`가 배열에 `exemptions` 프로퍼티를 붙여 `deepEqual`을 깨뜨림 — `{ failures, exemptions }` 반환으로 변경.

### 부분 구현 (완료로 보고하지 않음)
- 증거 산출물의 **모양**은 검증하지만 HEAD 커밋과의 연결은 검증하지 않는다 → #016
- ADR 상태 라인만 검증하고 Task Contract 승인 기준과의 교차검사는 없다 → #017

### 스코프 밖으로 남긴 것 (의도적)
지시서 §3은 "모든 프로젝트에 같은 검사를 억지로 적용하지 않는다"고 명시한다. 이 리포에 없는
개념을 만들어내면 발명 구조가 되므로 설치하지 않았다: NORTH_STAR 귀속(#018), plan revision
SHA-256 digest(#019), interrupt/return_to 삼중조(#020). 각 TODO에 사유를 기록했다.

## [#021~#022] 독립 리뷰 반영 (2026-09-27T22:55+09:00)

리뷰: `opencode run --model opencode-go/deepseek-v4.1-flash` 별도 프로세스, **이번엔 완주**(688줄).
등급: **blocker 0, major 1, minor 7, nit 3**. 세션 종료 게이트 규칙에 따라 major는 반드시 수정.

### major — 홈경로 정규식이 7가지 형태를 놓쳤다 (메인이 재현 검증)
`HOME_LEAK_RE`이 홈 세그먼트 앞에 구분자(`[\s"'`(]`)를 요구하고 뒤에 구분자를 요구했다.
아래는 **모두 실제 누수인데 통과**했다:

| 형태 | 결과 |
|------|------|
| `home:/Users/<name>/project/x` | 놓침 |
| `link:/Users/<name>/project/x` | 놓침 |
| `VAR=/Users/<name>/repo` | 놓침 |
| `PREFIX=/Users/<name>` | 놓침 |
| `see /Users/<name> here` (후행 슬래시 없음) | 놓침 |
| `C:/Users/<name>/project/x` (Windows 정슬래시) | 놓침 |
| `git blame /Users/<name>` | 놓침 |

내가 만든 fixture가 전부 "공백 + 후행 슬래시" 형태뿐이라 **자기 테스트가 이 결함을 못 봤다.**
원인: 구분자 클래스 의존. 수정: `(?<![\w./])` lookbehind + 후행 구분자 제거.
엔드투엔드 13케이스로 검증 — 검출 9종 전부, 오탐 4종(`/usr/local`, 상대경로, URL, 일반 텍스트) 0.
fixture에 회귀 테스트 15건 추가.

### minor 중 수정한 것
- 깨진 symlink에서 `fs.statSync`가 던져 스택트레이스로 죽던 것 → `file/expected/actual` 보고로 교체.
- 예외 마커가 면제한 경로를 출력하지 않아 실제 누출 은닉이 눈에 안 보이던 것 → 면제 항목을
  `파일:줄 + 면제된 경로`로 출력. 이 문서에도 "은닉 불가"라고 적어둔 근거.
- `ci.test.ts`의 "matrix job 소속" 단언이 약해 게이트를 다른 job으로 옮겨도 통과하던 것 →
  job 범위 파싱으로 강화. 옮기면 **1 fail** 되는 것을 실측 확인.

### 남긴 minor/nit (TODO #023·#024)
- `ci.test.ts`가 `|| :`·`; true` 같은 무음화는 아직 못 잡음.
- `package.json`의 `files`가 `scripts`를 포함해 검증·테스트 스크립트가 npm 배포물에 실림.

## [#004] [Storage] db 도메인 TDD (2026-09-28T00:10+09:00)

`src/db/__tests__/store.test.ts` — **51 fixture**. API 맵은 explore 서브에이전트가 런타임 검증까지
마쳐 제공했고, 함정 5건은 메인이 직접 재현한 뒤 테스트에 고정했다.

| 그룹 | 수 | 고정한 동작 |
|------|----|------------|
| initializeDatabase | 5 | FK ON, 스키마 생성, 멱등, 없는 상위 디렉터리면 `TypeError`(SqliteError 아님), **상위 디렉터리를 만들지 않음** |
| learnings | 13 | times_applied 0, project 필터가 project-less 행도 포함, 빈 문자열 필터는 전체 반환, updateLearning의 null은 "유지", NOT NULL, **FK 실패 시 트랜잭션 롤백**, FTS 트리거 동기(갱신·삭제) |
| sessions | 6 | 중복 id 무시, ended_at 스탬프, 카운터 누적, **명시적 null이 카운터를 영구 NULL로**, limit honored |
| wikis | 5 | 같은 slug·같은 위치 갱신, **다른 root_path 재등록은 plain Error(`code` 없음)**, deleteWiki cascade |
| wiki pages | 8 | (slug, rel_path) upsert, FK·NOT NULL, FTS snippet·**rank가 음수**(bm25이므로 오름차순이 최우선), 빈 질의 조기 반환, FTS 메타문자 survives |
| seeds | 7 | pending 기본, depth 정렬 우선, **peek은 비변경·claim은 active 전환**, status 무검증 저장 |
| lifecycle | 2 | close 멱등, 닫힌 후 TypeError, 원시 핸들 노출 |

### anti-tautology 실측 (뮤테이션 8/8 검출)
프로덕션 코드를 실제로 고쳐 이 테스트가 RED가 되는지 확인했다.

| 변조 | 결과 |
|------|------|
| `upsertWiki` 위치 가드 제거 | fail=1 |
| `claimPendingSeed` 의 active 전환 제거 | fail=1 |
| `searchWiki` 빈 질의 조기 반환 제거 | fail=1 |
| `updateLearning` 의 project 무시 해제 | **fail=5** |
| `nextPendingSeed` 정렬을 created_at 단독으로 | fail=1 |
| `addLearning` 트랜잭션 무력화 | fail=1 |
| `getAllLearnings` 프로젝트 필터 제거 | fail=1 |
| `incrementTimesApplied` 를 덮어쓰기로 | fail=1 |

### ABI 발견 — 이 리포의 다중 버전 검증에 구조적 제약
`better_sqlite3.node`는 **한 ABI로만 빌드**된다. 공유 `node_modules` 상태에서 node를 전환하면
20/22에서 49건이 실패했다(테스트 결함이 아니라 로드 실패). 버전별 `npm rebuild better-sqlite3`
후에는 **3버전 모두 195/195 통과**. CI는 매 레그마다 `npm ci`를 하므로 영향이 없다.
→ 로컬 다중 버전 검증 시 버전 전환 후 반드시 재빌드해야 한다.
