import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from backend.app.storage import VercelBlobSnapshotStore


class VercelBlobCompatibilityTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict("os.environ", {"BLOB_READ_WRITE_TOKEN": "test-token"})
        environment.start()
        self.addCleanup(environment.stop)
        # Use the installed SDK so a dependency with an incompatible API fails here.
        self.store = VercelBlobSnapshotStore()
        self.addCleanup(self.store.client.close)
        self.path = Path("/app/backend/data/gamma_dashboard_SPX_11-06-2026.json")

    def test_load_decodes_private_blob_content(self):
        with patch.object(type(self.store.client), "get", autospec=True) as get:
            get.return_value = SimpleNamespace(content=b'{"ticker": "SPX"}')
            self.assertEqual(self.store.load(self.path), {"ticker": "SPX"})
            get.assert_called_once_with(
                self.store.client, self.path.name, access="private"
            )

    def test_missing_blob_is_a_cache_miss(self):
        with patch.object(type(self.store.client), "get", autospec=True, return_value=None):
            self.assertIsNone(self.store.load(self.path))

    def test_save_uses_private_overwrite_api(self):
        with patch.object(type(self.store.client), "put", autospec=True) as put:
            self.store.save(self.path, {"ticker": "SPX"})
            put.assert_called_once_with(
                self.store.client,
                self.path.name,
                json.dumps({"ticker": "SPX"}, indent=2).encode(),
                access="private",
                content_type="application/json",
                overwrite=True,
            )

    def test_listing_follows_pagination(self):
        with patch.object(type(self.store.client), "list_objects", autospec=True) as listing:
            listing.side_effect = [
                SimpleNamespace(
                    blobs=[SimpleNamespace(pathname="first.json")],
                    has_more=True, cursor="next-page",
                ),
                SimpleNamespace(
                    blobs=[SimpleNamespace(pathname="second.json")],
                    has_more=False, cursor=None,
                ),
            ]
            self.assertEqual(
                self.store.list_pathnames("gamma_dashboard_SPX_"),
                ["first.json", "second.json"],
            )
            self.assertEqual(listing.call_args_list[1].kwargs["cursor"], "next-page")


if __name__ == "__main__":
    unittest.main()
