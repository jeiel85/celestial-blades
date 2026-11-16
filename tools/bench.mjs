// 화력 측정 실행기: 개발 서버(npm run dev)를 띄운 상태에서
//   node tools/bench.mjs [http://localhost:5173] [bossId] [cases.json]
// 헤드리스 Chrome으로 게임을 열어 src/dev/bench.ts의 runBench를 돌리고 결과 JSON을 표준 출력에 쓴다.
// cases.json이 없으면 defaultCases()를 쓴다. Chrome 경로는 CHROME 환경 변수로 바꿀 수 있다.
import { readFileSync } from 'node:fs';
import { evaluateInGame } from './cdp.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const bossId = process.argv[3] ?? 'midboss_ray';
const cases = process.argv[4] ? JSON.parse(readFileSync(process.argv[4], 'utf8')) : null;

const out = await evaluateInGame(
  base,
  `(async () => {
    const m = await import('/src/dev/bench.ts');
    const cases = ${cases ? JSON.stringify(cases) : 'm.defaultCases()'};
    return JSON.stringify(await m.runBench(window.__CB_GAME, cases, ${JSON.stringify(bossId)}));
  })()`,
);
if (out === null) process.exit(1);
process.stdout.write(`${out}\n`);
