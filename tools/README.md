# PDF Rebuild Tools

This folder contains helpers to rebuild the HTML page mapping from the PDF.

## Setup

```powershell
C:/Users/combe/AppData/Local/Programs/Python/Python313/python.exe -m pip install -r requirements.txt
```

## Rebuild page mapping

```powershell
C:/Users/combe/AppData/Local/Programs/Python/Python313/python.exe rebuild_from_pdf.py
```

Outputs:
- Updates public/page-content.js
- Updates public/pages-index.js
- Updates public/songs-index.js
- Updates public/sections.json
- Writes tools/rebuild-report.json
- Writes extracted PDF images to public/pdf-pages/
