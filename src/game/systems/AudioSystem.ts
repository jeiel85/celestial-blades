/**
 * 순수 Web Audio API 합성 오디오 시스템.
 * 외부 음원 파일 없이 사인/노이즈/스윕으로 효과음과 BGM을 만든다.
 * AudioContext는 첫 사용자 입력(resume())에서 활성화하고,
 * 어떤 실패에서도 예외를 던지지 않고 무음으로 동작한다.
 */

export type SfxName =
  | 'shoot'
  | 'chargeFull'
  | 'chargeShot'
  | 'enemyHit'
  | 'explode'
  | 'playerHit'
  | 'item'
  | 'bomb'
  | 'bossWarn'
  | 'bossDie'
  | 'menu';

export type MusicKind = 'stage1' | 'stage2' | 'stage3' | 'boss' | 'final' | 'ending';

interface MusicStyle {
  bpm: number;
  scale: number[];
  bass: number[];
  wave: OscillatorType;
  bassWave: OscillatorType;
}

const MUSIC_STYLES: Record<MusicKind, MusicStyle> = {
  stage1: { bpm: 132, scale: [0, 2, 4, 7, 9], bass: [0, -5, -3, -7], wave: 'square', bassWave: 'triangle' },
  stage2: { bpm: 148, scale: [0, 3, 5, 7, 10], bass: [0, 0, -4, -2], wave: 'sawtooth', bassWave: 'square' },
  stage3: { bpm: 160, scale: [0, 2, 3, 7, 8], bass: [0, -2, -5, -4], wave: 'sawtooth', bassWave: 'triangle' },
  boss: { bpm: 172, scale: [0, 1, 5, 6, 10], bass: [0, 0, 1, 0], wave: 'sawtooth', bassWave: 'sawtooth' },
  final: { bpm: 150, scale: [0, 2, 5, 7, 11], bass: [0, -7, -5, -3], wave: 'triangle', bassWave: 'sine' },
  ending: { bpm: 96, scale: [0, 4, 7, 11, 12], bass: [0, -5, -7, -4], wave: 'sine', bassWave: 'sine' },
};

const BASE_FREQ = 220;

function scaleFreq(semitone: number): number {
  return BASE_FREQ * Math.pow(2, semitone / 12);
}

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private masterVol = 0.8;
  private sfxVol = 0.9;
  private musicVol = 0.7;
  private muted = false;

  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicKind: MusicKind = 'stage1';
  private lastShootAt = 0;

  /** AudioContext 생성 + 첫 사용자 제스처에서 resume. 실패해도 무음. */
  resume(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.musicBus.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    } catch {
      this.ctx = null;
    }
  }

  private ready(): boolean {
    return this.ctx !== null && this.master !== null && this.sfxBus !== null && this.musicBus !== null;
  }

  private applyVolumes(): void {
    try {
      if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
      const t = this.ctx.currentTime;
      const m = this.muted ? 0 : this.masterVol;
      this.master.gain.setTargetAtTime(m, t, 0.02);
      this.sfxBus.gain.setTargetAtTime(this.sfxVol, t, 0.02);
      this.musicBus.gain.setTargetAtTime(this.musicVol * 0.5, t, 0.05);
    } catch {
      // 무음 유지
    }
  }

  setMasterVolume(v: number): void {
    this.masterVol = Math.min(1, Math.max(0, v));
    this.applyVolumes();
  }

  setSfxVolume(v: number): void {
    this.sfxVol = Math.min(1, Math.max(0, v));
    this.applyVolumes();
  }

  setMusicVolume(v: number): void {
    this.musicVol = Math.min(1, Math.max(0, v));
    this.applyVolumes();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyVolumes();
    return this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** 효과음 재생. 컨텍스트가 없으면 조용히 무시. */
  playSfx(name: SfxName): void {
    try {
      if (!this.ready() || !this.ctx || !this.sfxBus) return;
      // 기본 공격음은 과도한 중복을 막기 위해 45ms 쓰로틀
      if (name === 'shoot') {
        const now = performance.now();
        if (now - this.lastShootAt < 45) return;
        this.lastShootAt = now;
      }
      switch (name) {
        case 'shoot': this.tone(880 + Math.random() * 120, 0.07, 'square', 0.12, 420); break;
        case 'chargeFull': this.tone(660, 0.12, 'sine', 0.25, 1320); this.tone(1320, 0.18, 'sine', 0.15, 1980); break;
        case 'chargeShot': this.tone(220, 0.3, 'sawtooth', 0.3, 1100); this.noise(0.25, 0.2, 2400); break;
        case 'enemyHit': this.tone(340 + Math.random() * 80, 0.06, 'square', 0.16, 180); break;
        case 'explode': this.noise(0.4, 0.5, 900); this.tone(140, 0.35, 'sawtooth', 0.3, 40); break;
        case 'playerHit': this.tone(300, 0.4, 'sawtooth', 0.4, 60); this.noise(0.3, 0.35, 1400); break;
        case 'item': this.tone(660, 0.09, 'sine', 0.25, 990); this.tone(990, 0.12, 'sine', 0.2, 1320); break;
        case 'bomb': this.noise(0.8, 0.6, 600); this.tone(80, 0.7, 'sawtooth', 0.4, 400); this.tone(1200, 0.5, 'sine', 0.15, 200); break;
        case 'bossWarn': this.tone(196, 0.5, 'sawtooth', 0.35, 196); this.tone(147, 0.5, 'square', 0.25, 147); break;
        case 'bossDie': this.noise(1.0, 0.6, 500); this.tone(110, 0.9, 'sawtooth', 0.35, 30); break;
        case 'menu': this.tone(520, 0.08, 'sine', 0.25, 780); break;
      }
    } catch {
      // 무음 유지
    }
  }

  startMusic(kind: MusicKind): void {
    try {
      if (!this.ready()) return;
      this.stopMusic();
      this.musicKind = kind;
      this.musicStep = 0;
      const style = MUSIC_STYLES[kind];
      const stepMs = 60000 / style.bpm / 2; // 8분음표 간격
      this.musicTimer = window.setInterval(() => {
        this.scheduleStep();
      }, stepMs);
      this.scheduleStep();
    } catch {
      this.musicTimer = null;
    }
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  get currentMusic(): MusicKind | null {
    return this.musicTimer !== null ? this.musicKind : null;
  }

  dispose(): void {
    this.stopMusic();
    try {
      void this.ctx?.close();
    } catch {
      // 무시
    }
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
  }

  // -- 내부 합성 -----------------------------------------------------------

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    if (!this.ctx || !this.sfxBus) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    }
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFreq: number): void {
    if (!this.ctx || !this.sfxBus) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxBus);
    src.start(t0);
  }

  private scheduleStep(): void {
    try {
      if (!this.ctx || !this.musicBus) return;
      const style = MUSIC_STYLES[this.musicKind];
      const step = this.musicStep;
      const t0 = this.ctx.currentTime;
      const scaleLen = style.scale.length;
      // 리드: 스케일 기반 아르페지오 (상행 후 하행)
      const pos = step % (scaleLen * 2 - 2);
      const idx = pos < scaleLen ? pos : scaleLen * 2 - 2 - pos;
      const semi = style.scale[idx] + 12;
      this.musicTone(scaleFreq(semi), 0.16, style.wave, 0.10, t0);
      // 베이스: 4스텝마다 루트 진행
      if (step % 4 === 0) {
        const bar = Math.floor(step / 4) % style.bass.length;
        this.musicTone(scaleFreq(style.bass[bar] - 12), 0.4, style.bassWave, 0.16, t0);
      }
      // 8스텝마다 5도 위 장식음
      if (step % 8 === 6) {
        this.musicTone(scaleFreq(semi + 7), 0.12, style.wave, 0.06, t0 + 0.02);
      }
      this.musicStep += 1;
    } catch {
      // 다음 스텝에서 계속
    }
  }

  private musicTone(freq: number, dur: number, type: OscillatorType, vol: number, t0: number): void {
    if (!this.ctx || !this.musicBus) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.musicBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}
