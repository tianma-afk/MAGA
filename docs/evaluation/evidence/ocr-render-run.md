# Page images and OCR run (2026-11-27, Asia/Shanghai)

## 1. Page images

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File scripts/render-slides.ps1
```

Result:

```
Rendered 340 original slide images.
```

- Location: `data/slides/chapter-N/<page>.png`
- Size: 1600×1200, 7 chapters, 340 pages, ~68 MB
- Git: ignored (`data/` is not committed)
- Requirement: Windows desktop PowerPoint; no PowerPoint process may be open.

## 2. OCR

The project venv runs Python 3.14, while `rapidocr_onnxruntime` requires
Python < 3.13. A separate Python 3.12 venv was created under
`data/evaluation/ocr-venv` (gitignored) and used only for OCR.

```bash
data/evaluation/ocr-venv/Scripts/python.exe -m pip install -r requirements.txt -r requirements-ocr.txt
data/evaluation/ocr-venv/Scripts/python.exe scripts/ocr-slides.py
```

The script's default policy is **sparse pages only** (body < 20 chars and no
notes). It processed all 82 such pages; it did not OCR text-rich pages.

- Location: `data/ocr/chapter-N/<page>.txt`
- Count: **82 files**
- Git: ignored
- OCR extracts text only; it does not understand layout, arrows, or diagrams.

## 3. Hybrid index refresh

The OCR text is part of the slide digest, so the hybrid index was rebuilt:

```bash
HTTPS_PROXY=http://127.0.0.1:7890 python -m server.retrieval_index
{'total': 340, 'updated': 82, 'deleted': 0}
```

Only the 82 OCR-affected pages were re-embedded; the other 258 vectors were
reused. Jina was reached through the local system proxy.

## 4. What this changes

- The slide viewer can now show the **original PNG**; pages with OCR also show
  an "含 OCR 文本" label and a collapsible OCR block.
- Global search, chat, quiz, and the hybrid index now include OCR text for the
  82 sparse pages.
- The evaluation report compares the no-OCR run (2026-11-26) with the OCR run
  (2026-11-27); see `results/ocr-effect.json`.
- OCR can be wrong; the app labels it as machine-recognized text, not as
  authoritative course content.
