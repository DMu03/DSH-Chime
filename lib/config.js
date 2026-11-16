/**
 * 插件运行期配置：~/.dsh/done-chime/config.json。
 *
 * 独立于 Cordis patch，便于 /chime 指令、HTTP 路由与侧栏面板读写同一份数据；
 * 文件缺失时回落到 bundle patch 里的默认值。
 */

import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { TIMBRES, DEFAULT_TIMBRE } from "./recipes.js";

export const DEFAULTS = {
  enabled: true,
  timbre: DEFAULT_TIMBRE,
  minDurationMs: 60000,
  confirmSound: true,
};

export function configDir() {
  return join(homedir(), ".dsh", "done-chime");
}

export function configPath() {
  return join(configDir(), "config.json");
}

export function wavDir() {
  return join(configDir(), "wav");
}

export function loadConfig(fallback = DEFAULTS) {
  try {
    const raw = JSON.parse(readFileSync(configPath(), "utf8"));
    return normalize({ ...fallback, ...raw });
  } catch {
    return normalize({ ...fallback });
  }
}

export function saveConfig(next) {
  const value = normalize(next);
  mkdirSync(configDir(), { recursive: true });
  const target = configPath();
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tmp, target);
  return value;
}

export function configExists() {
  return existsSync(configPath());
}

export function normalize(value) {
  const out = { ...DEFAULTS, ...(value && typeof value === "object" ? value : {}) };
  out.enabled = out.enabled !== false;
  out.timbre = out.timbre === "off" || TIMBRES.includes(out.timbre) ? out.timbre : DEFAULT_TIMBRE;
  const ms = Number(out.minDurationMs);
  out.minDurationMs = Number.isFinite(ms) && ms >= 0 ? Math.floor(ms) : DEFAULTS.minDurationMs;
  out.confirmSound = out.confirmSound !== false;
  return out;
}
