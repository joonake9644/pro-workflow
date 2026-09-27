# 다음 세션 작업 지시서 — 2026-09-28 이후

## 🎯 다음 세션 목표
`[Storage]` 다음인 `[Search]` 도메인(`src/search/fts.ts`, 커버리지 0)에 TDD를 적용하고,
그래서 발견된 `getRelatedLearnings`의 FTS 문법 버그를 재현 확인한 뒤 고친다.

## ⚡ 즉시 시작 명령
다음 세션 시작 시 아래를 그대로 붙여넣으세요:

```
세션 이어받기. 프로젝트: /Users/joonake/Developer/projects/pro-workflow-lab  # validate-context:allow-home-path — 이 문서는 새 세션이 붙여넣을 경로라 절대 경로가 필요하다
오늘 할 것: #025 Storage 결함 수정(무효 갱신) → #005 [Search] 도메인 TDD 시작
먼저 git fetch 후 동기화 확인, 그 다음 npm run verify 로 baseline 확인.
```

## 📋 순서대로 할 일
1. **동기화 + baseline 확인** — 예상 시간: 3분
   - `git fetch fork && git rev-list --left-right --count fork/main...HEAD`
   - `npm run verify` (exit 0이어야 시작)
   - node 를 바꿨다면 `npm rebuild better-sqlite3` (ABI 불일치 방지, 15분 소요)
2. **#025 무효 갱신 수정** — 예상 시간: 20분
   - `updateLearning`이 `project`를 COALESCE 목록에 넣지 않아 조용히 버리고 `true`를 반환한다
   - `src/db/store.ts:130` 부근. RED 테스트를 먼저 추가하고 최소 수정은 `project` 포함
   - project 변경을 금지해야 하는 호출부가 있는지 먼저 grep으로 확인
2b. **`npm run session:close` 게이트 갱신** — 예상 시간: 20분
   - 구조만 검사해서 **최신 커밋보다 오래된 종료 문서를 통과**시킨다. 이번 세션에 실제로 그랬다
   - 종료 문서의 최종 커밋이 HEAD와 같은지 검사하는 freshness 규칙이 필요하다(#031)
3. **#005 [Search] TDD** — 예상 시간: 90분
   - `src/search/fts.ts` 5개 함수. explore 서브에이전트로 API 맵 + 런타임 검증 확보
   - `searchWiki`와 다른 점: `fts.ts`는 `createStore`가 아니라 원시 `Database.Database` 핸들을 받는다
   - **먼저 재현**: `getRelatedLearnings`가 키워드 2개 이상인 learning에 `SQLITE_ERROR`를 던진다는
     주장이 있다(서브에이전트 발견, 미검증). RED 테스트로 먼저 고정
4. **저장소 결함 명세** — 예상 시간: 30분
   - `sanitizeQuery`(`fts.ts:140`)가 FTS 문법을 통과시킨다. `*`·`OR`·`NEAR(` 등이 살아남음
   - 이게 #005의 근본 원인일 가능성이 크다. `sanitizeFtsQuery`(store.ts)처럼 무조건 안전하게 만들지
     검색어 유연성도 잃음 — 판단 필요

## 📁 이어받을 파일
| 파일 | 용도 |
|------|------|
| `.context/STATE` | 한 줄 JSON. `checkpoint`·`blockers`만 먼저 읽는다 |
| `.context/TODO.md` | #005~#030. 도메인별 TODO 0은 미개발 위험으로 취급 |
| `.context/CONTEXT.md` | 세션 기록 전체. #025의 실측 근거가 여기 있다 |
| `AGENTS.md` | 규칙 유일 원본. 세션마다 전체를 읽는다 |
| `CLAUDE.md` | 얇은 어댑터. 규칙을 여기에 복사하지 않는다 |
| `docs/sessions/2026-09-28/TEST-LOG.md` | 왜 어떤 게 아직 미검증인지 |

## baseline 상태
<!-- npm run verify 결과 -->
- passed: 225 / failed: 0 / suites: 16 / test files discovered: 9
- build exit 0, tsc exit 0, validate-context OK
- baseline 실행 시각: 2026-09-28T00:20 (node v24.19.0, ABI 137)
- 기록 시점 커밋: 3767650 (freshness 게이트는 이 커밋 이후의 새 커밋에서 다시 갱신을 요구한다)
- 다음 세션 시작 시 `npm run verify` 재실행 필요. 다르면 baseline이 드리프트한 것이다

## ⚠️ 주의사항
- **node 전환 후 `npm rebuild better-sqlite3` 필수.** 바인딩이 단일 ABI라 안 하면 49건이
  로드 실패로 깨진다. 테스트 결함처럼 보이지만 아니다. 15분 걸린다 — 시간 배율로 잡을 것.
- **`[Search]`는 `:memory:`로 충분하다.** 파일 DB는 상위 디렉터리를 직접 만들어야 하고 teardown에서
  `.db`·`-wal`·`-shm` 셋을 지워야 한다. `initializeDatabase`는 `~/.pro-workflow`를 매번 만든다.
- **변조로 통과한 건 통과가 아니다.** 손으로 고른 뮤턴 목록을 커버리지로 보고하지 않는다.
- **리뷰 프로세스는 권한 거부로 끊길 수 있다.** 완료 리포트가 실제로 나왔는지 확인하기 전까지
  "리뷰 완료"로 취급하지 않는다.
- `AGENTS.md`는 8KB 캡의 91%다. 문장을 추가하기 전에 `.context/`로 경로를 참조한다.

## 🔗 참고 문서
- `docs/sessions/2026-09-28/TICKETS.md` — 전체 미완료 목록
- `docs/sessions/2026-09-28/DONE.md` — 이번 세션 완료 항목과 결정
- `docs/sessions/2026-09-28/CONTEXT.md` — 결정 근거와 함정
- `docs/sessions/2026-09-28/TEST-LOG.md` — 테스트 기록과 미검증 영역
- `.context/TODO.md` — 항목 단위 추적

---
_생성: 2026-09-28 세션 종료 시_
