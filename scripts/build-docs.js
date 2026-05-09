#!/usr/bin/env node
/**
 * Genera (o rigenera) i file .docx di documentazione in docs/.
 * Richiede `npm install -g docx` (modulo `docx` di Dolan-Miu).
 *
 * Uso:
 *   npm run build:docs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const README_PATH = path.join(ROOT, 'README.md');

function loadDocxModule() {
  const candidates = [];
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'docx'));
  candidates.push('/usr/local/lib/node_modules/docx');
  candidates.push('/usr/lib/node_modules/docx');
  for (const p of candidates) {
    try { return require(p); } catch (e) {}
  }
  try { return require('docx'); } catch (e) {}
  console.error('ERR: modulo `docx` non trovato. Installa con: npm install -g docx');
  process.exit(1);
}

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  LevelFormat, ShadingType
} = loadDocxModule();

function buildGuida() {
  const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
  const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
  const P  = (t) => new Paragraph({ children: [new TextRun(t)] });
  const UL = (t) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(t)] });

  return new Document({
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 32, bold: true, color: '1f3864' },
          paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, color: '2e75b6' },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } }
      ]
    },
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      }]
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: [
        H1('Orario CdS — Guida tecnica'),
        P('Per la documentazione completa vedi README.md e i file detailed nel repository.'),
        H2('File in repo'),
        UL('src/ — codice Apps Script (.gs e .html)'),
        UL('config/local.json — ID specifici della tua installazione (gitignored)'),
        UL('scripts/ — utility setup, deploy, build-docs'),
        UL('package.json — npm scripts'),
        UL('README.md — istruzioni complete')
      ]
    }]
  });
}

(async () => {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const doc = buildGuida();
  const out = path.join(DOCS_DIR, 'Guida.docx');
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(out, buf);
  console.log('OK ' + out + ' (' + buf.length + ' bytes)');
})();
