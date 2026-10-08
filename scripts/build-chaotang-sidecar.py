"""Build a review candidate from a commit or an explicitly hashed local snapshot.

Run with the verified backend Python environment. Install build tools separately
and provide their directory through --tool-site. This does not install, deploy,
replace Tauri resources, certify a platform lock, or run a model.
Snapshot mode records the commit as ancestry only, never as the packaged version.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import re
import stat
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def private_path(path: PurePosixPath) -> bool:
    return any(
        part.lower() in {".env", "id_rsa", "id_ed25519"}
        or part.lower().startswith(".env.")
        or part.lower().endswith((".sqlite3", ".sqlite", ".db", ".p12", ".pfx", ".key"))
        or ("private" in part.lower() and part.lower().endswith(".pem"))
        for part in path.parts
    )


def extract(archive: Path, target: Path, *, metadata_only: bool = False) -> None:
    with zipfile.ZipFile(archive) as bundle:
        for item in bundle.infolist():
            path = PurePosixPath(item.filename)
            if (
                path.is_absolute()
                or ".." in path.parts
                or "\\" in item.filename
                or ":" in item.filename
                or stat.S_ISLNK(item.external_attr >> 16)
                or private_path(path)
            ):
                raise ValueError(f"Unsafe source member: {item.filename}")
            if metadata_only and not path.parts[0].endswith(".dist-info"):
                continue
            bundle.extract(item, target)


def snapshot_path(name: str) -> bool:
    path = PurePosixPath(name)
    return (
        name == path.as_posix()
        and not path.is_absolute()
        and ".." not in path.parts
        and "\\" not in name
        and ":" not in name
        and not private_path(path)
        and (
            name == "pyproject.toml"
            or (
                len(path.parts) > 1
                and path.parts[0] in {"app", "config"}
                and path.suffix in {".py", ".json", ".yaml", ".yml", ".md"}
            )
        )
    )


def snapshot_files(source: Path) -> dict[str, str]:
    """Inspect only product source; runtime data is never an input."""
    source = source.resolve(strict=True)
    files = {}

    def regular(path: Path) -> None:
        info = path.lstat()
        if path.is_symlink() or getattr(info, "st_file_attributes", 0) & 0x400:
            raise ValueError("Snapshot links or reparse points are not allowed")
        if not path.resolve().is_relative_to(source):
            raise ValueError("Snapshot source escapes root")

    metadata = source / "pyproject.toml"
    regular(metadata)
    files["pyproject.toml"] = digest(metadata)
    for directory in ("app", "config"):
        base = source / directory
        regular(base)
        for current, directories, names in os.walk(base, followlinks=False):
            current_path = Path(current)
            regular(current_path)
            for name in list(directories):
                regular(current_path / name)
                if name == "__pycache__":
                    directories.remove(name)
            for name in names:
                path = current_path / name
                regular(path)
                relative = path.relative_to(source).as_posix()
                if not snapshot_path(relative) or not path.is_file():
                    raise ValueError("Unexpected or private snapshot source file")
                files[relative] = digest(path)
    return files


def copy_snapshot(
    source: Path, manifest_path: Path, expected_digest: str, target: Path
) -> dict[str, str]:
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Duplicate snapshot path")
            result[key] = value
        return result

    raw = manifest_path.read_bytes()
    if (
        not re.fullmatch(r"[0-9a-f]{64}", expected_digest)
        or hashlib.sha256(raw).hexdigest() != expected_digest
    ):
        raise ValueError("Snapshot manifest digest mismatch")
    expected = json.loads(raw, object_pairs_hook=unique_pairs)
    if (
        not isinstance(expected, dict)
        or not expected
        or any(
            not snapshot_path(name)
            or not isinstance(value, str)
            or not re.fullmatch(r"[0-9a-f]{64}", value)
            for name, value in expected.items()
        )
    ):
        raise ValueError("Invalid snapshot manifest")
    if snapshot_files(source) != expected:
        raise ValueError("Snapshot file set or content changed")
    if target.resolve() == source.resolve() or target.resolve().is_relative_to(
        source.resolve()
    ):
        raise ValueError("Snapshot output must be outside source")
    target.mkdir(parents=True, exist_ok=False)
    for directory in ("app", "config"):
        (target / directory).mkdir()
    for name, checksum in expected.items():
        content = (source / name).read_bytes()
        if hashlib.sha256(content).hexdigest() != checksum:
            raise ValueError("Snapshot changed while copying")
        output = target / name
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(content)
    if snapshot_files(source) != expected or snapshot_files(target) != expected:
        raise ValueError("Snapshot changed during capture")
    return expected


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-repo", required=True, type=Path)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--build-root", required=True, type=Path)
    parser.add_argument("--tool-site", required=True, type=Path)
    parser.add_argument("--snapshot-root", type=Path)
    parser.add_argument("--snapshot-manifest", type=Path)
    parser.add_argument("--snapshot-sha256")
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.commit):
        parser.error("--commit must be a complete commit ID")
    repo = args.backend_repo.resolve(strict=True)
    root = args.build_root.resolve()
    tool_site = args.tool_site.resolve(strict=True)
    snapshot_options = (
        args.snapshot_root,
        args.snapshot_manifest,
        args.snapshot_sha256,
    )
    if any(snapshot_options) and not all(snapshot_options):
        parser.error("Snapshot root, manifest and its SHA-256 are required together")
    if args.snapshot_root and root.is_relative_to(args.snapshot_root.resolve()):
        parser.error("Build output must be outside snapshot source")
    if root == repo or root.is_relative_to(repo):
        parser.error("Build output must be outside the backend repository")
    root.mkdir(parents=True, exist_ok=False)
    report = {
        "startedAt": now(),
        "status": "running",
        "backendCommit": None if args.snapshot_root else args.commit,
        "backendBaseCommit": args.commit,
        "sourceKind": "UNCOMMITTED_SNAPSHOT" if args.snapshot_root else "GIT_COMMIT",
        "snapshotManifestSha256": args.snapshot_sha256,
        "python": sys.version,
        "commands": [],
        "realModelCalled": False,
        "nativeBackendPackaged": False,
        "nativeUiTested": False,
        "platformLockValidated": False,
        "releaseApproved": False,
        "runtimeInventory": sorted(
            [
                {"name": d.metadata["Name"], "version": d.version}
                for d in importlib.metadata.distributions()
            ],
            key=lambda d: d["name"],
        ),
        "buildToolInventory": sorted(
            [
                {"name": d.metadata["Name"], "version": d.version}
                for d in importlib.metadata.distributions(path=[str(tool_site)])
            ],
            key=lambda d: d["name"],
        ),
        "builderSha256": digest(Path(__file__)),
    }
    env = {
        k: v
        for k, v in os.environ.items()
        if not any(word in k.upper() for word in ("KEY", "TOKEN", "SECRET", "PASSWORD"))
        and not k.upper().startswith(("CHAOTANG_", "DEEPSEEK_", "OPENAI_", "PYTHON"))
    }
    env.update(
        PYTHONPATH=str(tool_site),
        PYTHONUTF8="1",
        PYTHONNOUSERSITE="1",
        CHAOTANG_DECREE_JOB_WORKER_ENABLED="false",
        PYINSTALLER_CONFIG_DIR=str(root / "pyinstaller-cache"),
    )

    def run(command: list[str], cwd: Path) -> None:
        report["commands"].append(
            {"argv": command, "cwd": str(cwd), "startedAt": now()}
        )
        with (root / "build.log").open("a", encoding="utf-8") as log:
            result = subprocess.run(
                command,
                cwd=cwd,
                env=env,
                stdout=log,
                check=False,
                stderr=subprocess.STDOUT,
                timeout=1800,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
        report["commands"][-1].update(endedAt=now(), exitCode=result.returncode)
        result.check_returncode()

    try:
        backend = root / "source/backend"
        if args.snapshot_root:
            run(["git", "cat-file", "-e", args.commit + "^{commit}"], repo)
            copy_snapshot(
                args.snapshot_root,
                args.snapshot_manifest,
                args.snapshot_sha256,
                backend,
            )
        else:
            archive = root / "backend-source.zip"
            run(
                [
                    "git",
                    "archive",
                    "--format=zip",
                    "-o",
                    str(archive),
                    args.commit,
                    "backend/app",
                    "backend/config",
                    "backend/pyproject.toml",
                ],
                repo,
            )
            extract(archive, root / "source")
            report["sourceArchiveSha256"] = digest(archive)
        report["sourceFiles"] = {
            p.relative_to(backend).as_posix(): digest(p)
            for p in backend.rglob("*")
            if p.is_file()
        }
        # Build genuine project metadata with its declared build backend.
        run(
            [
                sys.executable,
                "-m",
                "hatchling",
                "build",
                "-t",
                "wheel",
                "-d",
                str(root / "wheel"),
            ],
            backend,
        )
        wheels = list((root / "wheel").glob("*.whl"))
        if len(wheels) != 1:
            raise ValueError("Expected exactly one backend wheel")
        metadata = root / "metadata"
        extract(wheels[0], metadata, metadata_only=True)
        report["backendWheelSha256"] = digest(wheels[0])
        env["PYTHONPATH"] = os.pathsep.join((str(metadata), str(tool_site)))
        entry = Path(__file__).with_name("chaotang_sidecar_main.py")
        report["entrypointSha256"] = digest(entry)
        run(
            [
                sys.executable,
                "-m",
                "PyInstaller",
                "--onedir",
                "--noupx",
                "--name",
                "chaotang-backend",
                "--distpath",
                str(root / "dist"),
                "--workpath",
                str(root / "work"),
                "--specpath",
                str(root),
                "--paths",
                str(backend),
                "--collect-submodules",
                "app",
                "--collect-data",
                "app",
                "--copy-metadata",
                "chaotang-os-backend",
                "--add-data",
                f"{backend / 'config'}:config",
                str(entry),
            ],
            backend,
        )
        artifact = root / "dist/chaotang-backend"
        files = [p for p in artifact.rglob("*") if p.is_file()]
        for path in files:
            if private_path(PurePosixPath(path.relative_to(artifact).as_posix())):
                raise ValueError(f"Private artifact path: {path.name}")
        executable = artifact / (
            "chaotang-backend.exe" if os.name == "nt" else "chaotang-backend"
        )
        if not executable.is_file():
            raise ValueError("Packager did not produce an executable")
        report.update(
            status="packaged-awaiting-runtime-validation",
            nativeBackendPackaged=True,
            artifact=str(artifact),
            executableSha256=digest(executable),
            artifactFiles={
                p.relative_to(artifact).as_posix(): digest(p) for p in files
            },
        )
    except BaseException as error:
        report.update(status="failed", error=f"{type(error).__name__}: {error}")
        raise
    finally:
        report["endedAt"] = now()
        (root / "build-evidence.json").write_text(
            json.dumps(report, indent=2), encoding="utf-8"
        )


if __name__ == "__main__":
    main()
