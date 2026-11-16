/**
 * Web Audio 提示音合成器。
 *
 * 移植自 MiMo Desktop（引擎为 MiMo Code，https://github.com/XiaomiMiMo/MiMo-Code）
 * 的 task-done chime。上游源码以 MIT 发布（© 2026 MiMo Code, Xiaomi Corporation；
 * © 2025 opencode），同时受其 Use Restrictions 约束并明确覆盖衍生物。
 * 版权、限制与修改范围见仓库根 NOTICE / LICENSE-MiMo-Code / USE_RESTRICTIONS.md。
 *
 * 只在浏览器端使用（侧栏面板试听）。与 lib/wav.js 共用 lib/recipes.js 的
 * 配方常量，两边发声参数保持一致。
 */

import {
  MIX,
  MELODIES,
  TIMBRES,
  CONFIRM_MELODY,
  DEFAULT_TIMBRE,
  VOICE_PARAMS,
} from "./recipes.js";

let shared = null;

/** 共享 AudioContext + 主增益 + 卷积混响（噪声脉冲响应）。 */
export function audioGraph() {
  if (shared) {
    if (shared.ctx.state === "suspended") shared.ctx.resume();
    return shared;
  }
  const Ctor = typeof AudioContext !== "undefined" ? AudioContext : globalThis.webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = MIX.masterGain;
  master.connect(ctx.destination);
  if (MIX.reverbWet > 0) {
    const convolver = ctx.createConvolver();
    convolver.buffer = noiseImpulse(ctx, MIX.reverbSeconds, MIX.reverbDecayExponent);
    const wet = ctx.createGain();
    wet.gain.value = MIX.reverbWet;
    master.connect(convolver).connect(wet).connect(ctx.destination);
  }
  shared = { ctx, master };
  return shared;
}

function noiseImpulse(ctx, seconds, exponent) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** exponent;
    }
  }
  return buffer;
}

// ---- 八种音色发声体：(graph, freq, startTime, velocity, duration) ----

function voiceRhodes(g, freq, t, vel, dur) {
  const carrier = g.ctx.createOscillator();
  const mod = g.ctx.createOscillator();
  const modGain = g.ctx.createGain();
  const amp = g.ctx.createGain();
  carrier.type = "sine";
  mod.type = "sine";
  carrier.frequency.value = freq;
  mod.frequency.value = freq;
  const p = VOICE_PARAMS.rhodes;
  modGain.gain.setValueAtTime(freq * p.modGainStart * vel, t);
  modGain.gain.exponentialRampToValueAtTime(freq * p.modGainEnd, t + dur * p.modDecayAt);
  mod.connect(modGain).connect(carrier.frequency);
  amp.gain.setValueAtTime(1e-4, t);
  amp.gain.exponentialRampToValueAtTime(p.peak * vel, t + p.attack);
  amp.gain.exponentialRampToValueAtTime(1e-4, t + dur);
  carrier.connect(amp).connect(g.master);
  mod.start(t);
  carrier.start(t);
  mod.stop(t + dur + 0.1);
  carrier.stop(t + dur + 0.1);
}

function voiceHandpan(g, freq, t, vel, dur) {
  const p = VOICE_PARAMS.handpan;
  for (const [ratio, amp, decay] of p.partials) {
    const osc = g.ctx.createOscillator();
    const env = g.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    const stop = t + dur * decay;
    env.gain.setValueAtTime(1e-4, t);
    env.gain.exponentialRampToValueAtTime(amp * vel, t + p.attack);
    env.gain.exponentialRampToValueAtTime(1e-4, stop);
    osc.connect(env).connect(g.master);
    osc.start(t);
    osc.stop(stop + 0.1);
  }
}

function voiceVibes(g, freq, t, vel, dur) {
  const carrier = g.ctx.createOscillator();
  const amp = g.ctx.createGain();
  const tremGain = g.ctx.createGain();
  const trem = g.ctx.createOscillator();
  const tremDepth = g.ctx.createGain();
  const p = VOICE_PARAMS.vibes;
  carrier.type = "sine";
  carrier.frequency.value = freq;
  trem.type = "sine";
  trem.frequency.value = p.tremoloHz;
  tremDepth.gain.value = p.tremoloDepth;
  trem.connect(tremDepth).connect(tremGain.gain);
  tremGain.gain.value = 1;
  amp.gain.setValueAtTime(1e-4, t);
  amp.gain.exponentialRampToValueAtTime(p.peak * vel, t + p.attack);
  amp.gain.exponentialRampToValueAtTime(1e-4, t + dur);
  carrier.connect(amp).connect(tremGain).connect(g.master);
  carrier.start(t);
  trem.start(t);
  carrier.stop(t + dur + 0.1);
  trem.stop(t + dur + 0.1);
}

function voiceBloom(g, freq, t, vel, dur) {
  const osc = g.ctx.createOscillator();
  const amp = g.ctx.createGain();
  const filter = g.ctx.createBiquadFilter();
  const p = VOICE_PARAMS.bloom;
  osc.type = "triangle";
  osc.frequency.value = freq;
  filter.type = "lowpass";
  filter.Q.value = p.q;
  filter.frequency.setValueAtTime(p.filterStart, t);
  filter.frequency.linearRampToValueAtTime(p.filterEnd, t + p.filterTime);
  amp.gain.setValueAtTime(1e-4, t);
  amp.gain.exponentialRampToValueAtTime(p.peak * vel, t + p.attack);
  amp.gain.exponentialRampToValueAtTime(1e-4, t + dur);
  osc.connect(filter).connect(amp).connect(g.master);
  osc.start(t);
  osc.stop(t + dur + 0.1);
}

function voiceHarp(g, freq, t, vel, dur) {
  const osc = g.ctx.createOscillator();
  const amp = g.ctx.createGain();
  const filter = g.ctx.createBiquadFilter();
  const p = VOICE_PARAMS.harp;
  osc.type = "triangle";
  osc.frequency.value = freq;
  filter.type = "lowpass";
  filter.frequency.value = freq * p.filterRatio;
  filter.Q.value = p.q;
  amp.gain.setValueAtTime(1e-4, t);
  amp.gain.exponentialRampToValueAtTime(p.peak * vel, t + p.attack);
  amp.gain.exponentialRampToValueAtTime(1e-4, t + dur);
  osc.connect(filter).connect(amp).connect(g.master);
  osc.start(t);
  osc.stop(t + dur + 0.1);
}

function voiceKalimba(g, freq, t, vel, dur) {
  const p = VOICE_PARAMS.kalimba;
  for (const [ratio, amp, decay] of p.partials) {
    const osc = g.ctx.createOscillator();
    const env = g.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    const stop = t + dur * decay;
    env.gain.setValueAtTime(1e-4, t);
    env.gain.exponentialRampToValueAtTime(amp * vel, t + p.attack);
    env.gain.exponentialRampToValueAtTime(1e-4, stop);
    osc.connect(env).connect(g.master);
    osc.start(t);
    osc.stop(stop + 0.1);
  }
}

function voiceBowl(g, freq, t, vel, dur) {
  const p = VOICE_PARAMS.bowl;
  for (const [ratio, amp] of p.partials) {
    const osc = g.ctx.createOscillator();
    const env = g.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    env.gain.setValueAtTime(1e-4, t);
    env.gain.exponentialRampToValueAtTime(amp * vel, t + p.attack);
    env.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    osc.connect(env).connect(g.master);
    osc.start(t);
    osc.stop(t + dur + 0.15);
  }
}

function voiceKoto(g, freq, t, vel, dur) {
  const osc = g.ctx.createOscillator();
  const amp = g.ctx.createGain();
  const filter = g.ctx.createBiquadFilter();
  const p = VOICE_PARAMS.koto;
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq * p.glide, t);
  osc.frequency.linearRampToValueAtTime(freq, t + p.glideTime);
  filter.type = "lowpass";
  filter.frequency.value = freq * p.filterRatio;
  filter.Q.value = p.q;
  amp.gain.setValueAtTime(1e-4, t);
  amp.gain.exponentialRampToValueAtTime(p.peak * vel, t + p.attack);
  amp.gain.exponentialRampToValueAtTime(1e-4, t + dur);
  osc.connect(filter).connect(amp).connect(g.master);
  osc.start(t);
  osc.stop(t + dur + 0.1);
}

const VOICES = {
  rhodes: voiceRhodes,
  handpan: voiceHandpan,
  vibes: voiceVibes,
  bloom: voiceBloom,
  harp: voiceHarp,
  kalimba: voiceKalimba,
  bowl: voiceBowl,
  koto: voiceKoto,
};

/**
 * 播放一段动机。
 * @param {string} timbre 音色 id（TIMBRES 之一）
 * @param {Array} notes [频率, 偏移, 力度, 时长][]；缺省用该音色的默认动机
 */
export function play(timbre, notes) {
  const g = audioGraph();
  if (!g) return false;
  const id = TIMBRES.includes(timbre) ? timbre : DEFAULT_TIMBRE;
  const figure = notes || MELODIES[id];
  const base = g.ctx.currentTime + 0.03;
  for (const [freq, offset, velocity, duration] of figure) {
    VOICES[id](g, freq, base + offset, velocity, duration);
  }
  return true;
}

/** 播放权限/提问确认提示（两音，vibes 音色）。 */
export function playConfirm() {
  return play(CONFIRM_MELODY.timbre, CONFIRM_MELODY.notes);
}

export { TIMBRES, DEFAULT_TIMBRE };
