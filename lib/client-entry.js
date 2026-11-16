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
