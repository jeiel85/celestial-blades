// 화력 측정 실행기: 개발 서버(npm run dev)를 띄운 상태에서
//   node tools/bench.mjs [http://localhost:5173] [bossId] [cases.json]
// 헤드리스 Chrome으로 게임을 열어 src/dev/bench.ts의 runBench를 돌리고 결과 JSON을 표준 출력에 쓴다.
// cases.json이 없으면 defaultCases()를 쓴다. Chrome 경로는 CHROME 환경 변수로 바꿀 수 있다.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5173';
const bossId = process.argv[3] ?? 'midboss_ray';
const cases = process.argv[4] ? JSON.parse(readFileSync(process.argv[4], 'utf8')) : null;
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333;
const profile = mkdtempSync(join(tmpdir(), 'cb-bench-'));

const proc = spawn(chrome, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
  'about:blank',
]);

async function wsUrl() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${base}/?bench`)}`, { method: 'PUT' });
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {
      // Chrome이 아직 뜨는 중
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Chrome 디버깅 포트에 연결하지 못했습니다');
}

function client(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === 'Runtime.consoleAPICalled' && process.env.BENCH_LOG) {
      console.error('[page]', msg.params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.error('페이지 예외:', msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
    }
  };
  const ready = new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      id += 1;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { ready, send, close: () => ws.close() };
}

let exitCode = 0;
try {
  const cdp = client(await wsUrl());
  await cdp.ready;
  await cdp.send('Runtime.enable');
  // 게임 객체가 생길 때까지 기다린다.
  for (let i = 0; i < 300; i += 1) {
    const r = await cdp.send('Runtime.evaluate', { expression: 'typeof window.__CB_GAME', returnByValue: true });
    if (r.result?.result?.value === 'object') break;
    await new Promise((res) => setTimeout(res, 200));
  }
  const expr = `(async () => {
    const m = await import('/src/dev/bench.ts');
    const cases = ${cases ? JSON.stringify(cases) : 'm.defaultCases()'};
    return JSON.stringify(await m.runBench(window.__CB_GAME, cases, ${JSON.stringify(bossId)}));
  })()`;
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 1_800_000 });
  if (r.error || !r.result) {
    console.error('CDP 오류:', JSON.stringify(r.error ?? r));
    exitCode = 1;
  } else if (r.result.exceptionDetails) {
    console.error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
    exitCode = 1;
  } else {
    process.stdout.write(`${r.result.result.value}\n`);
  }
  cdp.close();
} catch (err) {
  console.error(err);
  exitCode = 1;
} finally {
  proc.kill();
  // 다음 실행이 같은 디버깅 포트를 쓰므로 Chrome이 완전히 닫힐 때까지 기다린다.
  await new Promise((r) => (proc.exitCode !== null ? r() : proc.once('exit', r)));
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome이 늦게 닫히면 임시 프로필이 남을 수 있다
  }
}
process.exit(exitCode);
