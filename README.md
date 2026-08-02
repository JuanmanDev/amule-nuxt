# aMule Nuxt

![aMule Nuxt dashboard](images/home2.png)

A modern web interface **and MCP server** for an [aMule](https://amule.org) daemon, built with **Nuxt 4**, **Nuxt UI 4** and **TypeScript**.

It speaks aMule's native **External Connection (EC) protocol** directly — a TypeScript implementation living in this repository, no `amulecmd` binary required — so it runs anywhere Node runs and can drive a daemon on another machine.

```
┌──────────────┐   HTTP/JSON   ┌────────────────────┐   EC protocol   ┌──────────────┐
│  Vue pages   │ ────────────► │  Nitro API + MCP   │ ──────────────► │ amuled       │
│  (Nuxt UI)   │ ◄──────────── │  server            │ ◄────────────── │ (TCP 4712)   │
└──────────────┘   WebSocket   └────────────────────┘                 └──────────────┘
```

## Highlights

- **Complete daemon control** — downloads, uploads, shared files, search, servers, Kad, preferences
- **MCP server built in** — 16 tools on `/mcp`, so an AI agent can drive aMule exactly as the UI does
- **Real EC protocol client** — opcodes and tags mirrored from aMule's own headers, UTF-8 safe, verified against a live daemon
- **Honest UI states** — every page starts in a loading state, explains *why* something is not progressing, and never claims success the daemon did not confirm
- **Handles `ed2k:` and `magnet:` links** from the operating system, with a confirmation step
- **Live updates** over WebSocket, with polling as a fallback, and a background that reacts to real traffic
- **Motion that means something** — rows animate in and out as the queue changes, live figures crossfade instead of snapping, translucent blurred surfaces let the activity background through, and everything is switched off under `prefers-reduced-motion`
- **Well tested** — unit tests for the protocol and helpers, Playwright end-to-end tests driving a real daemon, CI on every push

## Pages

| Page | What it does |
|------|--------------|
| `/` | Dashboard: queue summary, live speeds (clickable), add form, connection state |
| `/downloads` | Queue with progress, ETA, sources, health badges, details modal, pause/resume/priority/remove |
| `/uploads` | Who is downloading from you: file, address, client software, speed, session and all-time bytes, queue position |
| `/shared` | Every shared file with requests, accepted requests, bytes sent, share ratio, queued clients, details modal |
| `/search` | Kad / eD2k / local search with live incoming results and one-click download |
| `/servers` | Server list with connect, add, remove, plus server-list preferences and "update from URL" |
| `/connection` | eD2k and Kad state, connect/disconnect, Kad start/stop/bootstrap/nodes.dat, server message of the day |
| `/statistics` | Animated rate chart with server-side history, session **and** all-time totals, and aMule's full statistics tree |
| `/stats` | Compact statistics summary |
| `/preferences` | Nickname, bandwidth and connection limits, ports, directories |
| `/logs` | Daemon log with filter, newest-first toggle, highlighted warnings |
| `/settings` | Bandwidth limits, link-handler registration, runtime diagnostics |
| `/mcp-server` | Live documentation of the MCP endpoint and its tools |

Every list page shares the same controls: a filter that grows to fill the row, a compact sort menu that collapses to an icon on small screens, and an ascending/descending toggle for every sort field. Lists animate their additions and removals, and figures that change while a page is open (speeds, counts, badges) crossfade with a brief highlight. On a phone the download rows drop the ETA column so the stats stay on one line.

---

## Connecting to aMule

The app never touches aMule's files; it only needs the External Connection interface, which every `amuled` and `amule` build supports.

### A. You already run an aMule daemon

1. Enable external connections in `~/.aMule/amule.conf` (create the keys if missing):

   ```ini
   [eMule]
   AcceptExternalConnections=1
   ECPort=4712
   # MD5 of your chosen password
   ECPassword=5f4dcc3b5aa765d61d8327deb882cf99
   ```

   Compute the hash with `printf '%s' 'your_password' | md5sum` (Linux) or `md5 -q -s 'your_password'` (macOS).

2. Restart the daemon so it picks the settings up: `amuled --restart` or restart your service.

3. Point this app at it:

   ```bash
   cp .env.example .env
   # AMULE_EC_HOST=192.168.1.50     # host running amuled
   # AMULE_EC_PORT=4712
   # AMULE_EC_PASSWORD=your_password   (plain or the MD5 hash - both work)
   npm install && npm run dev
   ```

4. Check the wiring: `npm run amule:test`, or open `/settings` which shows the host, port, server mode and log level.

If the daemon listens only on loopback, either run this app on the same host, or set `ECAddr=0.0.0.0` in `amule.conf` and firewall port 4712 to your network.

### B. You want a fresh daemon

**Docker, everything in one go** — the compose file starts `amuled` and this app together:

```bash
cp .env.example .env      # set AMULE_EC_PASSWORD
docker compose up -d
# UI on http://localhost:3000, daemon EC on 4712
```

**On the host:**

```bash
# Linux / WSL2 — installs the upstream aMule 3.0.1 release into ~/.local
npm run install:amule:linux    # or install:amule:wsl2
# macOS — the 3.0.1 .dmg from https://github.com/amule-org/amule/releases
# ships amuled alongside the GUI; Homebrew's formula is still 2.3.3

npm run configure:amule    # writes amule.conf with EC enabled and hashes the password
amuled                     # start the daemon
npm run dev                # start this app
```

Distribution packages (`apt install amule-daemon`, `pacman -S amule`, `brew install amule`)
are still on aMule 2.3.3 from 2021. This app speaks EC to both — the protocol version is
unchanged at `0x0204` — but 3.x is worth having for the throughput rewrite, so the
installer scripts and the Docker image pull the upstream 3.0.1 release instead.

### Configuration reference

| Variable | Default | Purpose |
|----------|---------|---------|
| `AMULE_EC_HOST` | `localhost` | Host running the daemon |
| `AMULE_EC_PORT` | `4712` | External Connection port |
| `AMULE_EC_PASSWORD` | – | Plain password **or** its MD5 hash |
| `NUXT_PORT` / `PORT` | `3000` | Port this app listens on |
| `LOG_LEVEL` | auto | `error`, `warn`, `info`, `debug`, `trace`, or a number |
| `NODE_ENV` | – | `development` turns on verbose logging and dev tooling |

`AMULE_EC_HOST` and `AMULE_EC_PORT` are also exposed to the browser (they are not secrets) so the settings page can show what it is connected to. The password never leaves the server.

---

## Deployment

### Docker image from the registry

Every release publishes an image to GitHub Container Registry, tagged `X.Y.Z`, `X.Y`, `X` and `latest`. Pin as tightly as you want to be surprised:

```bash
docker run -d --name amule-nuxt -p 3000:3000 \
  -e AMULE_EC_HOST=192.168.1.50 \
  -e AMULE_EC_PORT=4712 \
  -e AMULE_EC_PASSWORD=your_password \
  ghcr.io/juanmandev/amule-nuxt:1
```

`edge` is a manually triggered build of a branch head; it is not a release. Multi-architecture (`linux/amd64`, `linux/arm64`), so it runs on a Raspberry Pi as happily as on a server. The image reports its own version at `/api/diagnostics` and in the `org.opencontainers.image.version` label.

### Standalone zip (no Docker)

Each GitHub release attaches `amule-nuxt-X.Y.Z.zip`: the built Nitro server plus launch helpers. Node 24+ is the only requirement — there is nothing to compile and no `npm install`.

```bash
unzip amule-nuxt-1.0.0.zip
cd amule-nuxt-1.0.0
cp .env.example .env       # set AMULE_EC_HOST / _PORT / _PASSWORD
./start.sh                 # start.ps1 on Windows
```

`DEPLOY.md` inside the zip covers the systemd unit that ships with it (`amule-nuxt.service`), the reverse proxy notes and how to upgrade in place. Build the same artifact locally with `npm run build && npm run package:zip` — it lands in `dist/`.

### Docker Compose (app + daemon)

```bash
docker compose up -d        # see docker-compose.yml
docker compose logs -f
```

The image bundles **aMule 3.0.1** — the upstream release AppImage, unpacked at build
time, since Debian still packages 2.3.3. `AMULE_VERSION` plus the two `AMULE_SHA256_*`
build args in the `Dockerfile` pin it; bumping the version means refreshing both
checksums, because each architecture ships its own AppImage.

### Plain Node

```bash
npm ci
npm run build
NUXT_PORT=3000 AMULE_EC_HOST=… AMULE_EC_PASSWORD=… node .output/server/index.mjs
```

The build output is a self-contained Nitro server; no `node_modules` needed at runtime.

### systemd

```ini
[Unit]
Description=aMule Nuxt
After=network.target amuled.service

[Service]
WorkingDirectory=/opt/amule-nuxt
Environment=NODE_ENV=production
Environment=AMULE_EC_HOST=127.0.0.1
Environment=AMULE_EC_PASSWORD=your_password
ExecStart=/usr/bin/node /opt/amule-nuxt/.output/server/index.mjs
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Behind a reverse proxy

Serve it over https so the `ed2k:` link handler and clipboard paste work. Proxy `/` to the app, and keep the WebSocket port (3001) reachable, or accept the polling fallback.

---

## Handling ed2k links from your device

On `/settings`, "Open links with this app" registers the page as the handler for `ed2k:` and `magnet:` links. Clicking such a link anywhere on the device then opens `/handle-link`, which shows the file name and the full link and asks before queueing it.

Browsers require a secure origin (https, or http on `localhost`) and confirm the first use. Installed as an app, the same handlers come from `public/manifest.webmanifest`, which lets the operating system route the links too.

---

## MCP server

The app doubles as a [Model Context Protocol](https://modelcontextprotocol.io) server via [`@nuxtjs/mcp-toolkit`](https://mcp-toolkit.nuxt.dev):

```bash
claude mcp add --transport http amule http://localhost:3000/mcp
```

| Area | Tools |
|------|-------|
| Status | `amule-status`, `amule-statistics`, `amule-logs`, `amule-preferences` |
| Downloads | `amule-downloads`, `amule-download-add`, `amule-download-control`, `amule-download-remove` |
| Sharing | `amule-uploads`, `amule-shared-files` |
| Search | `amule-search`, `amule-search-results`, `amule-search-download` |
| Network | `amule-servers`, `amule-server-control`, `amule-network` |

Destructive tools require an explicit `confirm: true`. `/mcp-server` documents the live tool list, parameters and client snippets; opening `/mcp` in a browser redirects there.

> The endpoint is unauthenticated: anyone who can reach it can control the daemon. Keep it on a trusted network or put an authenticating proxy in front.

---

## Logging

Logging is level based and picks its verbosity automatically: **debug in development, warnings only in production**. `LOG_LEVEL` overrides it without a rebuild, e.g. `LOG_LEVEL=debug` to see every EC packet in a deployed instance. Lines are tagged per subsystem (`amule-ec`, `amule-client`, `websocket`), timestamped in production, coloured in development. `GET /api/diagnostics` reports the active mode and level; the settings page shows both.

---

## Development

```bash
npm install
npm run dev            # http://localhost:3003
npm run build          # production build
npm run test:unit      # unit tests (vitest)
npm run test:e2e       # end-to-end tests (playwright, needs a running instance)
npx nuxt typecheck     # types
```

### Tests

- **Unit** (`test/*.test.ts`): EC packet encoding, link validation, download health classification, formatting, sorting, statistics-tree parsing, add-link summaries, logging levels, speed history.
- **End-to-end** (`test/e2e/*.spec.ts`): every page renders without console errors, no horizontal overflow at desktop and phone widths, add/duplicate/reject flows, details modals, remove confirmation, filters and both sort directions, live search, MCP endpoint, paste buttons.
- **Offline** (`test/e2e/offline.spec.ts`): with no daemon reachable, pages must still render and report the failure instead of crashing — this one needs no daemon and runs in CI.

E2E targets a running instance via `E2E_BASE_URL` (default `http://localhost:3003`). Tests that need a daemon use links whose hash exists nowhere, so nothing is ever transferred, and clean up after themselves.

### Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: install, typecheck, unit tests, production build, the zip packaging step, then the offline end-to-end suite against the built server. On pull requests it also lints the commit subjects, because the version number is derived from them.

`.github/workflows/release.yml` owns releases (see below). `.github/workflows/docker.yml` is only for the two cases release.yml does not cover: a manual `edge` build of any branch, and re-publishing an image from a hand-pushed `v*` tag.

### Releases and versioning

Versions are decided by [semantic-release](https://semantic-release.gitbook.io) from the commit messages, not by hand. Nothing in the repository should ever be version-bumped manually — `package.json` sits at `0.0.0-development` between releases and is rewritten during one.

Commit subjects follow [Conventional Commits](https://www.conventionalcommits.org) and decide the bump:

| Commit                                        | Bump      |
| --------------------------------------------- | --------- |
| `fix: …`, `perf: …`, `refactor: …`, `docs: …`  | patch     |
| `feat: …`                                     | minor     |
| any type with `!` or a `BREAKING CHANGE:` body | major     |
| `chore: …`, `ci: …`, `test: …`                 | no release |

Pushing to `master` then runs, in order: typecheck and unit tests, version bump, `CHANGELOG.md`, the production build, the standalone zip, the git tag `vX.Y.Z`, a GitHub release with the notes and the zip attached, and finally the multi-arch GHCR image built with `APP_VERSION` set to that version. A push with no releasable commits does nothing at all.

```bash
npx commitlint --from origin/master --to HEAD   # check your commits before pushing
npm run release:dry                             # what would the next version be? (needs GITHUB_TOKEN)
```

The `chore(release): …` commit semantic-release pushes back carries `[skip ci]`, so it does not trigger another run. If `master` is a protected branch, allow the GitHub Actions bot to push to it, or the release commit and tag cannot land.

### Layout

```
app/
  components/    AddLinkForm, DownloadRow, DownloadDetailsModal, ListControls,
                 SpeedChart, ActivityBackground, PasteButton, StatsTreeNode…
  composables/   useDownloads (single queue + command path), useAmuleApi (typed client),
                 useLinkHandler, useAmuleSocket
  pages/         one file per page listed above
server/
  api/amule/     REST endpoints, all returning the shared ApiResponse envelope
  mcp/tools/     one file per MCP tool
  plugins/       WebSocket push, transfer-rate sampler
  utils/
    amule-ec/    EC client, protocol implementation, link validation, statistics parsing
    logger.ts    level based logging
    speedHistory.ts   rolling transfer-rate samples
shared/utils/    format, sorting, downloadHealth, addLinks, statsFigures (both sides)
test/            unit tests, plus test/e2e Playwright specs
```

### Notes on the EC protocol implementation

Opcodes, tag names and enums come from aMule's own sources (`src/libs/ec/cpp/ECCodes.h`, `src/Constants.h`, `src/Server.h`) rather than guesswork — a wrong opcode makes the daemon answer `Invalid opcode (wrong protocol version?)`, which is easy to mistake for a working request. Strings travel as UTF-8 with byte-accurate tag lengths, so names with accents or CJK characters work. Commands inspect the reply: `EC_OP_FAILED` surfaces the daemon's own message rather than being reported as success, and when aMule only logs the real reason (adding a server, for instance) the log line is read back and shown.

---

## Related projects

The aMule ecosystem is larger than it first appears. If this project is not the shape you want, one of these probably is.

**Standalone web UIs** — their own server process talking to the daemon over External Connections, like this one:

- [aMuTorrent](https://github.com/got3nks/amutorrent) — Node, WebSockets and React. One manager for aMule, rTorrent, qBittorrent, Deluge and Transmission, with multi-instance support, users and SSO, Prowlarr search, a Torznab indexer, a qBittorrent-compatible API for aMule, Apprise notifications and GeoIP peers.
- [Mularr](https://github.com/joecarl/mularr) — TypeScript, deliberately retro-looking. Exposes qBittorrent-compatible APIs and Torznab indexers so Sonarr and Radarr can drive aMule, plus Gluetun integration and Telegram as a download source.
- [TransMule](https://github.com/Jo3l/transmule) — Vue. Unifies aMule, Transmission, Soulseek and Pyload behind one interface.
- [go-amule-webui](https://github.com/neonpc/go-amule-webui) — Go and Vue 3, deployed as a Docker sidecar. Clearly written README, though there are no screenshots to judge it by.

**amuleweb templates** — skins served by aMule's own web server, so there is no extra process to run:

- [AmuleWebUI-Reloaded](https://github.com/MatteoRagni/AmuleWebUI-Reloaded) — Bootstrap, Glyphicons and jQuery reskin of the stock interface. This is what I used before writing this project.
- [amuleweb-adaptable](https://github.com/esaracho/amuleweb-adaptable) — responsive template built on the default UI and on Reloaded.
- [mobileMule](https://github.com/elbowz/mobileMule) — mobile-first template that also holds up on the desktop.
- [amule-m26](https://github.com/jjling2011/amule-m26) — modern-looking template, but it needs its own patched aMule as the backend rather than upstream aMule.

**Other**

- [amule-mcp](https://github.com/mcbarba/amule-mcp) — Rust MCP server that drives aMule through `amulecmd` inside a Docker container over stdio. The same idea as the `/mcp` endpoint here, without the web UI.

---

## Contributing

Issues and pull requests welcome. Please keep the existing shape: types in `shared/` or `server/utils/amule-types.ts`; one behaviour in one place (the add-link path, the sort helpers and the queue composable are deliberately shared); a unit test for pure logic and an end-to-end test for anything a user can click.

## License

MIT

---

## Screenshots

### Desktop

**Dashboard** — queue summary, live speeds, add form and connection state:

![Dashboard](images/home.png)

![Dashboard with active transfers](images/home2.png)

**Downloads** — progress, ETA, sources, health badges and per-file controls:

![Downloads queue](images/downloads.png)

**Search** — Kad / eD2k / local search with results arriving live:

![Search](images/search.png)

**MCP server** — live documentation of the endpoint and its 16 tools:

![MCP server page](images/mcp.png)

![MCP tool list](images/mcp_menu.png)

### Mobile

| Dashboard | Downloads | Download details | Navigation |
|---|---|---|---|
| ![Dashboard on a phone](images/home_mobile.png) | ![Downloads on a phone](images/downloads_mobile.png) | ![Download details on a phone](images/download_detail_mobile.png) | ![Navigation menu on a phone](images/menu_mobile.png) |
