# dsh-her-eyes

English | [中文](README.zh.md)

A Vision-Language-Model (VLM) analyzer plugin for **DeepSeek Harness** (`dsh`). It gives the AI an `analyze_image` tool backed by primary/backup OpenAI-compatible vision endpoints with automatic failover, and adds an auto-saving **Settings → Vision Models (VLM)** page (English/中文).

## Features

- **`analyze_image` tool** registered on the global tools registry — available in every session.
- **Primary / backup VLM APIs** — OpenAI-compatible `endpoint` + `apiKey` + `model`; if the primary fails consecutively beyond the retry count, the AI automatically falls back to the backup.
- **Auto-saving settings page** — every edit saves and takes effect immediately; no Save button. Also lets you fetch the model list from the endpoint.
- **Web routes** `/vlm/config`, `/vlm/models`, `/vlm/reset` served by the host half.
- **i18n** — the settings page follows the harness UI language (English / 中文).

## Requirements

- `dsh` CLI (DeepSeek Harness) with a `web` profile installed. Requires `pnpm` on `PATH` (or use `npx --yes pnpm@<version>`).

## Install

The plugin is a **bundle**: it carries its own `cordis.patch.yml` and self-activates. Installing it is a single command — no manual patch editing in the profile.

```bash
# From a local directory
dsh plugin --profile web add ./dsh-her-eyes

# From GitHub
dsh plugin --profile web add github:huashenglian/dsh-her-eyes

# From a packed tarball (pnpm pack / npm pack)
dsh plugin --profile web add ./dsh-her-eyes-1.2.0.tgz
```

`dsh plugin add` installs the dependency and appends the bundle to `dsh.profile.bundles` automatically.

> If `pnpm` is not on `PATH`, run the equivalent manually:
> ```bash
> # in the profile directory (~/.dsh/profiles/web)
> npx --yes pnpm@11.7.0 add file:./plugins/dsh-her-eyes
> ```
> then add `"dsh-her-eyes"` to the `dsh.profile.bundles` array in `package.json`.

### Manual placement (alternative)

1. Put the package under `$DSH_HOME/profiles/web/plugins/dsh-her-eyes/`.
2. Add `"dsh-her-eyes": "file:./plugins/dsh-her-eyes"` to the profile `package.json` `dependencies`.
3. Add `"dsh-her-eyes"` to the profile `dsh.profile.bundles` array.
4. Run `pnpm install` (or `npx --yes pnpm@11.7.0 install`), then restart `dsh web`.

Do **not** add a manual `- insert: - id: her-eyes` row to the profile `cordis.patch.yml` — the bundle already inserts it. A second insert would throw `duplicate loader entry id: her-eyes` at boot.

## Configure

All configuration lives in one JSON file: **`$DSH_HOME/vlm-vision.json`** (default `~/.dsh/vlm-vision.json`).

```json
{
  "retryCount": 5,
  "api": {
    "primary": { "endpoint": "https://api.openai.com/v1", "apiKey": "sk-...", "model": "gpt-4o" },
    "backup":  { "endpoint": "", "apiKey": "", "model": "" }
  }
}
```

- `endpoint` — OpenAI-compatible base (e.g. `https://api.openai.com/v1`) or the full `…/chat/completions` URL.
- `apiKey` — leave the key empty in the file; it is saved via the settings page and stored masked.
- `retryCount` — after this many consecutive failures of one API, the active API switches (primary ⇄ backup).

You can edit the file directly, or use the settings page (all edits auto-save).

## How it works

The package is **dual-face**:

- **Host half** (`lib/index.js`) — a cordis plugin. Registers the `analyze_image` tool on the global tools registry and the `/vlm/config|models|reset` routes on the web server. Loads and persists `vlm-vision.json`.
- **Client half** (`lib/client.js`) — the browser module, loaded via `__ModuleLoader__` because the package declares `dsh.client`. Registers a **Settings → Vision Models (VLM)** section (list slot `settings.section`, id `vlm-vision`, order 40) and the locale namespace `settings.her-eyes`.

The bundle `cordis.patch.yml` inserts the `her-eyes` entry that activates both halves.

## Coexistence with other plugins

This plugin is built to play nicely with other frontend plugins that touch the settings window:

| Resource | Value | Notes |
|---|---|---|
| Loader entry id | `her-eyes` | unique across the harness |
| Settings slot id | `vlm-vision` | the `settings.section` slot is a **list** — multiple sections coexist; only the same `id` would conflict |
| Locale namespace | `settings.her-eyes` | namespaced by plugin |
| Tool name | `analyze_image` | unique |
| Web routes | `/vlm/*` | unique path prefix |
| CSS classes | `vlm-*` | global styles, prefixed to avoid collisions |

The harness itself enforces uniqueness (duplicate loader ids, slot ids, tool names, or routes throw and fail loudly) — so two plugins never silently shadow each other.

## Uninstall

```bash
dsh plugin --profile web remove dsh-her-eyes
```

This removes the dependency and the bundle entry. Your `vlm-vision.json` config file is left untouched.

## License

MIT
