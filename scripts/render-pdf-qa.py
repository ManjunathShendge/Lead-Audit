from pathlib import Path
import sys
sys.path.insert(0,str(Path('.qa-python').resolve()))
import pymupdf as fitz
out=Path('artifacts/pdf');out.mkdir(parents=True,exist_ok=True)
for tier in ['average','strong','weak']:
 doc=fitz.open(f'output/pdf/tier2-{tier}-sample.pdf')
 print(tier, 'pages:',len(doc))
 for i,page in enumerate(doc):
  text=page.get_text()
  assert 'TIER2 DIGITAL' in text, f'Missing branding page {i+1}'
  assert len(text)>120, f'Nearly blank page {i+1}'
  page.get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(out/f'{tier}-{i+1}.png')
  print(i+1, 'text chars:',len(text), 'size:',page.rect)
