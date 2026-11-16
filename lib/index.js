/**
 * dsh-done-chime —— 任务完成提示音（host 半侧）。
 *
 * 只使用插件官方接口：
 *   - ctx.inject(["commands"])   注册 /chime 指令
 *   - ctx.inject(["webServer"])  注册面板用的 HTTP 路由
 *   - ctx.on("session/event")    监听 turn/end，按时长阈值决定是否响铃
 *
 * 不读写应用本体（resources\app / app.asar），DSH 更新不会覆盖本插件；
 * 最坏情况是事件更名导致不响铃，插件本身仍可加载。
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULTS,
  loadConfig,
  saveConfig,
  normalize,
  configPath,
  wavDir,
} from "./config.js";
import { renderWav, renderConfirmWav, TIMBRES, DEFAULT_TIMBRE } from "./wav.js";
import { MELODIES } from "./recipes.js";

export const name = "dsh-done-chime";
export const inject = ["commands", "webServer"];

const TAG = "[dsh-done-chime]";

// ---- 播放 ----

function ensureWav(fileName, render) {
  const dir = wavDir();
  mkdirSync(dir, { recursive: true });
  const target = join(dir, fileName);
  if (!existsSync(target)) writeFileSync(target, render());
  return target;
}

function playWav(path) {
  if (process.platform !== "win32") return false;
  const script = `(New-Object Media.SoundPlayer '${path.replace(/'/g, "''")}').PlaySync()`;
  execFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true },
    (error) => {
      if (error) console.warn(`${TAG} play failed:`, String(error.message || error));
    },
  );
  return true;
}

function playTimbre(timbre) {
  const id = TIMBRES.includes(timbre) ? timbre : DEFAULT_TIMBRE;
  playWav(ensureWav(`${id}.wav`, () => renderWav(id, MELODIES[id])));
}

function playConfirm() {
  playWav(ensureWav("confirm.wav", () => renderConfirmWav()));
}

// ---- 指令 ----

const COMMAND_HINT = "status | on | off | timbre <name> | test [name] | min <seconds> | confirm on|off | help";

function describe(cfg) {
  const rows = [
    `enabled=${cfg.enabled}`,
    `timbre=${cfg.timbre}`,
    `minDurationMs=${cfg.minDurationMs}`,
    `confirmSound=${cfg.confirmSound}`,
  ];
  return rows.join(" ");
}

function handleCommand(raw, fallback) {
  const text = String(raw || "").trim();
  const [verbRaw, ...rest] = text.split(/\s+/);
  const verb = (verbRaw || "status").toLowerCase();
  const arg = (rest[0] || "").toLowerCase();
  const cfg = loadConfig(fallback);

  switch (verb) {
    case "status":
    case "":
      return `提示音状态：${describe(cfg)}｜配置文件：${configPath()}`;
    case "on":
      return `已开启完成提示音。${describe(saveConfig({ ...cfg, enabled: true }))}`;
    case "off":
      return `已关闭完成提示音。${describe(saveConfig({ ...cfg, enabled: false }))}`;
    case "timbre": {
      if (!arg) return `当前音色：${cfg.timbre}。可选：${TIMBRES.join(" / ")} / off`;
      if (arg !== "off" && !TIMBRES.includes(arg)) {
        return `未知音色「${arg}」。可选：${TIMBRES.join(" / ")} / off`;
      }
      playTimbre(arg === "off" ? cfg.timbre : arg);
      return `音色已设为 ${arg}。${describe(saveConfig({ ...cfg, timbre: arg }))}`;
    }
    case "test":
      playTimbre(arg || cfg.timbre);
      return `已试听 ${arg || cfg.timbre}。`;
    case "min": {
      const seconds = Number(arg);
      if (!Number.isFinite(seconds) || seconds < 0) return "用法：/chime min <秒数>，例如 /chime min 30";
      return `完成提示的最短任务时长设为 ${seconds} 秒。${describe(saveConfig({ ...cfg, minDurationMs: Math.floor(seconds * 1000) }))}`;
    }
    case "confirm": {
      if (arg !== "on" && arg !== "off") return "用法：/chime confirm on|off";
      if (arg === "on") playConfirm();
      return `确认提示音已${arg === "on" ? "开启" : "关闭"}。${describe(saveConfig({ ...cfg, confirmSound: arg === "on" }))}`;
    }
    case "help":
      return `用法：/chime ${COMMAND_HINT}`;
    default:
      return `未知子命令「${verb}」。用法：/chime ${COMMAND_HINT}`;
  }
}

// ---- HTTP 路由（侧栏面板用）----

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function allowRequest(request, response) {
  const site = String(request.headers["sec-fetch-site"] || "").toLowerCase();
  if (site === "cross-site") {
    sendJson(response, 403, { ok: false, error: "cross-site" });
    return false;
  }
  const origin = String(request.headers.origin || "").trim();
  if (origin === "null") {
    sendJson(response, 403, { ok: false, error: "null-origin" });
    return false;
  }
  return true;
}

async function readJsonBody(request, maxBytes = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("body too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function httpHandler(fallback) {
  return async (request, response) => {
    if (!allowRequest(request, response)) return;
    const url = new URL(request.url, "http://127.0.0.1");
    const tail = url.pathname.replace(/^\/dsh-done-chime\/?/i, "").replace(/\/+$/, "");
    const op = tail || String(url.searchParams.get("op") || "").replace(/\/$/, "");
    const method = String(request.method || "GET").toUpperCase();
    try {
      if (method === "GET" && (op === "" || op === "config")) {
        sendJson(response, 200, { ok: true, config: loadConfig(fallback), timbres: ["off", ...TIMBRES] });
        return;
      }
      if (method === "POST" && op === "config") {
        const body = await readJsonBody(request);
        const saved = saveConfig({ ...loadConfig(fallback), ...(body || {}) });
        sendJson(response, 200, { ok: true, config: saved });
        return;
      }
      if (method === "POST" && op === "test") {
        const body = await readJsonBody(request);
        const cfg = loadConfig(fallback);
        const timbre = body && body.timbre ? String(body.timbre) : cfg.timbre;
        if (timbre === "confirm") {
          playConfirm();
        } else {
          playTimbre(timbre);
        }
        sendJson(response, 200, { ok: true, playing: timbre });
        return;
      }
      sendJson(response, 404, { ok: false, error: `unknown op: ${op}` });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: String(error && error.message ? error.message : error) });
    }
  };
}

// ---- 生命周期 ----

export function apply(ctx, config = {}) {
  const fallback = normalize({ ...DEFAULTS, ...config });
  const turnStarts = new Map();

  ctx.effect(() => () => turnStarts.clear());

  // 回合起止：按时长阈值决定是否响铃；权限/提问确认播两音提示。
  ctx.on("session/event", (session, event) => {
    try {
      if (event.type === "turn/start") {
        turnStarts.set(session, event.time);
        return;
      }
      if (event.type !== "turn/end") return;
      const started = turnStarts.get(session);
      turnStarts.delete(session);
      const cfg = loadConfig(fallback);
      const reason = event.data && event.data.reason ? event.data.reason.kind : undefined;
      const aborted = reason === "aborted" || reason === "interrupted" || reason === "error";
      const elapsedMs = started === undefined ? undefined : Math.max(0, event.time - started);
      if (!cfg.enabled || cfg.timbre === "off" || aborted) return;
      if (elapsedMs !== undefined && elapsedMs <= cfg.minDurationMs) return;
      playTimbre(cfg.timbre);
    } catch (error) {
      console.warn(`${TAG} turn/end handler:`, String(error && error.message ? error.message : error));
    }
  });

  ctx.on("session/event", (session, event) => {
    try {
      if (event.type !== "approval/request") return;
      const cfg = loadConfig(fallback);
      if (cfg.confirmSound) playConfirm();
    } catch {
      /* 提示音失败不影响审批流程 */
    }
  });

  // /chime 指令
  ctx.inject(["commands"], (host) => {
    const commands = host.get("commands");
    host.effect(() => () => {
      /* 指令随 fiber 释放 */
    });
    try {
      commands.register({
        name: "chime",
        description: "任务完成提示音（status/on/off/timbre/test/min/confirm/help）",
        input: { hint: COMMAND_HINT },
        handler: async (invocation) => {
          try {
            return { kind: "success", text: handleCommand(invocation && invocation.rawInput, fallback) };
          } catch (error) {
            return { kind: "error", text: String(error && error.message ? error.message : error) };
          }
        },
      });
    } catch (error) {
      console.warn(`${TAG} /chime register failed:`, String(error && error.message ? error.message : error));
    }
  });

  // 侧栏面板 HTTP 路由
  ctx.inject(["webServer"], (host) => {
    let dispose = () => {};
    try {
      dispose = host.webServer.register({
        kind: "prefix",
        path: "/dsh-done-chime",
        handler: httpHandler(fallback),
      });
    } catch (error) {
      console.warn(`${TAG} route register failed:`, String(error && error.message ? error.message : error));
    }
    host.effect(() => () => {
      try {
        dispose();
      } catch {
        /* ignore */
      }
    });
  });
}
