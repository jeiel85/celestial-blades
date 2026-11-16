// 측정 도구 공용: 헤드리스 Chrome으로 개발 서버의 게임 페이지를 열고, 페이지 안에서 모듈 함수를 돌려 결과 문자열을 받는다.
// Chrome 경로는 CHROME 환경 변수로 바꿀 수 있다. 소프트웨어 WebGL(SwiftShader)을 쓴다: 원격 데스크톱 세션처럼
// GPU를 못 잡는 환경에서도 WebGL 컨텍스트가 끊기지 않게 하기 위해서다(측정은 화면을 그리지 않아 속도 차이가 없다).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9333;

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

/**
 * base(개발 서버 주소)의 게임을 열어 window.__CB_GAME이 생길 때까지 기다린 뒤 expression(Promise<string>)을 평가한다.
 * 성공하면 결과 문자열을, 실패하면 오류를 표준 오류에 쓰고 null을 돌려준다.
 */
export async function evaluateInGame(base, expression) {
  const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const profile = mkdtempSync(join(tmpdir(), 'cb-bench-'));
  const proc = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    'about:blank',
  ]);
  let out = null;
  try {
    let ws = null;
    for (let i = 0; i < 50 && !ws; i += 1) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`${base}/?bench`)}`, { method: 'PUT' });
        if (res.ok) ws = (await res.json()).webSocketDebuggerUrl;
      } catch {
        // Chrome이 아직 뜨는 중
      }
      if (!ws) await new Promise((r) => setTimeout(r, 200));
    }
    if (!ws) throw new Error('Chrome 디버깅 포트에 연결하지 못했습니다');
    const cdp = client(ws);
    await cdp.ready;
    await cdp.send('Runtime.enable');
    // 게임 객체가 생길 때까지 기다린다(개발 서버가 의존성을 다시 최적화하면 첫 로드가 1분 넘게 걸린다).
    for (let i = 0; i < 900; i += 1) {
      const r = await cdp.send('Runtime.evaluate', { expression: 'typeof window.__CB_GAME', returnByValue: true });
      if (r.result?.result?.value === 'object') break;
      await new Promise((res) => setTimeout(res, 200));
    }
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 1_800_000 });
    if (r.error || !r.result) {
      console.error('CDP 오류:', JSON.stringify(r.error ?? r));
    } else if (r.result.exceptionDetails) {
      console.error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
    } else {
      out = r.result.result.value;
    }
    cdp.close();
  } catch (err) {
    console.error(err);
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
  return out;
}
