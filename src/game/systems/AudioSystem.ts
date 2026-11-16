/**
 * 순수 Web Audio API 합성 오디오 시스템.
 * 외부 음원 파일 없이 사인/노이즈/스윕으로 효과음과 BGM을 만든다.
 * AudioContext는 첫 사용자 입력(resume())에서 활성화하고,
 * 어떤 실패에서도 예외를 던지지 않고 무음으로 동작한다.
 *
 * BGM은 오디오 시계 기준으로 조금 앞(LOOKAHEAD_SEC)까지 음을 미리 예약한다(타이머가 흔들려도 박이 흔들리지 않게).
 * 같은 예약 함수로 OfflineAudioContext에 렌더할 수 있어 개발 도구(src/dev/music.ts)가 곡을 WAV로 뽑아 확인한다.
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
  | 'menu'
  | 'laserCharge'
  | 'edgeWarn';

export type MusicKind = 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'stage5' | 'boss' | 'final' | 'ending' | 'story';

/**
 * 음악 강도. 마디가 바뀔 때 적용된다.
 * 0 타악기 없음(아르페지오+베이스) · 1 기본 박(킥 1·3박, 스네어 2·4박, 8분 하이햇)
 * 2 몰아치기(당김 킥, 16분 하이햇, 4분 베이스, 2마디마다 스네어 채움) · 3 절정(네 박 킥, 고스트 스네어, 열린 하이햇, 8분 베이스, 템포 +6%, 4마디마다 크래시)
 */
export type MusicIntensity = 0 | 1 | 2 | 3;

interface MusicStyle {
  bpm: number;
  scale: number[];
  bass: number[];
  wave: OscillatorType;
  bassWave: OscillatorType;
  /** startMusic 직후 강도 */
  base: MusicIntensity;
  /** 이 곡이 올라갈 수 있는 최고 강도(이야기·엔딩은 0: 타악기 없음) */
  max: MusicIntensity;
}

const MUSIC_STYLES: Record<MusicKind, MusicStyle> = {
  stage1: { bpm: 132, scale: [0, 2, 4, 7, 9], bass: [0, -5, -3, -7], wave: 'square', bassWave: 'triangle', base: 1, max: 3 },
  stage2: { bpm: 148, scale: [0, 3, 5, 7, 10], bass: [0, 0, -4, -2], wave: 'sawtooth', bassWave: 'square', base: 1, max: 3 },
  stage3: { bpm: 160, scale: [0, 2, 3, 7, 8], bass: [0, -2, -5, -4], wave: 'sawtooth', bassWave: 'triangle', base: 1, max: 3 },
  stage4: { bpm: 140, scale: [0, 2, 3, 7, 9], bass: [0, -4, -2, -5], wave: 'triangle', bassWave: 'triangle', base: 1, max: 3 },
  stage5: { bpm: 156, scale: [0, 1, 5, 7, 8], bass: [0, -3, 0, -6], wave: 'square', bassWave: 'sawtooth', base: 1, max: 3 },
  boss: { bpm: 172, scale: [0, 1, 5, 6, 10], bass: [0, 0, 1, 0], wave: 'sawtooth', bassWave: 'sawtooth', base: 2, max: 3 },
  final: { bpm: 150, scale: [0, 2, 5, 7, 11], bass: [0, -7, -5, -3], wave: 'triangle', bassWave: 'sine', base: 1, max: 3 },
  ending: { bpm: 96, scale: [0, 4, 7, 11, 12], bass: [0, -5, -7, -4], wave: 'sine', bassWave: 'sine', base: 0, max: 0 },
  story: { bpm: 84, scale: [0, 3, 7, 10, 12], bass: [0, -4, -5, -2], wave: 'sine', bassWave: 'triangle', base: 0, max: 0 },
};

const BASE_FREQ = 220;
/** 음을 미리 예약하는 길이 (초) */
const LOOKAHEAD_SEC = 0.12;
/** 예약 타이머 간격 (ms) */
const SCHEDULE_MS = 25;
/** 강도 3의 템포 배율 */
const PEAK_TEMPO = 1.06;
/** 한 마디 = 8분음표 8스텝 */
const BAR_STEPS = 8;
/** 같은 효과음이 이 간격(ms)보다 잦으면 거른다 */
const SFX_THROTTLE_MS: Partial<Record<SfxName, number>> = { shoot: 45, edgeWarn: 200 };

function scaleFreq(semitone: number): number {
  return BASE_FREQ * Math.pow(2, semitone / 12);
}

export class AudioSystem {
  /** 소리를 만드는 컨텍스트(실시간 또는 오프라인 렌더) */
  private ctx: BaseAudioContext | null = null;
  /** 실시간 재생일 때만: resume·close 대상 */
  private live: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  /** 타악기용 공용 백색 잡음(1초) */
  private noiseBuf: AudioBuffer | null = null;
  private masterVol = 0.8;
  private sfxVol = 0.9;
  private musicVol = 0.7;
  private muted = false;

  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicKind: MusicKind = 'stage1';
  /** 다음 스텝을 울릴 오디오 시계 시각 (초) */
  private nextStepTime = 0;
  /** 지금 마디에 적용 중인 강도 / 다음 마디부터 쓸 강도 */
  private intensity: MusicIntensity = 0;
  private targetIntensity: MusicIntensity = 0;
  private readonly lastSfxAt: Partial<Record<SfxName, number>> = {};

  /** AudioContext 생성 + 첫 사용자 제스처에서 resume. 실패해도 무음. */
  resume(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const live = new AC();
        this.live = live;
        this.attach(live);
      }
      if (this.live && this.live.state === 'suspended') {
        // 장면이 빨리 바뀌어 dispose()가 먼저 닫으면 거부되므로 삼킨다(무음 동작 원칙).
        this.live.resume().catch(() => undefined);
      }
    } catch {
      this.ctx = null;
      this.live = null;
    }
  }

  /** 버스(마스터·효과음·음악)와 공용 잡음을 만든다. */
  private attach(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    // 처음엔 램프 없이 바로 맞춘다(기본값 1에서 내려오는 동안 첫 박이 크게 튀지 않게)
    this.master.gain.value = this.muted ? 0 : this.masterVol;
    this.sfxBus.gain.value = this.sfxVol;
    this.musicBus.gain.value = this.musicVol * 0.5;
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
      const gap = SFX_THROTTLE_MS[name];
      if (gap !== undefined) {
        const now = performance.now();
        if (now - (this.lastSfxAt[name] ?? -Infinity) < gap) return;
        this.lastSfxAt[name] = now;
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
        // 레이저 예고(0.8초): 낮은 톱니가 차오르며 발사 시점을 귀로도 알린다
        case 'laserCharge': this.tone(160, 0.78, 'sawtooth', 0.12, 960); this.tone(320, 0.78, 'square', 0.04, 1920); break;
        // 가장자리 등장 경고선: 짧고 높은 신호음(무리가 한꺼번에 와도 0.2초에 한 번)
        case 'edgeWarn': this.tone(1500, 0.08, 'triangle', 0.14, 1100); break;
      }
    } catch {
      // 무음 유지
    }
  }

  startMusic(kind: MusicKind): void {
    try {
      if (!this.ready() || !this.ctx) return;
      this.stopMusic();
      this.beginMusic(kind, this.ctx.currentTime + 0.05);
      this.musicTimer = window.setInterval(() => this.pump(), SCHEDULE_MS);
      this.pump();
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

  /**
   * 음악 강도를 정한다(다음 마디부터, 곡의 최고 강도까지). 게임 장면이 매 프레임 상황에 맞춰 부른다.
   * startMusic은 곡의 기본 강도로 되돌린다.
   */
  setMusicIntensity(level: MusicIntensity): void {
    this.targetIntensity = level;
  }

  dispose(): void {
    this.stopMusic();
    try {
      this.live?.close().catch(() => undefined);
    } catch {
      // 무시
    }
    this.ctx = null;
    this.live = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.noiseBuf = null;
  }

  /**
   * 검증용(개발 도구 src/dev/music.ts): 곡을 OfflineAudioContext에 렌더한다. plan의 시각(초)마다 강도를 바꾼다.
   * 실제 재생과 같은 예약 함수를 쓰므로 들리는 그대로다(음악 볼륨 0.7, 마스터 0.8 기준).
   */
  static async renderMusic(
    kind: MusicKind,
    plan: { at: number; level: MusicIntensity }[],
    seconds: number,
    sampleRate = 44100,
  ): Promise<AudioBuffer> {
    const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
    const a = new AudioSystem();
    a.attach(ctx);
    a.beginMusic(kind, 0.05);
    for (const p of [...plan].sort((x, y) => x.at - y.at)) {
      a.scheduleMusicUntil(p.at);
      a.setMusicIntensity(p.level);
    }
    a.scheduleMusicUntil(seconds);
    return ctx.startRendering();
  }

  // -- 음악 예약 -------------------------------------------------------------

  private beginMusic(kind: MusicKind, at: number): void {
    const style = MUSIC_STYLES[kind];
    this.musicKind = kind;
    this.musicStep = 0;
    this.nextStepTime = at;
    this.intensity = style.base;
    this.targetIntensity = style.base;
  }

  private pump(): void {
    try {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // 탭이 백그라운드였다가 돌아오면 타이머가 늦어 밀린 스텝을 한꺼번에 울리지 않도록 건너뛴다.
      if (this.nextStepTime < now - 0.1) this.nextStepTime = now + 0.02;
      this.scheduleMusicUntil(now + LOOKAHEAD_SEC);
    } catch {
      // 다음 타이머에서 계속
    }
  }

  private stepSec(): number {
    const style = MUSIC_STYLES[this.musicKind];
    const tempo = this.intensity >= 3 ? PEAK_TEMPO : 1;
    return 60 / (style.bpm * tempo) / 2; // 8분음표
  }

  /** until(오디오 시계 초) 전에 시작하는 스텝을 모두 예약한다. */
  private scheduleMusicUntil(until: number): void {
    while (this.nextStepTime < until) {
      this.scheduleStep(this.nextStepTime);
      this.nextStepTime += this.stepSec();
      this.musicStep += 1;
    }
  }

  private scheduleStep(t0: number): void {
    if (!this.ctx || !this.musicBus) return;
    const style = MUSIC_STYLES[this.musicKind];
    const step = this.musicStep;
    // 강도는 마디 첫 박에서 바꾼다. 올라갈 때는 크래시로 알린다.
    if (step % BAR_STEPS === 0) {
      const next = Math.min(this.targetIntensity, style.max) as MusicIntensity;
      if (next > this.intensity && step > 0) this.crash(t0, 0.13);
      this.intensity = next;
    }
    const lvl = this.intensity;
    const sd = this.stepSec();
    const scaleLen = style.scale.length;
    // 리드: 스케일 기반 아르페지오 (상행 후 하행)
    const pos = step % (scaleLen * 2 - 2);
    const idx = pos < scaleLen ? pos : scaleLen * 2 - 2 - pos;
    const semi = style.scale[idx] + 12;
    this.musicTone(scaleFreq(semi), 0.16, style.wave, 0.1, t0);
    // 베이스: 마디 루트 진행. 강도 0~1은 4스텝(2분음표)마다, 2는 2스텝(4분), 3은 매 스텝(8분)
    const bar = Math.floor(step / 4) % style.bass.length;
    const bassFreq = scaleFreq(style.bass[bar] - 12);
    if (lvl <= 1 && step % 4 === 0) this.musicTone(bassFreq, 0.4, style.bassWave, 0.16, t0);
    else if (lvl === 2 && step % 2 === 0) this.musicTone(bassFreq, 0.24, style.bassWave, 0.15, t0);
    else if (lvl >= 3) this.musicTone(step % 2 === 0 ? bassFreq : bassFreq * 2, 0.13, style.bassWave, 0.13, t0);
    // 8스텝마다 5도 위 장식음
    if (step % 8 === 6) {
      this.musicTone(scaleFreq(semi + 7), 0.12, style.wave, 0.06, t0 + 0.02);
    }
    if (lvl >= 1) this.drums(t0, step % 16, lvl, sd);
    if (lvl >= 3 && step % 32 === 0 && step > 0) this.crash(t0, 0.09);
  }

  /** 2마디(16스텝) 단위 타악기 패턴 */
  private drums(t: number, s: number, lvl: MusicIntensity, sd: number): void {
    const b = s % BAR_STEPS;
    // 킥
    const kick = lvl === 1 ? b === 0 || b === 4 : lvl === 2 ? b === 0 || b === 3 || b === 4 : b % 2 === 0 || s === 15;
    if (kick) this.kick(t, 0.55);
    // 스네어(2·4박), 강도 3은 고스트 노트, 강도 2+는 2마디 끝에 16분 채움
    if (b === 2 || b === 6) this.snare(t, 0.26);
    if (lvl >= 3 && (b === 5 || b === 7)) this.snare(t, 0.07);
    if (lvl >= 2 && s === 15) {
      this.snare(t, 0.12);
      this.snare(t + sd / 2, 0.18);
    }
    // 하이햇: 8분, 강도 2+는 16분 뒷박 추가, 강도 3은 홀수 박 뒤에 열린 하이햇
    const open = lvl >= 3 && b % 4 === 3;
    this.hat(t, b % 2 === 0 ? 0.05 : 0.035, open);
    if (lvl >= 2) this.hat(t + sd / 2, 0.025, false);
  }

  // -- 합성 -----------------------------------------------------------------

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

  /** 공용 잡음을 거른 짧은 타악기 소리(음악 버스) */
  private noiseHit(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 0.7): void {
    if (!this.ctx || !this.musicBus || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.setValueAtTime(q, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.musicBus);
    // 같은 잡음의 다른 구간을 써서 연타가 똑같이 들리지 않게
    src.start(t, Math.random() * Math.max(0, this.noiseBuf.duration - dur - 0.05));
    src.stop(t + dur + 0.02);
  }

  private kick(t: number, vol: number): void {
    if (!this.ctx || !this.musicBus) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g);
    g.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  private snare(t: number, vol: number): void {
    if (!this.ctx || !this.musicBus) return;
    this.noiseHit(t, 0.16, vol, 'bandpass', 1800, 0.8);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    g.gain.setValueAtTime(vol * 0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(g);
    g.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  private hat(t: number, vol: number, open: boolean): void {
    this.noiseHit(t, open ? 0.16 : 0.035, vol, 'highpass', 7000);
  }

  private crash(t: number, vol: number): void {
    this.noiseHit(t, 1.1, vol, 'highpass', 4500);
  }
}
