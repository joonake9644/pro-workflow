# glossary.md (Living Glossary)

| 용어 | 정의 | 비고 |
|------|------|------|
| 기준선 | build/test/tsc/git 실측 출력 | 추측 보고 금지, 원문 보관 |
| 신규 세션 | .context/STATE 없음 상태 | Type A 프로토콜 |
| false-green | 테스트가 실행되지 않았는데 통과로 오인되는 상태 | 이 프로젝트의 핵심 결함 유형 |
| depth probe | 임의 깊이에 심어 테스트 탐지 깊이를 실측하는 임시 테스트 | RED 증명용, 검증 후 제거 |
| red/green 실측 | 결함을 실제로 재현(RED)하고 수정 후 통과(GREEN)를 **명령 출력으로** 입증 | 개수 변화로 증명 |
| coverage_gate | build+tsc+test 전부 exit 0 | passed 아니면 TODO 완료 불가 |
