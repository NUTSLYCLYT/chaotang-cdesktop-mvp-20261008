"""Probe a frozen backend copy through real loopback HTTP; never opens a UI."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import secrets
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-root", required=True, type=Path)
    parser.add_argument("--probe-root", required=True, type=Path)
    parser.add_argument(
        "--exercise-cash",
        action="store_true",
        help="Also check actual synthetic cash analysis, XLSX and archives",
    )
    args = parser.parse_args()
    build = args.build_root.resolve(strict=True)
    evidence = json.loads((build / "build-evidence.json").read_text(encoding="utf-8"))
    if not evidence.get("nativeBackendPackaged"):
        raise ValueError("A successful package build is required")
    source = build / "dist/chaotang-backend"
    expected_files = evidence["artifactFiles"]
    actual_files = {
        p.relative_to(source).as_posix() for p in source.rglob("*") if p.is_file()
    }
    if actual_files != set(expected_files):
        raise ValueError("Artifact file list changed after packaging")
    for name, expected in expected_files.items():
        with (source / name).open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
                raise ValueError(f"Artifact changed after packaging: {name}")
    root = args.probe_root.resolve()
    if root == build or root.is_relative_to(build):
        raise ValueError("Probe copy must be outside the build root")
    root.mkdir(parents=True, exist_ok=False)
    runtime = root / "runtime"
    shutil.copytree(source, runtime)
    executable = runtime / (
        "chaotang-backend.exe" if os.name == "nt" else "chaotang-backend"
    )
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    env = {
        k: v
        for k, v in os.environ.items()
        if not any(
            word in k.upper()
            for word in ("KEY", "TOKEN", "SECRET", "PASSWORD", "PROXY")
        )
        and not k.upper().startswith(("CHAOTANG_", "DEEPSEEK_", "OPENAI_", "PYTHON"))
    }
    env.update(
        CHAOTANG_BACKEND_PORT=str(port), CHAOTANG_DECREE_JOB_WORKER_ENABLED="false"
    )
    report = {
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "checks": [],
        "backendCommit": evidence["backendCommit"],
        "backendBaseCommit": evidence.get("backendBaseCommit"),
        "sourceKind": evidence.get("sourceKind", "GIT_COMMIT"),
        "snapshotManifestSha256": evidence.get("snapshotManifestSha256"),
        "executableSha256": evidence["executableSha256"],
        "realModelCalled": False,
        "network": "loopback-http-only",
        "nativeBackendUsed": True,
        "nativeUiTested": False,
        "multiAgentTested": False,
        "releaseApproved": False,
        "processesStopped": False,
        "command": [str(executable)],
        "commandRuns": [],
    }
    child = None
    log = (root / "runtime.log").open("w", encoding="utf-8")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def request(path: str, *, method: str = "GET", body=None, token=None, binary=False):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        req = urllib.request.Request(
            base + path,
            data=json.dumps(body).encode() if body is not None else None,
            method=method,
            headers=headers,
        )
        try:
            response = opener.open(req, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            data = response.read()
            return response.status, data if binary else (
                json.loads(data) if data else None
            )

    def check(name: str, passed: bool) -> None:
        report["checks"].append({"name": name, "passed": bool(passed)})
        if not passed:
            raise AssertionError(name)

    def start() -> None:
        nonlocal child
        child = subprocess.Popen(
            [str(executable)],
            cwd=runtime,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=log,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        report["commandRuns"].append(
            {"pid": child.pid, "startedAt": datetime.now(timezone.utc).isoformat()}
        )
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            if child.poll() is not None:
                raise RuntimeError(
                    f"Packaged backend exited: {child.returncode}; see runtime.log"
                )
            try:
                status, data = request("/health")
                if status == 200 and data.get("service") == "chaotang-os-backend":
                    return
            except (OSError, ValueError):
                pass
            time.sleep(0.25)
        raise TimeoutError("Packaged backend health timeout")

    def stop() -> None:
        nonlocal child
        if child is not None:
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=15)
            report["commandRuns"][-1].update(
                exitCode=child.returncode,
                endedAt=datetime.now(timezone.utc).isoformat(),
                stopped=True,
            )
            child = None

    try:
        start()
        status, data = request("/health")
        check(
            "frozen health and real wheel version",
            status == 200 and data["version"] == "0.1.0",
        )
        check("anonymous account denied", request("/api/v1/auth/me")[0] == 401)
        password = secrets.token_urlsafe(24)
        account = {
            "username": "sidecar-probe",
            "email": "sidecar-probe@example.invalid",
            "password": password,
        }
        status, registered = request(
            "/api/v1/auth/register", method="POST", body=account
        )
        check(
            "register persists real account",
            status == 201 and registered["user"]["username"] == account["username"],
        )
        token = registered["session_id"]
        check(
            "duplicate registration refused",
            request("/api/v1/auth/register", method="POST", body=account)[0] == 409,
        )
        check(
            "incorrect password denied",
            request(
                "/api/v1/auth/login",
                method="POST",
                body={"identifier": account["username"], "password": "incorrect"},
            )[0]
            == 401,
        )
        status, identity = request("/api/v1/auth/me", token=token)
        check(
            "authenticated identity correct",
            status == 200 and identity == registered["user"],
        )
        if args.exercise_cash:

            def amount(value, reference):
                return {
                    "amount": value,
                    "sourceReference": "synthetic:" + reference,
                    "attested": True,
                }

            payload = {
                "kind": "hubu.cash-safety-review.v1",
                "period": "2026-07",
                "asOf": "2026-08-01",
                "currency": "CNY",
                "balances": {
                    "cash": amount("100", "cash"),
                    "bank": amount("500", "bank"),
                    "reserved": amount("0", "reserved"),
                },
                "monthlyFlows": [
                    {
                        "period": month,
                        "inflow": "0",
                        "outflow": "100",
                        "sourceReference": "synthetic:" + month,
                        "attested": True,
                    }
                    for month in ("2026-05", "2026-06", "2026-07")
                ],
                "scheduledMovements": [],
            }
            status, cash = request(
                "/api/v1/hubu/cash-safety/create",
                method="POST",
                body=payload,
                token=token,
            )
            check(
                "packaged cash calculation and persistence",
                status == 200
                and cash["available_cash"] == "600.00"
                and cash["runway_months"] == "6.00"
                and len(cash["daily_forecast"]) == 31
                and cash["persistence_status"] == "PERSISTED",
            )
            artifact_path = "/api/v1/report-artifacts/" + cash["artifact_id"]
            status, workbook = request(
                artifact_path + "/download", token=token, binary=True
            )
            check("actual workbook download", status == 200)
            with zipfile.ZipFile(io.BytesIO(workbook)) as book:
                check(
                    "download is intact XLSX",
                    "xl/workbook.xml" in book.namelist() and book.testzip() is None,
                )
            report["workbookSha256"] = hashlib.sha256(workbook).hexdigest()
            status, confirmation = request(
                artifact_path + "/confirmation",
                method="POST",
                token=token,
                body={
                    "decision": "CONFIRMED",
                    "structured_reason": "合成打包测试，非真实经营数据。",
                },
            )
            check(
                "confirmation produces archive",
                status == 200 and bool(confirmation.get("shiguan_archive_id")),
            )
            archive_path = (
                "/api/v1/shiguan/archives/" + confirmation["shiguan_archive_id"]
            )
            status, _ = request(
                archive_path + "/review",
                method="PATCH",
                token=token,
                body={
                    "status": "PARTIAL",
                    "reviewed_at": "2026-09-28T00:00:00Z",
                    "note": "仅核验打包恢复。",
                },
            )
            check("archive review can be saved", status == 200)
            status, archive = request(archive_path, token=token)
            check("archive can be read", status == 200)
            check(
                "anonymous workbook denied",
                request(artifact_path + "/download", binary=True)[0] == 401,
            )
            status, other = request(
                "/api/v1/auth/register",
                method="POST",
                body={
                    "username": "other-probe",
                    "email": "other@example.invalid",
                    "password": secrets.token_urlsafe(24),
                },
            )
            check("second isolated account created", status == 201)
            for path in (artifact_path + "/download", archive_path):
                check(
                    "other account cannot read " + path.split("/")[-1],
                    request(path, token=other["session_id"], binary=True)[0] == 404,
                )
            request("/api/v1/auth/logout", method="POST", token=other["session_id"])
            status, jobs = request("/api/v1/decree-jobs", token=token)
            check("packaged task history readable", status == 200)
            report["syntheticInputs"] = True
        stop()
        start()
        status, identity = request("/api/v1/auth/me", token=token)
        check(
            "session survives process restart",
            status == 200 and identity == registered["user"],
        )
        if args.exercise_cash:
            status, after = request(
                artifact_path + "/download", token=token, binary=True
            )
            check(
                "workbook bytes survive executable restart",
                status == 200 and after == workbook,
            )
            status, after = request(archive_path, token=token)
            check(
                "archive and review survive executable restart",
                status == 200 and after == archive,
            )
            status, after = request("/api/v1/decree-jobs", token=token)
            check(
                "task history readable after executable restart",
                status == 200 and after == jobs,
            )
        check(
            "logout acknowledged",
            request("/api/v1/auth/logout", method="POST", token=token)[0] == 204,
        )
        check(
            "logged-out session revoked",
            request("/api/v1/auth/me", token=token)[0] == 401,
        )
        status, logged_in = request(
            "/api/v1/auth/login",
            method="POST",
            body={"identifier": account["email"], "password": password},
        )
        check(
            "persisted account can login again",
            status == 200 and logged_in["user"] == registered["user"],
        )
        # Revoke the final disposable session too; credentials never enter evidence.
        check(
            "final disposable session revoked",
            request(
                "/api/v1/auth/logout", method="POST", token=logged_in["session_id"]
            )[0]
            == 204,
        )
        report["status"] = "passed"
    except (AssertionError, RuntimeError, OSError, ValueError, KeyError) as error:
        report.update(status="failed", error=f"{type(error).__name__}: {error}")
    finally:
        stop()
        log.close()
        report["processesStopped"] = all(
            p.get("stopped") for p in report["commandRuns"]
        )
        report.update(
            endedAt=datetime.now(timezone.utc).isoformat(),
            passed=sum(c["passed"] for c in report["checks"]),
            failed=sum(not c["passed"] for c in report["checks"]),
        )
        (root / "runtime-evidence.json").write_text(
            json.dumps(report, indent=2), encoding="utf-8"
        )
    print(
        json.dumps(
            {
                k: report.get(k)
                for k in ("status", "passed", "failed", "error", "processesStopped")
            }
        )
    )
    raise SystemExit(0 if report["status"] == "passed" else 1)


if __name__ == "__main__":
    main()
