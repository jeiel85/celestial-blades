/**
 * BGM 확인(개발 서버 전용): AudioSystem.renderMusic으로 곡을 강도별로 오프라인 렌더해 16비트 모노 WAV(base64)와
 * 최고·평균(RMS) 크기를 돌려준다. tools/music.mjs가 헤드리스 Chrome으로 불러 파일로 저장한다.
 */
import { AudioSystem } from '../game/systems/AudioSystem';
import type { MusicIntensity, MusicKind } from '../game/systems/AudioSystem';

export interface MusicClip {
  name: string;
  kind: MusicKind;
  /** 시각(초)마다 강도. 첫 항목은 0초 */
  plan: { at: number; level: MusicIntensity }[];
  seconds: number;
}

export interface RenderedClip {
  name: string;
  wav: string;
  /** 최고 크기(1 = 0dBFS)와 평균 크기 */
  peak: number;
  rms: number;
}

function toWavBase64(buf: AudioBuffer): string {
  const data = buf.getChannelData(0);
  const bytes = new ArrayBuffer(44 + data.length * 2);
  const v = new DataView(bytes);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + data.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i += 1) {
    const s = Math.max(-1, Math.min(1, data[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let bin = '';
  const u8 = new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function renderClips(clips: MusicClip[]): Promise<RenderedClip[]> {
  const out: RenderedClip[] = [];
  for (const c of clips) {
    const buf = await AudioSystem.renderMusic(c.kind, c.plan, c.seconds);
    const d = buf.getChannelData(0);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < d.length; i += 1) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      sum += d[i] * d[i];
    }
    out.push({ name: c.name, wav: toWavBase64(buf), peak: Math.round(peak * 1000) / 1000, rms: Math.round(Math.sqrt(sum / d.length) * 1000) / 1000 });
  }
  return out;
}

/** 기본 세트: 바꾸기 전 소리(강도 0)와 강도별 비교, 보스 마지막 페이즈 진입 */
export function defaultClips(): MusicClip[] {
  return [
    { name: 'stage1_i0_before', kind: 'stage1', plan: [{ at: 0, level: 0 }], seconds: 12 },
    { name: 'stage1_i1_road', kind: 'stage1', plan: [{ at: 0, level: 1 }], seconds: 12 },
    { name: 'stage1_i2_lastlife', kind: 'stage1', plan: [{ at: 0, level: 2 }], seconds: 12 },
    { name: 'boss_i2', kind: 'boss', plan: [{ at: 0, level: 2 }], seconds: 12 },
    { name: 'boss_i2_to_i3_at6s', kind: 'boss', plan: [{ at: 0, level: 2 }, { at: 6, level: 3 }], seconds: 16 },
    { name: 'final_i1', kind: 'final', plan: [{ at: 0, level: 1 }], seconds: 12 },
    { name: 'story_unchanged', kind: 'story', plan: [{ at: 0, level: 3 }], seconds: 8 },
  ];
}
