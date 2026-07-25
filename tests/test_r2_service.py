from datetime import datetime
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

from app.r2_service import R2Service, build_object_key, sanitize_filename

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
