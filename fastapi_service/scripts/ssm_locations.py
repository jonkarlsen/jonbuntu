#!/usr/bin/env python3
"""Read or upload the split class parameters stored in AWS SSM.

SSM layout used by the web editor and this script:

  class_<key>   SecureString: base64(gzip(json.dumps(class_data)))
  current_class String:       comma-separated class keys, e.g. "A,B,C"
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import gzip
import json
import os
import sys
from typing import Any, cast

import aioboto3

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.locations_ssm import (  # noqa: E402
    prepare_class_payloads,
    upload_locations_to_ssm_auto,
)
from src.locations_utils import read_locations_file  # noqa: E402

CLASS_PREFIX = "class_"
CURRENT_CLASS_PARAM = "current_class"


async def get_parameter(client: Any, name: str) -> str | None:
    try:
        response = await client.get_parameter(Name=name, WithDecryption=True)
    except client.exceptions.ParameterNotFound:
        return None
    return cast(str, response["Parameter"]["Value"])


async def list_class_parameters(client: Any) -> list[str]:
    response = await client.describe_parameters(
        ParameterFilters=[
            {"Key": "Name", "Option": "BeginsWith", "Values": [CLASS_PREFIX]}
        ]
    )
    names = [item["Name"] for item in response.get("Parameters", [])]
    return sorted(name[len(CLASS_PREFIX) :] for name in names)


def decode_class(value: str) -> dict[str, Any]:
    raw = gzip.decompress(base64.b64decode(value))
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("decoded class payload is not a JSON object")
    return data


async def run_get(args: argparse.Namespace) -> int:
    session = aioboto3.Session()
    async with session.client("ssm", region_name=args.region) as client:
        if args.class_key:
            name = f"{CLASS_PREFIX}{args.class_key}"
            value = await get_parameter(client, name)
            if value is None:
                print(f"No SSM parameter named {name!r}.", file=sys.stderr)
                available = await list_class_parameters(client)
                if available:
                    print(
                        "Available classes: " + ", ".join(available),
                        file=sys.stderr,
                    )
                return 1
            try:
                data = decode_class(value)
            except (OSError, ValueError) as exc:
                print(f"Could not decode {name!r}: {exc}", file=sys.stderr)
                return 1
            print(json.dumps(data, ensure_ascii=False, indent=2))
            return 0

        current = await get_parameter(client, CURRENT_CLASS_PARAM)
        if current is None:
            print(
                f"{CURRENT_CLASS_PARAM!r} not found; "
                "listing class_* parameters instead.",
                file=sys.stderr,
            )
            class_keys = await list_class_parameters(client)
        else:
            print(f"{CURRENT_CLASS_PARAM} = {current}")
            class_keys = [key.strip() for key in current.split(",") if key.strip()]

        if not class_keys:
            print("No classes found in SSM.", file=sys.stderr)
            return 1

        word = "class" if len(class_keys) == 1 else "classes"
        print(f"{len(class_keys)} {word}: {', '.join(class_keys)}")
        return 0


async def run_upload(args: argparse.Namespace) -> int:
    data = read_locations_file(args.path)

    if args.dry_run:
        class_keys, params = prepare_class_payloads(data)
        for name, _value, secure in params:
            kind = "SecureString" if secure else "String"
            if name.startswith(CLASS_PREFIX):
                class_key = name[len(CLASS_PREFIX) :]
                class_data = data[class_key]
                z_index = class_data.get("zIndex", 0)
                student_count = len(class_data.get("students", []))
                print(f"{name} ({kind}) zIndex={z_index} students={student_count}")
            else:
                print(f"{name} ({kind})")
        word = "class" if len(class_keys) == 1 else "classes"
        print(f"Would upload {len(class_keys)} {word}: {', '.join(class_keys)}")
        return 0

    class_keys = await upload_locations_to_ssm_auto(data, region_name=args.region)
    word = "class" if len(class_keys) == 1 else "classes"
    print(f"Uploaded {len(class_keys)} {word}: {', '.join(class_keys)}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    get_parser = subparsers.add_parser(
        "get", help="Show current_class, or print/ungzip one class"
    )
    get_parser.add_argument("class_key", nargs="?", help="Class key to fetch, e.g. A")
    get_parser.add_argument("--region", default=None, help="AWS region")

    upload_parser = subparsers.add_parser(
        "upload", help="Upload a locations.json file as split SSM parameters"
    )
    upload_parser.add_argument(
        "path", nargs="?", default="locations.json", help="Path to locations.json"
    )
    upload_parser.add_argument(
        "--dry-run", action="store_true", help="Print what would be uploaded"
    )
    upload_parser.add_argument("--region", default=None, help="AWS region")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "get":
            return asyncio.run(run_get(args))
        return asyncio.run(run_upload(args))
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
