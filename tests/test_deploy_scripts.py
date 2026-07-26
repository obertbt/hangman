from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
POWERSHELL_SCRIPTS = sorted(REPO_ROOT.glob("deploy/*.ps1"))


def test_powershell_scripts_exist():
    assert POWERSHELL_SCRIPTS, "deploy/*.ps1 が見つかりません"


@pytest.mark.parametrize("script", POWERSHELL_SCRIPTS, ids=lambda p: p.name)
def test_powershell_scripts_are_ascii_only(script):
    """Windows PowerShell 5.1 reads BOM-less .ps1 files as the system ANSI
    codepage, so non-ASCII characters become parse errors on Japanese
    Windows. Keeping these scripts ASCII-only avoids depending on a BOM
    surviving Git and editors.
    """
    data = script.read_bytes()
    offenders = [(index, byte) for index, byte in enumerate(data) if byte > 127]
    assert not offenders, (
        f"{script.name} に非ASCII文字が含まれています（位置: {offenders[0][0]}）。"
        "PowerShell 5.1で構文エラーになるため、ASCIIのみで記述してください。"
    )
