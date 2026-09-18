/**
 * Writes short PCM WAV clips to public/sounds for staff notification alerts.
 * Pure Node — no ffmpeg.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sounds");

function pcm(seconds, fn) {
  const n = Math.floor(seconds * RATE);
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const v = Math.max(-1, Math.min(1, fn(t, seconds)));
    samples[i] = Math.round(v * 32767);
  }
  return samples;
}

function env(t, dur, attack = 0.008, release = 0.22) {
  const a = Math.min(1, t / attack);
  const r = Math.max(0, 1 - Math.max(0, t - (dur - release)) / release);
  return a * r;
}

function bell(t, freq, dur, gain = 0.42) {
  if (t < 0 || t > dur) return 0;
  const decay = Math.exp(-3.6 * t);
  const wave =
    Math.sin(2 * Math.PI * freq * t) * 0.62 +
    Math.sin(2 * Math.PI * freq * 2 * t) * 0.22 +
    Math.sin(2 * Math.PI * freq * 3.01 * t) * 0.1;
  return wave * decay * env(t, dur, 0.004, 0.12) * gain;
}

function writeWav(name, samples) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  writeFileSync(join(OUT, name), buf);
}

mkdirSync(OUT, { recursive: true });

writeWav(
  "chime.wav",
  pcm(0.85, (t) => bell(t, 784, 0.55, 0.4) + bell(t - 0.16, 1174.7, 0.68, 0.46)),
);
writeWav(
  "bell.wav",
  pcm(0.9, (t) => bell(t, 698.5, 0.9, 0.48) + bell(t, 1397, 0.55, 0.16)),
);
writeWav(
  "ping.wav",
  pcm(0.38, (t) => {
    const freq = 1480 * Math.exp(-1.8 * t);
    return Math.sin(2 * Math.PI * freq * t) * env(t, 0.38, 0.003, 0.18) * 0.38;
  }),
);
writeWav(
  "pop.wav",
  pcm(0.22, (t) => {
    const freq = 420 * Math.exp(-8 * t);
    return Math.sin(2 * Math.PI * freq * t) * env(t, 0.22, 0.002, 0.12) * 0.4;
  }),
);

console.log("Wrote notification sounds to", OUT);
