#!/usr/bin/env python3
"""
Build a clean, flat zip of this extension folder for AMO / Chrome Web Store
submission: manifest.json sits at the root of the zip (no wrapping folder),
and no macOS metadata (.DS_Store, __MACOSX, ._*) is included.

Usage (run from inside the extension folder, or point it elsewhere):
    python3 make_zip.py
    python3 make_zip.py my-custom-name.zip
"""
import sys
import zipfile
from pathlib import Path

SOURCE_DIR = Path(__file__).resolve().parent
DEFAULT_NAME = "ninja-listening-extension.zip"

# Folders to skip entirely. Remove "icons" once icons are finalized and
# referenced from manifest.json, if you want them included in the zip.
EXCLUDE_DIRS = {"icons", "__pycache__", ".git"}


def should_skip(rel_path: Path, output_name: str) -> bool:
    if rel_path.name == output_name:
        return True
    if rel_path.name == Path(__file__).name:
        return True
    if rel_path.name.startswith("."):
        return True
    if any(part in EXCLUDE_DIRS or part.startswith(".") for part in rel_path.parts[:-1]):
        return True
    return False


def main():
    output_name = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_NAME
    output_path = SOURCE_DIR / output_name

    if output_path.exists():
        output_path.unlink()

    count = 0
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(SOURCE_DIR.rglob("*")):
            if path.is_dir():
                continue
            rel = path.relative_to(SOURCE_DIR)
            if should_skip(rel, output_name):
                continue
            zf.write(path, rel)
            print("added:", rel)
            count += 1

    print(f"\nCreated {output_path} ({count} files)")
    with zipfile.ZipFile(output_path) as zf:
        names = zf.namelist()
        if "manifest.json" in names:
            print("OK: manifest.json is present at the zip root.")
        else:
            print("WARNING: manifest.json was not found at the root -- check EXCLUDE_DIRS or folder structure.")


if __name__ == "__main__":
    main()
