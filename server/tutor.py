import re

from .chapters import meaningful_text
from .models import ChatRequest, ChatResponse, ChapterDetail, Citation, Diagram


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


def illustrative_diagram(slide, message):
    source = f"{meaningful_text(slide.text)}\n{slide.notes}".lower()
    if not any(word in message.lower() for word in ("diagram", "visual", "flow", "\u56fe")):
        return None
    if "heartbeat" in source and any(
        word in source for word in ("failure", "fault", "nonresponsive")
    ):
        return Diagram.model_validate({
            "title": "\u6559\u5b66\u793a\u610f\uff1a\u5fc3\u8df3\u76d1\u6d4b\uff08\u975e\u539f\u7a3f\u91cd\u7ed8\uff09",
            "nodes": [{"id": "service", "label": "\u88ab\u76d1\u6d4b\u8fdb\u7a0b"},
                      {"id": "monitor", "label": "\u5fc3\u8df3\u76d1\u6d4b\u5668"},
                      {"id": "alert", "label": "\u7591\u4f3c\u6545\u969c"}],
            "edges": [{"source": "service", "target": "monitor", "label": "\u5468\u671f\u6027\u5fc3\u8df3"},
                      {"source": "monitor", "target": "alert", "label": "\u672a\u6309\u65f6\u6536\u5230\u5fc3\u8df3"}],
        })
    return None


def offline_answer(chapter: ChapterDetail, request: ChatRequest):
    message = request.message.lower().strip()
    slide = chapter.slides[request.slide - 1]
    prefix = "\u79bb\u7ebf\u8bfe\u4ef6\u5bfc\u8bfb\uff08\u975e AI \u751f\u6210\u89e3\u8bf4\uff09\u3002\n\n"
    if message in {"next", "next slide", "continue", "\u4e0b\u4e00\u9875",
                   "\u7ee7\u7eed", "\u7ee7\u7eed\u5b66\u4e60"}:
        slide = chapter.slides[min(request.slide, chapter.slideCount - 1)]
        ending = "\u5df2\u5230\u672c\u7ae0\u6700\u540e\u4e00\u9875\u3002\n\n" if request.slide == chapter.slideCount else ""
        content = ending + f"\u7b2c {slide.number} \u9875\uff1a{slide.title}\n\n" + excerpt(slide)
    elif any(word in message for word in (
        "quiz", "test me", "\u6d4b\u9a8c", "\u8003\u8003", "\u81ea\u6d4b", "\u51fa\u4e00\u9053\u9898",
    )):
        content = (
            f"\u7b2c {slide.number} \u9875\u81ea\u6d4b\uff1a{slide.title}\n"
            "\u8bf7\u7528\u81ea\u5df1\u7684\u8bdd\u6982\u62ec\u672c\u9875\u7684\u4e3b\u8981\u89c2\u70b9\uff0c"
            "\u5e76\u6307\u51fa\u652f\u6301\u5b83\u7684\u539f\u6587\u4f9d\u636e\uff1f\n\n"
            "\u8bf7\u5bf9\u7167\u4e0b\u65b9\u539f\u6587\u81ea\u67e5\uff1b"
            "\u79bb\u7ebf\u6a21\u5f0f\u4e0d\u81ea\u52a8\u8bc4\u5206\u3002\n\n"
            + excerpt(slide)
        )
    elif message in {"diagram", "draw a diagram", "\u753b\u56fe", "\u753b\u4e2a\u67b6\u6784\u56fe"}:
        diagram = illustrative_diagram(slide, message)
        content = (
            ("\u4ee5\u4e0b\u662f\u57fa\u4e8e\u672c\u9875\u5185\u5bb9\u7684\u6559\u5b66\u793a\u610f\uff0c"
             "\u4e0d\u662f\u539f\u7a3f\u91cd\u7ed8\u3002\n\n" if diagram else
             "\u672c\u9875\u53ef\u7528\u4fe1\u606f\u4e0d\u8db3\u4ee5\u751f\u6210\u53ef\u9760\u56fe\u89e3\uff0c"
             "\u8bf7\u67e5\u770b\u539f\u7a3f\u6216\u8865\u5145\u7ec4\u4ef6\u5173\u7cfb\u3002\n\n")
            + excerpt(slide)
        )
    elif message in {"guide", "start", "overview", "explain", "explain this slide",
                     "\u5bfc\u8bfb", "\u5f00\u59cb", "\u8bb2\u89e3", "\u8bb2\u89e3\u672c\u9875"}:
        content = (f"\u7b2c {slide.number} \u9875\uff1a{slide.title}\n\n" + excerpt(slide)
                   + "\n\n\u5b66\u4e60\u63d0\u793a\uff1a\u7528\u81ea\u5df1\u7684\u8bdd\u590d\u8ff0\u539f\u6587\uff0c"
                   "\u5e76\u63d0\u51fa\u4e00\u4e2a\u9700\u5728\u540e\u7eed\u8bfe\u4ef6\u4e2d\u6838\u5b9e\u7684\u95ee\u9898\u3002")
    else:
        matches = relevant_slides(chapter, message)
        if not matches:
            return ChatResponse(
                content=prefix + "\u672a\u5728\u672c\u7ae0\u53ef\u63d0\u53d6\u6587\u5b57\u4e2d\u627e\u5230\u5339\u914d\u5173\u952e\u8bcd\u3002"
                "\u8fd9\u662f\u5b57\u9762\u68c0\u7d22\uff0c\u4e0d\u662f\u8bed\u4e49\u7406\u89e3\u3002"
                "\u8bf7\u4f7f\u7528\u8bfe\u4ef6\u4e2d\u7684\u8bcd\u8bed\uff0c\u6216\u8f93\u5165\u5bfc\u8bfb\u3001\u4e0b\u4e00\u9875\u3001\u81ea\u6d4b\u3002",
                slide=slide.number, citations=[], mode="offline",
            )
        slide = matches[0]
        content = "\u5173\u952e\u8bcd\u5339\u914d\u539f\u6587\uff08\u975e\u751f\u6210\u7b54\u6848\uff09\uff1a\n\n" + excerpt(slide)
    return ChatResponse(
        content=prefix + content, slide=slide.number,
        citations=[Citation(slide=slide.number, title=slide.title)],
        diagram=illustrative_diagram(slide, message), mode="offline",
    )
