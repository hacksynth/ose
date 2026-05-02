# Desktop App

OSE uses Tauri for desktop packaging on Windows, Linux, and macOS.

## Prerequisites

- Node.js 22 LTS (build host).
- npm.
- Rust toolchain.
- Tauri system dependencies for your platform.

Install Rust from https://rustup.rs/ and follow the Tauri prerequisites for Windows, macOS, or Linux.

## Development

```bash
npm install
npm run tauri:dev
```

Tauri runs the Next.js dev server and opens a desktop WebView.

## Production Build

```bash
npm run tauri:prepare
npm run tauri:build
```

`tauri:prepare` performs:

1. Prisma Client generation.
2. Next.js standalone build.
3. Copying `.next/standalone`, static assets, Prisma schema, migrations, and required Prisma packages into `src-tauri/binaries/standalone`.
4. Writing a `start.js` sidecar that runs `prisma migrate deploy` before `server.js`.

### Bundling Node.js (no system Node.js required at runtime)

By default the desktop installer relies on the user having Node.js 22+ on `PATH`. To produce a self-contained installer that ships its own Node.js:

```bash
BUNDLE_NODE=1 npm run tauri:prepare
npm run tauri:build
```

`BUNDLE_NODE=1` downloads the official Node.js binary for the build host's platform/architecture and places it under `src-tauri/binaries/standalone/runtime/`. The Tauri app prefers this binary over `PATH` at runtime. Override the version with `BUNDLED_NODE_VERSION=v22.15.0` (or any other Node.js dist tag) if needed.

> **Cross-compilation note**: the bundled Node.js matches the build host. To ship for a different OS/arch, run `tauri:prepare` on that platform (e.g. via CI matrix builds).

#### Caveats when shipping the bundled runtime

- **macOS code signing**: the official Node.js binary is signed by Node.js, but that signature is invalid once moved into another `.app` bundle. macOS Gatekeeper will quarantine an unsigned bundled `.app`. Configure a Developer ID identity in Tauri (`signingIdentity` / `entitlements`) before distributing to users. For local builds you can self-test with `xattr -cr <App>.app`, but never ask end users to do that.
- **Linux glibc compatibility**: the official `linux-x64.tar.xz` is built against glibc 2.28 (Debian 10 / Ubuntu 18 era). It will run on any modern distro but will fail on CentOS 7, RHEL 7, Ubuntu 16.04, or musl-only systems. Build on a similarly-aged base image (e.g. `debian:11`) if you need broader compatibility, or use a musl Node build.
- **Windows extraction**: `tauri:prepare` invokes `%SystemRoot%\System32\tar.exe` (bsdtar) explicitly to avoid GNU tar from Git Bash misinterpreting `C:\` paths as `host:path`. Windows 10 1803+ is required.
- **SHA-256 verification**: every download is hash-checked against the official `SHASUMS256.txt`. Cached archives that fail verification are deleted and re-downloaded.

## Build Artifact Layout

> **Maintainer note**: The config files look contradictory at first glance — `tauri.conf.json`
> sets `frontendDist` to `../out`, but `next.config.mjs` uses `standalone` output (not `export`).
> This is intentional. Read this section before changing either setting.

### Why `frontendDist` points to `../out`

Tauri's build toolchain requires `frontendDist` to point to a directory that exists and contains
at least one file. It uses this path for packaging validation, not for serving the UI at runtime.

`scripts/prepare-sidecar.js` writes a minimal `out/index.html` placeholder purely to satisfy
this requirement. **`out/index.html` is not the real application UI.** It displays a
"Starting OSE..." message that appears briefly while the sidecar starts up; the WebView
navigates away as soon as the server is ready.

The real desktop UI is served entirely by the local Next.js sidecar process, not from any
files in `out/`.

### Sidecar artifact layout

`tauri:prepare` assembles a self-contained Next.js server under `src-tauri/binaries/standalone/`,
which Tauri bundles as a resource alongside the app binary:

```
src-tauri/binaries/standalone/
  server.js               ← Next.js standalone server entry point
  start.js                ← sidecar entry: runs migrations then starts server.js
  .next/
    static/               ← compiled client-side assets
  public/                 ← static public assets
  src/
    prisma/
      schema.prisma
      migrations/
  node_modules/
    @prisma/              ← Prisma engine binaries
    prisma/               ← Prisma CLI (for migrate deploy)
  runtime/                ← optional: bundled Node.js binary (BUNDLE_NODE=1 only)
    node[.exe]
```

Source of each artifact:

| Directory / file | Source |
|---|---|
| `server.js` and app code | `.next/standalone` (Next.js standalone output) |
| `.next/static` | `.next/static` |
| `public` | `public/` |
| Prisma schema + migrations | `src/prisma/` |
| `@prisma`, `prisma` packages | `node_modules/` |
| `runtime/node[.exe]` | Downloaded Node.js binary (`BUNDLE_NODE=1`) |

### Startup sequence

At launch the Rust layer and the Node.js sidecar perform the following steps in order:

1. **Rust** picks an unused `127.0.0.1` port.
2. **Rust** spawns `node start.js` (or `runtime/node start.js` when the bundled runtime is
   present), passing `PORT`, `HOSTNAME`, `DATABASE_URL`, `AUTH_URL`, and `NODE_ENV` as
   environment variables.
3. **`start.js`** runs `prisma migrate deploy` to apply any pending database migrations.
4. **`start.js`** loads `server.js`, starting the Next.js HTTP server.
5. **Rust** polls `GET /api/ai/status` (TCP connect + HTTP 200 check) every 300 ms, with a
   60-second timeout.
6. **Rust** calls `window.navigate("http://127.0.0.1:<port>")` on the main thread; the WebView
   loads the real application UI from the sidecar.

### What not to change

> **Do not remove `out/index.html` or point `frontendDist` elsewhere.** Tauri will refuse to
> build if `frontendDist` points to a missing or empty directory. The placeholder is the only
> artifact the Tauri packager reads from `out/`; everything else is served by the sidecar.

> **Do not switch `next.config.mjs` `output` to `"export"` for desktop builds.** Export mode
> produces a static site that cannot run server-side code, API routes, or Prisma queries. The
> desktop app depends on a live Next.js server process; switching output modes will break the
> sidecar entirely.

## Runtime Behavior

In production desktop mode, Tauri:

1. Selects an available local port.
2. Creates an app data directory.
3. Sets `DATABASE_URL` to the local SQLite database.
4. Starts `node start.js` — preferring the bundled `runtime/node[.exe]` when present, otherwise `node` from `PATH`.
5. Polls `/api/ai/status` until the Next.js server is ready.
6. Navigates the WebView to `http://127.0.0.1:<port>`.

## Portable Zip (Windows)

The Windows portable zip is assembled by the release workflow from the Tauri build output. It is not a native Tauri installer target and has additional requirements compared to the MSI/NSIS installers.

### Required build flags

The portable zip must be built with `BUNDLE_NODE=1` so it ships its own Node.js runtime:

```bash
BUNDLE_NODE=1 npm run tauri:prepare
npm run tauri:build
```

Without `BUNDLE_NODE=1` the zip depends on `node` from the user's `PATH`, which may be absent, the wrong version, or blocked by system policy.

### Verifying the portable bundle

After `tauri:prepare`, run:

```bash
npm run verify:portable
```

This checks that all required artifacts are present (`runtime/node.exe`, `start.js`, `server.js`, Prisma engine, migrations, `.next/static`, `public`) and that the bundled Node.js is executable. The release workflow should fail if this check fails.

### Portable zip layout

```
OSE-Portable/
  OSE.exe
  portable.ini
  README.txt
  resources/
    binaries/
      standalone/
        runtime/
          node.exe        ← bundled Node.js (BUNDLE_NODE=1 required)
        start.js
        server.js
        .next/static/
        public/
        src/prisma/
        node_modules/
```

### Known limitations of the portable zip

- **App data is not portable.** OSE still writes to `%AppData%\com.ose.softwareexam` and the WebView data cache. Deleting the zip does not remove user data. Multiple extracted versions share the same data directory.
- **WebView2 is not bundled.** The app requires WebView2 Runtime (pre-installed on Windows 11 and updated Windows 10). On machines without it the window will fail to open. Document this in the release notes and consider linking to the WebView2 Evergreen installer.
- **No updater integration.** There is no automatic update path for the portable zip.
- **Path sensitivity.** Test extraction paths with spaces, non-ASCII characters, and paths longer than 260 characters (long path support must be enabled on older Windows).

## Content Security Policy

The desktop WebView uses a restrictive Content Security Policy (CSP) defined in `src-tauri/tauri.conf.json`. Tauri only applies CSP protection when it is explicitly configured; without it the WebView has no guardrail against web vulnerabilities such as XSS.

### Active policy

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self' http://127.0.0.1:*;
font-src 'self' data:
```

### Directive rationale and exceptions

#### `script-src 'self'` — no inline or eval scripts

Scripts are restricted to same-origin files only. `'unsafe-inline'` and `'unsafe-eval'` are intentionally absent. The Next.js standalone build emits all JavaScript as static files served from `http://127.0.0.1:<port>`, so no inline script execution is required. This is the strictest setting and must not be relaxed.

#### `style-src 'self' 'unsafe-inline'` — inline styles (interim)

`'unsafe-inline'` is required because Tailwind CSS v3 injects utility classes as inline `<style>` blocks at runtime in the current build. Removing it breaks all component styling. This is a known interim exception: once the project migrates to Tailwind v4 (which uses a CSS file import model) or adopts a nonce-based CSP approach, `'unsafe-inline'` should be removed from `style-src`.

#### `img-src 'self' data: https:` — data URIs and external CDN images

Two sources beyond `'self'` are needed:

- **`data:`** — the `CaseFigures` component (`src/components/case-figures.tsx`) accepts figure values that may be base64-encoded data URIs (`data:image/...`). Blocking `data:` would prevent embedded figures from rendering in case-study questions.
- **`https:`** — question bank stems and AI explanations include images hosted on external CDNs (e.g. 51CTO image servers). The `MarkdownRenderer` component (`src/components/markdown-renderer.tsx`) renders these images via `react-markdown`. Restricting to `'self'` would break all question images. Allowing only `https:` (not `http:`) limits this to encrypted origins.

#### `connect-src 'self' http://127.0.0.1:*` — localhost sidecar communication

The Next.js sidecar does not run on a fixed port. At startup, `pick_port()` in `src-tauri/src/lib.rs` uses `portpicker::pick_unused_port()` to select any available ephemeral port, then starts the Node.js process bound to `127.0.0.1:<port>`. The WebView navigates to that address and makes all API calls against it. Because the port number is not known at build time, the wildcard `http://127.0.0.1:*` is required. All traffic stays on the loopback interface and never leaves the local machine.

#### `font-src 'self' data:` — local fonts only

No external font CDNs (e.g. Google Fonts) are used. `data:` is retained to accommodate any base64-encoded fonts that may be inlined by the build toolchain. If audits confirm no `data:` fonts are present, this can be tightened to `font-src 'self'`.

### Testing the CSP against a packaged build

The CSP is enforced by the Tauri WebView in production builds, not by the browser dev server. Always smoke-test the packaged app after any CSP change:

```bash
npm run tauri:prepare
npm run tauri:build
# Open the packaged binary and exercise:
# - Question rendering (images from CDN)
# - AI explanations (markdown with images)
# - Case-study figures (data: URIs)
# - Navigation and API calls
```

Open the browser DevTools console in the WebView (right-click → Inspect) and confirm there are no CSP violation errors. Any `Refused to load` messages indicate a source that needs to be either added to the policy or removed from the application.

## Troubleshooting

- **Server startup timeout**: verify Node.js is installed and available in `PATH`, or rebuild with `BUNDLE_NODE=1`. Check the startup log (see below).
- **Prisma errors**: run `npm run tauri:prepare` again and confirm migrations were copied.
- **Port issues**: OSE picks an unused port automatically.
- **Windows localhost issues**: the desktop app uses `127.0.0.1` to avoid IPv4/IPv6 mismatch.

### Startup log

On every launch the desktop app writes a `startup.log` file to the app data directory:

- **Windows**: `%AppData%\com.ose.softwareexam\startup.log`
- **macOS**: `~/Library/Application Support/com.ose.softwareexam/startup.log`
- **Linux**: `~/.local/share/com.ose.softwareexam/startup.log`

The log records the resolved standalone directory, Node.js binary path (bundled or system), selected port, database path, all sidecar stdout/stderr lines, and the final ready or timeout result. Share this file when reporting startup issues.
