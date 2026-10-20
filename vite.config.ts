import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';

/**
 * 빌드 산출물(dist/sw.js)에 해시가 붙은 JS/CSS 번들 목록과 빌드 ID를 주입한다.
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
        .filter((file) => /\.(js|css)$/.test(file))
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

export default defineConfig({
  base: './',
  plugins: [swPrecachePlugin()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600
  },
  server: {
    port: 5173,
    host: true
  }
});
