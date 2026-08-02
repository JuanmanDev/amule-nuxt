# aMule Nuxt __VERSION__ — deploying without Docker

This bundle is a self-contained Nitro server. There is nothing to compile and no
`npm install` to run: every runtime dependency is already inside `.output`.

## Requirements

- Node.js 24 or newer (`node --version`)
- A reachable aMule daemon with External Connections enabled
  (`AcceptExternalConnections=1` and a password in `~/.aMule/amule.conf`)

## 1. Configure

```bash
cp .env.example .env
```

Edit `.env` and set at least:

| Variable            | Meaning                                          | Default     |
| ------------------- | ------------------------------------------------ | ----------- |
| `AMULE_EC_HOST`     | Host running `amuled`                            | `localhost` |
| `AMULE_EC_PORT`     | External Connection port                         | `4712`      |
| `AMULE_EC_PASSWORD` | External Connection password (required)          | —           |
| `NUXT_PORT`         | Port the web UI listens on                       | `3000`      |
| `WS_PORT`           | Live-update WebSocket port, a second listener. The browser is told this number, so it must be reachable at the same value | `3001`      |
| `LOG_LEVEL`         | `error`, `warn`, `info` or `debug`               | `info`      |

## 2. Start

Linux / macOS:

```bash
./start.sh
```

Windows (PowerShell):

```powershell
.\start.ps1
```

Both helpers only read `.env` and then exec the server. Doing it by hand is
equally fine — the built server does **not** read `.env` on its own:

```bash
AMULE_EC_HOST=127.0.0.1 AMULE_EC_PASSWORD=secret NUXT_PORT=3000 \
  node .output/server/index.mjs
```

Open <http://localhost:3000>. `/diagnostics` reports whether the daemon
connection works.

## 3. Run it as a service (Linux)

```bash
sudo mkdir -p /opt/amule-nuxt
sudo cp -r .output package.json /opt/amule-nuxt/
sudo cp amule-nuxt.service /etc/systemd/system/
sudo cp .env /etc/amule-nuxt.env        # read by the unit as EnvironmentFile
sudoedit /etc/amule-nuxt.env            # make sure the password is set
sudo systemctl daemon-reload
sudo systemctl enable --now amule-nuxt
sudo systemctl status amule-nuxt
```

Keep `/etc/amule-nuxt.env` at mode `0600`: it holds the EC password.

## 4. Behind a reverse proxy

Serve the UI over https, otherwise the `ed2k:`/`magnet:` link handler and
clipboard paste stay disabled by the browser. Proxy `/` to `NUXT_PORT` and, for
live updates, allow WebSocket upgrades to `WS_PORT`; without it the UI falls
back to polling.

## Upgrading

Stop the service, replace `.output`, start it again. Configuration lives outside
the bundle, so nothing else carries over:

```bash
sudo systemctl stop amule-nuxt
sudo rm -rf /opt/amule-nuxt/.output
sudo cp -r .output package.json /opt/amule-nuxt/
sudo systemctl start amule-nuxt
```
