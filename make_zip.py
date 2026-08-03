#!/usr/bin/env python3
"""
Build a clean, flat zip of the extension source (in the `extension/`
subfolder) for AMO / Chrome Web Store submission: manifest.json sits at the
root of the zip (no wrapping folder), and no macOS metadata (.DS_Store,
__MACOSX, ._*) is included.

Lives at the repo root, alongside the `extension/` folder. The output zip
is also written to the repo root.

Usage:
    python3 make_zip.py
    python3 make_zip.py my-custom-name.zip
"""
import sys
import zipfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent

# Name of the subfolder (relative to this script) that contains manifest.json
# and the rest of the extension source. Change this if you rename the folder.
EXTENSION_SUBDIR = "extension"

SOURCE_DIR = SCRIPT_DIR / EXTENSION_SUBDIR
OUTPUT_DIR = SCRIPT_DIR  # zip is written next to this script, at the repo root

DEFAULT_NAME = "ninja-listening-extension.zip"

# Folders to skip entirely. Remove "icons" once icons are finalized and
# referenced from manifest.json, if you want them included in the zip.
EXCLUDE_DIRS = {"icons", "__pycache__", ".git"}


def should_skip(rel_path: Path) -> bool:
    if rel_path.name.startswith("."):
        return True
    if any(part in EXCLUDE_DIRS or part.startswith(".") for part in rel_path.parts[:-1]):
        return True
    return False


def main():
    if not SOURCE_DIR.is_dir():
        print(f"ERROR: expected extension source at {SOURCE_DIR}, but it doesn't exist.")
        print(f"Check EXTENSION_SUBDIR at the top of this script (currently: '{EXTENSION_SUBDIR}').")
        sys.exit(1)

    output_name = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_NAME
    output_path = OUTPUT_DIR / output_name

    if output_path.exists():
        output_path.unlink()

    count = 0
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(SOURCE_DIR.rglob("*")):
            if path.is_dir():
                continue
            rel = path.relative_to(SOURCE_DIR)
            if should_skip(rel):
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
