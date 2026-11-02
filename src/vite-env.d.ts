/// <reference types="vite/client" />

/** 빌드 시 src/의 소스에서 모은, 화면에 쓰일 수 있는 글자 전부(vite.config.ts의 uiGlyphsPlugin). */
declare module 'virtual:ui-glyphs' {
  const glyphs: string;
  export default glyphs;
}
