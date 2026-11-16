# dsh-done-chime

[English](README.md) | 中文

DSH（DeepSeek Harness）附加组件：回合结束时播放完成提示音。8 种音色可选，侧栏有开关与试听面板，另附 `/chime` 指令。

独立插件，**不修改应用本体**（`resources\app` / `app.asar` 一个字节都不碰），只使用插件官方接口，所以 DSH 更新覆盖不到它。

提示音配方与合成器移植自 MiMo Desktop，其上游 MIT 声明与随附的 Use Restrictions 见[来源与许可](#来源与许可基于-mimo-desktop)。

## 安装与使用

### 装之前

- DSH Desktop 0.2.1-rc.1 或更新（写在 `engines.dsh` 里；实测线是 0.2.x）。
- 下面两种装法任选一种，**都要重启 DSH**——插件是在启动时组合的。

### 装法 A：一条命令（推荐）

DSH 有一个官方 CLI，npm 上的包名是 `@deepseek-ai/dsh`；它的 `plugin` 子命令把参数交给 `pnpm`，装完还会自动把新组合包选进 `dsh.profile.bundles`：

```powershell
npx -y @deepseek-ai/dsh@latest plugin --profile desktop add github:DMu03/DSH-Chime#v1.0.0
```

- 换别的来源也行：tarball 地址（如 `https://github.com/DMu03/DSH-Chime/archive/refs/tags/v1.0.0.tar.gz`）、本机绝对路径，或者等它发布到 npm 后直接用包名 `dsh-done-chime`。
- 建议钉 tag 或完整提交号，别用分支——钉住之后更新行为才是确定的。
- 环境要求：Node ≥ 24.9，且 `pnpm` 在 `PATH` 里。桌面版先启动过一次让 profile 初始化，跑命令前把它完全退出。
- 装完重新打开 DSH。
- 卸载同理：`npx -y @deepseek-ai/dsh@latest plugin --profile desktop remove dsh-done-chime`。

### 装法 B：手动改 profile

1. `~/.dsh/profiles/desktop/package.json` 里，`dependencies` 加 `"dsh-done-chime": "file:<本仓库的绝对路径>"`，`dsh.profile.bundles` 加 `"dsh-done-chime"`。
2. 在 profile 目录跑 `pnpm install`（应用自带的 `runtime/primary-runtime` 里的 pnpm 也行）。
3. 重启 DSH。

桌面版的**设置 → 插件**页面能列出已装的组合包，也能在这里开关它们。

### 怎么用

- 侧栏会出现「提示音」面板：开关、音色（带试听）、最短时长、确认提示开关。配置存在 `~/.dsh/done-chime/config.json`。
- 回合结束时响铃，但只有任务时长超过阈值（默认 60 秒）才响，短回复不打扰。
- 权限确认或需要你回答时，播一个两音提示。
- 指令：

  | 指令 | 作用 |
  | --- | --- |
  | `/chime status` | 查看当前配置 |
  | `/chime on` / `/chime off` | 开 / 关 |
  | `/chime timbre <名称>` | 选音色：`rhodes handpan vibes bloom harp kalimba bowl koto` |
  | `/chime test [名称]` | 试听 |
  | `/chime min <秒>` | 响铃的最短任务时长 |
  | `/chime confirm on\|off` | 确认提示开关 |
  | `/chime help` | 看这些用法 |

## 效果

- 回合结束时播放提示音（8 种音色：Rhodes / Handpan / Vibes / Bloom / Harp / Kalimba / Bowl / Koto）。
- 仅当任务时长超过阈值（默认 60 秒）时才响铃，短任务不打扰。
- 权限/提问确认时播放两音提示（可关闭）。
- 侧栏「提示音」面板：开关、音色选择、试听、阈值、确认音开关。
- 指令：`/chime status | on | off | timbre <name> | test [name] | min <seconds> | confirm on|off | help`。

## 架构（为什么抗更新）

| 部件 | 落点 | 依赖的官方接口 |
| --- | --- | --- |
| 触发 | host 插件 | `ctx.on("session/event")` 监听 `turn/end` |
| 发声 | host 插件 | 渲染 WAV 后用系统 `SoundPlayer` 播放（零渲染端依赖） |
| 指令 | host 插件 | `ctx.inject(["commands"])` → `commands.register` |
| 配置 | host 插件 | `~/.dsh/done-chime/config.json` |
| 面板 | client bundle | `ctx.slots`（`sidebar.panellist` + `main` 槽位） |
| 试听 | client bundle | Web Audio 实时合成（与 WAV 同一套配方） |

音色配方只有一份（`lib/recipes.js`），两个渲染器共用：
`lib/synth.js`（Web Audio，面板试听）与 `lib/wav.js`（PCM→WAV，host 播放）。

## 目录

```
lib/recipes.js      音色配方与动机（数据，两边共用）
lib/synth.js        Web Audio 合成器
lib/wav.js          PCM→WAV 渲染器（同一套配方）
lib/config.js       ~/.dsh/done-chime/config.json 读写
lib/index.js        host 插件：指令 + HTTP 路由 + turn/end 触发 + 播放
lib/client-entry.js client 面板源码（可打包 ESM/CJS 混合约定，见文件头注释）
lib/client.js       生成物（scripts/build.mjs 产出，勿手改）
scripts/build.mjs   把 recipes + synth + client-entry 拼成 __ModuleLoader__ 工厂
scripts/selftest-wav.mjs  WAV 渲染自测
cordis.patch.yml    bundle patch：插件注册与回落默认配置
LICENSE             本项目自有代码的 MIT 许可
LICENSE-MiMo-Code   上游（MiMo Code）MIT 许可原文
USE_RESTRICTIONS.md 上游 Use Restrictions 原文（覆盖衍生物）
NOTICE              来源映射、修改范围与商标说明
```

## 构建与自检

```bash
node scripts/build.mjs            # 生成 lib/client.js
node scripts/build.mjs --check    # 校验产物可解析
node scripts/selftest-wav.mjs     # 8 音色 + 确认音的 WAV 渲染自测
```

## 卸载

`npx -y @deepseek-ai/dsh@latest plugin --profile desktop remove dsh-done-chime`，或手动从 `dependencies` 与 `dsh.profile.bundles` 移除后重启。配置与 WAV 缓存留在 `~/.dsh/done-chime/`，可手动删除。

## 已知边界

- 播放走 Windows `SoundPlayer`，非 Windows 平台暂不响铃（面板与指令仍可用）。
- `turn/end` 事件名属于 DSH 内部事件面；若大版本改名，插件会静默不响铃而不会导致启动失败（`/chime status` 仍可查配置）。
- 首次播放会现场渲染并缓存 WAV（`~/.dsh/done-chime/wav/`），此后直接播放缓存。

## 来源与许可（基于 MiMo Desktop）

提示音配方（`lib/recipes.js`）与 Web Audio 合成器（`lib/synth.js`）移植自 **Xiaomi MiMo Desktop** 的 task-done chime 功能；MiMo Desktop 以 MiMo Code 为核心引擎（<https://github.com/XiaomiMiMo/MiMo-Code>）。

- 上游源代码以 **MIT** 发布。依 MIT 的要求，上游版权声明原样收录于 [`LICENSE-MiMo-Code`](LICENSE-MiMo-Code)：`Copyright (c) 2026 MiMo Code, Xiaomi Corporation` 与 `Copyright (c) 2025 opencode`。
- 上游仓库同时附有 **Use Restrictions**，且明确覆盖 "any derivatives thereof"（其任何衍生物）。该文本原样收录于 [`USE_RESTRICTIONS.md`](USE_RESTRICTIONS.md)，因此对本仓库（作为上游衍生物）同样生效：不得用于违法 / 欺诈 / 恶意用途、伤害或骚扰他人、军事用途、恶意网络活动、未经授权处理个人数据，也不得在没有适当人工监督下自动执行高风险动作。
- 本仓库其余部分——离线 WAV 渲染器、host 插件、指令、侧栏面板、构建脚本——均为本项目作者原创，以 [`LICENSE`](LICENSE) 的 MIT 许可发布。
- 逐文件的来源映射、修改范围与商标说明见 [`NOTICE`](NOTICE)。

本项目**不是**小米 / MiMo 官方项目，未获其背书。文中出现的 MiMo、MiMo Code、Xiaomi MiMo Desktop 等名称仅用于说明代码来源，相关商标归小米集团所有。

## 许可

本项目自有代码为 MIT（见 [`LICENSE`](LICENSE)）；移植部分同时保留上游 MIT 声明与上游 Use Restrictions，详见 [`NOTICE`](NOTICE)。
