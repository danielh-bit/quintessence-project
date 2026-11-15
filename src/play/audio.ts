// Hum as synthesized sound (Web Audio). One voice: its pitch and volume follow
// what `listen` reports. Browsers only allow sound after a user gesture, so the
// voice starts on the first key or click.

import { type Hearing, SILENT } from "./hum";

const MASTER = 0.18;

export class HumVoice {
  private ctx: AudioContext | null = null;
  private body: OscillatorNode | null = null;
  private edge: OscillatorNode | null = null;
  private level: GainNode | null = null;

  /** Start the audio (call from a user gesture). Safe to call again. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const level = ctx.createGain();
    level.gain.value = 0;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1800;
    const body = ctx.createOscillator();
    body.type = "sine";
    // A second voice a little sharp of the first, so the hum has some grain.
    const edge = ctx.createOscillator();
    edge.type = "triangle";
    const edgeLevel = ctx.createGain();
    edgeLevel.gain.value = 0.35;
    body.connect(lowpass);
    edge.connect(edgeLevel).connect(lowpass);
    lowpass.connect(level).connect(ctx.destination);
    body.start();
    edge.start();
    this.ctx = ctx;
    this.body = body;
    this.edge = edge;
    this.level = level;
  }

  update(h: Hearing = SILENT): void {
    const ctx = this.ctx;
    if (!ctx || !this.body || !this.edge || !this.level) return;
    const t = ctx.currentTime;
    this.level.gain.setTargetAtTime(h.gain * MASTER, t, 0.06);
    if (h.gain > 0) {
      this.body.frequency.setTargetAtTime(h.freq, t, 0.04);
      this.edge.frequency.setTargetAtTime(h.freq * 1.006, t, 0.04);
    }
  }
}
