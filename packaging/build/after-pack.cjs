const fs = require("fs");
const path = require("path");

// node-pty forks the shell through this helper binary. Packing and unpacking the
// asar does not always preserve its executable bit, and without it every local
// console fails with "posix_spawnp failed".
function restoreSpawnHelperMode(appOutDir) {
  if (process.platform === "win32") return;

  const roots = [
    path.join(appOutDir, "resources", "app.asar.unpacked"),
    path.join(appOutDir, "Termix.app", "Contents", "Resources", "app.asar.unpacked"),
  ];

  for (const root of roots) {
    const ptyDir = path.join(root, "node_modules", "node-pty");
    if (!fs.existsSync(ptyDir)) continue;

    const candidates = [path.join(ptyDir, "build", "Release", "spawn-helper")];
    const prebuildsDir = path.join(ptyDir, "prebuilds");
    if (fs.existsSync(prebuildsDir)) {
      for (const entry of fs.readdirSync(prebuildsDir)) {
        candidates.push(path.join(prebuildsDir, entry, "spawn-helper"));
      }
    }

    for (const file of candidates) {
      if (fs.existsSync(file)) fs.chmodSync(file, 0o755);
    }
  }
}

exports.default = async function afterPack(context) {
  const { targets, appOutDir } = context;

  restoreSpawnHelperMode(appOutDir);

  const isDir = targets.some((t) => t.name === "dir");
  if (!isDir) return;

  const markerPath = path.join(appOutDir, ".portable");
  fs.writeFileSync(markerPath, "");
};
