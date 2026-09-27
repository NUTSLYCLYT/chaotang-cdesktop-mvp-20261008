import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inspectNativeToolchain } from "./check-native-toolchain.mjs";

function fixture(t) {
  const root = mkdtempSync(
    path.join(tmpdir(), "chaotang-native-prerequisites-"),
  );
  t.after(() => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
    assert.ok(
      path.basename(resolved).startsWith("chaotang-native-prerequisites-"),
    );
    rmSync(resolved, { recursive: true });
  });
  const put = (name, body = "fixture: presence only; never executable") => {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
  };
  put(
    "repo/rust-toolchain.toml",
    '[toolchain]\nchannel = "nightly-2025-12-04"\nprofile = "default"\n',
  );
  put("repo/Cargo.lock");
  const toolchain = "rust/toolchains/nightly-2025-12-04-x86_64-pc-windows-msvc";
  const options = {
    repo: path.join(root, "repo"),
    rustupHome: path.join(root, "rust"),
    sdkRoot: path.join(root, "sdk"),
    platform: "win32",
    installations: [
      { installationPath: path.join(root, "vs"), isComplete: true },
    ],
  };
  const complete = () => {
    for (const tool of ["cargo", "rustc", "rustfmt"])
      put(`${toolchain}/bin/${tool}.exe`);
    put(
      `${toolchain}/lib/rustlib/x86_64-pc-windows-msvc/lib/libstd-example.rlib`,
    );
    for (const file of [
      "bin/Hostx64/x64/cl.exe",
      "bin/Hostx64/x64/link.exe",
      "lib/x64/libcmt.lib",
    ])
      put(`vs/VC/Tools/MSVC/14.44/${file}`);
    for (const file of [
      "Lib/10.0/um/x64/kernel32.lib",
      "Lib/10.0/ucrt/x64/ucrt.lib",
      "Include/10.0/um/Windows.h",
      "Include/10.0/ucrt/stdio.h",
      "bin/10.0/x64/rc.exe",
    ])
      put(`sdk/${file}`);
  };
  return { root, put, toolchain, options, complete };
}

test("cargo alone must not count as a recovered compiler", (t) => {
  const f = fixture(t);
  f.put(`${f.toolchain}/bin/cargo.exe`);
  const report = inspectNativeToolchain(f.options);
  assert.equal(report.channel, "nightly-2025-12-04");
  assert.equal(report.prerequisitesPresent, false);
  assert.ok(report.missing.includes("rustc"));
  assert.ok(report.missing.includes("rustfmt"));
  assert.ok(report.missing.includes("rust-standard-library"));
});

test("complete fixture only proves presence, never native compilation or release", (t) => {
  const f = fixture(t);
  f.complete();
  const report = inspectNativeToolchain(f.options);
  assert.equal(report.prerequisitesPresent, true);
  assert.deepEqual(report.missing, []);
  for (const key of [
    "nativeCompiled",
    "nativeTestsRun",
    "releaseEligible",
    "networkUsed",
    "toolchainProcessesStarted",
  ])
    assert.equal(report[key], false);
});

test("partial Visual Studio installation fails even with compiler files", (t) => {
  const f = fixture(t);
  f.complete();
  f.options.installations[0].isComplete = false;
  assert.ok(inspectNativeToolchain(f.options).missing.includes("msvc"));
});

test("different SDK versions cannot be combined into one ready SDK", (t) => {
  const f = fixture(t);
  f.complete();
  f.put("sdk/Include/10.0/um/Windows.h", "");
  f.put("sdk/Include/11.0/um/Windows.h");
  assert.ok(inspectNativeToolchain(f.options).missing.includes("windows-sdk"));
});

test("invalid toolchain pin never falls back to an arbitrary installed compiler", (t) => {
  const f = fixture(t);
  f.complete();
  f.put(
    "repo/rust-toolchain.toml",
    '[other]\nchannel = "nightly-2025-12-04"\n[toolchain]\nchannel = "stable"\n',
  );
  const report = inspectNativeToolchain(f.options);
  assert.equal(report.channel, null);
  assert.ok(report.missing.includes("pinned-rust-channel"));
  assert.ok(report.missing.includes("rustc"));
});

test("unsupported platform is not Windows release evidence", (t) => {
  const f = fixture(t);
  f.complete();
  assert.ok(
    inspectNativeToolchain({
      ...f.options,
      platform: "linux",
    }).missing.includes("windows-x64"),
  );
});
