"""Shared logic for uploading locations to AWS SSM Parameter Store."""

from __future__ import annotations

import asyncio
import base64
import gzip
import json
import shutil
import subprocess
from typing import Any


def _ensure_aws_available() -> None:
    if shutil.which("aws") is None:
        raise RuntimeError("AWS CLI ('aws') not found in PATH")


async def put_ssm_parameter(
    name: str, value: str, secure: bool, timeout: int = 60
) -> None:
    """Put a parameter in AWS SSM using the AWS CLI."""
    _ensure_aws_available()
    cmd = [
        "aws",
        "ssm",
        "put-parameter",
        "--name",
        name,
        "--type",
        "SecureString" if secure else "String",
        "--value",
        value,
        "--overwrite",
    ]

    def _run() -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )

    try:
        result = await asyncio.to_thread(_run)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Timed out uploading {name} to AWS SSM") from exc

    if result.returncode != 0:
        stderr = result.stderr.strip()
        stdout = result.stdout.strip()
        detail = (
            stderr
            or stdout
            or f"aws ssm put-parameter failed with code {result.returncode}"
        )
        raise RuntimeError(f"Failed to upload {name} to AWS SSM: {detail}")


def prepare_class_payloads(
    data: dict[str, Any],
) -> tuple[list[str], list[tuple[str, str, bool]]]:
    """Prepare SSM parameters to upload for a locations dict.

    Returns (class_keys, [(param_name, value, secure), ...])
    """
    class_keys = sorted(key for key, value in data.items() if isinstance(value, dict))
    if not class_keys:
        raise ValueError("No classes to upload")

    params: list[tuple[str, str, bool]] = []
    for class_key in class_keys:
        class_data = dict(data[class_key])
        # Make sure every uploaded class payload carries its map stacking order.
        class_data.setdefault("zIndex", 0)
        student_data = json.dumps(class_data)
        encoded = base64.b64encode(gzip.compress(student_data.encode())).decode()
        params.append((f"class_{class_key}", encoded, True))

    params.append(("current_class", ",".join(class_keys), False))
    return class_keys, params


async def upload_locations_to_ssm(data: dict[str, Any]) -> list[str]:
    """Upload all classes from locations dict to AWS SSM.

    Same format as upload_locations.py: class_<name> (SecureString, gzipped+base64)
    plus current_class (String).
    """
    class_keys, params = prepare_class_payloads(data)
    for name, value, secure in params:
        await put_ssm_parameter(name, value, secure)
    return class_keys


_aioboto3: Any = None
_AIOBOTO3_AVAILABLE = False
try:
    import aioboto3 as _aioboto3_module

    _aioboto3 = _aioboto3_module
    _AIOBOTO3_AVAILABLE = True
except Exception:
    _aioboto3 = None
    _AIOBOTO3_AVAILABLE = False


async def upload_locations_to_ssm_aioboto3(
    data: dict[str, Any], region_name: str | None = None
) -> list[str]:
    """Upload using the native async aioboto3 client."""
    if not _AIOBOTO3_AVAILABLE or _aioboto3 is None:
        raise RuntimeError("aioboto3 not available")

    class_keys, params = prepare_class_payloads(data)

    session = _aioboto3.Session()
    async with session.client("ssm", region_name=region_name) as client:
        for name, value, secure in params:
            await client.put_parameter(
                Name=name,
                Value=value,
                Type="SecureString" if secure else "String",
                Overwrite=True,
            )

    return class_keys


async def upload_locations_to_ssm_auto(
    data: dict[str, Any], region_name: str | None = None
) -> list[str]:
    """Upload with aioboto3 when it is installed, otherwise use the AWS CLI."""
    if _AIOBOTO3_AVAILABLE:
        return await upload_locations_to_ssm_aioboto3(data, region_name)
    return await upload_locations_to_ssm(data)
