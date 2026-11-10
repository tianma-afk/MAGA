import pytest

from server.models import ChapterDetail, Slide
from server.retrieval_terms import query_terms
from server.search import search_all
from server.tutor import relevant_slides


@pytest.mark.parametrize(("query", "clean"), [
    ("心跳和故障", "心跳 故障"),
    ("可用性和性能", "可用性 性能"),
    ("的性能", "性能"),
    ("心跳图", "心跳"),
    ("图心跳", "心跳"),
    ("心跳以及故障", "心跳 故障"),
    ("心跳或者故障", "心跳 故障"),
])
def test_alias_consumption_does_not_leave_noise_terms(query, clean):
    assert query_terms(query) == query_terms(clean)


@pytest.mark.parametrize("word", [
    "和", "与", "及", "或", "以及", "或者", "关于", "的", "了", "呢", "吗", "吧", "啊",
])
def test_explicit_connectives_and_particles_are_not_query_terms(word):
    assert query_terms(word) == []


def test_connected_question_keeps_unknown_content_words():
    terms = query_terms("关于心跳的原理")
    assert "heartbeat" in terms
    assert "心跳" in terms
    assert "原理" in terms
    assert "关于" not in terms
    assert "的" not in terms
    assert len(terms) == len(set(terms))


@pytest.mark.parametrize("word", ["和谐", "的确", "关于性", "未知词", "原理", "图算法"])
def test_unknown_multicharacter_words_are_not_damaged_by_stopwords(word):
    expected = [word] + [word[index:index + 2] for index in range(len(word) - 1)]
    assert query_terms(word) == list(dict.fromkeys(expected))
    terms = query_terms("心跳" + word)
    assert word in terms
    assert all(term in terms for term in expected)


def test_explicit_single_character_query_keeps_existing_behavior():
    assert query_terms("图") == ["图"]


def test_noise_filter_keeps_english_boundaries_and_synonym_deduplication():
    expected = query_terms("heartbeat fault")
    assert query_terms("HEARTBEAT 心跳和故障 faults heartbeat") == expected
    assert query_terms("default preheartbeat") == ["default", "preheartbeat"]
    assert len(expected) == len(set(expected))


@pytest.fixture
def noise_store():
    chapter = ChapterDetail(
        id="noise", title="Fixture", filename="fixture.pptx", slideCount=3,
        slides=[
            Slide(number=1, title="Target", text="heartbeat fault availability performance 原理",
                  notes=""),
            Slide(number=2, title="和", text="与 及 或 以及 或者", notes="的 了",
                  ocrText="呢 吗 吧 啊 关于"),
            Slide(number=3, title="关于", text="的", notes="和", ocrText="以及 或者"),
        ],
    )

    class Store:
        def files(self):
            return {chapter.id: None}

        def read(self, chapter_id):
            assert chapter_id == chapter.id
            return chapter

    return Store()


@pytest.mark.parametrize("query", [
    "心跳和故障", "可用性和性能", "关于心跳的原理", "的性能",
])
def test_search_and_tutor_do_not_retrieve_connective_only_pages(noise_store, query):
    assert [result.slide for result in search_all(noise_store, query).results] == [1]
    chapter = noise_store.read("noise")
    assert [slide.number for slide in relevant_slides(chapter, query)] == [1]


@pytest.mark.parametrize("query", ["和", "的", "关于", "以及 或者 呢 吗"])
def test_connective_only_query_has_no_search_or_tutor_results(noise_store, query):
    assert search_all(noise_store, query).results == []
    assert relevant_slides(noise_store.read("noise"), query) == []
