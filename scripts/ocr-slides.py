"""Generate OCR text for slide images that have little or no extractable text.

Usage:
  python scripts/ocr-slides.py                 # sparse pages only
  python scripts/ocr-slides.py --chapter 5     # one chapter
  python scripts/ocr-slides.py --all           # every slide image
  python scripts/ocr-slides.py --overwrite     # replace existing OCR files

Install tooling first:
  .\\.venv\\Scripts\\python -m pip install -r requirements-ocr.txt

Output: data/ocr/{chapterId}/{page}.txt (ignored by Git).
The application only reads these text files; OCR packages are not runtime dependencies.
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from server.chapters import ChapterStore, meaningful_text


def is_sparse(slide) -> bool:
    body = meaningful_text(slide.text)
    if body == slide.title.strip():
        body = ""
    return len(body) < 20 and not slide.notes.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate OCR text for slide images.")
    parser.add_argument("--chapter", type=int, help="Only process this chapter number.")
    parser.add_argument("--all", action="store_true", help="Process text-rich pages too.")
    parser.add_argument("--overwrite", action="store_true", help="Replace existing OCR files.")
    args = parser.parse_args()

    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError:
        print("Missing rapidocr_onnxruntime.")
        print(r"Run: .\.venv\Scripts\python -m pip install -r requirements-ocr.txt")
        return 2

    store = ChapterStore(ROOT / "book", ROOT / "data" / "slides")
    output_root = ROOT / "data" / "ocr"
    engine = RapidOCR()
    processed = skipped = missing = empty = failed = 0
    chapter_id = f"chapter-{args.chapter}" if args.chapter is not None else None

    if chapter_id and chapter_id not in store.files():
        print(f"Unknown chapter: {chapter_id}")
        return 2

    for item in store.list():
        if chapter_id and item.id != chapter_id:
            continue
        chapter = store.read(item.id)
        for slide in chapter.slides:
            if not args.all and not is_sparse(slide):
                continue
            image = store.image(chapter.id, slide.number)
            if image is None:
                missing += 1
                print(f"skip {chapter.id}/{slide.number}: image missing")
                continue
            target = output_root / chapter.id / f"{slide.number}.txt"
            if target.exists() and not args.overwrite:
                skipped += 1
                continue
            try:
                result, _ = engine(str(image))
            except Exception as exc:
                failed += 1
                print(f"fail {chapter.id}/{slide.number}: {type(exc).__name__}: {exc}")
                continue
            lines = []
            for row in result or []:
                if len(row) < 3:
                    continue
                text = str(row[1]).strip()
                if text:
                    lines.append(text)
            text = "\n".join(lines).strip()
            if not text:
                empty += 1
                print(f"empty {chapter.id}/{slide.number}")
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text + "\n", encoding="utf-8")
            processed += 1
            print(f"ok {chapter.id}/{slide.number}: {len(lines)} lines, {len(text)} chars")

    print(
        "done: processed=%d skipped=%d missing_images=%d empty=%d failed=%d"
        % (processed, skipped, missing, empty, failed)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
