import pytest

from app.search_index import (
    IndexedEntry,
    SearchIndex,
    build_snippet,
    entries_from_markdown,
    split_terms,
)

MARKDOWN = """## 09:00

朝ラン5km。気持ちよかった。

- Discord投稿者: tomoya
- DiscordユーザーID: 1
- DiscordメッセージID: 111
- タグ: #運動 #健康
- 天気: 晴れ 28.0℃

## 20:00

スーパーで買い物。

- Discord投稿者: tomoya
- DiscordユーザーID: 1
- DiscordメッセージID: 222
- タグ: #買い物
- 添付ファイル:
  - `images/2026/07/26/222-photo.png`
"""


@pytest.fixture
def index(tmp_path):
    index = SearchIndex(str(tmp_path / "search.db"))
    yield index
    index.close()


@pytest.fixture
def populated(index):
    index.index_markdown("2026-07-26", MARKDOWN)
    return index


def test_split_terms_splits_on_whitespace():
    assert split_terms("  ラン  買い物 ") == ["ラン", "買い物"]


def test_build_snippet_returns_short_bodies_unchanged():
    assert build_snippet("朝ラン5km", ["ラン"]) == "朝ラン5km"


def test_build_snippet_centres_on_the_match():
    body = "あ" * 200 + "ホッケー" + "い" * 200
    snippet = build_snippet(body, ["ホッケー"])
    assert "ホッケー" in snippet
    assert snippet.startswith("…")


def test_build_snippet_collapses_newlines():
    assert build_snippet("一行目\n二行目", ["一行目"]) == "一行目 二行目"


def test_entries_from_markdown_reads_tags_and_image_counts():
    entries = entries_from_markdown("2026-07-26", MARKDOWN)
    assert [e.time_str for e in entries] == ["09:00", "20:00"]
    assert entries[0].tags == ["運動", "健康"]
    assert entries[1].image_count == 1


def test_entries_from_markdown_does_not_store_r2_keys():
    """A leaked index file must not be able to address the private bucket."""
    entries = entries_from_markdown("2026-07-26", MARKDOWN)
    assert "images/" not in " ".join(entry.body for entry in entries)


def test_search_finds_a_substring(populated):
    hits = populated.search("ラン")
    assert [hit.time_str for hit in hits] == ["09:00"]


def test_search_matches_tags_as_well_as_text(populated):
    """「運動」 appears only as a tag, never in the entry text."""
    assert [hit.time_str for hit in populated.search("運動")] == ["09:00"]


def test_search_requires_every_term(populated):
    assert populated.search("ラン 買い物") == []


def test_search_filters_by_tag(populated):
    hits = populated.search("", tag="買い物")
    assert [hit.time_str for hit in hits] == ["20:00"]


def test_search_tag_filter_does_not_match_a_prefix(index):
    index.index_entry(IndexedEntry("2026-07-26", "09:00", "本文", tags=["買い物リスト"]))
    assert index.search("", tag="買い物") == []


def test_search_returns_nothing_without_criteria(populated):
    assert populated.search("") == []


def test_search_treats_wildcards_literally(index):
    index.index_entry(IndexedEntry("2026-07-26", "09:00", "電池が50%まで減った", message_id="1"))
    index.index_entry(IndexedEntry("2026-07-25", "09:00", "無関係な記録", message_id="2"))
    assert [hit.date_str for hit in index.search("50%")] == ["2026-07-26"]
    assert [hit.date_str for hit in index.search("_")] == []


def test_search_orders_newest_first(index):
    for day in ("2026-07-24", "2026-07-26", "2026-07-25"):
        index.index_entry(IndexedEntry(day, "09:00", "ホッケー練習", message_id=day))
    hits = index.search("ホッケー")
    assert [hit.date_str for hit in hits] == ["2026-07-26", "2026-07-25", "2026-07-24"]


def test_search_respects_the_limit(index):
    for minute in range(5):
        index.index_entry(
            IndexedEntry("2026-07-26", f"09:0{minute}", "ホッケー", message_id=str(minute))
        )
    assert len(index.search("ホッケー", limit=2)) == 2


def test_reindexing_a_day_does_not_duplicate_entries(populated):
    populated.index_markdown("2026-07-26", MARKDOWN)
    assert populated.count() == 2


def test_reindexing_a_day_drops_entries_that_no_longer_exist(populated):
    populated.index_markdown("2026-07-26", "## 09:00\n\n朝ラン5km\n")
    assert populated.count() == 1


def test_index_entry_replaces_the_same_message(index):
    index.index_entry(IndexedEntry("2026-07-26", "09:00", "書き間違い", message_id="111"))
    index.index_entry(IndexedEntry("2026-07-26", "09:00", "書き直し", message_id="111"))
    assert index.count() == 1
    assert index.search("書き直し")[0].body == "書き直し"


def test_rebuild_replaces_everything(populated):
    total = populated.rebuild([("2026-07-25", "## 08:00\n\n昨日の記録\n")])
    assert total == 1
    assert populated.count() == 1
    assert populated.search("ラン") == []


def test_tag_counts_are_ordered_by_use(index):
    index.index_entry(IndexedEntry("2026-07-26", "09:00", "a", tags=["運動"], message_id="1"))
    index.index_entry(IndexedEntry("2026-07-25", "09:00", "b", tags=["運動"], message_id="2"))
    index.index_entry(IndexedEntry("2026-07-24", "09:00", "c", tags=["食事"], message_id="3"))
    assert index.tag_counts() == [("運動", 2), ("食事", 1)]


def test_index_survives_reopening(tmp_path):
    path = str(tmp_path / "nested" / "search.db")
    first = SearchIndex(path)
    first.index_markdown("2026-07-26", MARKDOWN)
    first.close()

    second = SearchIndex(path)
    assert second.count() == 2
    second.close()


def test_set_tags_attaches_tags_after_the_fact(index):
    """Tagging runs after the entry is saved, so it lands as an update."""
    index.index_entry(IndexedEntry("2026-07-26", "09:00", "朝ラン5km", message_id="111"))

    assert index.set_tags("111", ["運動", "健康"]) is True

    hit = index.search("ラン")[0]
    assert hit.tags == ["運動", "健康"]


def test_set_tags_makes_the_entry_findable_by_tag(index):
    index.index_entry(IndexedEntry("2026-07-26", "09:00", "朝ラン5km", message_id="111"))
    index.set_tags("111", ["運動"])
    assert [hit.time_str for hit in index.search("", tag="運動")] == ["09:00"]


def test_set_tags_reports_an_unknown_message(index):
    assert index.set_tags("999", ["運動"]) is False
