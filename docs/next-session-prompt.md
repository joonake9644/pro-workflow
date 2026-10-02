TOOL_LABEL: opencode (space-bunny-free) · 회귀 리뷰는 opencode-go/deepseek-v4.1-flash

# 다음 세션 작업 지시서 — 2026-10-01 이후

## 🎯 다음 세션 목표
`#039` `claimPendingSeed`의 동시성 경계를 정한다. 트랜잭션 래퍼도 UNIQUE 제약도 없어 문장
원자성에만 의존하고, 바깥 `UPDATE`에 `status = 'pending'` 재확인이 없다. peek-claim으로
리팩터하면 이중 claim이 재현된다(리뷰어가 changes 1/1 실측). 손대기 전에 재확인을 먼저 붙인다.

## ✅ 직전 세션(2026-10-01)에서 끝난 것
- **#028 종료** — status 제약을 CHECK 대신 트리거로. 기존 DB까지 적용된다
- **#007 CI 실증 완료** — PR #1 run 36860867596, 3레그(20/22/24) 전부 success
- **#035 node 18 종료** — engines `>=20`, 매트릭스 `[20,22,24]`
- #006 optimizer TDD(뮤턴 25/25) · #026~#030 Storage 결함 5건(뮤턴 17/17)
- session-close 게이트의 TAP 리포터 결함과 PR freshness 구조 결함 수정

## ⚡ 즉시 시작 명령
```
세션 이어받기. 프로젝트: /Users/joonake/Developer/projects/pro-workflow-lab  # validate-context:allow-home-path
오늘 할 것: #039 claimPendingSeed 동시성 (UPDATE에 status 재확인부터)
먼저 git fetch 후 동기화 확인, 그 다음 npm run verify.
```

## 📋 순서대로 할 일
1. **baseline 확인** — 예상 시간: 3분
   - `git fetch fork && git rev-list --left-right --count fork/main...HEAD`
   - `npm run verify` (exit 0이어야 시작). baseline이 아래와 다르면 드리프트한 것이다
   - node를 바꿨다면 `npm rebuild better-sqlite3` (ABI 불일치 방지, 15분 소요)
2. **PR #1 처리** — 예상 시간: 5분
   - PR #1은 **초록이지만 머지하지 않았다.** main 병합은 사용자 승인이 필요하다(AGENTS.md)
   - 머지할지 브랜치를 유지할지 먼저 확인할 것
3. **`claimPendingSeed` 동시성 (#039)** — 예상 시간: 30분
   - 트랜잭션 래퍼도 UNIQUE 제약도 없고 문장 원자성에만 의존한다(#039)
   - `research-tick.js:60`이 별도 프로세스로 루프를 띄우므로 겹침이 가능하다
   - peek-claim으로 리팩터하면 **이중 claim이 실증 가능하다** — 리뷰어가 changes 1/1을 재현했다
   - 손대면 바깥 UPDATE에 `AND status = 'pending'` 재확인을 붙이는 게 최저선

## 📁 이어받을 파일
| 파일 | 용도 |
|------|------|
| `.context/STATE` | 한 줄 JSON. `checkpoint`·`blockers`만 먼저 읽는다 |
| `.context/TODO.md` | #007·#016~#017·#032~#039. 도메인별 TODO 0은 미개발 위험 |
| `.context/CONTEXT.md` | 세션 기록 전체. 이번 결함 4건의 실측 근거가 여기 있다 |
| `AGENTS.md` | 규칙 유일 원본. 세션마다 전체를 읽는다 |
| `docs/sessions/2026-10-01/TEST-LOG.md` | 이번 세션 테스트 기록과 미검증 영역 |
| `docs/sessions/2026-10-01/DONE.md` | 완료 항목과 기각한 리뷰 발견 |

## baseline 상태
<!-- npm run verify 결과 -->
- passed: 397 / failed: 0 / suites: 35 / test files discovered: 15
- build exit 0, tsc exit 0, validate-context OK
- baseline 실행 시각: 2026-10-01T10:40 (node v24.19.0, ABI 137)
- 제품 커밋: 94c77af (5차 리뷰 정리 — 중복 productHead 제거)
- 직전 제품 커밋: baab3d2 (CI freshness 면제 + #035 종료)
- 다음 세션 시작 시 `npm run verify` 재실행 필요. 다르면 baseline이 드리프트한 것이다

## ⚠️ 주의사항
- **이번 세션에서 리뷰어가 1건을 틀렸습니다.** `infix NEAR`가 FTS5 문법 에러라는 추론이었으나
  실행해 보니 `[]`를 반환하며 예외가 없었다. 실행 없이 문법으로 판단한 발견은 **재현부터** 한다.
- **`npm ci`가 2.5초다.** 의존성이 `better-sqlite3` 하나뿐이다. Next.js급 설치 시간을 가정하지
  말 것. `allowScripts`로 네이티브 빌드를 승인해 두었다 — 이게 없으면 캐시 없는 환경에서 막힌다.
- **`node_modules`는 다른 프로젝트와 공유하지 않는다.** 네이티브 바인딩이 ABI에 결합된다.
- **변조로 통과한 건 통과가 아니다.** 살아남은 뮤턴은 원인을 나눠 처리한다 — 테스트 공백이면
  RED를 추가하고, 동치 변조면 변조를 고친다. 이번에도 동치 변조가 2건이었다.
- `AGENTS.md`는 8KB 캡에 가까워진다. 문장을 추가하기 전에 `.context/`로 경로를 참조한다.

## 🔗 참고 문서
- `docs/sessions/2026-10-01/TICKETS.md` — 전체 미완료 목록
- `docs/sessions/2026-10-01/DONE.md` — 완료 항목과 기각한 리뷰 발견
- `docs/sessions/2026-10-01/CONTEXT.md` — 결정 근거와 함정
- `docs/sessions/2026-10-01/TEST-LOG.md` — 테스트 기록과 미검증 영역
- `docs/sessions/2026-10-01/REVIEW.md` — 독립 리뷰 원문과 수정 내역
- `.context/TODO.md` — 항목 단위 추적

---
_생성: 2026-10-01 세션 종료 시_