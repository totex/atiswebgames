/**
 * Tetris sound effects — synthesized with the Web Audio API.
 *
 * No audio files are loaded. Every sound is a short oscillator envelope, with
 * a little filtered noise for impacts. The audio context is created lazily on
 * the first key/pointer gesture (browsers block audio before a user gesture)
 * and then reused for the lifetime of the page, including scene restarts.
 *
 * The generated sounds are deliberately soft: they sit under the game rather
 * than demanding attention, and the mute state is remembered in localStorage.
 */

const STORAGE_KEY = 'tetris-neon-muted';

interface ToneOptions {
  readonly freq: number;
  readonly endFreq?: number;
  readonly duration: number;
  readonly type?: OscillatorType;
  readonly gain?: number;
  readonly delay?: number;
  readonly pan?: number;
  readonly attack?: number;
}

interface NoisewOptions {
  readonly duration: number;
  readonly gain?: number;
  readonly cutoff?: number;
  readonly delay?: number;
  readonly pan?: number;
}

interface WebkitAudioContextWindow {
  webkitAudioContext?: typeof AudioContext;
}

function readStoredMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function storeMuted(muted: boolean): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Private browsing can reject localStorage writes; audio still works.
  }
}

export class TetrisSounds {
  private readonly volume = 0.36;
  private readonly maxVoices = 14;
  private muted: boolean;

  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private activeVoices = 0;
  private enabled = true;

  private readonly handleGesture: () => void;

  constructor() {
    this.muted = readStoredMuted();
    this.handleGesture = () => this.unlock();
    this.attachGestureListeners();
  }

  private attachGestureListeners(): void {
    if (typeof globalThis.addEventListener !== 'function') {
      return;
    }

    // Capture phase so the context is resumed before the scene handles the
    // same event. The listeners stay installed so a suspended context can be
    // woken up again later.
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
      console.warn('Tetris audio could not start:', error);
      this.enabled = false;
      return null;
    }
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer | null {
    try {
      const length = Math.max(1, Math.floor(context.sampleRate * 0.03));
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
        // A later gesture will retry.
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
    storeMuted(this.muted);

    const context = this.context;
    const master = this.master;

    if (!context || !master) {
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

  /* ---------------------------------------------------------------- */
  /* One-shot helpers                                                 */
  /* ---------------------------------------------------------------- */

  private tone({
    freq,
    endFreq,
    duration,
    type = 'sine',
    gain = 0.1,
    delay = 0,
    pan = 0,
    attack = 0.005,
  }: ToneOptions): void {
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

    const now = context.currentTime + Math.max(0, delay);
    const startFrequency = Math.max(30, freq);
    const endFrequency = Math.max(25, endFreq ?? startFrequency * 0.6);
    const durationSeconds = Math.max(0.02, duration);
    const attackSeconds = Math.max(
      0.001,
      Math.min(attack, durationSeconds * 0.5)
    );
    const peak = Math.max(0.0002, gain);
    const pannerValue = Math.max(-1, Math.min(1, pan));
    const nodes: AudioNode[] = [];

    try {
      let output: AudioNode = master;

      if (typeof context.createStereoPanner === 'function') {
        const panner = context.createStereoPanner();
        panner.pan.value = pannerValue;
        panner.connect(master);
        nodes.push(panner);
        output = panner;
      }

      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(
        peak,
        now + attackSeconds
      );
      envelope.gain.exponentialRampToValueAtTime(
        0.0001,
        now + durationSeconds
      );
      envelope.connect(output);

      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(startFrequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(
        endFrequency,
        now + durationSeconds * 0.8
      );
      oscillator.connect(envelope);

      nodes.push(envelope, oscillator);

      oscillator.onended = () => {
        this.activeVoices = Math.max(0, this.activeVoices - 1);
        this.disconnectNodes(nodes);
      };

      oscillator.start(now);
      oscillator.stop(now + durationSeconds + 0.02);
      this.activeVoices += 1;
    } catch {
      this.disconnectNodes(nodes);
    }
  }

  private noise({
    duration,
    gain = 0.06,
    cutoff = 900,
    delay = 0,
    pan = 0,
  }: NoisewOptions): void {
    if (!this.enabled || this.muted) {
      return;
    }

    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state !== 'running') {
      return;
    }

    if (this.activeVoices >= this.maxVoices || !this.noiseBuffer) {
      return;
    }

    const now = context.currentTime + Math.max(0, delay);
    const durationSeconds = Math.max(0.01, duration);
    const nodes: AudioNode[] = [];

    try {
      let output: AudioNode = master;

      if (typeof context.createStereoPanner === 'function') {
        const panner = context.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        panner.connect(master);
        nodes.push(panner);
        output = panner;
      }

      const source = context.createBufferSource();
      source.buffer = this.noiseBuffer;

      const filter = context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = Math.max(40, cutoff);

      const envelope = context.createGain();
      envelope.gain.setValueAtTime(Math.max(0.0002, gain), now);
      envelope.gain.exponentialRampToValueAtTime(
        0.0001,
        now + durationSeconds
      );

      source.connect(filter);
      filter.connect(envelope);
      envelope.connect(output);

      nodes.push(source, filter, envelope);

      source.onended = () => {
        this.activeVoices = Math.max(0, this.activeVoices - 1);
        this.disconnectNodes(nodes);
      };

      source.start(now);
      source.stop(now + durationSeconds + 0.01);
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

  /* ---------------------------------------------------------------- */
  /* Game sounds                                                      */
  /* ---------------------------------------------------------------- */

  move(): void {
    this.tone({
      freq: 330,
      endFreq: 300,
      duration: 0.035,
      type: 'triangle',
      gain: 0.025,
      pan: -0.15,
    });
  }

  rotate(): void {
    this.tone({
      freq: 460,
      endFreq: 640,
      duration: 0.055,
      type: 'triangle',
      gain: 0.07,
      pan: 0.1,
    });
  }

  hold(): void {
    this.tone({
      freq: 300,
      endFreq: 520,
      duration: 0.1,
      type: 'sine',
      gain: 0.08,
    });
    this.tone({
      freq: 600,
      endFreq: 760,
      duration: 0.08,
      type: 'triangle',
      gain: 0.04,
      delay: 0.035,
    });
  }

  lock(): void {
    this.tone({
      freq: 155,
      endFreq: 92,
      duration: 0.08,
      type: 'sine',
      gain: 0.11,
    });
    this.noise({ duration: 0.045, gain: 0.035, cutoff: 700 });
  }

  hardDrop(distance = 0): void {
    const weight = Math.min(1, 0.5 + distance / 18);

    this.tone({
      freq: 120 - weight * 20,
      endFreq: 48,
      duration: 0.16 + weight * 0.05,
      type: 'sine',
      gain: 0.12 + weight * 0.08,
    });
    this.noise({
      duration: 0.11,
      gain: 0.05 + weight * 0.035,
      cutoff: 480,
    });
  }

  lineClear(count = 1): void {
    const sequences: Record<number, readonly number[]> = {
      1: [659.25, 880],
      2: [523.25, 659.25, 783.99],
      3: [523.25, 659.25, 783.99, 1046.5],
      4: [392, 523.25, 659.25, 783.99, 1046.5, 1318.51],
    };
    const notes = sequences[Math.max(1, Math.min(4, count))] ?? sequences[1];
    const step = count >= 4 ? 0.055 : 0.065;

    notes.forEach((frequency, index) => {
      this.tone({
        freq: frequency,
        endFreq: frequency * 1.02,
        duration: count >= 4 ? 0.22 : 0.16,
        type: count >= 4 ? 'square' : 'triangle',
        gain: count >= 4 ? 0.055 : 0.08,
        delay: index * step,
        pan: -0.25 + (index / Math.max(1, notes.length - 1)) * 0.5,
      });
    });

    if (count >= 4) {
      this.noise({ duration: 0.22, gain: 0.045, cutoff: 1800 });
    }
  }

  levelUp(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      this.tone({
        freq: frequency,
        endFreq: frequency * 1.01,
        duration: 0.18,
        type: 'triangle',
        gain: 0.075,
        delay: index * 0.075,
      });
    });
    this.noise({ duration: 0.4, gain: 0.025, cutoff: 2200, delay: 0.12 });
  }

  gameOver(): void {
    [392, 329.63, 261.63, 196].forEach((frequency, index) => {
      this.tone({
        freq: frequency,
        endFreq: frequency * 0.98,
        duration: 0.34,
        type: 'sine',
        gain: 0.085,
        delay: index * 0.13,
      });
    });
  }

  pause(): void {
    this.tone({
      freq: 520,
      endFreq: 390,
      duration: 0.09,
      type: 'triangle',
      gain: 0.06,
    });
  }

  resume(): void {
    this.tone({
      freq: 390,
      endFreq: 520,
      duration: 0.09,
      type: 'triangle',
      gain: 0.06,
    });
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
