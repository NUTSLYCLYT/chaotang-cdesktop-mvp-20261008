"""Desktop-owned launcher for the unmodified FastAPI business service."""

from __future__ import annotations

import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=int(os.environ.get("CHAOTANG_BACKEND_PORT", "8000")),
        workers=1,
        access_log=False,
    )


if __name__ == "__main__":
    main()
