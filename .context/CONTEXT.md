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
