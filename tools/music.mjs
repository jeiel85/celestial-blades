// BGM 확인 실행기: 개발 서버(npm run dev)를 띄운 상태에서
//   node tools/music.mjs [http://localhost:5173] [outDir] [clips.json]
// 헤드리스 Chrome으로 src/dev/music.ts의 renderClips를 돌려 곡을 강도별 WAV로 저장하고, 최고·평균 크기를 출력한다.
// clips.json이 없으면 defaultClips()를 쓴다(MusicClip 배열).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateInGame } from './cdp.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const outDir = process.argv[3] ?? 'music-out';
const clips = process.argv[4] ? JSON.parse(readFileSync(process.argv[4], 'utf8')) : null;

const out = await evaluateInGame(
  base,
  `(async () => {
    const m = await import('/src/dev/music.ts');
    const clips = ${clips ? JSON.stringify(clips) : 'm.defaultClips()'};
    return JSON.stringify(await m.renderClips(clips));
  })()`,
);
if (out === null) process.exit(1);
mkdirSync(outDir, { recursive: true });
const rows = [];
for (const c of JSON.parse(out)) {
  writeFileSync(join(outDir, `${c.name}.wav`), Buffer.from(c.wav, 'base64'));
  rows.push({ clip: c.name, peak: c.peak, rms: c.rms, dBFS: c.peak > 0 ? Math.round(20 * Math.log10(c.peak) * 10) / 10 : -Infinity });
}
console.table(rows);
console.log(`WAV: ${outDir}`);
