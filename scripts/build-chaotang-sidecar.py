"""Build a review candidate from an exact backend commit, without editing either repo.

Run with the verified backend Python environment. Install build tools separately
and provide their directory through --tool-site. This does not install, deploy,
replace Tauri resources, certify a platform lock, or run a model.
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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-repo", required=True, type=Path)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--build-root", required=True, type=Path)
    parser.add_argument("--tool-site", required=True, type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.commit):
        parser.error("--commit must be a complete commit ID")
    repo = args.backend_repo.resolve(strict=True)
    root = args.build_root.resolve()
    tool_site = args.tool_site.resolve(strict=True)
    if root == repo or root.is_relative_to(repo):
        parser.error("Build output must be outside the backend repository")
    root.mkdir(parents=True, exist_ok=False)
    report = {
        "startedAt": now(),
        "status": "running",
        "backendCommit": args.commit,
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
        backend = root / "source/backend"
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
