from app.diary import entry_bodies, parse_daily_markdown

MARKDOWN = """## 09:00

朝ランを5km走った

- Discord投稿者: tomoya
- DiscordユーザーID: 999
- DiscordメッセージID: 1
- Discord投稿日時: 2026-07-26T09:00:00+09:00

## 21:35

夕方に買い物へ行った
牛乳と卵を買った

- Discord投稿者: tomoya
- DiscordユーザーID: 999
- DiscordメッセージID: 2
- Discord投稿日時: 2026-07-26T21:35:00+09:00
- 添付ファイル:
  - `images/2026/07/26/2-photo.jpg`
  - `images/2026/07/26/2-second.png`
"""


def test_parse_returns_one_entry_per_heading():
    entries = parse_daily_markdown(MARKDOWN)
    assert [e.time_str for e in entries] == ["09:00", "21:35"]


def test_parse_keeps_multiline_body_without_metadata():
    entries = parse_daily_markdown(MARKDOWN)
    assert entries[0].body == "朝ランを5km走った"
    assert entries[1].body == "夕方に買い物へ行った\n牛乳と卵を買った"
    assert "Discord投稿者" not in entries[1].body


def test_parse_collects_image_keys():
    entries = parse_daily_markdown(MARKDOWN)
    assert entries[0].image_keys == []
    assert entries[1].image_keys == [
        "images/2026/07/26/2-photo.jpg",
        "images/2026/07/26/2-second.png",
    ]


def test_parse_reads_author():
    assert parse_daily_markdown(MARKDOWN)[0].author == "tomoya"


def test_parse_keeps_image_only_entry_with_empty_body():
    markdown = (
        "## 10:00\n\n- Discord投稿者: tomoya\n- 添付ファイル:\n  - `images/2026/07/26/9-a.png`\n"
    )
    entries = parse_daily_markdown(markdown)
    assert len(entries) == 1
    assert entries[0].body == ""
    assert entries[0].image_keys == ["images/2026/07/26/9-a.png"]


def test_parse_ignores_text_before_first_heading():
    assert parse_daily_markdown("前書き\n\n## 09:00\n\n本文\n")[0].body == "本文"


def test_parse_handles_empty_input():
    assert parse_daily_markdown("") == []


def test_entry_bodies_drops_entries_without_text():
    markdown = MARKDOWN + "\n## 23:00\n\n- Discord投稿者: tomoya\n"
    assert entry_bodies(markdown) == [
        "朝ランを5km走った",
        "夕方に買い物へ行った\n牛乳と卵を買った",
    ]


def test_body_list_markers_are_not_mistaken_for_metadata():
    markdown = "## 09:00\n\n買い物:\n- 牛乳\n- 卵\n\n- Discord投稿者: tomoya\n"
    assert parse_daily_markdown(markdown)[0].body == "買い物:\n- 牛乳\n- 卵"
