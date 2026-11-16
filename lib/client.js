// Generated from lib/recipes.js + lib/synth.js + lib/client-entry.js by scripts/build.mjs. Do not edit.
(() => {
	const __CHIME_MODULE_URL__ = typeof document !== "undefined" ? document.currentScript?.src : undefined;
	window.__ModuleLoader__.load({
		id: "dsh-done-chime",
		factory: (require) => {
			var module = { exports: {} };
			var exports = module.exports;
//#region lib/recipes.js
/**
 * 提示音配方。
 *
 * 移植自 MiMo Desktop（引擎为 MiMo Code，https://github.com/XiaomiMiMo/MiMo-Code）
 * 的 task-done chime。上游源码以 MIT 发布（© 2026 MiMo Code, Xiaomi Corporation；
 * © 2025 opencode），同时受其 Use Restrictions 约束并明确覆盖衍生物。
 * 版权、限制与修改范围见仓库根 NOTICE / LICENSE-MiMo-Code / USE_RESTRICTIONS.md。
 *
 * 一份数据两边共用：
 *   - lib/synth.js 用它在浏览器里做 Web Audio 实时合成（侧栏试听）；
 *   - lib/wav.js 用它离线渲染 WAV（host 在 turn/end 时播放）。
 *
 * 音色全部是振荡器配方，不含任何采样资源。
 */

/** 音名 → 频率（十二平均律，与 MiMo 原表一致）。 */
const NOTES = {
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392,
  A4: 440,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880,
  C6: 1046.5,
};

/** 全部音色 id（顺序即设置页展示顺序）。 */
const TIMBRES = [
  "rhodes",
  "handpan",
  "vibes",
  "bloom",
  "harp",
  "kalimba",
  "bowl",
  "koto",
];

const DEFAULT_TIMBRE = "kalimba";

/**
 * 每种音色的小动机：[频率, 起始偏移(秒), 力度, 单音时长(秒)]。
 * 整体一两秒收尾，适合作为完成提示。
 */
const MELODIES = {
  rhodes: [
    [NOTES.A4, 0, 1, 1.3],
    [NOTES.E4, 0.17, 0.95, 1.6],
  ],
  handpan: [
    [NOTES.D4, 0, 1, 1.4],
    [NOTES.A4, 0.12, 0.9, 1.4],
    [NOTES.D5, 0.24, 1, 1.7],
  ],
  vibes: [
    [NOTES.C5, 0, 0.9, 1.2],
    [NOTES.E5, 0.1, 0.9, 1.2],
    [NOTES.G5, 0.2, 1, 1.6],
  ],
  bloom: [
    [NOTES.C4, 0, 1, 1.8],
    [NOTES.E4, 0, 0.9, 1.8],
    [NOTES.G4, 0, 0.9, 1.8],
    [NOTES.D5, 0.06, 0.7, 1.8],
  ],
  harp: [
    [NOTES.C5, 0, 0.85, 1.4],
    [NOTES.D5, 0.07, 0.82, 1.4],
    [NOTES.E5, 0.14, 0.79, 1.4],
    [NOTES.G5, 0.21, 0.76, 1.4],
    [NOTES.A5, 0.28, 0.73, 1.4],
    [NOTES.C6, 0.35, 0.7, 1.4],
  ],
  kalimba: [
    [NOTES.G4, 0, 1, 1.1],
    [NOTES.C5, 0.11, 0.95, 1.1],
    [NOTES.D5, 0.22, 1, 1.3],
  ],
  bowl: [
    [NOTES.F4, 0, 1, 2.4],
    [NOTES.C5, 0.03, 0.6, 2.2],
  ],
  koto: [
    [NOTES.A4, 0, 0.95, 1.3],
    [NOTES.D5, 0.1, 0.9, 1.3],
    [NOTES.E5, 0.22, 1, 1.6],
  ],
};

/** 权限/提问确认的两音提示（vibes 音色演奏）。 */
const CONFIRM_MELODY = {
  timbre: "vibes",
  notes: [
    [NOTES.E5, 0, 0.85, 1.1],
    [NOTES.A5, 0.16, 1, 1.4],
  ],
};

/** 各音色发声参数（两个渲染器共同的约定，勿单独改动一边）。 */
const VOICE_PARAMS = {
  // FM：调制指数起点 = 频率 × modGainStart × 力度，衰减到 频率 × modGainEnd。
  rhodes: { kind: "fm", modGainStart: 1.4, modGainEnd: 0.08, modDecayAt: 0.4, attack: 0.012, peak: 0.33 },
  // 加法：泛音列表 [倍频, 幅度, 衰减比例]。
  handpan: { kind: "additive", partials: [[1, 0.3, 1], [2, 0.12, 0.55 / 2], [3.01, 0.06, 0.55 / 3.01], [4.02, 0.03, 0.55 / 4.02]], attack: 0.014 },
  // AM 颤音：5.5Hz 正弦经 0.28 增益调制主增益。
  vibes: { kind: "tremolo", tremoloHz: 5.5, tremoloDepth: 0.28, attack: 0.02, peak: 0.3 },
  // 三角波 + 低通扫频。
  bloom: { kind: "sweep", wave: "triangle", filterStart: 380, filterEnd: 3200, filterTime: 0.45, q: 0.6, attack: 0.13, peak: 0.17 },
  // 三角波 + 固定低通（截止 = 频率 × 4.5）。
  harp: { kind: "lowpass", wave: "triangle", filterRatio: 4.5, q: 0.4, attack: 0.008, peak: 0.28 },
  // 钟形加法：三泛音，各自独立衰减比例。
  kalimba: { kind: "additive", partials: [[1, 0.32, 1], [2.76, 0.05, 0.4], [5.4, 0.02, 0.2]], attack: 0.006 },
  // 颂钵：四泛音，含轻微失谐与次谐波。
  bowl: { kind: "additive", partials: [[1, 0.2, 1], [1.004, 0.2, 1], [2.01, 0.07, 1], [0.5, 0.1, 1]], attack: 0.09 },
  // 三角波 + 音高滑入（0.99 → 1.0）+ 低通。
  koto: { kind: "glide", wave: "triangle", glide: 0.99, glideTime: 0.05, filterRatio: 5, q: 0.5, attack: 0.006, peak: 0.3 },
};

/** 输出链参数。 */
const MIX = {
  masterGain: 0.5,
  reverbSeconds: 1.8,
  reverbDecayExponent: 2.6,
  // 混响湿声。0 = 纯干声（渲染时跳过卷积）；想要空间感再往上调，0.04 起步就很淡。
  reverbWet: 0,
  /** 整段渲染长度（含尾音），WAV 用。 */
  renderTailSeconds: 0.6,
};

//#endregion

//#region lib/synth.js
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


let shared = null;

/** 共享 AudioContext + 主增益 + 卷积混响（噪声脉冲响应）。 */
function audioGraph() {
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
function play(timbre, notes) {
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
function playConfirm() {
  return play(CONFIRM_MELODY.timbre, CONFIRM_MELODY.notes);
}


//#endregion

//#region lib/client-entry.js
/**
 * dsh-done-chime —— client 半侧（侧栏面板 + Web Audio 试听）。
 *
 * 本文件是"可打包 ESM"风格：不写 import 语句，直接使用打包后同一作用域里的
 * lib/recipes.js 与 lib/synth.js 的名字；scripts/build.mjs 把三段拼成
 * lib/client.js（__ModuleLoader__ 工厂）。修改时保持这一约定。
 */

const h = require("react").createElement;

const API_PATH = "/dsh-done-chime";

function apiUrl(pathname) {
  try {
    const page = new URL(window.location.href);
    const script = (typeof __CHIME_MODULE_URL__ !== "undefined" && __CHIME_MODULE_URL__)
      || (typeof document !== "undefined" && document.currentScript && document.currentScript.src)
      || page.href;
    const moduleUrl = new URL(script, page);
    const marker = moduleUrl.pathname.indexOf("/plugins/");
    const base = moduleUrl.origin === page.origin && marker >= 0
      ? new URL(moduleUrl.pathname.slice(0, marker + 1), page)
      : page;
    return new URL(pathname.replace(/^\//, ""), base).href;
  } catch {
    return pathname;
  }
}

async function fetchJson(pathname, init) {
  const res = await fetch(apiUrl(pathname), Object.assign({ cache: "no-store", credentials: "same-origin" }, init || {}));
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.ok === false) throw new Error((data && data.error) || `http ${res.status}`);
  return data;
}

const styles = {
  wrap: { padding: "16px 20px", color: "#d8dee9", fontSize: 13, lineHeight: 1.7 },
  title: { fontSize: 15, fontWeight: 600, margin: "0 0 4px" },
  desc: { color: "#8b95a7", margin: "0 0 16px" },
  row: { display: "flex", alignItems: "center", gap: 10, margin: "10px 0" },
  label: { width: 96, color: "#8b95a7", flex: "0 0 auto" },
  select: {
    flex: 1, background: "#1b212c", color: "#d8dee9", border: "1px solid #2c3442",
    borderRadius: 6, padding: "6px 8px", fontSize: 13,
  },
  input: {
    width: 88, background: "#1b212c", color: "#d8dee9", border: "1px solid #2c3442",
    borderRadius: 6, padding: "6px 8px", fontSize: 13,
  },
  button: {
    background: "#2c3442", color: "#d8dee9", border: "1px solid #3a4454",
    borderRadius: 6, padding: "6px 14px", fontSize: 13, cursor: "pointer",
  },
  primary: {
    background: "#3b6fd4", color: "#fff", border: "1px solid #3b6fd4",
    borderRadius: 6, padding: "6px 14px", fontSize: 13, cursor: "pointer",
  },
  note: { color: "#8b95a7", marginTop: 14 },
  status: { marginTop: 10, minHeight: 20, color: "#9ad1a4" },
};

const TIMBRE_LABELS = {
  off: "关闭",
  rhodes: "Rhodes 电钢",
  handpan: "Handpan 手碟",
  vibes: "Vibes 颤音琴",
  bloom: "Bloom 绽放",
  harp: "Harp 竖琴",
  kalimba: "Kalimba 卡林巴",
  bowl: "Bowl 颂钵",
  koto: "Koto 古筝",
};

function Panel() {
  const react = require("react");
  const [cfg, setCfg] = react.useState(null);
  const [msg, setMsg] = react.useState("");
  const [busy, setBusy] = react.useState(false);

  react.useEffect(() => {
    let alive = true;
    fetchJson(`${API_PATH}/config`)
      .then((data) => { if (alive) setCfg(data.config); })
      .catch((error) => { if (alive) setMsg(`读取配置失败：${error.message}`); });
    return () => { alive = false; };
  }, []);

  const update = async (patch) => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const data = await fetchJson(`${API_PATH}/config`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      setCfg(data.config);
      setMsg("已保存");
    } catch (error) {
      setMsg(`保存失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const test = async (timbre) => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      await fetchJson(`${API_PATH}/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(timbre ? { timbre } : {}),
      });
      setMsg("已试听");
    } catch (error) {
      setMsg(`试听失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!cfg) {
    return h("div", { style: styles.wrap }, h("div", { style: styles.desc }, "正在读取提示音配置…"), msg ? h("div", { style: styles.status }, msg) : null);
  }

  return h(
    "div",
    { style: styles.wrap },
    h("div", { style: styles.title }, "任务完成提示音"),
    h("div", { style: styles.desc }, "回合结束时播放提示音；仅当任务时长超过阈值时响铃，避免短任务被打扰。"),
    h(
      "div",
      { style: styles.row },
      h("span", { style: styles.label }, "启用"),
      h("button", {
        style: cfg.enabled ? styles.primary : styles.button,
        disabled: busy,
        onClick: () => update({ enabled: !cfg.enabled }),
      }, cfg.enabled ? "已开启" : "已关闭"),
    ),
    h(
      "div",
      { style: styles.row },
      h("span", { style: styles.label }, "音色"),
      h(
        "select",
        {
          style: styles.select,
          value: cfg.timbre,
          disabled: busy,
          onChange: (event) => update({ timbre: event.target.value }),
        },
        ["off"].concat(TIMBRES).map((id) =>
          h("option", { key: id, value: id }, TIMBRE_LABELS[id] || id)),
      ),
      h("button", { style: styles.button, disabled: busy, onClick: () => test() }, "试听"),
    ),
    h(
      "div",
      { style: styles.row },
      h("span", { style: styles.label }, "最短时长"),
      h("input", {
        style: styles.input,
        type: "number",
        min: 0,
        step: 5,
        value: Math.round(cfg.minDurationMs / 1000),
        disabled: busy,
        onChange: (event) => update({ minDurationMs: Math.max(0, Number(event.target.value) || 0) * 1000 }),
      }),
      h("span", { style: styles.desc }, "秒（任务短于此值不响铃）"),
    ),
    h(
      "div",
      { style: styles.row },
      h("span", { style: styles.label }, "确认提示"),
      h("button", {
        style: cfg.confirmSound ? styles.primary : styles.button,
        disabled: busy,
        onClick: () => update({ confirmSound: !cfg.confirmSound }),
      }, cfg.confirmSound ? "已开启" : "已关闭"),
      h("button", { style: styles.button, disabled: busy, onClick: () => test("confirm") }, "试听"),
    ),
    h("div", { style: styles.status }, msg),
    h("div", { style: styles.note }, "也可用指令：/chime status | on | off | timbre <音色> | test | min <秒> | confirm on|off"),
  );
}

function PanelIcon(props) {
  // 侧栏槽位以 { size: 16|18, active } 调用图标，外层 panelGlyph 是定宽居中框；
  // 尺寸必须跟随 size，否则会比第一方图标大一圈且不齐。
  const size = (props && props.size) || 16;
  return h(
    "svg",
    { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" },
    h("path", {
      d: "M12 3a6 6 0 0 0-6 6v3.6l-1.4 2.8A1 1 0 0 0 5.5 17h13a1 1 0 0 0 .9-1.5L18 12.6V9a6 6 0 0 0-6-6Z",
      stroke: "currentColor",
      strokeWidth: 1.6,
      strokeLinejoin: "round",
    }),
    h("path", { d: "M10 20a2 2 0 0 0 4 0", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" }),
  );
}

const PANEL_ID = "dsh-done-chime";

function* apply(ctx) {
  yield ctx.slots.inject("sidebar.panellist", () =>
    ctx.slots.register(
      {
        name: "sidebar.panellist",
        id: PANEL_ID,
        order: 40,
        label: "提示音",
      },
      PanelIcon,
    ),
  );
  yield ctx.slots.inject("main", () =>
    ctx.slots.register(
      {
        name: "main",
        key: PANEL_ID,
      },
      Panel,
    ),
  );
}

module.exports = { name: "dsh-done-chime", inject: ["slots", "locale"], apply, PANEL_ID };

//#endregion
			return module.exports;
		}
	});
})();
