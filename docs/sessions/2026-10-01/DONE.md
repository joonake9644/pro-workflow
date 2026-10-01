# DONE — 2026-10-01

## 완료 항목

### #006 [Optimizer-LLM] TDD — 80 fixture
- 탈출구 3건(`reflect.__test`·`validate.__test`·`store.__test`)을 **호출자 0건 grep 실측** 후
  정식 named export로 교체, `__test` 전부 삭제. `store.__test`는 이미 export된 함수의 중복 별칭이었다
- 결함 4건 수정:
  1. `store.ts` `slice(-0)` — `valCount`가 0이면 `slice(-0) === slice(0)`이라 validation에
     **전체 행**이 들어가고 train이 빴다. `valCount > 0` 분기로 수정
  2. `llm.ts` anthropic body가 `temperature` 키를 아예 만들지 않음. `validate.ts:28`은 채점 게이트에
     `temperature: 0`을 명시하는데 이 프로바이더에서 버려졌다. 실제 요청 body를 캡처해 확인 후 수정
  3. `llm.ts` `parseInt(...) || DEFAULT`에서 `'-1'`이 통과 → `setTimeout(fn, -1)` 즉시 발화.
     `resolveTimeoutMs`로 분리해 양수만 허용
  4. `reflect.ts` `extractReasoning`이 `{"reasoning":5}`에 숫자 `5` 반환 (선언 타입은 string).
     `parsePatches`·`parseOutcomes`의 null 요소 `TypeError`도 함께 수정

### #026~#030 [Storage] — 결함 5건, fixture 53 → 74
수정 전 **모든 결함의 프로덕션 호출자를 실측**했다. 5건 모두 호출자가 결함을 발동시킬 수 없음.

1. **#026** `getAllLearnings('')`·`listWikis('')`이 falsy로 받아 전체 반환 → `!== undefined`로 판정 변경.
   부수 발견: `wiki list --scope`(값 없이)는 파서가 `true`를 넣어 도달 가능했고 생짜
   `SQLite3 can only bind...`를 냈다. `typeof scope !== 'string'` 가드로 교체
2. **#027** 명시적 null 델타가 카운터를 **영구 NULL**로 만듦(`NULL + 0 = NULL`). 양쪽 COALESCE로
   수정 — 이미 null이 된 행도 복구된다. 프로덕션 DB 전수 조사 결과 손상 행 0건
3. **#028** `wiki_seeds.status` 무제약. **실제 피해는 오염이 아니라 보이지 않음** — 임의 status 행이
   `nextPendingSeed`·`claimPendingSeed`·`cmdCancel`·`cmdStatus` 네 경로 전부에서 회피된다.
   애플리케이션 가드 + 스키마 CHECK. 프로덕션 호출자는 status를 리터럴만 넘겨 회귀 없음
4. **#029** **TODO보다 심각.** 두 번째 호출이 조용히 또 다른 NULL-id 행을 만든다.
   `id TEXT PRIMARY KEY`는 SQLite에서 NOT NULL을 함의하지 않고 UNIQUE 인덱스에 NULL이 반복될 수
   있어 PRIMARY KEY만으로는 막히지 않는다. `getSession(null)`도 undefined라 공개 API로 회수 불가.
   `getRecentSessions()`를 오염시키고 `session-start.js`의 "이전 세션" 출력에 섞인다. 삽입 전 가드
5. **#030** `initializeDatabase`가 dbPath와 무관하게 `~/.pro-workflow`를 생성. `ensureDbDir(dir)`가
   파라미터를 받고 `dirname(dbPath)`를 mkdir. **계약이 바뀌어** 버그를 고정하던 기존 테스트 2건 교체

### session-close 게이트 — blocker 1건 (리뷰 발견)
spec 리포터(`ℹ`)만 파싱 → **CI 매트릭스 3레그(18/20/22) 전부 실패.** 게이트를 CI에 추가한
changeset이 스스로 통과 불가능했다. node 20.11.0·22.17.0에서 직접 실행해 `# pass` 출력 확인.
TAP 형식 fixture를 RED로 고정하고 GREEN. `num()`이 `m` 플래그를 버리던 결함도 함께 고쳤다

### 설치·저장소 정리
- `npm approve-scripts`로 better-sqlite3·esbuild·fsevents 승인. 캐시 없이도 `npm ci` **2.5초**,
  네이티브 바인딩 존재, 239 tests 통과를 신규 설치본에서 실측
- `.opencode/`(61 MB)·`.omo/`를 `.gitignore`에 추가

### AGENTS.md 8KB advisory 해소
8841 B → 7781 B(113줄). 상세 서술을 새 `.context/GATES.md`로 옮기고 경로만 남겼다.
이 문서가 스스로 지시한 방식이다

## 기각한 리뷰 발견 (근거 기록)

**`infix NEAR`가 FTS5 문법 에러라는 minor — 기각.** 리뷰어는 실행 없이 FTS5 BNF로 추론했다.
메인이 같은 suite에서 실측: `a NEAR b` → `[]`, `zebra NEAR giraffe` → 예외 없음. `NEAR`는 중위에서도
독립 토큰으로 분류되고 양끝 제거 후 빈 결과가 된다. 수정하지 않고 **실측된 동작을 테스트로 고정**했다.

## 내가 만든 테스트 실측 오류 (기록)

- 카운터 복구 테스트가 통과하는데 **엉뚱한 이유**로 통과했다. 전제 경로(명시적 null 델타)가
  수정으로 사라졌는데도 그대로 뒀다. "이전 빌드가 이미 null로 만든 행"을 raw UPDATE로 세팅하는
  전제로 고쳐야 했다
- `enqueueSeed` RED를 캐스트로 덮으려니 tsc exit 2. `parent_id: null` 명시가 관례였다
- 뮤턴 스크립트가 `.trim()`을 "치환"했는데 `.trim()`이 그대로 남는 동치 변조를 만들었다.
  변조가 아니라면 살아남는 게 아니라 애초에 변조가 아니다

## 실측 최종 (커밋 885fe65 이후)
- `npm test` → **388 tests / 388 pass / 0 fail**, suites 35, test files 15
- `npx tsc --noEmit` → exit 0 · `npm run build` → exit 0
- `npm run validate:context` → OK · `npm run session:close` → **OK**
  (`live run: passed 388 / failed 0 / suites 35 / test files 15` — handoff와 대조 확인)

## 미검증 (이 세션에서 끝내지 못한 것)
- **GitHub Actions 실제 실행** — push 전이라 run 0건. 이번에 고친 게이트가 CI에서 도는지 미확인(#007)
- **node 18 레그** — 미설치. `better-sqlite3` engines가 20+를 요구해 `npm ci` 실패 가능성 높음(#035)
- **CHECK 제약이 이미 생성된 DB에 적용되지 않음** — 마이그레이션 미작성
- **`claimPendingSeed` 동시성** — 트랜잭션 래퍼도 UNIQUE 제약도 없고 문장 원자성에만 의존(#039)
- `trainer.ts`·`optimizer/store.ts`는 커버리지 0 유지 — `Math.random()` 때문에 비결정적(#036)