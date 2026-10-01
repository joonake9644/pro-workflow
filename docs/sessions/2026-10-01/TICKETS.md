# TICKETS — 2026-10-01

## 이번 세션 종료 시점 미완료 목록

### 최우선 — 이번에 고친 게이트가 CI에서 도는지 확인해야 한다

- [✓] **#007 CI 실행 실증 — 종료 2026-10-01.** PR #1 run 36860867596: 3레그(20/22/24) 전부 success,
  각 레그 `Session close gate` success(`live run: passed 391 / failed 0 / suites 35 / test files 15`).
  freshness advisory가 CI에서 실제로 출력되는 것도 로그로 확인
  (`[ADVISORY] ... handoff freshness is not verified in CI`)
- [✓] **#035 node 18 검증 — 종료 2026-10-01.** run 36831658193의 build(18)이 `npm ci`에서
  `EBADENGINE`(better-sqlite3@12.8.0 required `20.x||...`, current `v18.20.8`)로 65초 후 canceled.
  사용자 승인 후 `engines`를 `>=20`, 매트릭스를 `[20, 22, 24]`로 변경. 선언과 실제를 일치시켰다

### Storage 후속

- [ ] **CHECK 제약 마이그레이션(#028 잔여)** — `wiki_seeds.status`의 CHECK는 새로 만든 DB에만
  적용된다. `CREATE TABLE IF NOT EXISTS`가 기존 테이블에 CHECK를 소급하지 않는다. 기존 DB는
  애플리케이션 가드로만 보호된다. `db.exec('PRAGMA table_info(wiki_seeds)')`로 실제 확인 후
  테이블 재생성 마이그레이션 작성
- [ ] **#039 `claimPendingSeed` 동시성** — 트랜잭션 래퍼도 UNIQUE/부분 인덱스도 없고 문장
  원자성에만 의존한다. 6개 동시 프로세스 실측에서 단 1개 승자였다(리뷰어가 재현). 그러나
  `research-tick.js:60`이 별도 프로세스로 루프를 띄우므로 겹침이 가능하다. **peek-claim으로
  리팩터하면 이중 claim이 실증 가능하다** — 리뷰어가 changes 1/1을 재현했다. 손대면 바깥 UPDATE에
  `AND status = 'pending'` 재확인을 붙이는 게 최저선

### 커버리지 공백

- [ ] **#036 trainer.ts 커버리지 0** — `Math.random()`(trainer.ts:338)이 있어 비결정적이다.
  특정 패치 궤적을 고정하는 테스트는 flaky가 되므로 **분기 검증만** 가능하다. `store?` 주입 지점과
  `https.request` stub이 전부다
- [ ] **#037 `store.upsertValidation` 반환 계약** — `items.length`를 반환하는데 실제로 쓰인 행 수가
  아닐 수 있다(prompt_hash 충돌 시 3 반환 / 2행, 서브에이전트 VERIFIED). `trainer.ts:55`는 반환값을
  버려 현재는 잠복. 반환값을 "쓰인 행 수"로 바꿀지 무시할지 결정
- [ ] **#038 `metaUpdateEveryEpochs` 미구현** — `types.ts:84`에 선언돼 있고 CLI(`--meta-every`)가
  노출하지만 **읽는 코드가 어디에도 없다.** `--meta-every 1`을 주면 조용히 아무 일도 안 일어난다.
  읽는 곳을 구현하거나 옵트를 제거
- [ ] **optimizer store.ts I/O 322줄 커버리지 0**

### Search

- [ ] **#032 `getRelatedLearnings` 타입 계약** — 카테고리 fallback이 `SearchResult[]`로 캐스팅하지만
  `rank`·`snippet` 키가 없다. 공개 타입이 실제 반환보다 넓음
- [ ] **#033 `+1` 오버페치** — "타깃이 상위 N칸에 없다"를 보장하지 않음. `limit`보다 적은 결과가
  나올 수 있다(관측된 동작, 결함 여부 미판정)
- [ ] **#034 문서 수치 드리프트** — `docs/TEST-LOG.md`가 `fts.ts`를 320줄로 기록하나 실제 181줄

### 부분 구현

- [ ] **#016 증거 커밋 연결** — `lifecycle: complete`가 산출물 모양만 요구하고 HEAD 커밋을
  연결하지 않는다. 가짜 증거("done" 한 단어)는 실패하지만 진짜 커밋도 요구하지 않는다
- [ ] **#017 ADR↔Task Contract 교차검사** — ADR이 실제 구현과 맞는지 자동 검사 없음

### 자체 게이트의 비대칭 (이번 세션에 발견)

- [ ] **`AGENTS.md` 8KB advisory가 테스트에서는 hard fail** — `validate-context`는 advisory로
  exit 0을 주지만 `scripts/__tests__/validate-context.test.js`의 "real entry doc" 테스트는
  실패로 본다. 어느 쪽이 정본인지 결정해야 한다. 이번 세션에는 문서를 줄여 양쪽을 통과시켰지만
  구조적 불일치는 남아 있다

## 이번 세션에 남긴 실측 (추정 아님)

- 리포터 형식: node 20.11.0·22.17.0 = tap(`# pass`), node 24.19.0 = spec(`ℹ pass`) — 직접 실행 확인
- `session-close`가 3레그 전부 실패했음 — 리포터 형식 기전은 실측, end-to-end 게이트 실패는 미실측
- 캐시 없는 `npm ci` 2.5초, prebuild 바이너리로 컴파일 불필요
- `npm publish` 산출물 318.4 kB (언팩 1.1 MB, 301파일)