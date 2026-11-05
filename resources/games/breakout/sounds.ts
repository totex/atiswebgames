'use strict';

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

class BreakoutSounds {
  constructor(options = {}) {
    this.volume = Number.isFinite(options.volume) ? options.volume : 0.4;
    this.maxVoices = Number.isFinite(options.maxVoices)
      ? options.maxVoices
      : 6;
    this.muted = Boolean(options.muted);

    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.activeVoices = 0;
    this.enabled = true;

    this.handleGesture = () => this.unlock();
    this.attachGestureListeners();
  }

  attachGestureListeners() {
    if (typeof globalThis.addEventListener !== 'function') {
      return;
    }

    // Capture phase so the context is resumed before Phaser processes the
    // same key press. The listeners stay installed so audio can recover if
    // the browser suspends the context later.
    globalThis.addEventListener('keydown', this.handleGesture, true);
    globalThis.addEventListener('pointerdown', this.handleGesture, true);
  }

  detachGestureListeners() {
    if (typeof globalThis.removeEventListener !== 'function') {
      return;
    }

    globalThis.removeEventListener('keydown', this.handleGesture, true);
    globalThis.removeEventListener('pointerdown', this.handleGesture, true);
  }

  ensureContext() {
    if (this.context) {
      return this.context;
    }

    if (!this.enabled) {
      return null;
    }

    const AudioContextClass =
      globalThis.AudioContext || globalThis.webkitAudioContext;

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

  createNoiseBuffer(context) {
    try {
      const length = Math.max(1, Math.floor(context.sampleRate * 0.024));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < length; i += 1) {
        const fade = 1 - i / length;
        data[i] = (Math.random() * 2 - 1) * fade * fade;
      }

      return buffer;
    } catch (error) {
      return null;
    }
  }

  unlock() {
    const context = this.ensureContext();

    if (!context) {
      return;
    }

    if (context.state === 'suspended' || context.state === 'interrupted') {
      const resumed = context.resume();

      if (resumed && typeof resumed.catch === 'function') {
        resumed.catch(() => {
          // Autoplay policy rejected the resume; a later gesture will retry.
        });
      }
    }
  }

  isMuted() {
    return this.muted;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);

    if (!this.master || !this.context) {
      return;
    }

    const now = this.context.currentTime;
    const gain = this.master.gain;

    try {
      if (typeof gain.cancelScheduledValues === 'function') {
        gain.cancelScheduledValues(now);
      }

      if (typeof gain.setTargetAtTime === 'function') {
        gain.setTargetAtTime(this.muted ? 0 : this.volume, now, 0.015);
      } else {
        gain.value = this.muted ? 0 : this.volume;
      }
    } catch (error) {
      gain.value = this.muted ? 0 : this.volume;
    }
  }

  clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  /**
   * Play one brick pop. `brick` is the simulation brick that was just
   * destroyed; `fieldWidth` turns its x position into a stereo pan.
   */
  popBrick(brick = {}, fieldWidth = 1280) {
    const row = Number.isFinite(brick.row)
      ? this.clamp(brick.row, 0, 9)
      : 4;
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
  popPaddle(offset = 0, contactX, fieldWidth = 1280) {
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
  playPop({
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
  }) {
    if (!this.enabled || this.muted) {
      return;
    }

    const context = this.context;

    if (!context || context.state !== 'running') {
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

    let panner = null;
    let gain = null;
    let oscillator = null;
    let noiseSource = null;
    let noiseFilter = null;
    let noiseGain = null;

    try {
      if (typeof context.createStereoPanner === 'function') {
        panner = context.createStereoPanner();
        panner.pan.value = pannerValue;
        panner.connect(this.master);
      }

      const output = panner || this.master;

      gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peakGain, now + attackTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + holdTime);
      gain.connect(output);

      oscillator = context.createOscillator();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(startFrequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(
        endFrequency,
        now + sweepTime
      );
      oscillator.connect(gain);

      if (this.noiseBuffer && noiseGainValue > 0) {
        noiseSource = context.createBufferSource();
        noiseSource.buffer = this.noiseBuffer;

        noiseFilter = context.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = Math.max(
          40,
          Number.isFinite(noiseCutoff) ? noiseCutoff : 1400
        );

        noiseGain = context.createGain();
        noiseGain.gain.setValueAtTime(noiseGainValue, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseTime);

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(output);

        noiseSource.start(now);
        noiseSource.stop(now + noiseTime + 0.002);
      }

      oscillator.start(now);
      oscillator.stop(now + stopTime);
      this.activeVoices += 1;

      oscillator.onended = () => {
        this.activeVoices = Math.max(0, this.activeVoices - 1);

        for (const node of [
          oscillator,
          gain,
          noiseSource,
          noiseFilter,
          noiseGain,
          panner,
        ]) {
          if (node && typeof node.disconnect === 'function') {
            try {
              node.disconnect();
            } catch (error) {
              // The browser may already have released the node.
            }
          }
        }
      };
    } catch (error) {
      for (const node of [
        oscillator,
        gain,
        panner,
        noiseSource,
        noiseFilter,
        noiseGain,
      ]) {
        if (node && typeof node.disconnect === 'function') {
          try {
            node.disconnect();
          } catch (disconnectError) {
            // Ignore cleanup failures.
          }
        }
      }
    }
  }

  dispose() {
    this.detachGestureListeners();

    if (this.context && typeof this.context.close === 'function') {
      try {
        this.context.close();
      } catch (error) {
        // Ignore cleanup failures.
      }
    }

    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.activeVoices = 0;
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.BreakoutSounds = BreakoutSounds;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BreakoutSounds };
}
