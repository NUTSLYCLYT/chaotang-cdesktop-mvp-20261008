"""Packaging boundaries: reject data leaks and unsafe archive members."""

import importlib.util
import stat
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "sidecar_builder", Path(__file__).with_name("build-chaotang-sidecar.py")
)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ArchiveBoundaries(unittest.TestCase):
    def test_reject_unsafe_members_before_writing(self):
        for name in (
            "../escape.txt",
            "/absolute.txt",
            "C:/absolute.txt",
            "..\\escape.txt",
            "backend/.env",
            "backend/.ENV.production",
            "backend/users.sqlite3",
            "backend/secrets/private.pem",
            "backend/id_ed25519",
        ):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                archive = root / "source.zip"
                with zipfile.ZipFile(archive, "w") as bundle:
                    bundle.writestr(name, b"must not be extracted")
                with self.assertRaises(ValueError):
                    builder.extract(archive, root / "output")
                self.assertFalse((root / "output").exists())

    def test_reject_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "source.zip"
            entry = zipfile.ZipInfo("backend/app/link")
            entry.create_system = 3
            entry.external_attr = (stat.S_IFLNK | 0o777) << 16
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr(entry, "../../outside")
            with self.assertRaises(ValueError):
                builder.extract(archive, root / "output")

    def test_metadata_extraction_does_not_shadow_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "backend.whl"
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("app/main.py", b"wheel source")
                bundle.writestr(
                    "backend-1.dist-info/METADATA", b"Name: backend\nVersion: 1\n"
                )
            builder.extract(archive, root / "metadata", metadata_only=True)
            self.assertFalse((root / "metadata/app").exists())
            self.assertEqual(
                (root / "metadata/backend-1.dist-info/METADATA").read_bytes(),
                b"Name: backend\nVersion: 1\n",
            )


if __name__ == "__main__":
    unittest.main()
