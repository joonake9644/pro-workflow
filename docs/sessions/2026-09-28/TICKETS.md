# TICKETS — 2026-09-28 세션 이후 미완료

## 🔴 긴급 (다음 세션 즉시 처리)
- [ ] **#025 `updateLearning`이 `project`를 조용히 무시하고 `true` 반환** — 성공으로 보고되는 무효 갱신. 가장 위험. 특성화 테스트 있음(`src/db/__tests__/store.test.ts`)
- [ ] **#007 CI 실실행 미확인** — `joonake9644/pro-workflow`의 `actions/runs total_count = 0`. fork는 push 트리거가 기본 비활성이라 push/PR로 실제 실행을 만들어 봐야 한다. `main`은 branch protection 404, rulesets `[]`로 required check 미설정도 실측됨

## 🟡 중요 (이번 주 내)
- [ ] **#005 [Search] 검색 도메인 TDD** — `src/search/fts.ts` 5개 함수. 서브에이전트가 버그 발견: `getRelatedLearnings`가 키워드 2개 이상인 learning에 대해 `SQLITE_ERROR`(fts5 syntax error near "*")를 던진다. `sanitizeQuery`가 FTS 문법을 통과시키므로
- [ ] **#016 증거 커밋 연결(§6-124) 미구현** — 증거 산출물 모양만 검증하고 HEAD 커밋과의 연결은 안 봄
- [ ] **#017 ADR↔Task Contract 교차검사(§6-122) 미구현** — ADR 상태 라인만 검증
- [ ] **#023 `ci.test.ts`가 `|| :`·`; true` 무음화를 못 잡음**
- [ ] **#026~#030 Storage 결함 5건** — 빈 문자열 필터가 전체 반환 / `updateSessionCounts`의 null이 카운터 영구 NULL / `setSeedStatus` 무검증 / `startSession(undefined)`가 `undefined` 반환(시그니처는 `Session`) / `initializeDatabase`가 dbPath와 무관하게 `~/.pro-workflow` 생성

## 🟢 보류 (여유 있을 때)
- [ ] **#018~#020 스코프 밖 확정분** — NORTH_STAR 귀속, plan revision SHA-256 digest, interrupt/return_to 삼중조. 이 리포에 해당 개념이 없어 만들면 발명 구조가 된다. 필요해지면 그때 결정
- [ ] **#024 `package.json`의 `files`가 `scripts`를 포함** — 검증·테스트 스크립트가 npm 배포물에 실림
- [ ] **node 18 검증** — `engines: >=18`이나 `better-sqlite3@12.8.0`은 `20.x || 22.x || 23.x || 24.x || 25.x` 요구. CI 매트릭스 `[18,20,22]`에 18이 있으나 이 환경에 없어 미검증
- [ ] **#006 [Optimizer-LLM]** — `reflect.__test`·`validate.__test`·`store.__test` 탈출구 3개 미사용

---
_생성: 2026-09-28 세션 종료 시_
