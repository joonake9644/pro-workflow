# TEST-LOG — 2026-09-28

## 이번 세션 테스트 결과

### baseline (세션 시작, 2026-09-27T18:12 기록분 재실측)
- passed: 14 / failed: 0 / suites: 6
- 명령: `npm test` — `tsx --test src/optimizer/__tests__/*.test.ts` (단일 디렉터리 glob)
- build exit 0, tsc exit 0, node v24.19.0 / npm 11.17.0
- 최초 상태에서 `src/db/__tests__/`에 테스트를 추가해도 **14 pass / 0 fail** — 실행조차 안 됨

### 세션 종료 후 (2026-09-28T00:20, node v24.19.0)
- passed: 239 / failed: 0 / suites: 16
- 명령: `npm run verify` (check + test + validate:context) — **exit 0**
- 발견된 테스트 파일: 9
- `validate-context`: OK, AGENTS.md 7,451 bytes (8KB 캡의 91%)
- 제품 코드 최신 커밋: 303d0dd

### 다중 버전 (ABI별 `npm rebuild better-sqlite3` 후)
- node v20.11.0 / v22.17.0 / v24.19.0 모두 동일 게이트 통과 확인
- 재빌드 없이 node만 전환하면 20·22에서 49건 실패 — 바인딩 ABI 불일치. 테스트 결함 아님

## 새로 추가·수정한 테스트
- [x] `scripts/__tests__/validate-context.test.js` — 81 fixture
- [x] `scripts/__tests__/run-tests.test.js` — 4 fixture
- [x] `src/db/__tests__/store.test.ts` — 57 fixture
- [x] `src/db/__tests__/index.test.ts` — 3 fixture
- [x] `src/__tests__/ci.test.ts` — 9 fixture
- [x] `src/optimizer/__tests__/apply.test.ts` — 기존 14 fixture (변경 없음)

## 미완 / 다음 세션 검증 필요
- [ ] **CI 실제 실행** — `actions/runs total_count = 0`. 로컬에서 재실행 불가
- [ ] **node 18 CI 레그** — 이 환경에 node 18 없음
- [ ] **#016 증거 커밋 연결, #017 ADR 교차검사** — 미구현이라 테스트도 없다

## 세션 종료 문서의 공백 (자기 발견)
`session-wrap`을 **마지막 일감보다 먼저** 실행했다. 이후에 `CLAUDE.md`, `session:close`
게이트, 독립리뷰 major 2건 수정이 들어갔는데 종료 문서는 갱신되지 않았다(210 pass 기록,
최종 실측 220 pass). 더 나쁜 것은 **그 문서가 게이트를 통과했다**는 점이다 — 센서가
구조만 검사해서 최신 커밋보다 오래된 종료 문서를 막지 못한다. TODO #031.

## 테스트하지 못한 영역
- `src/search/fts.ts`(5개 함수, 320줄) — 커버리지 0. `getRelatedLearnings`의 `SQLITE_ERROR` 버그는
  서브에이전트가 발견만 했고 재현 검증을 메인이 하지 않았다. TODO #005 대상
- `src/search/embeddings.ts` — 벡터 검색·RRF. `src/index.ts`에서 미export라 공개 API 결정이 선행
- `src/optimizer/store.ts`(322줄) — 커버리지 0
- `src/optimizer/llm.ts`·`slow.ts` — 네트워크 호출이라 이 시점엔 미검증
- `scripts/`의 기존 38개 JS 훅 — 커버리지 0. `scripts/__tests__/`의 3개 파일만 존재
- WAL이 불가능한 파일시스템에서의 `journal_mode` 폴백 — 이 환경에서 재현 불가

---
_생성: 2026-09-28 세션 종료 시_
