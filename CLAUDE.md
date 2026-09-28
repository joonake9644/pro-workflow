@.plan/CAPSULE.md

@AGENTS.md

# pro-workflow-lab — Claude Code 진입점

이 파일은 **얇은 어댑터**다. 규칙의 유일한 원본은 [`AGENTS.md`](./AGENTS.md)다.
여기에 규칙을 복사하거나 덧붙이지 않는다. 규칙이 바뀌면 `AGENTS.md`만 고친다.

## 왜 이런 구조인가

프로젝트에서 모델을 바꿔도 **작동·기준·품질이 같아야** 한다. 이를 보장하는 방법:

1. **규칙이 한 곳에만 존재한다.** `AGENTS.md`가 원본이고 `CLAUDE.md`는 그것을 가리킨다.
   두 파일에 같은 규칙이 두 번 적히면 어느 쪽이 진짜인지 갈라지고, 갱신할 때 한쪽만 고쳐진다.
2. **규칙이 아니라 게이트로 강제한다.** 문장으로 지켜 달라고 하지 않는다.
   `npm run verify`가 세 게이트(`check`·`test`·`validate:context`)를 돌리고,
   같은 명령이 CI의 `Run tests`·`Validate session context` 스텝에서 다시 돈다.
   문서를 못 읽는 에이전트도 게이트는 통과할 수 없다.
3. **결과는 실측만 보고한다.** 명령을 실행한 출력과 exit code만 결과로 삼는다.

## Claude Code 전용

- **세션 종료**: 이 프로젝트는 `AGENTS.md`의 "세션 종료 게이트"를 따른다.
  전역 `session-wrap` 스킬이 `docs/sessions/YYYY-MM-DD/`에 종료 문서를 만든다.
  이 프로젝트의 기록 규칙은 `.context/`(STATE·CONTEXT·TODO·glossary)에 있고,
  `npm run validate:context`가 그 유효성을 강제한다. 둘 다 실행한다.
- **독립 리뷰**: 세션 종료 게이트 §1대로 `opencode run --model opencode-go/deepseek-v4.1-flash`로
  새 프로세스 리뷰를 먼저 돌린다. 자기 컨텍스트에서 자기 코드를 판정하지 않는다.
- **Stop 훅**: 이 프로젝트에는 `.claude/`가 없다. 화면 완료를 근거 없이 보고하지 않는 규칙은
  `AGENTS.md`의 보고 규칙이 지탱하고, 코드 게이트는 CI가 지탱한다.
- **effort·모델**: 아키텍처·고위험 판단은 메인(opus·high)이 직접 맡는다. 기계적 구현만 하위
  에이전트에 위임하고, 하위 에이전트 보고는 근거일 뿐 diff와 재실측으로 최종 판정한다.

## 읽는 순서

1. 이 파일
2. `AGENTS.md` 전체 (세션마다)
3. `.context/STATE`의 `checkpoint`·`blockers`만 (한 줄 JSON)
4. 그 외 문서는 필요할 때만

## 확인할 명령

```bash
npm run verify            # check + test + validate:context — 완료 전 필수
npm test                  # 테스트만
npm run validate:context  # 세션 컨텍스트 유효성만
```
