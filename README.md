# dsh-done-chime

[中文](README.zh-CN.md) | English

A DSH (DeepSeek Harness) add-on: plays a completion chime when a turn finishes. Optional 8 timbres, a sidebar panel for the switch and preview, and `/chime` commands.

It is an independent plugin that **does not modify the application itself** — not a single byte of `resources/app.asar` is touched. It only uses official plugin interfaces, so DSH updates cannot overwrite it.

The chime recipes and the Web Audio synthesizer are ported from MiMo Desktop; see [Origin and licensing](#origin-and-licensing) for the upstream MIT notice and the Use Restrictions that come with it.

## Install and use

### Before you start

- DSH Desktop 0.2.1-rc.1 or newer (declared in `engines.dsh`; 0.2.x is the tested line).
- One of the two install routes below. Both end with a **DSH restart**, because plugins are composed at startup.

### Route A: one command (recommended)

DSH ships an official CLI, published on npm as `@deepseek-ai/dsh`, and its `plugin` subcommand hands its arguments to `pnpm` and then selects the new bundle into `dsh.profile.bundles` for you:

```powershell
npx -y @deepseek-ai/dsh@latest plugin --profile desktop add github:DMu03/DSH-Chime#v1.0.0
```

- Any other source works too: a tarball URL such as `https://github.com/DMu03/DSH-Chime/archive/refs/tags/v1.0.0.tar.gz`, an absolute local path, or the bare package name `dsh-done-chime` once it is published to npm.
- Pin the tag (or a full commit) rather than a branch: a pinned spec is also what makes future updates deterministic.
- Requirements: Node ≥ 24.9 and `pnpm` on `PATH`. Open the desktop app once first so its profile exists, and quit it before running the command.
- Then start DSH again.
- Uninstall the same way: `npx -y @deepseek-ai/dsh@latest plugin --profile desktop remove dsh-done-chime`.

### Route B: edit the profile by hand

1. In `~/.dsh/profiles/desktop/package.json`, add `"dsh-done-chime": "file:<absolute path to this repo>"` to `dependencies`, and add `"dsh-done-chime"` to `dsh.profile.bundles`.
2. Run `pnpm install` in that profile directory (the bundled `pnpm` under `runtime/primary-runtime` works too).
3. Restart DSH.

The desktop app's **Settings → Plugins** page lists the installed bundles and lets you switch them on and off.

### How to use it

- A **Chime** panel appears in the sidebar: enable switch, timbre picker with preview, minimum duration, confirmation cue toggle. Settings persist in `~/.dsh/done-chime/config.json`.
- A chime plays when a turn ends, but only if the turn ran longer than the threshold (default 60 s), so quick replies stay quiet.
- A two-note cue plays when a permission prompt or a question needs you.
- Commands:

  | Command | Effect |
  | --- | --- |
  | `/chime status` | show the current configuration |
  | `/chime on` / `/chime off` | enable / disable |
  | `/chime timbre <name>` | pick one of `rhodes handpan vibes bloom harp kalimba bowl koto` |
  | `/chime test [name]` | preview a timbre |
  | `/chime min <seconds>` | minimum turn duration before it rings |
  | `/chime confirm on\|off` | toggle the confirmation cue |
  | `/chime help` | list the above |

## What it does

- Plays a chime when a turn ends (8 timbres: Rhodes / Handpan / Vibes / Bloom / Harp / Kalimba / Bowl / Koto).
- Only rings when the task ran longer than a threshold (60 s by default), so short replies stay quiet.
- Plays a two-note cue when a permission prompt or a question needs your attention (toggleable).
- Sidebar panel **Chime**: enable switch, timbre picker, preview, threshold, confirmation toggle.
- Commands: `/chime status | on | off | timbre <name> | test [name] | min <seconds> | confirm on|off | help`.

## Architecture (why updates cannot break it)

| Piece | Lives in | Official interface used |
| --- | --- | --- |
| Trigger | host plugin | `ctx.on("session/event")`, watching `turn/end` |
| Sound | host plugin | renders a WAV, plays it with the system `SoundPlayer` (zero renderer dependencies) |
| Commands | host plugin | `ctx.inject(["commands"])` → `commands.register` |
| Config | host plugin | `~/.dsh/done-chime/config.json` |
| Panel | client bundle | `ctx.slots` (`sidebar.panellist` + `main`) |
| Preview | client bundle | live synthesis with Web Audio (same recipes as the WAV renderer) |

The timbre recipes exist once (`lib/recipes.js`) and are shared by both renderers: `lib/synth.js` (Web Audio, panel preview) and `lib/wav.js` (PCM → WAV, host playback).

## Repository layout

```
lib/recipes.js      timbre recipes and motifs (data, shared by both renderers)
lib/synth.js        Web Audio synthesizer (panel preview)
lib/wav.js          PCM → WAV renderer (host playback)
lib/config.js       read/write ~/.dsh/done-chime/config.json
lib/index.js        host plugin: command, HTTP route, turn/end trigger, playback
lib/client-entry.js client panel source (bundled ESM/CJS convention, see the file header)
lib/client.js       generated bundle (scripts/build.mjs output — do not edit by hand)
scripts/build.mjs   bundles recipes + synth + client-entry into a __ModuleLoader__ factory
scripts/selftest-wav.mjs  WAV rendering self-test
cordis.patch.yml    bundle patch: plugin registration and fallback defaults
LICENSE             MIT for this project's own code
LICENSE-MiMo-Code   upstream (MiMo Code) MIT notice, verbatim
USE_RESTRICTIONS.md upstream Use Restrictions, verbatim (covers derivatives)
NOTICE              provenance mapping, modification scope, trademark statement
```

## Build and self-check

```bash
node scripts/build.mjs            # generate lib/client.js
node scripts/build.mjs --check    # verify the existing bundle parses
node scripts/selftest-wav.mjs     # render all 8 timbres + the confirmation cue
```

## Uninstall

`npx -y @deepseek-ai/dsh@latest plugin --profile desktop remove dsh-done-chime`, or remove the entry from `dependencies` and `dsh.profile.bundles` by hand. Restart afterwards. Configuration and cached WAVs live in `~/.dsh/done-chime/` and can be deleted manually.

## Known limits

- Playback goes through the Windows `SoundPlayer`, so it stays silent on non-Windows platforms (panel and commands still work).
- `turn/end` is an internal DSH event name. If a major release renames it, the plugin silently stops ringing instead of failing to start (`/chime status` still reports the config).
- The first playback renders and caches a WAV under `~/.dsh/done-chime/wav/`; later plays use the cache.

## Origin and licensing

The chime recipes (`lib/recipes.js`) and the Web Audio synthesizer (`lib/synth.js`) are ported from the task-done chime in **Xiaomi MiMo Desktop**, whose core engine is MiMo Code (<https://github.com/XiaomiMiMo/MiMo-Code>).

- Upstream source code is **MIT**-licensed. As MIT requires, the upstream copyright notice is kept verbatim in [`LICENSE-MiMo-Code`](LICENSE-MiMo-Code): `Copyright (c) 2026 MiMo Code, Xiaomi Corporation` and `Copyright (c) 2025 opencode`.
- Upstream also ships **Use Restrictions** that explicitly cover "any derivatives thereof". That text is reproduced verbatim in [`USE_RESTRICTIONS.md`](USE_RESTRICTIONS.md) and therefore applies to this repository as a derivative: it may not be used for unlawful/fraudulent/malicious purposes, to harm others, for military purposes, for malicious cyber activity, to process personal data without authorization, or to run high-risk actions without human oversight.
- Everything else here — the offline WAV renderer, the host plugin, the commands, the panel, the build scripts — is original work by this project's author under the MIT license in [`LICENSE`](LICENSE).
- [`NOTICE`](NOTICE) carries the file-by-file mapping, the modification scope, and the trademark statement.

This is **not** an official Xiaomi / MiMo project and is not endorsed by Xiaomi. The names MiMo, MiMo Code and Xiaomi MiMo Desktop are used only to state provenance; their trademarks belong to Xiaomi.

## License

MIT for this project's own code (see [`LICENSE`](LICENSE)). The ported parts additionally remain under the upstream MIT notice and the upstream Use Restrictions — see [`NOTICE`](NOTICE).
