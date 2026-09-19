from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


class SnapshotStore:
    def load(self, path: Path) -> Any | None:
        raise NotImplementedError

    def save(self, path: Path, payload: Any) -> None:
        raise NotImplementedError


class LocalSnapshotStore(SnapshotStore):
    def load(self, path: Path) -> Any | None:
        if not path.exists():
            return None
        try:
            with path.open("r", encoding="utf-8") as file:
                return json.load(file)
        except (json.JSONDecodeError, OSError):
            return None

    def save(self, path: Path, payload: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(f"{path.suffix}.tmp")
        with temporary.open("w", encoding="utf-8") as file:
            json.dump(payload, file, indent=2)
        temporary.replace(path)


class VercelBlobSnapshotStore(SnapshotStore):
    def __init__(self) -> None:
        try:
            from vercel.blob import BlobClient
        except ImportError as exc:
            raise RuntimeError("Install vercel-blob to use Vercel Blob storage.") from exc

        token = os.getenv("BLOB_READ_WRITE_TOKEN")
        if not token:
            raise RuntimeError("BLOB_READ_WRITE_TOKEN is required for Vercel Blob storage.")
        self.client = BlobClient(token=token)

    @staticmethod
    def _pathname(path: Path) -> str:
        return path.as_posix().lstrip("/")

    def load(self, path: Path) -> Any | None:
        try:
            response = self.client.get(self._pathname(path))
            body = response.read() if hasattr(response, "read") else response
            return json.loads(body)
        except Exception:  # noqa: BLE001 - missing snapshots are normal cache misses
            return None

    def save(self, path: Path, payload: Any) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.client.put(
            self._pathname(path),
            body,
            access="private",
            content_type="application/json",
            overwrite=True,
        )


def get_snapshot_store() -> SnapshotStore:
    if os.getenv("STORAGE_BACKEND", "local").lower() == "vercel_blob":
        return VercelBlobSnapshotStore()
    return LocalSnapshotStore()
