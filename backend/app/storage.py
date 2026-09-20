from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
logger = logging.getLogger(__name__)


class SnapshotStore:
    def load(self, path: Path) -> Any | None:
        raise NotImplementedError

    def save(self, path: Path, payload: Any) -> None:
        raise NotImplementedError

    def list_pathnames(self, prefix: str) -> list[str]:
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

    def list_pathnames(self, prefix: str) -> list[str]:
        return [path.name for path in DATA_DIR.glob(f"{prefix}*") if path.is_file()]


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
        parts = path.parts
        if "data" in parts:
            return Path(*parts[parts.index("data") + 1 :]).as_posix()
        return path.as_posix().lstrip("/")

    def load(self, path: Path) -> Any | None:
        try:
            response = self.client.get(self._pathname(path), access="private")
            if response is None:
                return None
            body = getattr(response, "stream", response)
            if hasattr(body, "read"):
                body = body.read()
            if not isinstance(body, (bytes, bytearray, str)):
                body = getattr(response, "content", body)
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

    def list_pathnames(self, prefix: str) -> list[str]:
        try:
            names: list[str] = []
            cursor = None
            while True:
                listing = self.client.list_objects(prefix=prefix, limit=1000, cursor=cursor)
                blobs = getattr(listing, "blobs", None)
                if blobs is None and isinstance(listing, dict):
                    blobs = listing.get("blobs", [])
                for blob in blobs or []:
                    pathname = getattr(blob, "pathname", None)
                    if pathname is None and isinstance(blob, dict):
                        pathname = blob.get("pathname")
                    if pathname:
                        names.append(str(pathname))

                has_more = getattr(listing, "has_more", None)
                next_cursor = getattr(listing, "cursor", None)
                if isinstance(listing, dict):
                    has_more = listing.get("has_more", has_more)
                    next_cursor = listing.get("cursor", next_cursor)
                if not has_more or not next_cursor:
                    break
                cursor = next_cursor
            return names
        except Exception:  # noqa: BLE001 - keep the API available if the archive is unavailable
            logger.exception("Unable to list Vercel Blob snapshots for prefix %s", prefix)
            return []


def get_snapshot_store() -> SnapshotStore:
    if os.getenv("STORAGE_BACKEND", "local").lower() == "vercel_blob":
        return VercelBlobSnapshotStore()
    return LocalSnapshotStore()
