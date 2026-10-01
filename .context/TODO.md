# TODO.md

## Domain Map (실측 2026-09-27)

| 도메인 | 파일 | 줄 | 커버리지 |
|--------|------|-----|----------|
| [Infra] | scripts/run-tests.js | 60 | 커버됨 (깊이 무관 탐색 검증) |
| [Infra] | scripts/validate-context.js | 178 | 커버됨 (fixture 58건) |
| [Optimizer-순수] | apply/aggregate/clip | 149 | 커버됨 |
| [Optimizer-순수] | trainer.ts | 362 | 부분 — `stripExistingStamp`만 |
| [Optimizer-LLM] | llm/reflect/validate/parse/hash | 483 | **커버됨** (80 fixture — slow.ts·반사/채점의 LLM 경유부는 미포함) |
| [Optimizer-Store] | store.ts | 322 | 부분 — 순수 `trajectoriesToValidation`만 (I/O 322줄 미커버) |
| [Storage] | db/index.ts, store.ts, schema.sql | 809 | **커버됨** (74 fixture) |
| [Search] | fts.ts | 212 | **커버됨** (28 fixture) |
| [Search] | embeddings.ts | 139 | 0건 — 공개 API 결정 필요(#032와 별개) |
| [Infra] | scripts/session-close.js | 142 | **커버됨** (9 fixture) |
| [Distribution] | scripts/ (기존 38 JS) | 2,459 | 0건 |

## 항목

- [✓] #001 작업 범위 확정 — 2026-09-27: 테스트 인프라 결함부터
- [✓] #002 test 스크립트 glob 비재귀 결함 수정 — `scripts/run-tests.js` 도입, src/** 깊이 무관 탐색
- [✓] #003 CI에 test 게이트 추가 — `build` job(노드 매트릭스)에 `run: npm test` 스텝
- [✓] #004 [Storage] db 도메인 TDD — 51 fixture. initializeDatabase 5 + learnings 13 + sessions 6 + wikis 5 + wiki pages 8 + seeds 7 + lifecycle 2
- [✓] #025 [Storage][major] `updateLearning`이 `project`를 조용히 무시 — **수정 완료 2026-09-28**. COALESCE 목록에 `project` 추가 + 파라미터 바인딩. RED 2건 확인 후 GREEN, 뮤턴 2건 모두 검출
- [✓] #026 [Storage][minor] `getAllLearnings('')`·`listWikis('')`이 빈 문자열을 falsy로 받아 전체 반환 — **수정 완료 2026-10-01**. `!== undefined` 로 판정 변경(빈 문자열은 진짜 필터 값). `listWikis`에 `typeof scope !== 'string'` 가드 추가 — `wiki list --scope`(값 없음)는 파서가 `true`를 넣어 도달 가능했고 원래 생짜 SQLite bind 에러를 냈다. 외부 호출자 3개는 전부 회귀 없음 확인. RED 3건 후 GREEN, 뮤턴 3/3
- [✓] #027 [Storage][minor] `updateSessionCounts`의 명시적 null 델타가 영구 NULL을 만듦 — **수정 완료 2026-10-01**. 컬럼·델타 양쪽에 COALESCE(`COALESCE(edit_count,0) + COALESCE(@edits,0)`). 이미 null이 된 행도 복구된다. 프로덕션 호출자 2개는 정수 리터럴만이라 회귀 없음. 프로덕션 DB 전수 조사 결과 손상 행 0건. 뮤턴 5/5
- [✓] #028 [Storage][minor] `setSeedStatus`가 임의 문자열을 저장 — **완료 2026-10-01(잔여 마이그레이션 포함)**. 애플리케이션 가드(`SEED_STATUSES`) + DB 레벨 트리거(INSERT·UPDATE 각각). **실제 피해는 오염이 아니라 보이지 않음** — 임의 status 행은 `nextPendingSeed`·`claimPendingSeed`·`cmdCancel`·`cmdStatus` 네 경로 전부에서 회피된다. **CHECK 대신 트리거를 쓴 이유**: `CREATE TABLE IF NOT EXISTS`는 기존 테이블에 CHECK를 소급하지 않지만 `CREATE TRIGGER IF NOT EXISTS`는 별도 문장이라 기존 DB에 적용된다. CHECK를 유지하면 BEFORE 트리거가 항상 먼저 발화해 CHECK 에러가 절대 안 나오므로(아무것도 막지 않는 방어) 제거했다. 프로덕션 DB 사본으로 마이그레이션 실측: 트리거 0→2 설치, 데이터·자기참조 FK 보존, `foreign_key_check` 빈 결과. 뮤턴 4/4
- [✓] #029 [Storage][minor] `startSession(undefined)`가 `id IS NULL` 행을 씀 — **수정 완료 2026-10-01**. **TODO보다 심각**: 두 번째 호출이 조용히 또 다른 NULL-id 행을 만든다. `sessions.id`의 `id TEXT PRIMARY KEY`는 SQLite에서 NOT NULL을 함의하지 않고 UNIQUE 인덱스에 NULL이 반복될 수 있어 PRIMARY KEY만으로는 막히지 않는다. `getSession(null)`도 undefined라 공개 API로 회수 불가. 삽입 전 가드로 수정. 기존 `INSERT OR IGNORE` 중복 테스트를 깨지 않음. 뮤턴 3/3
- [✓] #030 [Storage][minor] `initializeDatabase`가 dbPath와 무관하게 `~/.pro-workflow`를 생성 — **수정 완료 2026-10-01**. `ensureDbDir(dir)`가 파라미터를 받고 `path.dirname(path.resolve(dbPath))`를 mkdir. 계약이 바뀌어(지정한 디렉터리를 만든다) 버그를 고정하던 기존 테스트 2건을 교체. `:memory:` 분기는 죽은 방어로 판명돼 삭제. 하위 프로세스로 격리한 테스트 3건. 뮤턴 2/2
- [✓] #031 [Infra][major] 종료 게이트가 실제 수치를 재지 않고 sha 존재만 확인 — **수정 완료 2026-09-28**. `scripts/session-close.js` 도입(구조 검사 + 라이브 재측정 + 필드별 대조), `npm run session:close` 배선, CI에 스텝 추가. 실측: stale handoff(225 기록 / 239 실제)에 대해 exit 1
- [✓] #005 [Search] 검색 도메인 TDD — **완료 2026-09-28**. `src/search/__tests__/fts.test.ts` 28 fixture. 그 과정에서 `getRelatedLearnings`의 SQLITE_ERROR와 조용히 무너진 phrase 검색을 발견해 수정
- [✓] #006 [Optimizer-LLM] 순수함수 + 미사용 탈출구 3개 TDD — **완료 2026-10-01**. 신규 80 fixture(optimizer 4파일). 탈출구 3건(`reflect.__test`·`validate.__test`·`store.__test`)을 정식 named export로 교체 후 `__test` 전부 삭제. 결함 4건 수정: `store.ts` `slice(-0)`(valCount 0이면 validation에 전체 행 유입), `llm.ts` anthropic temperature 유실(`validate.ts:28`의 `temperature: 0`이 조용히 버려짐), `llm.ts` 음수 타임아웃 통과(`setTimeout(fn,-1)` 즉시 발화), `reflect.ts`/`validate.ts` null 요소 `TypeError`·reasoning 타입 누출. 뮤턴 25/25 검출. tsc exit 0, build exit 0
- [✓] #008 경량 컨텍스트 하네스 설치 — somatlas 패턴(8KB 얇은 지도 + 결정론적 센서 + session-wrap) 채택
- [✓] #009 하네스 자체 감사 — 서브에이전트 general 1건. 메인이 치명 2건 재현 검증 후 수정
- [✓] #007 CI 실행 실증 — **완료 2026-10-01**. PR #1 run 36860867596 3레그(20/22/24) 전부 success, Session close gate도 각 레그 success. 실증 과정에서 게이트가 PR에서 구조적으로 통과 불가능함을 발견해 수정(freshness를 CI에서 면제, advisory로 노출)
- [ ] #016 [Infra] 종료 게이트의 `lifecycle: complete`가 산출물 모양만 요구하고 HEAD 커밋을 연결하지 않음. 가짜 증거("done" 한 단어)는 막히지만 진짜 커밋도 요구하지 않음
- [ ] #017 [Infra] ADR과 Task Contract의 교차검사가 없음 — ADR이 실제 구현과 맞는지 자동으로 확인하지 않음
- [ ] #032 [Search][minor] `getRelatedLearnings`의 카테고리 fallback이 `SearchResult[]`로 캐스팅하지만 `rank`·`snippet` 키가 없음. 공개 타입이 실제 반환보다 넓음 — 타입 계약 결정 필요
- [ ] #033 [Search][minor] `getRelatedLearnings`의 `+1` 오버페치는 "타깃이 상위 N칸에 없다"를 보장하지 않음. `limit`보다 적은 결과가 나올 수 있음(관측된 동작, 결함 여부 미판정)
- [ ] #034 [Infra] `docs/TEST-LOG.md`가 `fts.ts`를 320줄로 기록하나 실제 181줄. 문서 수치 드리프트
- [ ] #036 [Optimizer-LLM] `trainer.ts`는 비결정적(`Math.random()` at trainer.ts:338)이라 `store?` 주입 지점으로 분기 검증만 가능. 커버리지 0 유지
- [ ] #037 [Optimizer-Store] `store.upsertValidation`이 `items.length`를 반환하는데 실제로 쓰인 행 수가 아닐 수 있음(Subagent VERIFIED: prompt_hash 충돌 시 3 반환 / 2행). `trainer.ts:55`는 반환값을 버려 현재는 잠복. 반환 계약 결정 필요
- [ ] #038 [Optimizer-LLM] `types.ts:84` `metaUpdateEveryEpochs`를 읽는 코드가 어디에도 없는데 CLI(`--meta-every`)는 노출. `--meta-every 1`을 주면 조용히 아무 일도 안 일어남. 읽는 곳 구현 또는 옵트 제거
- [ ] #039 [Optimizer-LLM] `store.__test` 중복 별칭이므로 #006에서 함께 삭제됨. 남은 죽은 방어 코드 후보: `apply.ts:60` unknown-op 분기(프로덕션 도달 불가 — `clipByLR`이 먼저 TypeError), `store.ts:142` `updateRun`의 `if (sets.length===0) return`, `store.ts:18` `store.db` 핸들(읽는 곳 0건)
- [✓] #035 [Infra] node 18 레그가 `npm ci`에서 EBADENGINE(better-sqlite3@12.8.0은 20+ 요구, 프로젝트 engines는 >=18)으로 canceled — **종료 2026-10-01**. engines>=20, 매트릭스 [20,22,24]로 변경. suites 수는 3레그 모두 35로 일치 실측
