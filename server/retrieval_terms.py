"""Small bilingual course vocabulary shared by search and tutor retrieval."""

import re

SYNONYM_GROUPS = (
    ("heartbeat", "心跳"),
    ("availability", "可用性"),
    ("interoperability", "互操作性"),
    ("modifiability", "可修改性"),
    ("performance", "性能"),
    ("security", "安全性"),
    ("reliability", "可靠性"),
    ("tactic", "tactics", "战术"),
    ("scenario", "scenarios", "场景"),
    ("fault", "faults", "故障"),
    ("redundancy", "冗余"),
    ("recovery", "recover", "恢复"),
)
ENGLISH = re.compile(r"[a-z0-9]{2,}")
CJK_RUN = re.compile(r"[一-鿿]+")
STOPWORDS = {
    "the", "and", "for", "with", "what", "how", "why", "this", "that",
    "from", "are", "was", "were", "is", "of", "to", "in", "on", "a", "an",
    "explain", "please", "slide",
}
CJK_STOPWORDS = {
    "和", "与", "及", "或", "以及", "或者", "关于", "的", "了", "呢", "吗", "吧", "啊",
}
_LOOKUP = {term: group for group in SYNONYM_GROUPS for term in group}


def expand_terms(terms):
    """Canonical group order makes bilingual and repeated queries equivalent."""
    expanded = []
    for term in terms:
        normalized = term.lower().strip()
        if normalized:
            expanded.extend(_LOOKUP.get(normalized, (normalized,)))
    return list(dict.fromkeys(expanded))


def query_terms(query: str):
    lowered = query.lower().strip()
    terms = [word for word in ENGLISH.findall(lowered) if word not in STOPWORDS]
    for run in CJK_RUN.findall(lowered):
        # Consume known phrases before bigrams: 可修改性 must not add unrelated
        # 修改 / 改性 fragments that its English equivalent does not contain.
        remainder = run
        for alias in sorted((term for term in _LOOKUP if not term.isascii()),
                            key=len, reverse=True):
            if alias in remainder:
                terms.append(alias)
                remainder = remainder.replace(alias, " ")
        for fragment in remainder.split():
            # Drop single-character leftovers from alias consumption, while
            # keeping explicit single-character runs such as 图 searchable.
            # Match stopwords as whole fragments so 和谐 / 的确 stay intact.
            if fragment in CJK_STOPWORDS or (remainder != run and len(fragment) < 2):
                continue
            terms.append(fragment)
            terms.extend(fragment[index:index + 2] for index in range(len(fragment) - 1))
    return expand_terms(terms)


def term_matches(term: str, source: str):
    pattern = re.escape(term)
    if ENGLISH.fullmatch(term):
        pattern = r"(?<![a-z0-9_])" + pattern + r"(?![a-z0-9_])"
    return re.finditer(pattern, source, re.IGNORECASE)


def term_count(term: str, source: str, cap: int = 3):
    count = 0
    for _ in term_matches(term, source):
        count += 1
        if count >= cap:
            break
    return count
