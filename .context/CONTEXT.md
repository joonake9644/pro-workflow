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

### anti-tautology 실측 (2026-09-28 정정)
**이 절의 이전 주장은 과대했다.** "뮤테이션 8/8 검출"이라고 적었으나, 그 8건은 **내가 고른**
항목이었고 커버리지 측정이 아니었다. 독립 리뷰어가 내가 *하지 않은* 뮤턴을 만들어 5건이 통과함을
찾아냈다(WAL pragma 미검증, rank 정렬 방향 미검증, snippet 컬럼 미검증, `getRecentSessions`
기본 limit 미검증, category COALESCE 미검증). 해당 5건을 모두 테스트로 고쳤고, 지금은 검출된다.
→ **教训: 변조에 통과한 건 통과했다고 말하면 안 된다. 변조 목록은 커버리지 지표가 아니다.**

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

## 알려진 미해결 사항 (AGENTS.md에서 이리로 이동, 2026-09-28)

### 실측 목록

- **Node 18 CI 레그 검증 불가.** `engines: >=18.0.0`이나 `better-sqlite3@12.8.0`은
  `20.x || 22.x || 23.x || 24.x || 25.x`를 요구한다. CI 매트릭스에 18이 있으나 이
  환경에 node 18이 없어 실제 동작을 확인하지 못했다.
- **fork의 GitHub Actions 미실행.** `joonake9644/pro-workflow`에 push했으나 run 기록이
  0건이다. fork는 push 트리거 워크플로가 기본 비활성이며, 활성화 여부를 확인하지
  못했다. 따라서 CI 게이트는 로컬 3버전 실측만으로 뒷받침된다.

## 문서 하네스 최신 트렌드 정렬 (2026-09-28)

### projects 전역 실측 (28개 디렉터리, explore 서브에이전트)
| 항목 | 실측 |
|------|------|
| 핸드오프 5파일 블록 `{next-session-prompt, TICKETS, DONE, CONTEXT, TEST-LOG}` | **20/28 프로젝트**에서 동일. `docs/<name>` + `docs/sessions/YYYY-MM-DD/<name>` 이중 저장 |
| `REVIEW.md` | 7개 프로젝트, 날짜 폴더 214개 중 80개 |
| `.context/STATE` 7키 JSON | 19개 프로젝트 중 15개 (4개는 비JSON으로 드리프트) |
| `docs/DONE.md` 루트 배치 | 5개 있음 / 15개 없음. `browser-design-forensics`는 **반드시 없어야 한다**고 단언 |
| `session:close` 게이트 | 스크립트 존재 15개 프로젝트 중 **CI에서 실행되는 곳 0개** |
| `validate:context` / `check:context` | CI에서 실행 2개(`pro-workflow-lab`, `docstudio`). `somatlas`은 스크립트만 있고 CI에 없음 |

**조사에서 드러난 최대 공백**: 게이트를 만들어 놓고 파이프라인에 못 박은 프로젝트가 대부분.
이 저장소는 예외가 아니라 정상이고, `validate:context`를 CI에 넣은 2개 중 하나다.

### 트렌드 근거
- Red Hat Developer (2026-07-27): AGENTS.md는 **덤프가 아니라 색인**. 150줄 미만, 소형 저장소는
  30~50줄. 문장마다 "이걸 지우면 에이전트가 실수하는가?" 를 묻는다. **자동 생성 컨텍스트 파일은
  모델 성능을 해친다**(ETH Zurich 연구). CLAUDE.md는 `@AGENTS.md` 한 줄로 충분하다.
- VS Code context engineering: "start small, iterate", "stale context는 부정확한 제안을 만든다",
  living documents, "context overload는 초점을 흐린다".
- Fowler *Harness engineering* (2026-04): guides(feedforward) + sensors(feedback).
- OpenAI *Harness engineering* (2026-02): AGENTS.md는 지도, 저장소 문서가 사실 원천, 기계적 강제.

### 채택 (센서 + 테스트로 강제)
1. **handoff 80줄 하드 캡** — somatlas ADR-0015·docstudio와 동일. 실측 76줄.
2. **`REVIEW.md` 6번째 파일** — `AGENTS.md`가 세션 종료 독립 리뷰를 필수화하면서 결과물을 남길
   자리가 없었다. 규칙과 산출물의 불일치를 닫는다. `REVIEW_MODEL`·`REVIEW_RESULT` 필수.
3. **`TOOL_LABEL` 필수** — 이 저장소의 존재 이유가 모델 비의존성인데, 쓰인 모델을 안 남기면
   드리프트가 보이지 않는다.
4. **`docs/DONE.md` 루트 금지** — 15/20이 없고 1개 프로젝트가 부재까지 단언한다.
5. **freshness** — 종료 문서가 **제품 코드** 최신 커밋을 반영해야 한다. `docs/`·`.context/` 만 건드린
   커밋은 예외(그래야 "handoff를 갱신하는 커밋"이 자기 자신을 무효화하지 않는다).
6. **진입문서 예산을 줄 단위로** — Red Hat가 제시한 150줄을 하드로, 8KB는 advisory로, 절대 한계
   12KB를 하드로. 근거: `docstudio/ADR-0002`도 8KB 하드 캡이 "규칙을 삭제하는 결과"를 내지
   근거를 남기고 advisory로 강등했다. 같은 판단을 따른다.

### 명시적으로 채택하지 않음 (오버웨이트·드리프트 증명)
- `.harness/policy.json`+`work-items.json`+`state.json` — 조사에서 **서로 호환되지 않는 스키마 2종**
  (B1 7키 / B2 5키)이 공존했다. `.context/STATE`(15/28 표준)를 이미 쓰고 있다.
- `HARNESS_NORTH_STAR` / `PLAN_APPROVAL` / `RETURN_TO` 헤더 블록 — 3개 프로젝트의 제품 특정 설계.
- `korean-ascent-ai`의 510줄 STATE — 인센서스 기록상 다른 모든 STATE보다 40배 큰 **역사적 안티패턴**.
- handoff에 전체 대화 히리를 담는 방식 — OpenAI Agents SDK의 `input_filter`가 지향하는 바와 반대.

### 이번 작업 중 내가 만든 결함 (테스트가 잡음)
- REVIEW.md를 무조건 읽어 크래시(ENOENT) — 존재 확인 후 읽도록 수정.
- `docs/DONE.md` 검사를 날짜 폴더 블록 안에 넣어, 세션 폴더가 없으면 실행되지 않음 — 독립
  docs 루트 규칙이므로 블록 밖으로 이동.
- 편집 실수 3건: 중복 `const` 선언, 함수를 문자열로 바꿈, `gitRepo`가 플래그를 `extraFiles`로 전달.

---

# 2026-09-28 세션 — #025 · #031 · #005

기준선 실측: `git fetch fork` 후 `fork/main...HEAD` = 0/0. `npm run verify` exit 0,
**239 pass / 0 fail, suites 16, test 파일 9** (node v24.19.0).

### 시작하자마자 발견한 드리프트 — handoff의 baseline이 거짓말이었다
`docs/next-session-prompt.md`는 `passed: 225`를 기록하고 있었고, 실제는 239였다.
handoff가 이름 붙인 제품 커밋 `66aa5d5`의 커밋 메시지 자체가 "239 tests"라고 적고 있어서
**handoff의 수치는 그 커밋 시점에도 이미 틀렸다.** sha 규칙은 그 커밋이 최신 제품 커밋이라
통과했고, `session:close`는 `validate:context`의 별칭이라 숫자를 아예 보지 않았다.
→ #031의 실제 구멍은 "오래된 문서"가 아니라 **"거짓 숫자를 쓴 문서가 통과한다"**였다.

## #025 [Storage] `updateLearning`이 `project`를 버림 — 수정

`src/db/store.ts:130`의 COALESCE 목록에 `project`가 없었고, 조용히 버린 채 `true`를 반환했다.

수정 전에 호출부를 전수 확인했다: `updateLearning`의 프로덕션 호출자는 **0개**
(`grep -rn` 결과 전부 테스트). project를 못 바꾸는 전제 depended-on 호출부가 없어
의미를 바꾸는 것이 안전했다.

RED: project 영속화 / null 유지 / 빈 문자열 저장 3건 추가 → **2 fail**(빈 문자열은 우연히 통과).
GREEN: COALESCE에 `project` 추가 + `project: updates.project ?? null` 바인딩 → 59/59.

뮤턴 2건 모두 검출: COALESCE에서 `project` 제거 → 2 fail, 파라미터 바인딩 제거 → 8 fail.

## #031 [Infra] 종료 게이트가 수치를 재지 않는다 — 게이트 신설

`scripts/session-close.js` 신설(142줄). `validate:context`의 구조 검사를 그대로 재사용하고,
**그다음 실제로 테스트를 돌려** handoff의 baseline 블록과 필드별로 대조한다.

- 구조 검사가 실패하면 측정조차 하지 않는다 — 나중의 성공한 측정이 결함을 덮을 수 없게.
- 실행 로그에 없는 표시는 **0이 아니라 null**로 읽는다. 표식이 없는 실행을 "0건 실패"로 바꾸면
  깨진 측정이 통과로 바뀐다.
- baseline 블록이 **없어도 실패**다. 삭제로 우회할 수 없게.
- `parseTestOutput` / `parseBaseline` / `compare` / `run`을 분리해 순수 함수를 단위 테스트한다.
  실제 CLI 경로는 재귀가 생기므로(게이트가 자기를 구는 테스트를 실행함) 스텁 주입으로 끝낸다.

배선: `package.json`의 `session:close` 배선, `ci.yml`에 스텝 추가, `ci.test.ts`의 GATES에 3번째 항목.
GATES에 넣은 이유는 계측 3건(matrix job 소속 / 실패 은폐 / tsc 이후 순서)이 자동으로 따라오게 하기 위함이다.
**기존 GATES 테이블이 CI에서 `session:close`를 실행하는 곳은 0개였다** — 전.projects 실측의 최대 공백이
이 저장소에도 그대로 있었다.

측정: stale handoff(기록 225 / 실제 239)에 대해 **exit 1**, `file/expected/actual`로 보고.

## #005 [Search] fts.ts TDD — 테스트가 버그를 3개 찾았다

`src/search/__tests__/fts.test.ts` 28 fixture. 서브에이전트(explore)가 API 맵을 냈지만
그 "VERIFIED" 표시는 **내 실행으로 전부 재확인**했다. 그 표기가 맞지 않은 항목이 실제로 있었다.

`:memory:` + `schema.sql`을 직접 exec. `initializeDatabase`를 부르면 dbPath와 무관하게
`~/.pro-workflow`를 만들기 때문에(기존 #030) 피했다.

### 발견·수정한 결함 3종
1. **`getRelatedLearnings`가 SQLITE_ERROR** — `keywords.join(' OR ')`로 만든 질의가 `sanitizeQuery`를
   거치며 `OR*`가 되어 FTS5 문법 오류. **키워드가 2개 이상인 learning이면 무조건 던진다.**
   서브에이전트가 발견했고 미검증이라 했는데, 내 실행으로 재현 확인 후 RED로 고정했다.
2. **인용 구문이 조용히 무너져 있었다** — `"zebra unique"`가 공백 기준 분할에 의해
   `"zebra` + `unique"`로 찢어져 결국 **두 접두사 AND**가 됐다. 즉 phrase 검색은 애초에 동작한 적이 없다.
   (FTS5 직접 질의 실측: `"zebra unique"` → 1행, `zebra* unique*` → 1,2행)
3. **fallback이 자기 자신을 반환** — 키워드가 0개면 `searchByCategory` 결과를 걸러내지 않아
   "related learning"에 질문한 learning 본인이 들어갔다. `+1` 오버페치도 빠져 있었다.

추가로 고친 유효성 구멍: 맨 앞/뒤 `OR`(`'OR zebra'` → throws), 따옴표 짝이 안 맞을 때
(`'"zebra'` → throws), 연산자만 있는 질의.

### sanitizeQuery 설계 판단 (handoff가 결정을 넘겼던 지점)
`sanitizeFtsQuery`(store.ts)처럼 전부 따옴표로 감싸면 **안전하지만 접두사 검색을 잃는다**
(`zeb` → `zeb*`). 현재 호출자가 그에 의존하므로 토큰 필터 방식을 유지하고, 유효성을 깨뜨리는
두 모양(연산자에 붙는 `*`, 문자 없는 토큰)만 제거했다. **보장은 문법 검증기가 아니라 테스트 스위트다.**

## 변조로 통과한 건 통과가 아니다 — 이 세션에서 세 번 당했다

| 실수 | 교훈 |
|------|------|
| perl 정규식이 안 맞아 뮤턴이 적용되지 않았는데 "통과"로 읽음 | 변이 적용 여부를 **기계적으로 확인**하고, 안 바뀌면 실패로 보고 |
| 피스톤 없이 파일을 덮어써 "복원" | 백업 사본 필수 |
| M6(인용 구문 분기) 생존 → 조사하니 **애초에 도달 불가능한 죽은 코드**였음 | 생존한 뮤턴은 조용히 지워야 할 죽은 코드일 수 있다 |

뮤턴 10건 전부 **적용 확인 후 전부 검출**. 도중에 내가 추가한 방어 코드 2건(M9 따옴표 제거,
M10 빈 결과 가드)이 **뮤턴으로 죽은 코드임이 판명**돼 삭제했다. 방어적으로 보이는 분기가
아무것도 막지 않으면 방어처럼 읽히는 것이 가장 나쁘다.

### 내가 만든 테스트 결함 4건
- `s.project ?? 'proj'`가 **명시적 `null`을 `'proj'`으로 바꿔** NULL 케이스 5건이 엉뚱한 이유로 통과.
- `const project`를 함수 바깥에 적어 `s is not defined`로 전 파일 크래시.
- `got[0]` 접근으로 tsc 2건 실패.
- phrase 테스트에 decoy 행이 없어 phrase와 두 접두사를 **구분하지 못했다** — 이게 M6 미검출의 원인.

## 미검증 (이 세션에서 끝내지 못한 것)
- **GitHub Actions 실제 실행** — fork의 push 트리거 비활성이라 run 0건. 이번에 CI에
  `session:close` 스텝을 추가했지만 실제로 돌았는지는 push 후 확인이 필요(#007).
- **Node 18** — 이 환경에 미설치. 게이트를 매트릭스 3레그에 넣었으므로, 버전별로
  suite 수가 다르면 **코드와 무관하게 CI가 실패할 수 있다**(#035). 미검증.
- **멀티 버전 실측 미수행** — node를 바꾸면 `npm rebuild better-sqlite3`(단일 ABI) 필요.
- 이번 작업분은 **미커밋** 상태다. 종료 게이트의 "제품 커밋 기록"은 이전 세션 커밋을 가리킨다.

---

## 2026-10-01 세션 — #006 [Optimizer-LLM] TDD

### 시작 상태 (복구 프로토콜)
`dirty: true`라 git 상태를 먼저 실측했다. `c00718d`에 미커밋 제품 변경이 쌓여 있었고
`docs/next-session-prompt.md`는 2026-09-28 세션 종료 시점의 것을 그대로 담고 있었다.
`next-session-prompt.md`의 지시(#025·#031·#005)는 STATE의 `checkpoint`에 이미 완료로
기록돼 있어 **문서가 STATE보다 뒤처진 상태**였다. 이때 지시를 그대로 따랐으면 이미 끝난
 일을 다시 한다. STATE가 정본이다.

**ABI 함정 실측 재현**: `npm run verify`가 `ERR_DLOPEN_FAILED`(NODE_MODULE_VERSION 115 vs 137)로
전 파일 크래시. node v24.19.0인데 바인딩이 예전 ABI로 빌드돼 있던 상태. `npm rebuild better-sqlite3`
(재빌드 exit 0) 후 해소. 문서에 적힌 대로지만 이번에도 재현했다.

### baseline (제품 변경 전 실측)
- `npm test` → tests 293 / suites 22 / **pass 289 / fail 4**
- `npx tsc --noEmit` → exit 0 · `npm run build` → exit 0
- **fail 4건은 전부 `scripts/__tests__/validate-context.test.js`의 "real repository" 계열**이고
  원인은 단 하나 — `docs/next-session-prompt.md`가 `c00718d`를 명시하지 않아 #031 신선도 게이트가
  stale로 판정. 제품 코드 결함이 아니다. **exit 1이므로 baseline은 "빨강"이었다.** 이 상태에서
  세션을 시작해야 증가분을 정직하게 읽을 수 있다.

### 탈출구 3건 — 실측 확인 후 정식 export로 교체
`rg -n "__test" src scripts` 결과 정의 3건 외 **호출자 0건**:
`reflect.ts:88` `validate.ts:72` `store.ts:322`. `store.__test`는 이미 named export인
`trajectoriesToValidation`의 중복 별칭이라 `__test.trajectoriesToValidation === trajectoriesToValidation`가
`true`(서브에이전트 판정, 메인이 파일로 확인). 탈출구는 테스트 가능성을 **숨기는** 구조라
테스트를 직접 export로 쓰게 하고 `__test` 3개를 전부 삭제했다.

### 결함 4건 발견·수정 (모두 RED로 고정 후 수정)
1. **`store.ts` `slice(-0)`** — `valCount`가 0이면 `slice(-0)`이 `slice(0)`이 되어 **validation에
   전체 행이 들어가고 train이 비었다**. holdout 0 또는 배치 4개 미만에서 실측 재현.
   `valCount > 0` 분기로 수정.
2. **`llm.ts` anthropic temperature 유실** — `buildAnthropicBody`가 `temperature` 키를 아예
   만들지 않았다. `validate.ts:28`은 채점 게이트에 `temperature: 0`을 명시하는데 이 프로바이더에서
   조용히 버려졌다. 실제 요청 body를 캡처해 확인: `{"model":...,"max_tokens":4096,"system":"S","messages":[...]}`
   — temperature 키 없음. openai는 `temperature: 0` 포함. 수정.
3. **`llm.ts` 음수·0 타임아웃 통과** — `parseInt(...) || DEFAULT`에서 `'-1'`은 truthy라 `-1`이 그대로
   통과했다. `setTimeout(fn, -1)`은 즉시 발화해 모든 요청이 0ms로 타임아웃. `resolveTimeoutMs`로 분리해
   양수만 허용.
4. **`reflect.ts` `extractReasoning` 타입 누출** — `root?.reasoning ?? ''`이 `{"reasoning":5}`에
   `5`(숫자)를 반환. 반환 타입은 `string`이므로 잘못된 타입이 실행 기록으로 저장될 수 있었다.
   `typeof` 가드 추가. `parsePatches`·`parseOutcomes`도 `null` 요소에서 `TypeError`를 던졌는데
   함께 가드.

### 뮤턴 25건 — 최종 25/25 검출
1차 실행에서 3건 SURVIVED. **3건 모두 테스트 공백이나 제 뮤턴 스크립트 오류였고, 이를 감추지 않고
원인을 나눠 处理했다.**
- 2건은 **제 뮤턴 스크립트가 동치 변조를 만든 것**(`.trim()`을 치환했는데 `.trim()`이 그대로 남음;
  `Math.max(0,...)` 하한 제거 — 이미 `valCount > 0` 가드가 가려서 관측 불가). 동치 변조는
  살아남는 게 아니라 **애초에 변조가 아니다**. 스크립트를 고쳐 재실행.
- 1건은 실제 공백 — `parsePatches('{"patches":[null]}')`가 `[]`을 반환하는데(가드가 있으므로) 그
  경로에 테스트가 없었다. RED 2건 추가 후 재실행.
- `Math.max(0, ...)`는 죽은 방어로 판명돼 **삭제했다**(M6 교훈). `Math.max(0,...)`가 없어도
  음수 holdout 회귀 테스트가 잡아낸다.
- 최종: **TOTAL=25 SURVIVED=0**. 스크립트는 `/var/folders/.../opencode/mutate.sh`(저장소 밖, 커밋 대상 아님).

### 최종 실측
- `npm test` → tests **373** / suites **34** / **pass 369 / fail 4** (신규 80 fixture)
- `npx tsc --noEmit` → exit 0 · `npm run build` → exit 0
- `npm run validate:context` → exit 1, 위반 1건 = 위와 동일한 handoff 신선도. **제품 코드와 무관.**
- fail 4건은 세션 종료 하네스(`npm run session:close`)를 돌리면 해소된다. 지금 해결하려 들면
  handoff에 아직 안 끝난 다음 작업 상태를 적어야 하므로 틀린다.

### 남은 것
- 이 작업분은 **미커밋**. 커밋 여부는 사용자 승인 대기(AGENTS.md git 정책).
- #026~#030 Storage 결함 5건 여전히 특성화만 하고 미수정.
- `store.ts`(I/O 322줄)와 `trainer.ts`는 커버리지 0 유지. `trainer.ts`는 `store?` 주입 지점과
  `Math.random()`(trainer.ts:338) 때문에 비결정적 — 분기 검증만 가능.

### 2026-10-01 세션 계속 — #026~#030 Storage 결함 5건 수정

5건을 수정 전에 서브에이전트에게 **호출자 실측**을 맡겼다. 결함을 고치면 호출부가 깨질 수
있으므로 "누가 이 함수를 호출하고, 그 인자가 빈 문자열이 될 수 있는가"를 먼저 확정해야 한다.
그 결과 **5건 모두 프로덕션 호출자가 결함을 발동시킬 수 없음**이 실측으로 드러났다
(`getAllLearnings`는 외부 호출자 0개 — 죽은 API. `listWikis` 3개 호출자 중 값을 넘기는
`wiki-cli.js:78`의 `args.scope`는 파서를 실행해 `''`가 될 수 없음을 확인. `updateSessionCounts`
2개 호출자 모두 정수 리터럴. `setSeedStatus`/`enqueueSeed` 모두 status가 리터럴이고
`enqueueSeed`에 status를 넘기는 호출자는 0개. `startSession` 1개 호출자는
`process.env.CLAUDE_SESSION_ID || String(process.ppid) || 'default'`라 `undefined`가 될 수 없음).
그래서 수정은 **어떤 프로덕션 경로도 깨지 않는다**는 전제 위에서 진행할 수 있었다.

#### TODO가 적힌 것보다 심각했던 것 2건

**#029가 더 나빴다.** TODO는 "예외 없이 `id IS NULL` 행을 쓰고 undefined 반환"이라고 적었지만
실측 결과 **두 번째 호출이 조용히 또 다른 NULL-id 행을 만든다.** `INSERT OR IGNORE`는 아무것도
방지 못 하는데, 그 제약이 없다는 것이 근본 원인이다. `sessions.id`는 `id TEXT PRIMARY KEY`인데
SQLite에서 `INTEGER PRIMARY KEY`를 뺀 PRIMARY KEY는 NOT NULL을 함의하지 않고, UNIQUE 인덱스에는
NULL이 **반복될 수 있다**. 즉 PRIMARY KEY만으로는 이 구멍을 막을 수 없다. 실측:
`startSession(undefined)` 두 번 → rowid 1, 2 둘 다 `id: null`. 게다가 `getSession(null)`도
`undefined`를 반환하므로 **공개 API로는 이 행을 찾거나 치울 방법이 없다.** `getRecentSessions()`에
들어가 `session-start.js:60-66`의 "이전 세션" 출력에도 섞인다. 수정: `typeof id !== 'string' ||
id === ''`이면 삽입 전에 예외. 기존 테스트 `store.test.ts`의 "ignores a duplicate session id"가
`INSERT OR IGNORE` 의미를 고정하고 있으므로 plain INSERT로 바꾸는 해법은 불가했다.

**#028의 실제 피해는 오염이 아니라 "보이지 않음"이다.** 임의 status가 저장되면 그 행은 네 경로
전부에서 회피된다 — `nextPendingSeed`, `claimPendingSeed`, `cmdCancel`
(`status IN ('pending','active')`), 그리고 `cmdStatus`의 네 개 `SUM(CASE...)` 버킷 어느 것에도
들지 않는다. 즉 **읽는 경로도 고치는 경로도 모두 놓친다.** 수정: `setSeedStatus`·`enqueueSeed`에
애플리케이션 가드 + 스키마 `CHECK` 제약(마지막 방어선). 단 `CREATE TABLE IF NOT EXISTS`는
기존 DB에 CHECK를 추가하지 않으므로, **이미 생성된 DB는 애플리케이션 가드만 유효**하다.
프로덕션 DB를 읽기 전수 조사해 wiki_seeds 0행·sessions 0행이라 손상된 행이 없음을 확인했다.

#### 발견한 추가 결함 1건 (저장하지 않음 — 수정이 함께 해결)
`listWikis(true)`가 `TypeError: SQLite3 can only bind numbers, strings...`를 냈다.
`wiki list --scope`(값 없이)를 실행하면 파서가 `true`를 넣는 걸 **파서를 실제로 실행해 확인**했다
(`--scope` → `true`, `--scope ''` → `true`, `--scope=project` → `undefined` — `=` 형태는 미지원).
도달 가능한 경로라 `typeof scope !== 'string'` 가드로 읽을 수 있는 에러로 바꾼다. 수정 전후
모두 TypeError였으므로 회귀가 아니라 개선이다.

#### #030의 계약 변경
기존 테스트 2건이 버그의 부작용을 "계약"으로 굳고 있었다 — `throws a TypeError ... when the
parent directory is absent`와 `never creates the parent directory of a custom path`. 그대로 두면
`ensureDbDir`가 아무것도 안 하는 함수가 되어 결함을 되살리므로, **새 계약(호출자가 지정한
디렉터리를 만든다)** 으로 교체했다. `ensureDbDir`에 `dir` 파라미터를 주고
`path.dirname(path.resolve(dbPath))`를 넘긴다.

#### 뮤턴 17건 — 최종 17/17 검출
1차 3건 SURVIVED → 1건은 `enqueueSeed` 가드에 테스트가 없던 실제 공백(RED 3건 추가), 2건은
**동치 변조**였다. `existsSync` 가드 제거는 `mkdir(recursive:true)`가 존재 디렉터리에서 no-op이라
관측 차이가 없고, `:memory:` 가드 제거는 `dirname(':memory:')`가 이미 존재하는 cwd라 역시
무관했다. CONTEXT M6 교훈대로 **죽은 `:memory:` 분기를 코드에서 삭제**했다 — 두 경로 모두
아무것도 막지 않는 방어였다. 재실행 후 `TOTAL=17 SURVIVED=0`.

#### 내 테스트 실측 오류 2건 (기록해 둔다)
- 카운터 복구 테스트가 "명시적 null 델타 → NULL" 경로를 전제했는데, COALESCE 수정 후엔
  그 경로로 NULL이 안 만들어졌다. **다른 이유로 실패하는 테스트**였다. "이전 빌드가 이미
  null로 만든 행"을 raw UPDATE로 세팅하는 전제로 고쳐야 했다. 테스트가 통과하는데
  엉뚱한 이유로 통과하는 건 통과가 아니다.
- `enqueueSeed` RED를 처음에 `as SeedInput` 캐스트로 작성했다가 tsc exit 2. `parent_id`가
  필수라 캐스트로 덮으려니 TS2352. `parent_id: null`을 명시하는 게 관례(`seedRow`)에 맞았다.

#### 최종 실측
- `npm test` → tests **385** / suites 35 / **pass 381 / fail 4** (Storage 53 → 74 fixture)
- `npx tsc --noEmit` → exit 0 · `npm run build` → exit 0
- fail 4건은 #006와 동일 — handoff 신선도, 제품 코드와 무관.

---

## 2026-10-01 세션 종료 — 독립 리뷰 결과와 미해결

### 3차 독립 리뷰 (세션 전체 `c00718d..HEAD`)

blocker 0 · major 1(수정) · minor 2(수정) · nit 0.

**major — `isSyntheticMergeCheckout`의 fallback이 너무 넓었다.** 부모 수 probe를 `GITHUB_REF`가
없을 때만 돌려야 하는데 `isCI()`이면 돌렸다. main push도 merge commit일 수 있으므로(GitHub 기본
merge 전략) `refs/heads/main` + merge HEAD가 면제됐다 — 함수 주석과 테스트가 주장한 것과 정반대.
**직접 재현해 확인**하고, `GITHUB_REF`가 설정돼 있으면 probe를 건너뛰도록 고쳤다. RED 테스트를
실제 2-부모 merge repo로 만들었고, 수정을 되돌리면 그 테스트가 RED가 되는 것까지 확인했다.

이 발견의 교훈: **면제 조건을 넓힐 때는 "그 조건이 참이 되는 다른 경우"를 먼저 열거한다.**
`GITHUB_REF`가 없는 경우를 위한 fallback이 `GITHUB_REF`가 있는 경우까지 잡았다.

**minor 2건:** 트리거 write-path 테스트 공백(REPLACE·UPSERT 실측 후 고정), 두 계층 메시지 어구.
후자는 **리뷰어 지적이 실제보다 강했다** — 실측하니 두 메시지 모두 `one of pending, active, done,
failed`를 포함해 공유 패턴으로 양쪽 인식이 가능했고, 접두사가 달라 계층 구분은 오히려 된다.
수정 대신 공유 어구를 테스트로 고정했다.

### 리뷰어가 샌드박스에서 검증하지 못한 것 (메인이 대체 검증)

`GITHUB_ACTIONS=... npm test`, `CI=true npm test`, `node -e`, `sqlite3`이 거부됐다. 그래서
UPSERT 트리거 동작과 CI 모드 숫자는 INFERENCE였다. 메인이 4모드 전부와 세 write-path를 직접
실측했다(397 tests / 0 fail, 세 경로 모두 거부).

### 이번 세션 완료 항목

#006 optimizer TDD(뮤턴 25/25) · #026~#030 Storage 결함 5건(뮤턴 17/17) · #028 잔여 트리거
마이그레이션(기존 DB까지, 뮤턴 5/5) · session-close 게이트 TAP 리포터 결함 · CI freshness 구조
결함(PR에서 충족 불가) · #035 node 18 종료 · #007 CI 실증(PR #1 3레그 success) · AGENTS.md 8KB
압축(.context/GATES.md 신설) · npm approve-scripts 설치 정리.

### 최종 실측

4모드(로컬/PR/main/CI=true) **397 tests / 397 pass / 0 fail**, suites 35, test files 15.
tsc exit 0, build exit 0, `npm run verify` exit 0, `session:close` OK, PR #1 CI 3레그 SUCCESS.

### 미해결 (미검증)

- **PR #1은 초록·MERGEABLE이지만 머지하지 않았다.** main 병합은 사용자 승인 항목이다
- node 20·22에서 #028 마이그레이션을 end-to-end로 돌리지 않았다(CI 3레그는 통과)
- #039 `claimPendingSeed` 동시성 — 트랜잭션 래퍼·UNIQUE 제약 없이 문장 원자성만
- `trainer.ts`·`optimizer/store.ts` 커버리지 0(#036) · `upsertValidation` 반환 계약(#037) ·
  `metaUpdateEveryEpochs` 미구현(#038) · Search 타입 계약(#032) · `+1` 오버페치 판정(#033) ·
  `docs/TEST-LOG.md` fts.ts 줄수 드리프트(#034)
- `AGENTS.md` 8KB advisory가 validate-context에서는 advisory인데 테스트에서는 hard fail이라는
  구조적 불일치가 남아 있다 — 이번엔 문서를 줄여 양쪽을 통과시켰을 뿐이다
- #016 증거 커밋 연결, #017 ADR↔Task Contract 교차검사는 부분 구현 상태
