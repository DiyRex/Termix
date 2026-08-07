# Building and installing the macOS client

Reproducible steps for this fork on Apple Silicon, including the failure modes
that are easy to hit and hard to diagnose.

Repo: `~/Projects/Termix` — build from the `integration` branch.

---

## 1. Build

Run the **whole** chain. Do not skip `npm run build`:

```bash
cd ~/Projects/Termix
npm run build            # vite build + tsc -p tsconfig.node.json (backend)
npm run electron:rebuild # native modules against Electron's ABI
npm run electron:patch-builder
npx electron-builder --mac dmg --arm64 --publish=never
```

### Gate 1 — before packaging

`vite build` empties `dist/`, and only the `tsc -p tsconfig.node.json` half of
`npm run build` regenerates `dist/backend`. If you run `electron-builder`
without it, there is nothing for `asarUnpack` to unpack and the packaged app has
no backend.

```bash
test -f dist/backend/backend/starter.js && echo OK || echo "STOP: run npm run build"
```

Never pipe `npm run build` through `grep` — it masks the exit code, so a failed
backend compile looks like a successful frontend build.

### Gate 2 — after packaging

Electron loads the backend from **outside** the asar. Confirm it is there:

```bash
test -f release/mac-arm64/Termix.app/Contents/Resources/app.asar.unpacked/dist/backend/backend/starter.js \
  && echo OK || echo "STOP: backend not unpacked"
```

If this is missing the app launches, spawns nothing, and the window sits on a
loading spinner forever. The log says
`Backend entry not found: .../app.asar.unpacked/dist/backend/backend/starter.js`.

---

## 2. Install

```bash
pkill -f "/Applications/Termix.app"; sleep 2
rm -rf /Applications/Termix.app
cp -R ~/Projects/Termix/release/mac-arm64/Termix.app /Applications/Termix.app
xattr -dr com.apple.quarantine /Applications/Termix.app
codesign --force --deep --sign - /Applications/Termix.app
codesign --verify --strict /Applications/Termix.app   # silence means valid
```

**Ad-hoc signing is required.** electron-builder reports
`0 valid identities found` and skips signing because there is no Developer ID
in the keychain, and Apple Silicon refuses to run an unsigned bundle. For real
distribution you need a Developer ID Application certificate and notarisation;
`electron-builder.json` already reads the `MAC_*` / `APPLE_*` secrets when
present.

---

## 3. Free the ports before launching

The app spawns its own backend on **30001** and a guacd websocket on **30008**.
Anything already holding those makes startup fail — the log shows
`EADDRINUSE :::30008`.

```bash
# SIGTERM, not -9. Writes are buffered in memory and flushed 2s after the last
# change (DatabaseSaveTrigger), and the backend force-saves on SIGTERM. A -9
# skips that handler, so anything written in the last couple of seconds — a
# credential you just saved, a login session row — is silently lost.
for p in 30001 30008 30011 30012 30013; do
  pids=$(lsof -ti:$p) || continue
  kill $pids 2>/dev/null
done
sleep 3
# Only escalate if something is still holding a port.
for p in 30001 30008 30011 30012 30013; do
  pids=$(lsof -ti:$p) || continue
  kill -9 $pids 2>/dev/null
done
```

A local dev server (`npm run dev` plus a `node dist/backend/backend/starter.js`)
uses the same ports, so **the desktop client and the dev server cannot run at
the same time**.

---

## 4. Verify without launching the GUI

A headless shell generally cannot launch a macOS GUI app, but the bundled
backend can be exercised directly the same way Electron invokes it:

```bash
cd /Applications/Termix.app/Contents/Resources/app.asar.unpacked
DATA_DIR="$HOME/Library/Application Support/termix/server-data" \
PORT=30001 NODE_ENV=production \
  "/Applications/Termix.app/Contents/Frameworks/Termix Helper.app/Contents/MacOS/Termix Helper" \
  dist/backend/backend/starter.js &
sleep 10
curl -s http://127.0.0.1:30001/health     # expect {"status":"ok"}
```

Kill it afterwards or the app cannot claim the port:

```bash
# Again SIGTERM first, so the in-memory database is flushed to disk.
kill $(lsof -ti:30001) 2>/dev/null; sleep 3
lsof -ti:30001 | xargs kill -9 2>/dev/null
```

Sanity-check what actually shipped in the bundle:

```bash
strings /Applications/Termix.app/Contents/Resources/app.asar | grep -c ui-sans-serif  # sans UI font
strings /Applications/Termix.app/Contents/Resources/app.asar | grep -c termius        # theme
lipo -archs /Applications/Termix.app/Contents/MacOS/Termix                            # arm64
```

---

## 5. Debugging

Main-process log, which records backend spawn and crashes:

```
~/Library/Application Support/termix/termix-main.log
```

Client database (separate from any dev instance):

```
~/Library/Application Support/termix/server-data/db.sqlite.encrypted
```

It is encrypted per user, so it cannot be inspected or seeded with `sqlite3`.
To add data, log in through the app and use the REST API on `localhost:30001`
with a cookie jar while the app is running.

---

## 6. Native module ABI

`npm run electron:rebuild` rebuilds `better-sqlite3` and `serialport` against
Electron's ABI. That breaks running the backend under system Node afterwards:

```
NODE_MODULE_VERSION 148 ... requires NODE_MODULE_VERSION 147
```

To go back to local development:

```bash
npm rebuild better-sqlite3
```

Then re-run `npm run electron:rebuild` before the next desktop build. Expect to
flip between the two.

---

## 7. Windows and Linux

Do not build them on macOS. The fork adds
`.github/workflows/electron-hosted.yml`, which is upstream's Electron workflow
with `runs-on` switched to `windows-latest` / `ubuntu-latest` / `macos-latest` —
upstream pins `blacksmith-*` runners that do not exist on a fork, so those jobs
queue forever.

Enable Actions on the fork, then run **Build Electron App (GitHub-hosted
runners)** with `build_type: all`, `artifact_destination: file`,
`source_ref: integration`.

---

## Type checking

`npm run type-check` does **not** check the UI. The root `tsconfig.json` has
`"files": []` with project references, so plain `tsc --noEmit` compiles nothing.
The real command is:

```bash
npx tsc -p tsconfig.app.json --noEmit
```

There is a large pre-existing error count inherited from upstream (~325 on
`main`), so compare against that baseline rather than expecting zero. Note that
`vite build` succeeds regardless, because it does not type-check.
