/**
 * Breakout sound effects — generated entirely with the Web Audio API.
 *
 * No audio files are loaded. Bricks produce a bright sine chirp with a fast
 * downward pitch sweep; the paddle produces a lower, rounder triangle thump.
 * Both use a tiny synthesized noise transient, and every hit gets a small
 * random detune (the brick pitch also follows its row/column, the paddle pitch
 * follows the impact point). Stereo position follows the contact x coordinate.
 *
 * The AudioContext is created lazily on the first key press or pointer press
 * (the browser autoplay policy requires a user gesture) and is then reused for
 * the lifetime of the page, including across scene restarts.
 */

export interface BreakoutSoundOptions {
  volume?: number;
  maxVoices?: number;
  muted?: boolean;
}

/** The subset of a simulation brick that determines its pop sound. */
export interface SoundBrick {
  row: number;
  column: number;
  x: number;
}

export interface PopOptions {
  base: number;
  endRatio?: number;
  peak?: number;
  attack?: number;
  hold?: number;
  duration?: number;
  sweep?: number;
  pan?: number;
  wave?: OscillatorType;
  noiseLevel?: number;
  noiseCutoff?: number;
  noiseDuration?: number;
}

interface WebkitAudioContextWindow {
  webkitAudioContext?: typeof AudioContext;
}

export class BreakoutSounds {
  private readonly volume: number;
  private readonly maxVoices: number;
  private muted: boolean;

  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private activeVoices = 0;
  private enabled = true;

  private readonly handleGesture: () => void;

  constructor(options: BreakoutSoundOptions = {}) {
    this.volume =
      typeof options.volume === 'number' && Number.isFinite(options.volume)
        ? options.volume
        : 0.4;
    this.maxVoices =
      typeof options.maxVoices === 'number' &&
      Number.isFinite(options.maxVoices)
        ? options.maxVoices
        : 6;
    this.muted = Boolean(options.muted);

    this.handleGesture = () => this.unlock();
    this.attachGestureListeners();
  }

  private attachGestureListeners(): void {
    if (typeof globalThis.addEventListener !== 'function') {
      return;
    }

    // Capture phase so the context is resumed before Phaser processes the
    // same key press. The listeners stay installed so audio can recover if
    // the browser suspends the context later.
    globalThis.addEventListener('keydown', this.handleGesture, true);
    globalThis.addEventListener('pointerdown', this.handleGesture, true);
  }

  private detachGestureListeners(): void {
    if (typeof globalThis.removeEventListener !== 'function') {
      return;
    }

    globalThis.removeEventListener('keydown', this.handleGesture, true);
    globalThis.removeEventListener('pointerdown', this.handleGesture, true);
  }

  private ensureContext(): AudioContext | null {
    if (this.context) {
      return this.context;
    }

    if (!this.enabled) {
      return null;
    }

    const AudioContextClass =
      globalThis.AudioContext ??
      (globalThis as typeof globalThis & WebkitAudioContextWindow)
        .webkitAudioContext;

    if (!AudioContextClass) {
      this.enabled = false;
      return null;
    }

    try {
      const context = new AudioContextClass();
      const master = context.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      master.connect(context.destination);

      this.context = context;
      this.master = master;
      this.noiseBuffer = this.createNoiseBuffer(context);

      return context;
    } catch (error) {
      console.warn('Breakout audio could not start:', error);
      this.enabled = false;
      return null;
    }
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer | null {
    try {
      const length = Math.max(1, Math.floor(context.sampleRate * 0.024));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < length; i += 1) {
        const fade = 1 - i / length;
        data[i] = (Math.random() * 2 - 1) * fade * fade;
      }

      return buffer;
    } catch {
      return null;
    }
  }

  unlock(): void {
    const context = this.ensureContext();

    if (!context) {
      return;
    }

    if (
      context.state === 'suspended' ||
      (context.state as string) === 'interrupted'
    ) {
      void context.resume().catch(() => {
        // Autoplay policy rejected the resume; a later gesture will retry.
      });
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = Boolean(muted);

    const master = this.master;
    const context = this.context;

    if (!master || !context) {
      return;
    }

    const now = context.currentTime;
    const gain = master.gain;

    try {
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(this.muted ? 0 : this.volume, now, 0.015);
    } catch {
      gain.value = this.muted ? 0 : this.volume;
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
  }

  /**
   * Play one brick pop. `brick` is the simulation brick that was just
   * destroyed; `fieldWidth` turns its x position into a stereo pan.
   */
  popBrick(brick: SoundBrick, fieldWidth = 1280): void {
    const row = this.clamp(
      Number.isFinite(brick.row) ? brick.row : 4,
      0,
      9
    );
    const column = Number.isFinite(brick.column) ? brick.column : 0;
    const width =
      Number.isFinite(fieldWidth) && fieldWidth > 0 ? fieldWidth : 1280;
    const x = Number.isFinite(brick.x) ? brick.x : width / 2;

    // Higher rows (lower row number) get a higher pop. A random detune of up
    // to 1.5 semitones keeps repeated hits from sounding mechanical.
    const rowBase = 540 + (9 - row) * 32 + (column % 3) * 12;
    const detune = Math.pow(2, ((Math.random() * 2 - 1) * 1.5) / 12);
    const base = rowBase * detune;
    const pan = this.clamp((x / width) * 2 - 1, -1, 1) * 0.45;

    this.playPop({
      base,
      endRatio: 0.34,
      peak: 0.16,
      attack: 0.004,
      hold: 0.105,
      duration: 0.12,
      sweep: 0.075,
      pan,
      wave: 'sine',
      noiseLevel: 0.045,
      noiseCutoff: 1400,
      noiseDuration: 0.022,
    });
  }

  /**
   * Play the softer paddle thump. `offset` is the clamped -1..1 hit offset
   * from the paddle centre, while `contactX` is where the ball actually hit.
   */
  popPaddle(offset = 0, contactX: number, fieldWidth = 1280): void {
    const width =
      Number.isFinite(fieldWidth) && fieldWidth > 0 ? fieldWidth : 1280;
    const x = Number.isFinite(contactX) ? contactX : width / 2;
    const impact = this.clamp(Number.isFinite(offset) ? offset : 0, -1, 1);

    // Edge hits are a little higher; a random detune adds life to repeats.
    const impactBase = 245 + Math.abs(impact) * 60;
    const detune = Math.pow(2, ((Math.random() * 2 - 1) * 1.2) / 12);
    const base = impactBase * detune;
    const pan = this.clamp((x / width) * 2 - 1, -1, 1) * 0.4;

    this.playPop({
      base,
      endRatio: 0.52,
      peak: 0.15,
      attack: 0.006,
      hold: 0.12,
      duration: 0.15,
      sweep: 0.09,
      pan,
      wave: 'triangle',
      noiseLevel: 0.03,
      noiseCutoff: 700,
      noiseDuration: 0.018,
    });
  }

  /**
   * Shared one-shot voice: oscillator -> gain -> pan -> master, plus an
   * optional filtered noise transient mixed into the same output.
   */
  private playPop({
    base,
    endRatio = 0.35,
    peak = 0.16,
    attack = 0.004,
    hold = 0.105,
    duration = 0.12,
    sweep = 0.075,
    pan = 0,
    wave = 'sine',
    noiseLevel = 0.045,
    noiseCutoff = 1400,
    noiseDuration = 0.022,
  }: PopOptions): void {
    if (!this.enabled || this.muted) {
      return;
    }

    const context = this.context;
    const master = this.master;

    if (!context || !master || context.state !== 'running') {
      return;
    }

    if (this.activeVoices >= this.maxVoices) {
      return;
    }

    const startFrequency = Math.max(40, Number.isFinite(base) ? base : 400);
    const ratio = Number.isFinite(endRatio) ? endRatio : 0.35;
    const endFrequency = Math.max(35, startFrequency * ratio);
    const peakGain = Math.max(0.0002, Number.isFinite(peak) ? peak : 0.16);
    const pannerValue = this.clamp(Number.isFinite(pan) ? pan : 0, -1, 1);
    const now = context.currentTime;
    const attackTime = Math.max(0.001, Number.isFinite(attack) ? attack : 0.004);
    const holdTime = Math.max(
      attackTime + 0.01,
      Number.isFinite(hold) ? hold : 0.105
    );
    const stopTime = Math.max(
      holdTime + 0.01,
      Number.isFinite(duration) ? duration : 0.12
    );
    const sweepTime = Math.max(
      0.01,
      Math.min(Number.isFinite(sweep) ? sweep : 0.075, holdTime)
    );
    const noiseGainValue = Math.max(
      0,
      Number.isFinite(noiseLevel) ? noiseLevel : 0
    );
    const noiseTime = Math.max(
      0.005,
      Number.isFinite(noiseDuration) ? noiseDuration : 0.022
    );

    const nodes: AudioNode[] = [];

    try {
      let panner: StereoPannerNode | null = null;

      if (typeof context.createStereoPanner === 'function') {
        panner = context.createStereoPanner();
        panner.pan.value = pannerValue;
        panner.connect(master);
        nodes.push(panner);
      }

      const output: AudioNode = panner ?? master;

      const gain = context.createGain();
      nodes.push(gain);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peakGain, now + attackTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + holdTime);
      gain.connect(output);

      const oscillator = context.createOscillator();
      nodes.push(oscillator);
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(startFrequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(
        endFrequency,
        now + sweepTime
      );
      oscillator.connect(gain);

      if (this.noiseBuffer && noiseGainValue > 0) {
        const noiseSource = context.createBufferSource();
        noiseSource.buffer = this.noiseBuffer;

        const noiseFilter = context.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = Math.max(
          40,
          Number.isFinite(noiseCutoff) ? noiseCutoff : 1400
        );

        const noiseGain = context.createGain();
        noiseGain.gain.setValueAtTime(noiseGainValue, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseTime);

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(output);
        nodes.push(noiseSource, noiseFilter, noiseGain);

        noiseSource.start(now);
        noiseSource.stop(now + noiseTime + 0.002);
      }

      oscillator.onended = () => {
        this.activeVoices = Math.max(0, this.activeVoices - 1);
        this.disconnectNodes(nodes);
      };

      oscillator.start(now);
      oscillator.stop(now + stopTime);
      this.activeVoices += 1;
    } catch {
      this.disconnectNodes(nodes);
    }
  }

  private disconnectNodes(nodes: readonly AudioNode[]): void {
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        // The browser may already have released the node.
      }
    }
  }

  dispose(): void {
    this.detachGestureListeners();

    const context = this.context;

    if (context) {
      try {
        void context.close().catch(() => {
          // Ignore cleanup failures.
        });
      } catch {
        // Ignore cleanup failures.
      }
    }

    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.activeVoices = 0;
  }
}
