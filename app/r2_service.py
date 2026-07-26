"""Uploads and deletes lifelog images in a private Cloudflare R2 bucket.

R2 is accessed through its S3-compatible API via boto3. The bucket is
private: this module never generates or relies on public URLs.
"""
from __future__ import annotations

import re
from datetime import datetime

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from app.config import Config

SUPPORTED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}

_UNSAFE_CHARS_RE = re.compile(r"[^A-Za-z0-9._-]+")
_DEFAULT_FILENAME = "file"

OBJECT_KEY_PREFIX = "images/"
# Cloudflare R2's Standard storage free allowance.
FREE_TIER_BYTES = 10 * 1024**3
# images/YYYY/MM/DD/<message-id>-<filename>
_OBJECT_KEY_RE = re.compile(r"^images/\d{4}/\d{2}/\d{2}/[A-Za-z0-9._-]+$")


def sanitize_filename(filename: str) -> str:
    """Strip directory components and any character that isn't a safe
    filename character, to prevent path traversal into arbitrary R2 keys.
    """
    name = filename.replace("\\", "/").split("/")[-1]
    name = _UNSAFE_CHARS_RE.sub("_", name)
    name = name.lstrip(".")
    return name or _DEFAULT_FILENAME


def build_object_key(dt: datetime, message_id: int, filename: str) -> str:
    """images/YYYY/MM/DD/<message-id>-<safe-filename>"""
    safe_name = sanitize_filename(filename)
    return f"images/{dt:%Y}/{dt:%m}/{dt:%d}/{message_id}-{safe_name}"


def format_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    value = float(size)
    for unit in ("KB", "MB", "GB"):
        value /= 1024
        if value < 1024 or unit == "GB":
            return f"{value:.1f} {unit}"
    return f"{value:.1f} GB"


def describe_usage(object_count: int, total_bytes: int) -> str:
    """`123件 / 456.7 MB（無料枠10GBの4.5%）` for notifications."""
    percentage = total_bytes / FREE_TIER_BYTES * 100
    return (
        f"{object_count}件 / {format_bytes(total_bytes)}"
        f"（無料枠{format_bytes(FREE_TIER_BYTES)}の{percentage:.1f}%）"
    )


def validate_object_key(key: str) -> str | None:
    """Return an error message if `key` is not a well-formed lifelog image
    key, or None when it is safe to use.

    Restricting to the exact `images/YYYY/MM/DD/<name>` shape keeps a
    crafted argument from reaching unrelated objects in the bucket.
    """
    key = key.strip()
    if not key:
        return "R2キーが空です。"
    if not key.startswith(OBJECT_KEY_PREFIX):
        return f"R2キーは `{OBJECT_KEY_PREFIX}` で始まる必要があります。"
    if ".." in key:
        return "R2キーに `..` は使用できません。"
    if not _OBJECT_KEY_RE.match(key):
        return (
            "R2キーの形式が正しくありません。"
            "`images/YYYY/MM/DD/<メッセージID>-<ファイル名>` の形式で指定してください。"
        )
    return None


class R2Service:
    def __init__(self, config: Config):
        self._bucket = config.r2_bucket_name
        self._client = boto3.client(
            "s3",
            endpoint_url=config.r2_endpoint_url,
            aws_access_key_id=config.r2_access_key_id,
            aws_secret_access_key=config.r2_secret_access_key,
            region_name="auto",
            config=BotoConfig(signature_version="s3v4"),
        )

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> None:
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    def delete_objects(self, keys: list[str]) -> None:
        if not keys:
            return
        self._client.delete_objects(
            Bucket=self._bucket,
            Delete={"Objects": [{"Key": key} for key in keys]},
        )

    def object_exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return False
            raise
        return True

    def calculate_usage(self) -> tuple[int, int]:
        """(object count, total bytes) for the whole bucket.

        R2 exposes no size metric through the S3 API, so this walks the
        object listing. Paginated because a single response caps at 1000.
        """
        count = 0
        total = 0
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket):
            for item in page.get("Contents", []):
                count += 1
                total += item["Size"]
        return count, total

    def generate_presigned_url(self, key: str, expires_in: int) -> str:
        """Issue a temporary read URL for a private object.

        The returned URL is a credential: never log it, and only hand it
        back to the requesting user.
        """
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires_in,
        )
