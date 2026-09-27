# AGENTS.md — pro-workflow-lab

프로젝트 단위 작업 규칙. 전역 `~/.claude/CLAUDE.md`와 함께 적용되며, 충돌 시 이 파일이
프로젝트 고유 경계를 정의한다.

---

## 모델 비의존성 (어떤 모델·도구로都一样하게 작동하게 만드는 방법)

모델을 바꿔도 **작동·기준·품질이 같아야** 한다. 이를 약속으로 두지 않고 기계로 만든다.

1. **규칙은 한 곳에만 존재한다.** 이 파일이 원본이고 `CLAUDE.md`는 `@AGENTS.md`로 이 파일을
   가리키는 얇은 어댑터일 뿐이다. Codex·Cursor·Gemini CLI는 `AGENTS.md`를 직접 읽는다.
   두 파일에 복사하면 어느 쪽이 진짜인지 갈라진다.
2. **규칙이 아니라 게이트로 강제한다.** `npm run verify`가 세 게이트를 돌고 같은 명령이
   CI에서도 다시 돈다. 지시를 못 읽는 에이전트도 게이트는 통과할 수 없다.
3. **센서가 규칙 파일 자체를 검사한다.** `validate-context`가 `CLAUDE.md`의 존재·`@AGENTS.md`
   import·규칙 제목 중복을 확인한다. 강제 장치 표의 여섯 번째 행이 그 대응물이다.
4. **모델·effort 전환은 품질을 바꾸지 않는다.** 통과 기준은 `npm run verify`의 exit code
   하나뿐이다. 모델이 나쁘면 그 모델을 바꾸고 기준을 낮추지 않는다.

## 세션 시작 규칙 (점진적 노출)

이 파일은 매 세션 통째로 읽히므로 8KB 이하를 유지한다
(`npm run validate:context`가 검사). 세부는 경로로만 가리킨다.

1. `.context/STATE`의 `checkpoint`와 `blockers`만 읽는다 (한 줄 JSON).
2. 그다음 `.context/TODO.md`에서 `todo_active`의 stage를 확인한다.
3. 그 밖의 문서는 필요할 때만 연다. `dirty: true`면 복구 프로토콜을 먼저 실행한다.
4. 상태가 불일치하면 손대기 전에 `npm run validate:context`로 드리프트를 확인한다.

`TODO = 0`인 도메인은 "미개발 위험"으로 취급한다. 기능 추가 전에 Domain Map을 갱신한다.

---

## 세션 종료 게이트 (필수, 예외 없음)

**사용자가 세션 종료를 요청하면 — 어느 단계에서든, 커밋 여부와 무관하게 — 아래를
순서대로 실행한다. 이 게이트를 건너뛰고 세션을 닫지 않는다.**

1. **독립 코드 리뷰 실행.** 메인 컨텍스트의 자기 판단으로 판정하지 않는다. 새
   프로세스·새 컨텍스트에서 메인이 작성한 내용을 보지 않은 상태로 리뷰시킨다.

   ```bash
   opencode run --model "opencode-go/deepseek-v4.1-flash" \
     --dir "$PWD" "<리뷰 대상 커밋/범위와 리뷰 요구사항>"
   ```

   리뷰 프롬프트에는 반드시 다음을 포함한다.
   - 리뷰 대상을 명시 (`git show <sha>` / diff 범위)
   - "작성자를 신뢰하지 말고, 동기 부여 설명도 검증 대상"이라는 지시
   - `VERIFIED` / `INFERENCE` 라벨링 강제
   - 수정 금지(리뷰만), 발견은 `[SEVERITY] file:line` + VERIFIED/IMPACT/FIX 형식
   - 심각도 등급이 비어 있는 등급은 **명시적으로** 보고할 것

2. **리뷰 실측 확인.** 리뷰어가 실제로 명령을 실행해 결과를 냔는지 확인한다.
   권한 거부·도구 실패로 **중간에 끊긴 리뷰는 완료된 리뷰가 아니다.** 미완료라면
   재실행하거나, 미완료 사실을 그대로 보고한다. 부분 결과를 완료처럼 제시하지 않는다.

3. **blocker / major 수정.** 리뷰 결과에서 `blocker`와 `major` 등급은 반드시 수정한다.
   `minor`/`nit`은 TODO로 남기되 사유를 기록한다. 등급 판정 근거가 불명확하면
   수정 전에 사용자에게 확인한다.

4. **수정 후 재실측.** 수정했으면 `npm test`, `npx tsc --noEmit`, `npm run build`를
   다시 돌려 exit code를 확인한다. 이전 실행 결과를 재사용하지 않는다.

5. **체크포인트 갱신.** `.context/STATE`와 `.context/CONTEXT.md`에 리뷰 결과와
   미해결 항목을 기록한다. 미검증 항목은 반드시 "미검증"으로 남긴다.

6. **사용자에게 보고.** 실제 명령 출력으로 뒷받침된 것만 보고한다. 추측·예측을
   결과로 제시하지 않는다. 무엇을 검증했고 무엇을 검증하지 못했는지 구분해
   明시한다.

### 리뷰 결과 처리 규칙

- 리뷰어의 판단을 그대로 믿지 않는다. 메인이 실제 diff와 재실측으로 최종 판정한다.
- 리뷰어가 틀린 판정은 수정하지 않는다. 근거를 남기고 기각한다.
- 리뷰 없이 "완료"라고 보고하지 않는다. 리뷰를 건너뛴 이유를 기록해야 한다.

---

## 보고 규칙 (전 세션 공통)

- 모든 결과는 **실측**이다. 명령을 실행하고 exit code·출력 원문을 근거로 한다.
- 추측, 예측, 추론을 결과로 보고하지 않는다. 검증 불가한 항목은 "미검증"이라고
  명시한다.
- 사용자가 만든 요구·결정은 반영하되, 근거가 틀렸으면 근거를 반박하고 대안을 제시한다.

---

## 강제 장치 (규칙을 지킨다는 약속이 아니라 실제로 막는 곳)

| 원칙 | 기계가 막는 곳 |
|------|--------------|
| 테스트가 실제로 실행될 것 | `npm test` → `scripts/run-tests.js`가 `src/`·`scripts/`를 깊이 무관 탐색. 0건이면 exit 1. `__tests__/` 안의 비실행 파일은 제외 |
| CI가 테스트를 돌릴 것 | `.github/workflows/ci.yml`의 `Run tests` 스텝. 제거하거나 matrix job 밖으로 옮기면 `src/__tests__/ci.test.ts`가 실패 |
| 컨텍스트 파일이 유효할 것 | `npm run validate:context` → `scripts/validate-context.js` |
| 이 세 가지를 한 번에 | `npm run verify` (check → test → validate:context) |
| 세션 종료가 실제로 happened | `docs/next-session-prompt.md`의 `baseline` 절 + `TOOL_LABEL` + 80줄 캡, `docs/sessions/<날짜>/` 6개 파일, `docs/` 루트 동기화, 제품 커밋이 handoff에 기록됨. 위반 시 exit 1 (`npm run session:close`) |
| 독립 리뷰가 실제로 돌아갔는가 | `docs/sessions/<날짜>/REVIEW.md`에 `REVIEW_MODEL`·`REVIEW_RESULT`. 규칙만 있고 결과물이 없으면 실패 |
| 이력 문서가 현재본을 덮지 않음 | `docs/DONE.md` 금지. DONE은 날짜 폴더 전용 (20개 프로젝트 중 15개가 루트에 없음) |
| 이 문서가 규칙의 유일한 원본 | `validate-context`의 CLAUDE.md import·중복 검사 |

`scripts/validate-context.js`가 검사하는 것: AGENTS.md 8KB 캡과 200B 하한, `CLAUDE.md`가
`@AGENTS.md`를 import 하고 규칙을 복사하지 않았음, `.context/STATE`의 필수 7개 필드와 타입,
`todo_active`이 TODO.md에 실제로 존재함, 심볼릭 링크가 저장소를 벗어나지 않음, 가짜 증거 차단,
ADR 상태 라인, CONTEXT/TODO/glossary의 존재·비어있지 않음, 커밋되는 문서 전체에
절대 홈경로(`/Users/<이름>/`·`/home/<이름>/`·`C:\Users\<이름>\`)가 없는 것. 위반 시 고칠 파일·예상값·실제값을 출력하고
exit 1. AI 호출과 네트워크를 쓰지 않는다.

pre-commit 훅은 **연결하지 않았다**. 이 클론은 `core.hooksPath`가 설정되어 있지 않고
`scripts/commit-validate.js`도 opt-in(`scripts/setup-hook.js`) 구조라, Git 훅 경로는
기존 방식을 따르려 하지 않고 CI만 게이트로 썼다. 로컬 커밋 전 게이트가 필요하면
`npm run verify`를 직접 돌린다.

---

## 알려진 미해결 사항

거부된 항목, 부분 구현, 스코프 밖으로 남긴 이유, 그리고 미검증 항목을 `.context/TODO.md`
(#016~#030) 와 `.context/CONTEXT.md`의 "미검증 항목" 절에 적었다. 새 항목을 여기에 복사하지
않고 거기 references만 둔다. 상세 목록을 이 파일에 복사하면 이 파일이 8KB 캡을 넘긴다.
