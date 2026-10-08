"""Packaging boundaries: reject data leaks and unsafe archive members."""

import hashlib
import importlib.util
import json
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
    def test_snapshot_rejects_duplicate_manifest_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = root / "manifest.json"
            manifest.write_text(
                '{"pyproject.toml":"'
                + "0" * 64
                + '","pyproject.toml":"'
                + "1" * 64
                + '"}'
            )
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                builder.copy_snapshot(
                    root, manifest, builder.digest(manifest), root / "out"
                )
            self.assertFalse((root / "out").exists())

    def test_snapshot_rejects_source_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            (source / "app").mkdir(parents=True)
            (source / "config").mkdir()
            (source / "pyproject.toml").write_bytes(b"[project]\n")
            (root / "outside.py").write_bytes(b"private")
            try:
                (source / "app/linked.py").symlink_to(root / "outside.py")
            except OSError:
                self.skipTest("Symlink creation not permitted on this platform")
            with self.assertRaisesRegex(ValueError, "links|reparse"):
                builder.snapshot_files(source)

    def test_snapshot_copies_exact_source_without_runtime_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            (source / "app").mkdir(parents=True)
            (source / "config").mkdir()
            (source / "app/main.py").write_bytes(b"# real source\n")
            (source / "pyproject.toml").write_bytes(b"[project]\n")
            files = {
                name: builder.digest(source / name)
                for name in ("app/main.py", "pyproject.toml")
            }
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps(files))
            expected = builder.digest(manifest)
            output = root / "candidate"
            builder.copy_snapshot(source, manifest, expected, output)
            self.assertEqual((output / "app/main.py").read_bytes(), b"# real source\n")
            self.assertEqual(
                set(files),
                {
                    p.relative_to(output).as_posix()
                    for p in output.rglob("*")
                    if p.is_file()
                },
            )
            (source / "app/main.py").write_bytes(b"# drift")
            with self.assertRaises(ValueError):
                builder.copy_snapshot(source, manifest, expected, root / "rejected")
            self.assertFalse((root / "rejected").exists())

    def test_snapshot_rejects_manifest_drift_extra_files_and_private_names(self):
        for extra in ("app/new.py", "app/.env", "config/custom.key"):
            with self.subTest(extra=extra), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / "source/app").mkdir(parents=True)
                (root / "source/config").mkdir()
                (root / "source/pyproject.toml").write_bytes(b"[project]\n")
                manifest = root / "manifest.json"
                manifest.write_text(
                    json.dumps(
                        {
                            "pyproject.toml": builder.digest(
                                root / "source/pyproject.toml"
                            )
                        }
                    )
                )
                expected = builder.digest(manifest)
                with self.assertRaises(ValueError):
                    builder.copy_snapshot(
                        root / "source", manifest, "0" * 64, root / "bad-hash"
                    )
                (root / "source" / extra).write_bytes(b"unapproved")
                with self.assertRaises(ValueError):
                    builder.copy_snapshot(
                        root / "source", manifest, expected, root / "bad-extra"
                    )
                self.assertFalse((root / "bad-extra").exists())

    def test_snapshot_rejects_traversal_and_runtime_paths_even_when_hashed(self):
        for name in (
            "../escape.py",
            "C:/escape.py",
            "app/../escape.py",
            "app\\x.py",
            "data/users.sqlite3",
            "app/.env",
            "config/token.key",
            "app/secret.pem",
        ):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / "source").mkdir()
                manifest = root / "manifest.json"
                manifest.write_text(
                    json.dumps({name: hashlib.sha256(b"x").hexdigest()})
                )
                with self.assertRaises(ValueError):
                    builder.copy_snapshot(
                        root / "source",
                        manifest,
                        builder.digest(manifest),
                        root / "out",
                    )
                self.assertFalse((root / "out").exists())

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
