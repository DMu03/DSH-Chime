/**
 * 离线 WAV 渲染器：与 lib/synth.js 使用同一套配方（lib/recipes.js），
 * 把提示音渲染成 16-bit 立体声 WAV。host 在 turn/end 时播放这些文件，
 * 不依赖渲染端任何能力。
 *
 * 包络与 Web Audio 的两段 exponentialRamp 严格一致：
 *   1e-4 → 峰值（attack 内），峰值 → 1e-4（剩余时长内）。
 * 曾经的错误实现是"升到峰值后保持满幅、末尾 20ms 切断"，把拨弦渲染成了
 * 持续长音，听感像"很长的尾音"。以 envAt() 为准，勿再分开写包络。
 */

import {
  MIX,
  MELODIES,
  TIMBRES,
  CONFIRM_MELODY,
  DEFAULT_TIMBRE,
  VOICE_PARAMS,
} from "./recipes.js";

const SAMPLE_RATE = 48000;

/**
 * Web Audio 两段指数包络的 PCM 等价：
 * t < attack 时 1e-4 指数升到 peak；attack ≤ t < stop 时 peak 指数降到 1e-4。
 */
function envAt(t, peak, attack, stop) {
  if (t <= 0) return 1e-4;
  if (t < attack) return 1e-4 * (peak / 1e-4) ** (t / attack);
  if (t < stop) {
    const fall = Math.max(stop - attack, 1e-6);
    return peak * (1e-4 / peak) ** ((t - attack) / fall);
  }
  return 0;
}

function triangle(phase) {
  return (2 / Math.PI) * Math.asin(Math.sin(phase));
}

/** 简易 2 极低通（状态变量式），cutoff 可逐样本变化。 */
function makeLowpass(q) {
  let low = 0;
  let band = 0;
  return (sample, cutoff) => {
    const f = 2 * Math.sin((Math.PI * Math.min(cutoff, SAMPLE_RATE * 0.45)) / SAMPLE_RATE);
    const damp = 1 / Math.max(q, 0.5);
    const high = sample - low - damp * band;
    band += f * high;
    low += f * band;
    return low;
  };
}

// ---- 八种音色的 PCM 发声体：把单音混入缓冲 ----
// 与 lib/synth.js 的对应函数逐一保持同样的包络常数。

function voiceRhodes(buf, freq, start, vel, dur) {
  const p = VOICE_PARAMS.rhodes;
  const i0 = Math.floor(start * SAMPLE_RATE);
  const n = Math.floor(dur * SAMPLE_RATE);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    // 调制器包络：峰值 freq*1.4*vel 在 dur*0.4 内指数降到 freq*0.08 并保持。
    const modulated = freq * p.modGainStart * vel
      * ((freq * p.modGainEnd) / (freq * p.modGainStart * vel)) ** Math.min(t / (dur * p.modDecayAt), 1);
    const instantaneous = freq + Math.sin(2 * Math.PI * freq * t) * modulated;
    phase += (2 * Math.PI * instantaneous) / SAMPLE_RATE;
    const amp = envAt(t, p.peak * vel, p.attack, dur);
    const idx = i0 + i;
    if (idx >= 0 && idx < buf.length && amp > 0) buf[idx] += amp * Math.sin(phase);
  }
}

function voiceAdditive(buf, freq, start, vel, dur, partials, attack) {
  for (const [ratio, amp, decay] of partials) {
    const stop = dur * decay;
    const i0 = Math.floor(start * SAMPLE_RATE);
    const n = Math.floor(stop * SAMPLE_RATE);
    for (let i = 0; i < n; i += 1) {
      const t = i / SAMPLE_RATE;
      const gain = envAt(t, amp * vel, attack, stop);
      const idx = i0 + i;
      if (idx < 0 || idx >= buf.length || gain <= 0) continue;
      buf[idx] += gain * Math.sin(2 * Math.PI * freq * ratio * t);
    }
  }
}

function voiceVibes(buf, freq, start, vel, dur) {
  const p = VOICE_PARAMS.vibes;
  const i0 = Math.floor(start * SAMPLE_RATE);
  const n = Math.floor(dur * SAMPLE_RATE);
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const amp = envAt(t, p.peak * vel, p.attack, dur);
    if (amp <= 0) continue;
    const trem = 1 + p.tremoloDepth * Math.sin(2 * Math.PI * p.tremoloHz * t);
    const idx = i0 + i;
    if (idx >= 0 && idx < buf.length) buf[idx] += amp * trem * Math.sin(2 * Math.PI * freq * t);
  }
}

function voiceBloom(buf, freq, start, vel, dur) {
  const p = VOICE_PARAMS.bloom;
  const lp = makeLowpass(p.q);
  const i0 = Math.floor(start * SAMPLE_RATE);
  const n = Math.floor(dur * SAMPLE_RATE);
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const cutoff = t < p.filterTime
      ? p.filterStart + ((p.filterEnd - p.filterStart) * t) / p.filterTime
      : p.filterEnd;
    const amp = envAt(t, p.peak * vel, p.attack, dur);
    if (amp <= 0) continue;
    const idx = i0 + i;
    if (idx < 0 || idx >= buf.length) continue;
    buf[idx] += amp * lp(triangle(2 * Math.PI * freq * t), cutoff);
  }
}

function voiceHarp(buf, freq, start, vel, dur) {
  const p = VOICE_PARAMS.harp;
  const lp = makeLowpass(p.q);
  const i0 = Math.floor(start * SAMPLE_RATE);
  const n = Math.floor(dur * SAMPLE_RATE);
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const amp = envAt(t, p.peak * vel, p.attack, dur);
    if (amp <= 0) continue;
    const idx = i0 + i;
    if (idx < 0 || idx >= buf.length) continue;
    buf[idx] += amp * lp(triangle(2 * Math.PI * freq * t), freq * p.filterRatio);
  }
}

function voiceKoto(buf, freq, start, vel, dur) {
  const p = VOICE_PARAMS.koto;
  const lp = makeLowpass(p.q);
  const i0 = Math.floor(start * SAMPLE_RATE);
  const n = Math.floor(dur * SAMPLE_RATE);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const f = t < p.glideTime ? freq * (p.glide + ((1 - p.glide) * t) / p.glideTime) : freq;
    phase += (2 * Math.PI * f) / SAMPLE_RATE;
    const amp = envAt(t, p.peak * vel, p.attack, dur);
    if (amp <= 0) continue;
    const idx = i0 + i;
    if (idx < 0 || idx >= buf.length) continue;
    buf[idx] += amp * lp(triangle(phase), freq * p.filterRatio);
  }
}

const VOICE_RENDERERS = {
  rhodes: (buf, freq, s, v, d) => voiceRhodes(buf, freq, s, v, d),
  handpan: (buf, freq, s, v, d) => voiceAdditive(buf, freq, s, v, d, VOICE_PARAMS.handpan.partials, VOICE_PARAMS.handpan.attack),
  vibes: (buf, freq, s, v, d) => voiceVibes(buf, freq, s, v, d),
  bloom: (buf, freq, s, v, d) => voiceBloom(buf, freq, s, v, d),
  harp: (buf, freq, s, v, d) => voiceHarp(buf, freq, s, v, d),
  kalimba: (buf, freq, s, v, d) => voiceAdditive(buf, freq, s, v, d, VOICE_PARAMS.kalimba.partials, VOICE_PARAMS.kalimba.attack),
  bowl: (buf, freq, s, v, d) => voiceAdditive(buf, freq, s, v, d, VOICE_PARAMS.bowl.partials, VOICE_PARAMS.bowl.attack),
  koto: (buf, freq, s, v, d) => voiceKoto(buf, freq, s, v, d),
};

/**
 * 与 lib/synth.js 一致的卷积混响（Web Audio ConvolverNode 默认 normalize:true，
 * 这里复刻同一条噪声 IR 与 1/sqrt(Σ ir²) 归一化）。reverbWet = 0 时整个跳过。
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseImpulse(seconds, exponent) {
  const length = Math.floor(SAMPLE_RATE * seconds);
  const ir = new Float64Array(length);
  const rand = mulberry32(0x9e3779b9);
  for (let i = 0; i < length; i += 1) {
    ir[i] = (rand() * 2 - 1) * (1 - i / length) ** exponent;
  }
  return ir;
}

function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i += 1) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

function convolveNormalized(signal, ir) {
  let energy = 0;
  for (let i = 0; i < ir.length; i += 1) energy += ir[i] * ir[i];
  const scale = 1 / Math.sqrt(energy);
  const total = signal.length + ir.length - 1;
  let size = 1;
  while (size < total) size *= 2;
  const reA = new Float64Array(size);
  const imA = new Float64Array(size);
  const reB = new Float64Array(size);
  const imB = new Float64Array(size);
  for (let i = 0; i < signal.length; i += 1) reA[i] = signal[i];
  for (let i = 0; i < ir.length; i += 1) reB[i] = ir[i] * scale;
  fft(reA, imA);
  fft(reB, imB);
  for (let i = 0; i < size; i += 1) {
    const aRe = reA[i];
    const aIm = imA[i];
    const bRe = reB[i];
    const bIm = imB[i];
    reA[i] = aRe * bRe - aIm * bIm;
    imA[i] = aRe * bIm + aIm * bRe;
  }
  fft(reA, imA, true);
  const out = new Float32Array(total);
  for (let i = 0; i < total; i += 1) out[i] = reA[i];
  return out;
}

let impulseCache = null;

function impulseResponse() {
  if (!impulseCache) impulseCache = noiseImpulse(MIX.reverbSeconds, MIX.reverbDecayExponent);
  return impulseCache;
}

function figureLength(notes) {
  let end = 0;
  for (const [freq, offset, vel, dur] of notes) {
    end = Math.max(end, offset + dur + 0.15);
  }
  return Math.max(end, 0.5);
}

function encodeWav(left, right) {
  const frames = left.length;
  const data = Buffer.alloc(44 + frames * 4);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + frames * 4, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SAMPLE_RATE, 24);
  data.writeUInt32LE(SAMPLE_RATE * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i += 1) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    data.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
    data.writeInt16LE(Math.round(r * 32767), 44 + i * 4 + 2);
  }
  return data;
}

/**
 * 渲染一段动机为 WAV。
 * @param {string} timbre 音色 id
 * @param {Array} notes 缺省用该音色的默认动机
 * @returns {Buffer} WAV 字节
 */
export function renderWav(timbre, notes) {
  const id = TIMBRES.includes(timbre) ? timbre : DEFAULT_TIMBRE;
  const figure = notes || MELODIES[id];
  const length = Math.ceil(figureLength(figure) * SAMPLE_RATE);
  const mono = new Float32Array(length);
  for (const [freq, offset, velocity, duration] of figure) {
    VOICE_RENDERERS[id](mono, freq, offset, velocity, duration);
  }
  // 湿声为 0 时跳过卷积：输出纯干声，也不再多出静音尾巴。
  if (MIX.reverbWet <= 0) {
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const dry = mono[i] * MIX.masterGain;
      left[i] = dry;
      right[i] = dry;
    }
    return encodeWav(left, right);
  }
  const wet = convolveNormalized(mono, impulseResponse());
  const outLength = wet.length;
  const left = new Float32Array(outLength);
  const right = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const dry = i < length ? mono[i] * MIX.masterGain : 0;
    const mix = dry + wet[i] * MIX.reverbWet * MIX.masterGain;
    left[i] = mix;
    right[i] = mix;
  }
  return encodeWav(left, right);
}

/** 权限/提问确认提示的 WAV（vibes 两音）。 */
export function renderConfirmWav() {
  return renderWav(CONFIRM_MELODY.timbre, CONFIRM_MELODY.notes);
}

export { TIMBRES, DEFAULT_TIMBRE, SAMPLE_RATE };
