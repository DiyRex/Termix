const fs = require("node:fs");
const path = require("node:path");

// Two independent node-pty defects, both surfacing as "posix_spawnp failed":
//
//  1. node-pty forks a shell through a small `spawn-helper` binary on POSIX, and
//     npm does not preserve the executable bit when it unpacks the prebuild.
//  2. unixTerminal.js locates that helper with
//       helperPath.replace('app.asar', 'app.asar.unpacked')
//     which is not idempotent: inside an `asarUnpack`ed tree the path already
//     contains "app.asar.unpacked", so the substring "app.asar" matches its
//     prefix and the result is ".../app.asar.unpacked.unpacked/...". The helper
//     is then missing and every local console fails to launch. Only the packaged
//     app is affected, which is why it never reproduces in development.
const ptyDir = path.join(__dirname, "..", "node_modules", "node-pty");

if (!fs.existsSync(ptyDir)) {
  console.log("[patch-node-pty] node-pty not found, skipping");
  process.exit(0);
}

// ── 1. Guard the asar path rewrite ───────────────────────────────────────────
// Applies on every platform: Windows unpacks conpty the same way.
const unixTerminalPath = path.join(ptyDir, "lib", "unixTerminal.js");
let pathRewritePatched = false;

if (fs.existsSync(unixTerminalPath)) {
  const source = fs.readFileSync(unixTerminalPath, "utf8");
  const marker = "// termix: idempotent asar rewrite";

  if (source.includes(marker)) {
    pathRewritePatched = true;
  } else {
    const original = `helperPath = helperPath.replace('app.asar', 'app.asar.unpacked');
helperPath = helperPath.replace('node_modules.asar', 'node_modules.asar.unpacked');`;

    const patched = `${marker} — skip when the path is already unpacked, or
// "app.asar.unpacked" becomes "app.asar.unpacked.unpacked".
if (!helperPath.includes('app.asar.unpacked')) {
    helperPath = helperPath.replace('app.asar', 'app.asar.unpacked');
}
if (!helperPath.includes('node_modules.asar.unpacked')) {
    helperPath = helperPath.replace('node_modules.asar', 'node_modules.asar.unpacked');
}`;

    if (source.includes(original)) {
      fs.writeFileSync(unixTerminalPath, source.replace(original, patched));
      pathRewritePatched = true;
    } else {
      console.warn(
        "[patch-node-pty] asar path rewrite not applied; expected source was not found",
      );
    }
  }
}

if (process.platform === "win32") {
  console.log(
    pathRewritePatched
      ? "[patch-node-pty] asar path rewrite guarded (ConPTY needs no chmod)"
      : "[patch-node-pty] Windows uses ConPTY, nothing to chmod",
  );
  process.exit(0);
}

// ── 2. Restore the executable bit on spawn-helper ────────────────────────────
const candidates = [path.join(ptyDir, "build", "Release", "spawn-helper")];

const prebuildsDir = path.join(ptyDir, "prebuilds");
if (fs.existsSync(prebuildsDir)) {
  for (const entry of fs.readdirSync(prebuildsDir)) {
    candidates.push(path.join(prebuildsDir, entry, "spawn-helper"));
  }
}

let fixed = 0;
for (const file of candidates) {
  if (!fs.existsSync(file)) continue;
  const mode = fs.statSync(file).mode;
  // Any-execute bit already set: leave it alone.
  if (mode & 0o111) continue;
  fs.chmodSync(file, 0o755);
  fixed++;
}

console.log(
  `[patch-node-pty] asar path rewrite ${
    pathRewritePatched ? "guarded" : "NOT patched"
  }; ${
    fixed > 0
      ? `restored the executable bit on ${fixed} spawn-helper binary/binaries`
      : "spawn-helper already executable"
  }`,
);
