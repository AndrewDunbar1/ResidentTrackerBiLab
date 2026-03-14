import JSZip from 'jszip';
import type { ResidentComparison } from '@/types/resident';

type HeaderMap = {
  headerRow?: number; // row containing Categories/Mean/Minimum
  residentHeaderRow?: number; // row containing resident initials/names
  categoryCol?: string;
  meanCol?: string;
  minimumCol?: string;
  residentCols: Record<string, string>; // header text -> col letter
};

const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeCategory = (category: string) => {
  // Normalize aggressively so template labels (with/without section prefixes, punctuation, or "Old DC" codes)
  // match PDF-parsed categories reliably.
  let s = category
    .toLowerCase()
    .replace(/\([^)]*\)/g, '') // remove parentheticals like (Old DC1)
    .replace(/\bold\s*dc[\d+\-\s]*\b/gi, '') // remove old DC tokens if present
    .replace(/total\s*:\s*$/g, '')
    .replace(/:\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip section prefixes that appear in PDF output but not in BWH template row labels.
  // Keep "pediatric" because it disambiguates pediatric rows from adult spinal.
  s = s.replace(/^other\s*:\s*/g, '').replace(/^other\s+/g, '');
  s = s.replace(/^critical care\s*:\s*/g, '').replace(/^critical care\s+/g, '');

  // Normalize punctuation/slashes to spaces so "Thoracic/Lumbar/Sacral Instrumentation Fusion"
  // matches "Thoracic/Lumbar/Sacral/Instrumentation/Fusion" etc.
  s = s
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return s;
};

const nameKeyFirstLast = (name: string) => {
  const tokens = normalizeName(name).split(' ').filter(t => t.length > 1);
  if (tokens.length < 2) return '';
  return `${tokens[0]}|${tokens[tokens.length - 1]}`;
};

const initialsKey = (name: string) => {
  const tokens = normalizeName(name).split(' ').filter(Boolean);
  if (tokens.length === 0) return '';
  if (tokens.length === 1) return tokens[0].toUpperCase();
  return `${tokens[0][0]}${tokens[tokens.length - 1][0]}`.toUpperCase();
};

function colFromCellRef(cellRef: string): string {
  const m = cellRef.match(/^[A-Z]+/);
  return m ? m[0] : '';
}

function rowFromCellRef(cellRef: string): number {
  const m = cellRef.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

function colToNumber(col: string): number {
  // A=1, B=2, ..., Z=26, AA=27, etc.
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + (col.charCodeAt(i) - 64);
  }
  return n;
}

function compareCellRef(a: string, b: string): number {
  const ca = colToNumber(colFromCellRef(a));
  const cb = colToNumber(colFromCellRef(b));
  return ca - cb;
}

function isNumericString(v: string) {
  return /^-?\d+(\.\d+)?$/.test(v.trim());
}

function getSharedStrings(sstDoc: Document): string[] {
  const sis = Array.from(sstDoc.getElementsByTagName('si'));
  return sis.map(si => {
    const ts = Array.from(si.getElementsByTagName('t')).map(t => t.textContent ?? '');
    return ts.join('').replace(/\s+/g, ' ').trim();
  });
}

function getCellText(cellEl: Element, sharedStrings?: string[]): string {
  const t = cellEl.getAttribute('t') ?? '';
  if (t === 's' && sharedStrings) {
    const v = (cellEl.querySelector('v')?.textContent ?? '').trim();
    const idx = parseInt(v, 10);
    return Number.isFinite(idx) ? (sharedStrings[idx] ?? '').trim() : '';
  }
  if (t === 'inlineStr') {
    const tt = cellEl.querySelector('is t')?.textContent ?? '';
    return tt.trim();
  }

  const v = cellEl.querySelector('v');
  return (v?.textContent ?? '').trim();
}

function ensureV(cellEl: Element, doc: Document): Element {
  let v = cellEl.querySelector('v');
  if (!v) {
    const ns = doc.documentElement.namespaceURI ?? undefined;
    v = ns ? doc.createElementNS(ns, 'v') : doc.createElement('v');
    cellEl.appendChild(v);
  }
  return v;
}

function getOrCreateRow(sheetDoc: Document, rowNum: number): Element {
  const ns = sheetDoc.documentElement.namespaceURI ?? undefined;
  const sheetData = sheetDoc.getElementsByTagName('sheetData')[0];
  if (!sheetData) throw new Error('Invalid sheet XML: missing sheetData');

  const rows = Array.from(sheetData.getElementsByTagName('row'));
  let rowEl = rows.find(r => parseInt(r.getAttribute('r') ?? '0', 10) === rowNum);

  if (!rowEl) {
    rowEl = ns ? sheetDoc.createElementNS(ns, 'row') : sheetDoc.createElement('row');
    rowEl.setAttribute('r', String(rowNum));

    const insertBefore = rows.find(r => parseInt(r.getAttribute('r') ?? '0', 10) > rowNum) ?? null;
    sheetData.insertBefore(rowEl, insertBefore);
  }

  return rowEl;
}

function getOrCreateCell(sheetDoc: Document, cellIndex: Map<string, Element>, cellRef: string): Element {
  const existing = cellIndex.get(cellRef);
  if (existing) return existing;

  const ns = sheetDoc.documentElement.namespaceURI ?? undefined;
  const rowNum = rowFromCellRef(cellRef);
  const rowEl = getOrCreateRow(sheetDoc, rowNum);

  const newCell = ns ? sheetDoc.createElementNS(ns, 'c') : sheetDoc.createElement('c');
  newCell.setAttribute('r', cellRef);

  const cells = Array.from(rowEl.getElementsByTagName('c'));
  const insertBefore =
    cells.find(c => compareCellRef(c.getAttribute('r') ?? '', cellRef) > 0) ?? null;
  rowEl.insertBefore(newCell, insertBefore);

  cellIndex.set(cellRef, newCell);
  return newCell;
}

function setCellSharedString(cellEl: Element, doc: Document, sharedStringIndex: number) {
  // Prefer sharedStrings in templates to preserve Excel behavior/compat.
  cellEl.setAttribute('t', 's');
  const existingIs = cellEl.querySelector('is');
  if (existingIs) existingIs.remove();
  const v = ensureV(cellEl, doc);
  v.textContent = String(sharedStringIndex);
}

function setCellNumber(cellEl: Element, doc: Document, value: number) {
  cellEl.removeAttribute('t');
  const existingIs = cellEl.querySelector('is');
  if (existingIs) existingIs.remove();
  const v = ensureV(cellEl, doc);
  v.textContent = String(value);
}

function parseHeaderMap(sheetDoc: Document, sharedStrings?: string[]): HeaderMap {
  const map: HeaderMap = { residentCols: {} };
  const rows = Array.from(sheetDoc.getElementsByTagName('row'));

  // Find the row containing Categories/Mean/Minimum (BWH template uses "Categories")
  const header = rows
    .slice(0, 50)
    .map(r => {
      const rNum = parseInt(r.getAttribute('r') ?? '0', 10);
      const cells = Array.from(r.getElementsByTagName('c'));
      const texts = cells
        .map(c => getCellText(c, sharedStrings))
        .filter(Boolean)
        .map(t => t.toLowerCase());
      return { rNum, rowEl: r, texts };
    })
    .find(x => x.texts.some(t => t === 'categories' || t === 'category') && x.texts.includes('mean') && x.texts.includes('minimum'));

  if (!header) return map;
  map.headerRow = header.rNum;
  map.residentHeaderRow = header.rNum - 1;

  const cells = Array.from(header.rowEl.getElementsByTagName('c'));
  for (const c of cells) {
    const ref = c.getAttribute('r') ?? '';
    const col = colFromCellRef(ref);
    const text = getCellText(c, sharedStrings);
    const normalized = text.toLowerCase();

    if (normalized === 'categories' || normalized === 'category') map.categoryCol = col;
    else if (normalized === 'mean') map.meanCol = col;
    else if (normalized === 'minimum') map.minimumCol = col;
  }

  // Resident headers are on the row above, and include initials/names (skip "Program")
  const residentRow = rows.find(r => parseInt(r.getAttribute('r') ?? '0', 10) === map.residentHeaderRow);
  if (residentRow) {
    const rcells = Array.from(residentRow.getElementsByTagName('c'));
    for (const c of rcells) {
      const ref = c.getAttribute('r') ?? '';
      const col = colFromCellRef(ref);
      const text = getCellText(c, sharedStrings);
      if (!text) continue;
      if (text.toLowerCase() === 'program') continue;
      map.residentCols[text] = col;
    }
  }

  return map;
}

function buildCellIndex(sheetDoc: Document): Map<string, Element> {
  const map = new Map<string, Element>();
  const cells = Array.from(sheetDoc.getElementsByTagName('c'));
  for (const c of cells) {
    const r = c.getAttribute('r');
    if (r) map.set(r, c);
  }
  return map;
}

function findCategoryRows(sheetDoc: Document, categoryCol: string, sharedStrings?: string[]): Map<string, number> {
  const categoryToRow = new Map<string, number>();
  const cells = Array.from(sheetDoc.getElementsByTagName('c'));
  for (const c of cells) {
    const r = c.getAttribute('r') ?? '';
    if (!r.startsWith(categoryCol)) continue;
    const rowNum = rowFromCellRef(r);
    if (rowNum <= 1) continue; // skip header
    const category = getCellText(c, sharedStrings);
    if (!category) continue;
    categoryToRow.set(category, rowNum);
  }
  return categoryToRow;
}

function downloadArrayBuffer(arrayBuffer: ArrayBuffer, filename: string) {
  const blob = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadExcelTemplateFilledFromUploads(
  comparisons: ResidentComparison[],
  templateUrl = '/bwh-case-log-template.xlsx'
): Promise<void> {
  const res = await fetch(templateUrl);
  if (!res.ok) {
    throw new Error(`Failed to load template from ${templateUrl}`);
  }

  const templateBuf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(templateBuf);

  const workbookXml = await zip.file('xl/workbook.xml')?.async('text');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text');
  if (!workbookXml || !relsXml) {
    throw new Error('Template is missing workbook relationship files.');
  }

  const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('text');
  const parser = new DOMParser();
  let sharedStringsDoc = sharedStringsXml
    ? parser.parseFromString(sharedStringsXml, 'application/xml')
    : undefined;
  let sharedStrings = sharedStringsDoc ? getSharedStrings(sharedStringsDoc) : undefined;

  // Ensure "not uploaded" exists in sharedStrings so we can write it safely.
  let notUploadedSstIndex: number | undefined;
  if (sharedStrings) {
    notUploadedSstIndex = sharedStrings.findIndex(s => s.toLowerCase() === 'not uploaded');
    if (notUploadedSstIndex < 0) {
      notUploadedSstIndex = sharedStrings.length;
      const ns = sharedStringsDoc?.documentElement.namespaceURI ?? undefined;
      const si = ns ? sharedStringsDoc!.createElementNS(ns, 'si') : sharedStringsDoc!.createElement('si');
      const t = ns ? sharedStringsDoc!.createElementNS(ns, 't') : sharedStringsDoc!.createElement('t');
      t.textContent = 'not uploaded';
      si.appendChild(t);
      sharedStringsDoc!.documentElement.appendChild(si);
      sharedStrings = [...sharedStrings, 'not uploaded'];

      // Update count/uniqueCount attributes if present
      const sstEl = sharedStringsDoc!.documentElement;
      sstEl.setAttribute('count', String(sharedStrings.length));
      if (sstEl.getAttribute('uniqueCount')) {
        sstEl.setAttribute('uniqueCount', String(sharedStrings.length));
      }
    }
  }

  // Parse workbook + rels to map sheetName -> worksheet xml path
  const wbDoc = parser.parseFromString(workbookXml, 'application/xml');
  const relsDoc = parser.parseFromString(relsXml, 'application/xml');

  const relIdToTarget = new Map<string, string>();
  for (const rel of Array.from(relsDoc.getElementsByTagName('Relationship'))) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) relIdToTarget.set(id, `xl/${target}`);
  }

  const sheets = Array.from(wbDoc.getElementsByTagName('sheet')).map(s => ({
    name: s.getAttribute('name') ?? '',
    relId: s.getAttribute('r:id') ?? '',
    state: s.getAttribute('state') ?? '',
  }));

  // Build lookup from uploaded comparisons using first+last matching
  const uploadedByKey = new Map<string, ResidentComparison>();
  for (const c of comparisons) {
    uploadedByKey.set(nameKeyFirstLast(c.residentName), c);
  }

  // Explicit mapping for the BWH template layout (December 10, 2025 sheet).
  // These are the authoritative row numbers you provided (and we validated critical-care/peds rows from the template).
  const BWH_ROW_MAP: Array<{ row: number; categoryKey: string }> = [
    { row: 10, categoryKey: 'cranial: tumor general' },
    { row: 11, categoryKey: 'cranial: tumor sellar/parasellar' },
    { row: 12, categoryKey: 'cranial: trauma/other' },
    { row: 13, categoryKey: 'cranial: vascular open' },
    { row: 14, categoryKey: 'cranial: vascular endovascular' },
    // PDF category is "Cranial: Vascular Total" (Lead+Senior Total = open + endovascular)
    { row: 15, categoryKey: 'cranial: vascular total' },
    { row: 16, categoryKey: 'cranial: csf diversion/etv/other' },
    { row: 17, categoryKey: 'cranial/extracranial: pain' },
    // PDF category is plural ("Functional Disorders")
    { row: 18, categoryKey: 'cranial/extracranial: functional disorders' },
    { row: 19, categoryKey: 'cranial/extracranial: epilepsy' },
    { row: 20, categoryKey: 'total cranial' },

    { row: 22, categoryKey: 'spinal: anterior cervical' },
    { row: 23, categoryKey: 'spinal: posterior cervical' },
    { row: 24, categoryKey: 'spinal: thoracic/lumbar/sacral/instrumentation/fusion' },
    { row: 25, categoryKey: 'spinal: lumbar laminectomy/laminotomy' },
    { row: 26, categoryKey: 'spinal: stimulation/lesion/pump/other' },
    { row: 27, categoryKey: 'total spinal' },

    { row: 28, categoryKey: 'peripheral nerve' },
    { row: 29, categoryKey: 'radiosurgery' },
    { row: 30, categoryKey: 'peripheral device management' },

    { row: 32, categoryKey: 'airway management' },
    { row: 33, categoryKey: 'angiography' },
    { row: 34, categoryKey: 'arterial line placement' },
    { row: 35, categoryKey: 'cvp line placement' },
    { row: 36, categoryKey: 'evd/transdural monitor placement' },
    { row: 37, categoryKey: 'lumbar/other puncture/drain placement' },
    { row: 38, categoryKey: 'percutaneous tap of csf reservoir' },
    { row: 39, categoryKey: 'total critical care' },

    { row: 41, categoryKey: 'pediatric: cranial tumor' },
    { row: 42, categoryKey: 'pediatric: cranial trauma/other' },
    { row: 43, categoryKey: 'pediatric: csf diversion/etv/other' },
    { row: 44, categoryKey: 'pediatric: spinal' },
    { row: 45, categoryKey: 'total pediatric' },

    { row: 46, categoryKey: 'total' },
    { row: 47, categoryKey: 'microdissection' },
  ];

  // Authoritative resident column mapping you provided for this template.
  // Keys are header labels as they appear in the sheet's resident-header row.
  const BWH_RESIDENT_COLS: Record<string, string> = {
    JB: 'E',
    MC: 'F',
    SG: 'G',
    MA: 'I',
    JC: 'J',
    'J. Chen': 'K',
    AG: 'P',
    DL: 'Q',
    GL: 'R',
    EC: 'T',
    RG: 'U',
    CN: 'V',
    EM: 'X',
    AY: 'Y',
    SB: 'Z',
    RP: 'AB',
    SS: 'AC',
    // Present in the template header row; if not uploaded, should show "not uploaded"
    ML: 'AD',
  };

  // Map those template headers to roster names (so we can find the uploaded comparison).
  const BWH_HEADER_TO_ROSTER_NAME: Record<string, string> = {
    JB: 'Joshua Bernstock',
    MC: 'Melissa Chua',
    SG: 'Saksham Gupta',
    MA: 'Marcelle Altshuler',
    JC: 'Joshua Chalif',
    'J. Chen': 'Jason Chen',
    AG: 'Adam Glaser',
    DL: 'David Liu',
    GL: 'Gabrielle Luiselli',
    EC: 'Eric Chalif',
    RG: 'Ron Gadot',
    CN: 'Chibueze Nwagwu',
    EM: 'Eduardo Maury',
    AY: 'Alexander Yearley',
    SB: 'Sarah Blitz',
    RP: 'Ruchit V. Patel',
    SS: 'Solomiia Savchuk',
    ML: 'Maren Loe',
  };

  for (const sheet of sheets) {
    if (sheet.state === 'hidden') continue; // keep hidden sheets untouched
    const sheetPath = relIdToTarget.get(sheet.relId);
    if (!sheetPath) continue;

    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) continue;

    const sheetXml = await sheetFile.async('text');
    const sheetDoc = parser.parseFromString(sheetXml, 'application/xml');

    const header = parseHeaderMap(sheetDoc, sharedStrings);
    if (!header.headerRow || !header.categoryCol || !header.meanCol || !header.minimumCol) {
      // Not a recognized template sheet
      continue;
    }

    const cellIndex = buildCellIndex(sheetDoc);
    // If this is the BWH template (multi-row header at row 8), use explicit mapping.
    const isBwhLayout = header.headerRow === 8 && sheet.name.toLowerCase().includes('december');
    // Style index used by the BWH template for gray "Minimums" header cells; reuse for "not uploaded".
    // (We intentionally reuse an existing style to preserve compatibility with the template.)
    const bwhNotUploadedStyleId = 227;

    const residentHeaders = isBwhLayout
      ? Object.keys(BWH_RESIDENT_COLS)
      : Object.keys(header.residentCols);

    // Pre-compute per-uploaded resident category map (normalized)
    const uploadedCategoryMap = new Map<string, Map<string, number>>();
    for (const c of comparisons) {
      const m = new Map<string, number>();
      for (const r of c.leadAndSeniorResults) {
        m.set(normalizeCategory(r.category), r.current);
      }
      uploadedCategoryMap.set(nameKeyFirstLast(c.residentName), m);
    }

    const allResidentHeaders = residentHeaders;
    const headerTextBlob = allResidentHeaders.map(h => h.toLowerCase()).join(' ');

    const resolveResidentKey = (residentHeader: string) => {
      // 1) Direct match by "first|last" if header is a full name
      const directKey = nameKeyFirstLast(residentHeader);
      if (directKey && uploadedByKey.has(directKey)) return directKey;

      // 2) If header contains a last name (e.g. "J. Chen"), match by last name + first initial
      const n = normalizeName(residentHeader);
      const tokens = n.split(' ').filter(Boolean);
      if (tokens.length >= 2) {
        const firstInitial = tokens[0][0];
        const last = tokens[tokens.length - 1];
        const candidates = Array.from(uploadedByKey.keys()).filter(k => {
          const c = uploadedByKey.get(k);
          if (!c) return false;
          const ct = normalizeName(c.residentName).split(' ').filter(Boolean);
          const cFirst = ct[0]?.[0];
          const cLast = ct[ct.length - 1];
          return cFirst === firstInitial && cLast === last;
        });
        if (candidates.length === 1) return candidates[0];
      }

      // 3) Initials match (e.g. "JB", "MC", "JC")
      const init = initialsKey(residentHeader);
      if (init.length >= 2) {
        const candidates = Array.from(uploadedByKey.keys()).filter(k => {
          const c = uploadedByKey.get(k);
          if (!c) return false;
          return initialsKey(c.residentName) === init;
        });
        if (candidates.length === 1) return candidates[0];

        // Disambiguate by checking if one candidate's last name is explicitly present in headers.
        if (candidates.length > 1) {
          const scored = candidates.map(k => {
            const c = uploadedByKey.get(k)!;
            const last = normalizeName(c.residentName).split(' ').filter(Boolean).pop() ?? '';
            const lastIsSpelledOut = last && headerTextBlob.includes(last);
            return { k, lastIsSpelledOut };
          });
          // Prefer the candidate whose last name is NOT already spelled out elsewhere (e.g. "J. Chen" handles Chen)
          const preferred = scored.find(s => !s.lastIsSpelledOut);
          if (preferred) return preferred.k;
        }
      }

      return '';
    };

    const applyRow = (rowNum: number, categoryKey: string) => {
      let rowSum = 0;

      for (const residentHeader of residentHeaders) {
        const col = isBwhLayout ? BWH_RESIDENT_COLS[residentHeader] : header.residentCols[residentHeader];
        if (!col) continue;

        const ref = `${col}${rowNum}`;
        const cell = getOrCreateCell(sheetDoc, cellIndex, ref);

        const rosterName = isBwhLayout ? (BWH_HEADER_TO_ROSTER_NAME[residentHeader] ?? '') : residentHeader;
        const resolvedKey = rosterName ? nameKeyFirstLast(rosterName) : resolveResidentKey(residentHeader);

        const catMap = resolvedKey ? uploadedCategoryMap.get(resolvedKey) : undefined;
        if (!catMap) {
          if (notUploadedSstIndex != null) setCellSharedString(cell, sheetDoc, notUploadedSstIndex);
          else setCellNumber(cell, sheetDoc, 0);
          if (isBwhLayout) {
            cell.setAttribute('s', String(bwhNotUploadedStyleId));
          }
          continue;
        }

        const value = catMap.get(normalizeCategory(categoryKey)) ?? 0;
        setCellNumber(cell, sheetDoc, value);
        rowSum += value;
      }

      // Do not overwrite the template's Mean column; keep the original values/formulas as-is.
      void rowSum;
    };

    if (isBwhLayout) {
      for (const { row, categoryKey } of BWH_ROW_MAP) {
        applyRow(row, categoryKey);
      }
    } else {
      // Fallback for non-BWH templates: keep previous behavior (driven by category column)
      void findCategoryRows(sheetDoc, header.categoryCol, sharedStrings);
      for (let rowNum = header.headerRow + 1; rowNum < header.headerRow + 1000; rowNum++) {
        const catRef = `${header.categoryCol}${rowNum}`;
        const catCell = cellIndex.get(catRef);
        if (!catCell) continue;
        const categoryRaw = getCellText(catCell, sharedStrings);
        if (!categoryRaw) continue;

        // Skip obvious section headers: no minimum value and no resident cells populated
        const minRef = `${header.minimumCol}${rowNum}`;
        const minCell = cellIndex.get(minRef);
        const minText = minCell ? getCellText(minCell, sharedStrings) : '';
        const hasMin = isNumericString(minText);

        const normalizedCategory = normalizeCategory(categoryRaw);
        if (!normalizedCategory) continue;

        const isSectionHeader =
          !hasMin &&
          !categoryRaw.includes(':') &&
          !/^total\b/i.test(categoryRaw) &&
          !/microdissection/i.test(categoryRaw);
        if (isSectionHeader) continue;

        applyRow(rowNum, normalizedCategory);
      }
    }

    const updatedXml = new XMLSerializer().serializeToString(sheetDoc);
    zip.file(sheetPath, updatedXml);
  }

  if (sharedStringsDoc) {
    const updatedSst = new XMLSerializer().serializeToString(sharedStringsDoc);
    zip.file('xl/sharedStrings.xml', updatedSst);
  }

  const out = await zip.generateAsync({ type: 'arraybuffer' });
  downloadArrayBuffer(out, `Excel_Template_Filled_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

