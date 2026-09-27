# AGENTS.md — pro-workflow-lab

프로젝트 단위 작업 규칙. 전역 `~/.claude/CLAUDE.md`와 함께 적용되며, 충돌 시 이 파일이
프로젝트 고유 경계를 정의한다.

---

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
| 테스트가 실제로 실행될 것 | `npm test` → `scripts/run-tests.js`가 `src/`·`scripts/`를 깊이 무관 탐색. 0건이면 exit 1 |
| CI가 테스트를 돌릴 것 | `.github/workflows/ci.yml`의 `Run tests` 스텝. 제거하면 `src/__tests__/ci.test.ts`가 실패 |
| 컨텍스트 파일이 유효할 것 | `npm run validate:context` → `scripts/validate-context.js` |
| 이 세 가지를 한 번에 | `npm run verify` (check → test → validate:context) |

`scripts/validate-context.js`가 검사하는 것: AGENTS.md 8KB 캡, `.context/STATE`의 필수
7개 필드와 타입, CONTEXT/TODO/glossary의 존재·비어있지 않음, 커밋되는 문서에
절대 경로(`/Users/<이름>/`)가 없는 것. 위반 시 고칠 파일·예상값·실제값을 출력하고
exit 1. AI 호출과 네트워크를 쓰지 않는다.

pre-commit 훅은 **연결하지 않았다**. 이 클론은 `core.hooksPath`가 설정되어 있지 않고
`scripts/commit-validate.js`도 opt-in(`scripts/setup-hook.js`) 구조라, Git 훅 경로는
기존 방식을 따르려 하지 않고 CI만 게이트로 썼다. 로컬 커밋 전 게이트가 필요하면
`npm run verify`를 직접 돌린다.

---

## 알려진 미해결 사항 (2026-09-27 실측)

- **Node 18 CI 레그 검증 불가.** `engines: >=18.0.0`이나 `better-sqlite3@12.8.0`은
  `20.x || 22.x || 23.x || 24.x || 25.x`를 요구한다. CI 매트릭스에 18이 있으나 이
  환경에 node 18이 없어 실제 동작을 확인하지 못했다.
- **fork의 GitHub Actions 미실행.** `joonake9644/pro-workflow`에 push했으나 run 기록이
  0건이다. fork는 push 트리거 워크플로가 기본 비활성이며, 활성화 여부를 확인하지
  못했다. 따라서 CI 게이트는 로컬 3버전 실측만으로 뒷받침된다.
