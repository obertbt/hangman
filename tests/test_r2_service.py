from datetime import datetime
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

import pytest

from botocore.exceptions import ClientError

from app.r2_service import (
    R2Service,
    build_object_key,
    describe_usage,
    format_bytes,
    sanitize_filename,
    validate_object_key,
)

JST = ZoneInfo("Asia/Tokyo")


def test_sanitize_filename_removes_path_traversal():
    assert sanitize_filename("../../etc/passwd") == "passwd"
    assert sanitize_filename("..\\..\\windows\\win.ini") == "win.ini"


def test_sanitize_filename_removes_dangerous_symbols():
    assert sanitize_filename("photo;rm -rf.jpg") == "photo_rm_-rf.jpg"
    assert sanitize_filename("日本語 写真.jpg") == "_.jpg"


def test_sanitize_filename_falls_back_when_empty():
    assert sanitize_filename("...") == "file"
    assert sanitize_filename("") == "file"


def test_sanitize_filename_keeps_safe_names_untouched():
    assert sanitize_filename("photo-01_final.jpg") == "photo-01_final.jpg"


def test_build_object_key_format():
    dt = datetime(2026, 7, 19, 21, 35, tzinfo=JST)
    key = build_object_key(dt, 123456789, "photo.jpg")
    assert key == "images/2026/07/19/123456789-photo.jpg"


def test_build_object_key_sanitizes_filename():
    dt = datetime(2026, 7, 19, 21, 35, tzinfo=JST)
    key = build_object_key(dt, 123456789, "../evil/../name.png")
    assert key == "images/2026/07/19/123456789-name.png"


def _make_service():
    config = MagicMock()
    config.r2_bucket_name = "hearth-media"
    config.r2_endpoint_url = "https://account.r2.cloudflarestorage.com"
    config.r2_access_key_id = "key"
    config.r2_secret_access_key = "secret"
    with patch("app.r2_service.boto3.client") as mock_client:
        service = R2Service(config)
        return service, mock_client.return_value


def test_upload_bytes_calls_put_object():
    service, client = _make_service()
    service.upload_bytes("images/2026/07/19/123-photo.jpg", b"data", "image/jpeg")
    client.put_object.assert_called_once_with(
        Bucket="hearth-media",
        Key="images/2026/07/19/123-photo.jpg",
        Body=b"data",
        ContentType="image/jpeg",
    )


def test_delete_objects_calls_delete_objects():
    service, client = _make_service()
    service.delete_objects(["a.jpg", "b.jpg"])
    client.delete_objects.assert_called_once_with(
        Bucket="hearth-media",
        Delete={"Objects": [{"Key": "a.jpg"}, {"Key": "b.jpg"}]},
    )


def test_delete_objects_is_noop_for_empty_list():
    service, client = _make_service()
    service.delete_objects([])
    client.delete_objects.assert_not_called()


def test_validate_object_key_accepts_well_formed_key():
    assert validate_object_key("images/2026/07/26/123456789-photo.png") is None


def test_validate_object_key_rejects_empty():
    assert validate_object_key("   ") is not None


def test_validate_object_key_rejects_wrong_prefix():
    assert validate_object_key("secrets/2026/07/26/123-photo.png") is not None


def test_validate_object_key_rejects_path_traversal():
    assert validate_object_key("images/../../etc/passwd") is not None
    assert validate_object_key("images/2026/07/26/../../../x.png") is not None


def test_validate_object_key_rejects_malformed_date_segments():
    assert validate_object_key("images/2026/7/26/123-photo.png") is not None
    assert validate_object_key("images/2026/07/26/sub/dir/photo.png") is not None


def test_object_exists_returns_true_when_head_succeeds():
    service, client = _make_service()
    assert service.object_exists("images/2026/07/26/123-photo.png") is True
    client.head_object.assert_called_once_with(
        Bucket="hearth-media", Key="images/2026/07/26/123-photo.png"
    )


def test_object_exists_returns_false_on_404():
    service, client = _make_service()
    client.head_object.side_effect = ClientError(
        {"Error": {"Code": "404", "Message": "Not Found"}}, "HeadObject"
    )
    assert service.object_exists("images/2026/07/26/123-missing.png") is False


def test_object_exists_reraises_other_client_errors():
    service, client = _make_service()
    client.head_object.side_effect = ClientError(
        {"Error": {"Code": "AccessDenied", "Message": "Denied"}}, "HeadObject"
    )
    with pytest.raises(ClientError):
        service.object_exists("images/2026/07/26/123-photo.png")


def test_generate_presigned_url_passes_bucket_key_and_expiry():
    service, client = _make_service()
    client.generate_presigned_url.return_value = "https://signed.example/photo"
    url = service.generate_presigned_url("images/2026/07/26/123-photo.png", 300)
    assert url == "https://signed.example/photo"
    client.generate_presigned_url.assert_called_once_with(
        "get_object",
        Params={"Bucket": "hearth-media", "Key": "images/2026/07/26/123-photo.png"},
        ExpiresIn=300,
    )


def test_format_bytes_scales_units():
    assert format_bytes(512) == "512 B"
    assert format_bytes(2048) == "2.0 KB"
    assert format_bytes(5 * 1024**2) == "5.0 MB"
    assert format_bytes(3 * 1024**3) == "3.0 GB"


def test_format_bytes_keeps_huge_values_in_gb():
    assert format_bytes(2048 * 1024**3).endswith("GB")


def test_describe_usage_reports_free_tier_share():
    text = describe_usage(120, 1024**3)  # 1 GB of the 10 GB allowance
    assert "120件" in text
    assert "1.0 GB" in text
    assert "10.0%" in text


def test_calculate_usage_sums_across_pages():
    service, client = _make_service()
    paginator = MagicMock()
    paginator.paginate.return_value = [
        {"Contents": [{"Size": 100}, {"Size": 200}]},
        {"Contents": [{"Size": 300}]},
    ]
    client.get_paginator.return_value = paginator

    assert service.calculate_usage() == (3, 600)
    client.get_paginator.assert_called_once_with("list_objects_v2")


def test_calculate_usage_handles_empty_bucket():
    service, client = _make_service()
    paginator = MagicMock()
    paginator.paginate.return_value = [{}]
    client.get_paginator.return_value = paginator

    assert service.calculate_usage() == (0, 0)
