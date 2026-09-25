// Resolve electronDist at runtime (#38673, #47917): electron-builder 26.8.x can
// re-unpack a broken Electron.app; reusing the installed dist dodges that.
// npm workspace hoisting is non-deterministic — require.resolve finds electron
// wherever it landed. Dist present → -c.electronDist=<abs>/dist; absent → let
// electron-builder fetch via @electron/get (electronVersion + ELECTRON_MIRROR).

import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

function electronDistDir() {
  try {
    return path.join(path.dirname(require.resolve("electron/package.json")), "dist")
  } catch {
    return null
  }
}

function distBinary(dist) {
  if (process.platform === "darwin") {
    return path.join(dist, "Electron.app", "Contents", "MacOS", "Electron")
  }
  if (process.platform === "win32") {
    return path.join(dist, "electron.exe")
  }
  return path.join(dist, "electron")
}

function electronBuilderCli() {
  // Resolve the package's own `package.json` to read its `bin` entry. This used
  // to be `require.resolve("electron-builder/package.json")`, which electron-builder
  // 27.0.0-alpha broke: its `exports` map is `["." , "./internal"]`, so the
  // `./package.json` subpath is no longer importable and the resolve throws
  // ERR_PACKAGE_PATH_NOT_EXPORTED before any bundling starts.
  //
  // `exports` still exposes the root, so ask for the package ENTRY POINT and walk
  // up to the directory that holds it. Walk rather than hardcode a depth: a
  // package can point `exports` at `./dist/index.js` today and move it tomorrow,
  // and `bin` is always a sibling of the package.json we are looking for.
  let pkgDir
  try {
    pkgDir = path.dirname(require.resolve("electron-builder/package.json"))
  } catch {
    let dir = path.dirname(require.resolve("electron-builder"))
    // Bounded: a package directory is never more than a few levels below its
    // entry point, and an unbounded walk would spin at the filesystem root.
    for (let i = 0; i < 4 && !fs.existsSync(path.join(dir, "package.json")); i += 1) {
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    pkgDir = dir
  }

  const pkgJson = path.join(pkgDir, "package.json")
  const bin = JSON.parse(fs.readFileSync(pkgJson, "utf8")).bin
  const rel = typeof bin === "string" ? bin : bin["electron-builder"]
  return path.join(pkgDir, rel)
}

const dist = electronDistDir()
// Local `hermes desktop` builds only ever package (--dir or dist), never
// publish a GitHub release — no CI workflow drives this script. But the npm
// lifecycle env sets CI=1 (so esbuild's postinstall doesn't try interactive
// animations), and electron-builder treats CI=1 as a signal to implicitly
// resolve a publish target. That resolution reads <projectDir>/.git/config
// directly — projectDir here is apps/desktop, which has no .git of its own
// (only the repo root does) and no "repository" field in its package.json —
// so it fails with "Cannot detect repository by .git/config". Pin publish to
// "never" so electron-builder skips that lookup entirely.
const args = ["--publish", "never"]
if (dist && fs.existsSync(distBinary(dist))) {
  args.push(`-c.electronDist=${dist}`)
} else {
  console.warn(
    "[run-electron-builder] no local electron dist; electron-builder will fetch " +
      "via @electron/get (electronVersion + ELECTRON_MIRROR)."
  )
}
args.push(...process.argv.slice(2))

const result = spawnSync(process.execPath, [electronBuilderCli(), ...args], {
  stdio: "inherit",
})
if (result.error) {
  console.error(`[run-electron-builder] spawn failed: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status == null ? 1 : result.status)
