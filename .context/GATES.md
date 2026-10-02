# GATES.md — 강제 장치 상세

`AGENTS.md`의 강제 장치 표가 "무엇을 막는가"만 담고, 이 파일은 그 게이트가 **무엇을 검사하는지**
를 담는다. `AGENTS.md`가 8KB advisory를 넘지 않도록 세부는 여기로 옮긴다.

## `npm run verify`가 돌리는 세 게이트

1. `npm run check` → `tsc --noEmit`
2. `npm test` → `scripts/run-tests.js`
3. `npm run validate:context` → `scripts/validate-context.js`

같은 명령이 `.github/workflows/ci.yml`에서 node 매트릭스 `[20, 22, 24]`로 다시 돈다.

## `scripts/run-tests.js` — 테스트 탐색

- 루트: `src/`, `scripts/`. `fs.existsSync`로 걸러낸다
- 재귀: `fs.readdirSync(withFileTypes)` 수동 walk. 깊이 제한이 없다. node 자체 glob이
  v22.6.0+ 기능이라 구버전 node와 충돌하므로 의도적으로 피한다
- 테스트 파일 판정: **어디서든** `*.test.*`·`*.spec.*`(ts/js/mts/cts/mjs/cjs). **`__tests__/`
  안에서는** 실행 가능 확장자 파일 전부. `schema.sql`·`README.md`·`snapshot.json`은 제외 —
  tsx가 확장자를 모르면 suite 전체가 죽는다
- 실행: `node_modules/.bin/tsx --test <files>`, 없으면 `npx tsx`. exit code 그대로 전달
- **0건이면 exit 1.** 게이트가 아니라 실수 가림막이다

## `scripts/validate-context.js` — 컨텍스트 문서 검사

검사 항목:

- `AGENTS.md` 150줄 하드 · 12KB 절대 · 8KB advisory · 200B 하한
- `CLAUDE.md`의 `@AGENTS.md` import 존재, 규칙 제목 중복 없음
- `.context/STATE` 7필드 타입. `typeof` 판정기가 아니라 전용 판정기를 쓴다 — `typeof`은
  `null`과 배열을 모두 `'object'`로 돌려주어 STATE 전체 검증이 통째로 건너뛰어진다
- `todo_active`이 `TODO.md`에 실제로 존재하는지
- 심볼릭 링크가 저장소를 벗어나지 않는지
- 가짜 증거 차단 (`lifecycle: complete`는 200B 이상 + 명령/결과 인용 요구)
- ADR 상태 라인
- `CONTEXT.md`·`TODO.md`·`glossary.md` 존재·비어있지 않음
- 커밋되는 문서 전체의 절대 홈경로 없음. 예외는 `validate-context:allow-home-path` 주석
- handoff 신선도: handoff가 제품 커밋보다 오래되면 위반

위반 시 고칠 파일·예상값·실제값을 출력하고 exit 1. **AI 호출과 네트워크를 쓰지 않는다** —
센서는 결정론적이어야 재현된다.

## `scripts/session-close.js` — 종료 게이트

handoff(`docs/next-session-prompt.md`)를 검사하되, **구조만 보지 않고 라이브로 재측정해
필드별로 대조한다.** sha가 있어도 숫자가 틀리면 exit 1.

- 재측정: `npm test`를 실제로 돌려 exit code를 요구한다
- 파싱: spec 리포터(`ℹ pass N`)와 tap 리포터(`# pass N`) **둘 다** 받아야 한다. node는
  비TTY stdout에서 23 미만이면 tap이 기본이고, 이 게이트는 파이프로 출력을 읽는다.
  spec만 보면 CI 매트릭스 전 레그에서 실패한다 — VERIFIED(node 20.11.0·22.17.0 실측)
- `num()`은 `g`를 **덮어쓰지 않고** 기존 플래그에 합친다. `m`을 버리면 앵커된 패턴이 전부 null이 된다
- 정합성 검사: `passed + failed + (skipped + todo + cancelled) == tests`. skipped를 빼먹으면
  `it.skip()` 하나만 있어도 게이트가 깨진다

## 독립 코드 리뷰 절

세션 종료 게이트 1단계는 메인 컨텍스트의 자기 판단이 아니라 **새 프로세스·새 컨텍스트**에서
메인이 작성한 내용을 보지 않은 상태로 리뷰시켜야 한다.

```bash
opencode run --model "opencode-go/deepseek-v4.1-flash" \
  --dir "$PWD" "<리뷰 대상 커밋/범위와 리뷰 요구사항>"
```

리뷰 프롬프트에 반드시 포함할 것:

- 리뷰 대상을 명시 (`git show <sha>` / diff 범위)
- "작성자를 신뢰하지 말고, 동기 부여 설명도 검증 대상"이라는 지시
- `VERIFIED` / `INFERENCE` 라벨링 강제 — 실행하지 않은 런타임 동작을 INFERENCE로 표시하게
- 수정 금지(리뷰만). 발견은 `[SEVERITY] file:line` + VERIFIED/IMPACT/FIX 형식
- 심각도 등급이 비어 있는 등급은 **명시적으로** 보고할 것 ("major: 0건"처럼)

리뷰 결과는 **증거이지 판정이 아니다.** 각 주장을 재현하는 커맨드를 직접 실행하고,
재현되는 것만 보고한다. 재현되지 않는 주장은 `unverified`로 표기하고 수정하지 않는다.

## pre-commit 훅을 연결하지 않은 이유

이 클론은 `core.hooksPath`가 설정되어 있지 않고 `scripts/commit-validate.js`도 opt-in
(`scripts/setup-hook.js`) 구조다. Git 훅 경로는 기존 방식을 따르려 하지 않고 **CI만 게이트로
쓴다.** 로컬 커밋 전 게이트가 필요하면 `npm run verify`를 직접 돌린다.