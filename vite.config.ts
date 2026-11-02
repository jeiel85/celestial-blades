import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';

/**
 * 빌드 산출물(dist/sw.js)에 해시가 붙은 JS/CSS와 그림(PNG/JPG) 번들 목록과 빌드 ID를 주입한다.
 * 서비스워커가 첫 방문 뒤 오프라인 실행에 필요한 번들을 프리캐시하게 하려는 것으로,
 * 새 npm 의존성(vite-plugin-pwa 등) 없이 처리한다.
 */
function swPrecachePlugin(): Plugin {
  let config: ResolvedConfig;
  let assets: string[] = [];
  return {
    name: 'sw-precache-assets',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    generateBundle(_options, bundle) {
      assets = Object.keys(bundle)
        // 로고 글꼴(woff/woff2)은 유니코드 범위별 조각이 수백 개라 프리캐시하지 않는다(처음 쓸 때 캐시됨).
        .filter((file) => /\.(js|css|png|jpg)$/.test(file))
        .sort()
        .map((file) => `./${file}`);
    },
    closeBundle() {
      const swPath = resolve(config.root, config.build.outDir, 'sw.js');
      const src = readFileSync(swPath, 'utf8');
      const idMarker = "const BUILD_ID = 'dev';";
      const assetsMarker = 'const BUILD_ASSETS = [];';
      if (!src.includes(idMarker) || !src.includes(assetsMarker)) {
        throw new Error('sw-precache-assets: dist/sw.js에서 BUILD_ID/BUILD_ASSETS 자리를 찾지 못했습니다.');
      }
      const buildId = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 10);
      const out = src
        .replace(idMarker, `const BUILD_ID = '${buildId}';`)
        .replace(assetsMarker, `const BUILD_ASSETS = ${JSON.stringify(assets)};`);
      writeFileSync(swPath, out);
    },
  };
}

/**
 * `virtual:ui-glyphs`: src/ 아래 .ts 소스에 등장하는 비ASCII 글자 + 출력 가능한 ASCII 전부.
 * 글꼴이 유니코드 범위별 조각으로 나뉘어 있어서, BootScene이 이 문자열로 document.fonts.load를 호출해
 * 화면에 쓰일 조각을 미리 받는다(Phaser 텍스트는 생성 시점 글꼴로 한 번 래스터화되기 때문).
 */
function uiGlyphsPlugin(): Plugin {
  const id = 'virtual:ui-glyphs';
  const resolvedId = `\0${id}`;
  let root = '';
  const collect = (dir: string, out: Set<string>): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) collect(p, out);
      else if (entry.name.endsWith('.ts')) {
        for (const ch of readFileSync(p, 'utf8')) if (ch.charCodeAt(0) > 0x7e) out.add(ch);
      }
    }
  };
  return {
    name: 'ui-glyphs',
    configResolved(resolved) {
      root = resolved.root;
    },
    resolveId(source) {
      return source === id ? resolvedId : null;
    },
    load(loadId) {
      if (loadId !== resolvedId) return null;
      const set = new Set<string>();
      collect(resolve(root, 'src'), set);
      let ascii = '';
      for (let c = 0x20; c <= 0x7e; c += 1) ascii += String.fromCharCode(c);
      return `export default ${JSON.stringify(ascii + [...set].sort().join(''))};`;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [swPrecachePlugin(), uiGlyphsPlugin()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600
  },
  server: {
    port: 5173,
    host: true
  }
});
