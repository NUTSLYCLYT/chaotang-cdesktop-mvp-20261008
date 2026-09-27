#!/usr/bin/env node
/** Read-only Windows prerequisites. Never invoke rustup, cargo, or an installer. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const target = "x86_64-pc-windows-msvc";
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function nonemptyFile(file) {
  try {
    const stat = statSync(file);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function directories(root) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name));
  } catch {
    return [];
  }
}

export function inspectNativeToolchain({
  repo = projectRoot,
  rustupHome = process.env.RUSTUP_HOME || path.join(homedir(), ".rustup"),
  sdkRoot = path.join(
    process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)",
    "Windows Kits/10",
  ),
  installations = [],
  platform = process.platform,
} = {}) {
  const checks = [];
  const add = (id, present, detail) => checks.push({ id, present, detail });
  add(
    "windows-x64",
    platform === "win32",
    "This check covers the Windows x64 desktop only.",
  );
  let channel;
  try {
    const source = readFileSync(path.join(repo, "rust-toolchain.toml"), "utf8");
    const section = source.match(
      /^\[toolchain\][\s\S]*?(?=^\[|$(?![\s\S]))/m,
    )?.[0];
    channel = section?.match(
      /^channel\s*=\s*"(nightly-\d{4}-\d{2}-\d{2})"\s*$/m,
    )?.[1];
  } catch {
    // Missing/unrecognized pin is a failed prerequisite, not permission to use latest.
  }
  add(
    "pinned-rust-channel",
    Boolean(channel),
    channel || "Missing supported dated nightly pin.",
  );
  add(
    "cargo-lock",
    nonemptyFile(path.join(repo, "Cargo.lock")),
    "Use the committed dependency lock.",
  );
  const toolchain = channel
    ? path.join(rustupHome, "toolchains", `${channel}-${target}`)
    : undefined;
  for (const tool of ["rustc", "cargo", "rustfmt"]) {
    const binary = toolchain && path.join(toolchain, "bin", `${tool}.exe`);
    add(
      tool,
      Boolean(binary && nonemptyFile(binary)),
      binary || "No pinned toolchain directory.",
    );
  }
  const standardLibrary =
    toolchain && path.join(toolchain, "lib/rustlib", target, "lib");
  let hasStd = false;
  if (standardLibrary && existsSync(standardLibrary)) {
    try {
      hasStd = readdirSync(standardLibrary).some(
        (name) =>
          /^libstd-.*\.rlib$/.test(name) &&
          nonemptyFile(path.join(standardLibrary, name)),
      );
    } catch {
      // Unreadable libraries cannot satisfy the prerequisite.
    }
  }
  add(
    "rust-standard-library",
    hasStd,
    standardLibrary || "No pinned standard library.",
  );
  const msvc = installations
    .filter(
      (entry) =>
        entry.isComplete === true && typeof entry.installationPath === "string",
    )
    .flatMap((entry) =>
      directories(path.join(entry.installationPath, "VC/Tools/MSVC")),
    )
    .find((dir) =>
      [
        "bin/Hostx64/x64/cl.exe",
        "bin/Hostx64/x64/link.exe",
        "lib/x64/libcmt.lib",
      ].every((name) => nonemptyFile(path.join(dir, name))),
    );
  add(
    "msvc",
    Boolean(msvc),
    msvc ||
      "No complete Visual Studio installation with the x64 compiler, linker and runtime library.",
  );
  const sdk = directories(path.join(sdkRoot, "Lib")).find((dir) => {
    const version = path.basename(dir);
    return (
      ["um/x64/kernel32.lib", "ucrt/x64/ucrt.lib"].every((name) =>
        nonemptyFile(path.join(dir, name)),
      ) &&
      ["um/Windows.h", "ucrt/stdio.h"].every((name) =>
        nonemptyFile(path.join(sdkRoot, "Include", version, name)),
      ) &&
      nonemptyFile(path.join(sdkRoot, "bin", version, "x64/rc.exe"))
    );
  });
  add(
    "windows-sdk",
    Boolean(sdk),
    sdk ||
      "No single SDK version contains the x64 libraries, headers and resource compiler.",
  );
  return {
    schema: "chaotang.native-prerequisites.v1",
    checkedAtUtc: new Date().toISOString(),
    target,
    channel: channel || null,
    checks,
    prerequisitesPresent: checks.every((check) => check.present),
    missing: checks.filter((check) => !check.present).map((check) => check.id),
    nativeCompiled: false,
    nativeTestsRun: false,
    releaseEligible: false,
    networkUsed: false,
    toolchainProcessesStarted: false,
    boundary:
      "File presence and Visual Studio installation metadata only. This does not verify compiler integrity, Cargo cache completeness, compilation, or user flows.",
  };
}

function main() {
  // vswhere only queries existing installer metadata; it cannot install components.
  const vswhere = path.join(
    process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)",
    "Microsoft Visual Studio/Installer/vswhere.exe",
  );
  let installations = [];
  let discovery = "vswhere unavailable";
  if (process.platform === "win32" && nonemptyFile(vswhere)) {
    const result = spawnSync(
      vswhere,
      ["-all", "-products", "*", "-format", "json", "-utf8"],
      { encoding: "utf8", timeout: 10000, windowsHide: true },
    );
    if (result.status === 0) {
      try {
        const parsed = JSON.parse(result.stdout.replace(/^\uFEFF/, ""));
        if (Array.isArray(parsed)) {
          installations = parsed;
          discovery = "queried installed Visual Studio metadata";
        }
      } catch {
        discovery = "vswhere returned unreadable metadata";
      }
    } else {
      discovery = "vswhere query failed or timed out";
    }
  }
  const report = { ...inspectNativeToolchain({ installations }), discovery };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.prerequisitesPresent ? 0 : 2;
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
)
  main();
