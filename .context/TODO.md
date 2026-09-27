# TODO.md

## Domain Map (실측 2026-09-27)

| 도메인 | 파일 | 줄 | 커버리지 |
|--------|------|-----|----------|
| [Infra] | scripts/run-tests.js | 60 | 커버됨 (깊이 무관 탐색 검증) |
| [Infra] | scripts/validate-context.js | 178 | 커버됨 (fixture 58건) |
| [Optimizer-순수] | apply/aggregate/clip | 149 | 커버됨 |
| [Optimizer-순수] | trainer.ts | 362 | 부분 — `stripExistingStamp`만 |
| [Optimizer-LLM] | llm/reflect/validate/slow/parse/hash | 483 | 0건 |
| [Optimizer-Store] | store.ts | 322 | 0건 |
| [Storage] | db/index.ts, store.ts, schema.sql | 806 | **커버됨** (51 fixture) |
| [Search] | fts.ts, embeddings.ts | 320 | 0건 |
| [Distribution] | scripts/ (기존 38 JS) | 2,459 | 0건 |

## 항목

- [✓] #001 작업 범위 확정 — 2026-09-27: 테스트 인프라 결함부터
- [✓] #002 test 스크립트 glob 비재귀 결함 수정 — `scripts/run-tests.js` 도입, src/** 깊이 무관 탐색
- [✓] #003 CI에 test 게이트 추가 — `build` job(노드 매트릭스)에 `run: npm test` 스텝
- [✓] #004 [Storage] db 도메인 TDD — 51 fixture. initializeDatabase 5 + learnings 13 + sessions 6 + wikis 5 + wiki pages 8 + seeds 7 + lifecycle 2
- [ ] #025 [Storage][major] `updateLearning`이 `project`를 조용히 무시하고 `true` 반환 — COALESCE 목록에 없음. 테스트로 특성화 완료, 미수정
- [ ] #026 [Storage][minor] `getAllLearnings('')`·`listWikis('')`이 빈 문자열을 falsy로 받아 **전체** 반환. 필터로 오인될 수 있음. 특성화 완료, 미수정
- [ ] #027 [Storage][minor] `updateSessionCounts(id, null, null, null)`이 카운터를 영구 NULL로 만듦. 기본값 경로로 복구 불가(`NULL + 0 = NULL`). 특성화 완료, 미수정
- [ ] #028 [Storage][minor] `setSeedStatus`가 임의 문자열을 저장 — CHECK 제약·enum 없음. 특성화 완료, 미수정
- [ ] #029 [Storage][minor] `startSession(undefined)`가 예외 없이 `id IS NULL` 행을 쓰고 `undefined` 반환 — 시그니처는 `Session`. TS와 런타임 불일치. 특성화 완료, 미수정
- [ ] #030 [Storage][minor] `initializeDatabase`가 dbPath와 무관하게 매번 `~/.pro-workflow`를 생성. 테스트 격리에도 부작용
- [ ] #005 [Search] 검색 도메인 TDD — fts.ts 5개 함수, embeddings.ts는 공개 API 설계 결정 필요
- [ ] #006 [Optimizer-LLM] 순수함수 + 미사용 탈출구 3개 TDD
- [✓] #008 경량 컨텍스트 하네스 설치 — somatlas 패턴(8KB 얇은 지도 + 결정론적 센서 + session-wrap) 채택
- [✓] #009 하네스 자체 감사 — 서브에이전트 general 1건. 메인이 치명 2건 재현 검증 후 수정
- [ ] #007 CI 실행 실증 — push/PR 실제 CI 로그에서 3개 매트릭스 레그 테스트 통과 확인
