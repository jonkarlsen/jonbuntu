"""Utilities for safely loading and saving locations.json."""

from __future__ import annotations

import errno
import json
import os
import stat
import tempfile
from typing import Any

LOCATIONS_FILE = "locations.json"


def read_locations_file(path: str = LOCATIONS_FILE) -> dict[str, Any]:
    """Read locations.json from disk."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return data


def validate_locations(data: Any) -> str | None:
    """Return an error message if the locations data has the wrong shape."""
    if not isinstance(data, dict):
        return "locations must be a JSON object keyed by class name"

    for class_key, class_data in data.items():
        if not isinstance(class_data, dict):
            return f"Class {class_key!r} must be a JSON object"

        students = class_data.get("students", [])
        if not isinstance(students, list):
            return f"Class {class_key!r}: 'students' must be an array"

        for index, student in enumerate(students):
            if not isinstance(student, dict):
                return f"Class {class_key!r}: student {index} must be a JSON object"

    return None


def write_locations_file_atomic(
    data: dict[str, Any], path: str = LOCATIONS_FILE
) -> None:
    """Write locations.json to disk, avoiding corruption where possible.

    A normal write goes to a temporary file which is then renamed over the
    target.  That does not work when the target is a bind-mounted file (for
    example ``./locations.json:/app/locations.json`` in docker-compose):
    replacing a mount point fails with ``EBUSY``.  In that case fall back to
    writing the already-serialised payload in place.
    """
    payload = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    directory = os.path.dirname(os.path.abspath(path)) or "."
    try:
        target_stat = os.stat(path)
    except OSError:
        target_stat = None
    fd, tmp_path = tempfile.mkstemp(
        prefix=".locations.", suffix=".json.tmp", dir=directory
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())

        if target_stat is not None:
            os.chmod(tmp_path, stat.S_IMODE(target_stat.st_mode))
            try:
                os.chown(tmp_path, target_stat.st_uid, target_stat.st_gid)
            except OSError:
                pass

        try:
            os.replace(tmp_path, path)
            return
        except OSError as exc:
            if exc.errno not in (errno.EBUSY, errno.EXDEV):
                raise

        # The target is a mount point, so its inode cannot be replaced.
        with open(path, "w", encoding="utf-8") as f:
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
    finally:
        try:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
        except OSError:
            pass
