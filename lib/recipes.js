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
export const NOTES = {
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
export const TIMBRES = [
  "rhodes",
  "handpan",
  "vibes",
  "bloom",
  "harp",
  "kalimba",
  "bowl",
  "koto",
];

export const DEFAULT_TIMBRE = "kalimba";

/**
 * 每种音色的小动机：[频率, 起始偏移(秒), 力度, 单音时长(秒)]。
 * 整体一两秒收尾，适合作为完成提示。
 */
export const MELODIES = {
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
export const CONFIRM_MELODY = {
  timbre: "vibes",
  notes: [
    [NOTES.E5, 0, 0.85, 1.1],
    [NOTES.A5, 0.16, 1, 1.4],
  ],
};

/** 各音色发声参数（两个渲染器共同的约定，勿单独改动一边）。 */
export const VOICE_PARAMS = {
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
export const MIX = {
  masterGain: 0.5,
  reverbSeconds: 1.8,
  reverbDecayExponent: 2.6,
  // 混响湿声。0 = 纯干声（渲染时跳过卷积）；想要空间感再往上调，0.04 起步就很淡。
  reverbWet: 0,
  /** 整段渲染长度（含尾音），WAV 用。 */
  renderTailSeconds: 0.6,
};
