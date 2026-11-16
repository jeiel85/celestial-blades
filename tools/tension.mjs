// 긴박감 측정 실행기: 개발 서버(npm run dev)를 띄운 상태에서
//   node tools/tension.mjs [http://localhost:5173] [runs.json] [--json]
// 헤드리스 Chrome으로 src/dev/tension.ts의 runTension을 돌려 구간별 표를 출력한다(--json이면 원본 JSON).
// runs.json이 없으면 defaultRuns()를 쓴다(TensionRun 배열).
import { readFileSync } from 'node:fs';
import { evaluateInGame } from './cdp.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--json');
const asJson = process.argv.includes('--json');
const base = args[0] ?? 'http://localhost:5173';
const runs = args[1] ? JSON.parse(readFileSync(args[1], 'utf8')) : null;

const out = await evaluateInGame(
  base,
  `(async () => {
    const m = await import('/src/dev/tension.ts');
    const runs = ${runs ? JSON.stringify(runs) : 'm.defaultRuns()'};
    return JSON.stringify(await m.runTension(window.__CB_GAME, runs));
  })()`,
);
if (out === null) process.exit(1);
if (asJson) {
  process.stdout.write(`${out}\n`);
  process.exit(0);
}

const rows = [];
for (const r of JSON.parse(out)) {
  for (const key of ['road', 'midboss', 'boss']) {
    const s = r[key];
    if (!s) continue;
    rows.push({
      run: r.name,
      seg: key,
      sec: s.sec,
      '탄 평균': s.bulletsAvg,
      '탄 p90': s.bulletsP90,
      '탄 최대': s.bulletsMax,
      '빈 화면%': s.emptyPct,
      '잡몹/분': key === 'road' ? s.enemiesPerMin : '',
      '스침/초': s.grazePerSec,
      '닿은 탄/분': s.hitsPerMin,
      '침묵 처치%': key === 'road' ? r.silentKillPct : '',
      클리어: key === 'boss' ? (r.cleared ? 'O' : 'X') : '',
    });
  }
}
console.table(rows);
