"""Uploads and deletes lifelog images in a private Cloudflare R2 bucket.

R2 is accessed through its S3-compatible API via boto3. The bucket is
private: this module never generates or relies on public URLs.
"""
from __future__ import annotations

import re
from datetime import datetime

import boto3
from botocore.config import Config as BotoConfig

from app.config import Config

SUPPORTED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}

_UNSAFE_CHARS_RE = re.compile(r"[^A-Za-z0-9._-]+")
_DEFAULT_FILENAME = "file"


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
