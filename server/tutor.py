import re

from .chapters import meaningful_text
from .models import ChapterDetail


def relevant_slides(chapter: ChapterDetail, message: str):
    tokens = set(re.findall(r"[a-z0-9]{3,}|[\u4e00-\u9fff]{2,}", message.lower()))
    tokens -= {"the", "this", "that", "what", "how", "explain", "please", "slide"}
    ranked = []
    for slide in chapter.slides:
        source = f"{slide.title}\n{meaningful_text(slide.text)}\n{slide.notes}".lower()
        score = sum(len(token) for token in tokens if token in source)
        if score:
            ranked.append((score, slide.number, slide))
    return [item[2] for item in sorted(ranked, key=lambda item: (-item[0], item[1]))[:4]]


def excerpt(slide):
    text = meaningful_text(slide.text)
    if not text or text == slide.title:
        text = (
            "\u672c\u9875\u53ef\u63d0\u53d6\u6587\u5b57\u4e0d\u8db3\uff0c"
            "\u56fe\u50cf\u5185\u5bb9\u5c1a\u672a\u89e3\u6790\u3002"
            "\u8bf7\u67e5\u770b\u539f\u7a3f\u56fe\u7247\u6216 PPT\uff0c"
            "\u4e0d\u80fd\u4ec5\u51ed\u6807\u9898\u63a8\u65ad\u56fe\u4e2d\u5185\u5bb9\u3002"
        )
    else:
        text = "\u8bfe\u4ef6\u539f\u6587\u8282\u9009\uff1a\n" + text[:5000]
    if slide.notes:
        text += "\n\n\u8bb2\u8005\u5907\u6ce8\uff1a\n" + slide.notes[:2500]
    return text
