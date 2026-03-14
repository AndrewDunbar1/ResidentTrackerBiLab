import { jsPDF } from 'jspdf';
import type { ResidentComparison } from '@/types/resident';

/**
 * PDF export that mirrors the BWH Excel template layout exactly:
 * - Categories / Mean / Minimum columns
 * - Grouped by PGY year with "Program" and "Minimums" columns between groups
 * - Section headers (Cranial, Spinal, etc.)
 * - Conditional formatting (red < min, yellow >= min < mean, green >= mean, gray = not uploaded)
 */

const TEMPLATE_URL = '/bwh-case-log-template.xlsx';

// Category labels exactly as they appear in the Excel template
const CATEGORY_LABELS: Record<number, string> = {
  10: 'Cranial: Tumor General (Old DC1)',
  11: 'Cranial: Tumor Sellar/Parasellar (Old DC5)',
  12: 'Cranial: Trauma/Other (Old DC2)',
  13: 'Cranial: Vascular Open',
  14: 'Cranial: Vascular Endovascular',
  15: 'Total Cranial: Vascular (Old DC3+DC6) Total :',
  16: 'Cranial: CSF Diversion/ETV/Other (Old DC9)',
  17: 'Cranial/Extracranial: Pain (Old DC4)',
  18: 'Cranial/Extracranial: Functional Disorder (Old DC8)',
  19: 'Cranial/Extracranial: Epilepsy (old DC19)',
  20: 'Total Cranial (Old DC1-DC9) Total :',
  22: 'Spinal: Anterior Cervical (Old DC10)',
  23: 'Spinal: Posterior Cervical (Old DC11)',
  24: 'Spinal: Thoracic/Lumbar/Sacral/Instrumentation/Fusion (Old DC13)',
  25: 'Spinal: Lumbar Laminectomy/Laminotomy (Old DC12)',
  26: 'Spinal: Stimulation/Lesion/Pump/Other',
  27: 'Total Spinal (Old DC10-14) :',
  28: 'Peripheral Nerve (Old DC14)',
  29: 'Radiosurgery (Old DC7)',
  30: 'Peripheral Device Management',
  32: 'Airway management (Old DC26)',
  33: 'Angiography',
  34: 'Arterial line placement (Old DC27)',
  35: 'CVP line placement (Old DC25)',
  36: 'EVD/Transdural Monitor Placement (Old DC 20+21)',
  37: 'Lumbar/Other Puncture/Drain Placement',
  38: 'Percutaneous Tap of CSF Reservoir (Old DC22)',
  39: 'Total Critical Care (Old DC20-27)',
  41: 'Pediatric: Cranial Tumor (Old DC15)',
  42: 'Pediatric: Cranial Trauma/Other (Old DC 16)',
  43: 'Pediatric: CSF Diversion/ETV/Other (Old DC18)',
  44: 'Pediatric: Spinal (Old DC17)',
  45: 'Total Pediatric (Old DC15-18) :',
  46: 'Total :',
  47: 'Microdissection',
};

// Authoritative row mapping with section headers
const BWH_ROW_MAP: Array<{ row: number; key: string; section?: string }> = [
  { row: 9, key: '__section_cranial', section: 'Cranial' },
  { row: 10, key: 'cranial tumor general' },
  { row: 11, key: 'cranial tumor sellar parasellar' },
  { row: 12, key: 'cranial trauma other' },
  { row: 13, key: 'cranial vascular open' },
  { row: 14, key: 'cranial vascular endovascular' },
  { row: 15, key: 'cranial vascular total' },
  { row: 16, key: 'cranial csf diversion etv other' },
  { row: 17, key: 'cranial extracranial pain' },
  { row: 18, key: 'cranial extracranial functional disorders' },
  { row: 19, key: 'cranial extracranial epilepsy' },
  { row: 20, key: 'total cranial' },

  { row: 21, key: '__section_spinal', section: 'Spinal' },
  { row: 22, key: 'spinal anterior cervical' },
  { row: 23, key: 'spinal posterior cervical' },
  { row: 24, key: 'spinal thoracic lumbar sacral instrumentation fusion' },
  { row: 25, key: 'spinal lumbar laminectomy laminotomy' },
  { row: 26, key: 'spinal stimulation lesion pump other' },
  { row: 27, key: 'total spinal' },

  { row: 28, key: 'peripheral nerve' },
  { row: 29, key: 'radiosurgery' },
  { row: 30, key: 'peripheral device management' },

  { row: 31, key: '__section_critical_care', section: 'Critical Care' },
  { row: 32, key: 'airway management' },
  { row: 33, key: 'angiography' },
  { row: 34, key: 'arterial line placement' },
  { row: 35, key: 'cvp line placement' },
  { row: 36, key: 'evd transdural monitor placement' },
  { row: 37, key: 'lumbar other puncture drain placement' },
  { row: 38, key: 'percutaneous tap of csf reservoir' },
  { row: 39, key: 'total critical care' },

  { row: 40, key: '__section_pediatric', section: 'Pediatric' },
  { row: 41, key: 'pediatric cranial tumor' },
  { row: 42, key: 'pediatric cranial trauma other' },
  { row: 43, key: 'pediatric csf diversion etv other' },
  { row: 44, key: 'pediatric spinal' },
  { row: 45, key: 'total pediatric' },

  { row: 46, key: 'total' },
  { row: 47, key: 'microdissection' },
];

// Per-PGY minimums from the BWH template (columns H, M, S, W, AA, AE, AI)
// These are the "Minimums" values that appear after each PGY group
const PGY_MINIMUMS: Record<number, Record<number, number>> = {
  // PGY 7 (R7) - Column H minimums
  7: {
    10: 300, 11: 35, 12: 175, 13: 45, 14: 25, 15: 70, 16: 100, 17: 20, 18: 15, 19: 30, 20: 745,
    22: 50, 23: 60, 24: 125, 25: 100, 26: 10, 27: 345,
    28: 20, 29: 15, 30: 75,
    32: 10, 33: 40, 34: 20, 35: 15, 36: 100, 37: 30, 38: 10, 39: 225,
    41: 10, 42: 15, 43: 25, 44: 10, 45: 60,
    46: 1485, 47: 200,
  },
  // PGY 6 (R6) - Column M minimums
  6: {
    10: 200, 11: 30, 12: 125, 13: 35, 14: 25, 15: 60, 16: 80, 17: 15, 18: 15, 19: 20, 20: 545,
    22: 40, 23: 50, 24: 100, 25: 80, 26: 10, 27: 280,
    28: 20, 29: 15, 30: 75,
    32: 10, 33: 40, 34: 20, 35: 15, 36: 100, 37: 30, 38: 10, 39: 225,
    41: 10, 42: 15, 43: 20, 44: 10, 45: 55,
    46: 1215, 47: 100,
  },
  // PGY 5 (R5) - interpolated
  5: {
    10: 150, 11: 25, 12: 100, 13: 25, 14: 20, 15: 45, 16: 60, 17: 12, 18: 12, 19: 15, 20: 400,
    22: 35, 23: 40, 24: 80, 25: 65, 26: 10, 27: 230,
    28: 15, 29: 15, 30: 60,
    32: 10, 33: 35, 34: 20, 35: 15, 36: 80, 37: 25, 38: 10, 39: 195,
    41: 10, 42: 12, 43: 18, 44: 8, 45: 48,
    46: 1000, 47: 80,
  },
  // PGY 4 (R4) - Column S minimums
  4: {
    10: 100, 11: 20, 12: 75, 13: 15, 14: 15, 15: 30, 16: 40, 17: 10, 18: 10, 19: 10, 20: 245,
    22: 20, 23: 30, 24: 50, 25: 50, 26: 10, 27: 160,
    28: 10, 29: 15, 30: 40,
    32: 10, 33: 25, 34: 20, 35: 15, 36: 60, 37: 20, 38: 10, 39: 160,
    41: 10, 42: 10, 43: 10, 44: 5, 45: 35,
    46: 665, 47: 50,
  },
  // PGY 3 (R3) - Column W minimums
  3: {
    10: 80, 11: 20, 12: 40, 13: 10, 14: 10, 15: 20, 16: 40, 17: 10, 18: 10, 19: 10, 20: 200,
    22: 20, 23: 30, 24: 50, 25: 50, 26: 5, 27: 155,
    28: 10, 29: 10, 30: 40,
    32: 10, 33: 25, 34: 20, 35: 15, 36: 60, 37: 20, 38: 10, 39: 160,
    41: 10, 42: 10, 43: 10, 44: 5, 45: 35,
    46: 600, 47: 50,
  },
  // PGY 2 (R2) - Column AA minimums
  2: {
    10: 30, 11: 5, 12: 10, 13: 5, 14: 5, 15: 15, 16: 15, 17: 2, 18: 10, 19: 5, 20: 92,
    22: 5, 23: 10, 24: 10, 25: 10, 26: 5, 27: 40,
    28: 5, 29: 10, 30: 20,
    32: 10, 33: 20, 34: 20, 35: 15, 36: 45, 37: 10, 38: 10, 39: 130,
    41: 5, 42: 5, 43: 5, 44: 5, 45: 20,
    46: 317, 47: 20,
  },
  // PGY 1 (R1) - Column AE minimums
  1: {
    10: 0, 11: 0, 12: 5, 13: 0, 14: 0, 15: 0, 16: 3, 17: 0, 18: 0, 19: 0, 20: 8,
    22: 0, 23: 0, 24: 0, 25: 0, 26: 0, 27: 0,
    28: 0, 29: 0, 30: 0,
    32: 10, 33: 10, 34: 10, 35: 5, 36: 5, 37: 5, 38: 0, 39: 50,
    41: 0, 42: 0, 43: 0, 44: 0, 45: 0,
    46: 58, 47: 0,
  },
};

// Default PGY groups with resident names (can be overridden by cohort)
const DEFAULT_PGY_GROUPS: Array<{ pgy: number; label: string; residents: string[] }> = [
  { pgy: 7, label: 'R7', residents: ['Joshua Bernstock', 'Melissa Chua', 'Saksham Gupta'] },
  { pgy: 6, label: 'R6', residents: ['Marcelle Altshuler', 'Joshua Chalif', 'Jason Chen'] },
  { pgy: 5, label: 'R5', residents: ['Casey Jarvis', 'Sean Lyne', 'James Tanner McMahon'] },
  { pgy: 4, label: 'R4', residents: ['Adam Glaser', 'David Liu', 'Gabrielle Luiselli'] },
  { pgy: 3, label: 'R3', residents: ['Eric Chalif', 'Ron Gadot', 'Chibueze Nwagwu', 'Maren Loe'] },
  { pgy: 2, label: 'R2', residents: ['Eduardo Maury', 'Alexander Yearley', 'Sarah Blitz'] },
  { pgy: 1, label: 'R1', residents: ['Ruchit V. Patel', 'Solomiia Savchuk'] },
];

// Short initials for display in narrow columns
const NAME_TO_INITIALS: Record<string, string> = {
  'Joshua Bernstock': 'JB',
  'Melissa Chua': 'MC',
  'Saksham Gupta': 'SG',
  'Marcelle Altshuler': 'MA',
  'Joshua Chalif': 'JC',
  'Jason Chen': 'J.Chen',
  'Casey Jarvis': 'CJ',
  'Sean Lyne': 'SL',
  'James Tanner McMahon': 'JM',
  'Adam Glaser': 'AG',
  'David Liu': 'DL',
  'Gabrielle Luiselli': 'GL',
  'Eric Chalif': 'EC',
  'Ron Gadot': 'RG',
  'Chibueze Nwagwu': 'CN',
  'Eduardo Maury': 'EM',
  'Alexander Yearley': 'AY',
  'Sarah Blitz': 'SB',
  'Ruchit V. Patel': 'RP',
  'Solomiia Savchuk': 'SS',
  'Maren Loe': 'ML',
};

const normalizeCategory = (category: string) => {
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

const canonicalizeCategory = (category: string) => {
  let s = normalizeCategory(category);
  s = s.replace('mangement', 'management');
  s = s.replace('functional disorder', 'functional disorders');
  return s;
};

const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const nameKeyFirstLast = (name: string) => {
  const tokens = normalizeName(name).split(' ').filter(t => t.length > 1);
  if (tokens.length < 2) return '';
  return `${tokens[0]}|${tokens[tokens.length - 1]}`;
};

// Generate initials for a name (handles edited names)
const getInitials = (name: string): string => {
  if (NAME_TO_INITIALS[name]) return NAME_TO_INITIALS[name];
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

async function loadTemplateData(): Promise<{
  means: Map<number, number>;
  minimums: Map<number, number>;
}> {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error(`Failed to load template from ${TEMPLATE_URL}`);

  const buf = await res.arrayBuffer();
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buf);
  const sstXml = await zip.file('xl/sharedStrings.xml')?.async('text');
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml')?.async('text');
  if (!sstXml || !sheetXml) throw new Error('Template is missing sharedStrings or sheet1.xml');

  const sis = [...sstXml.matchAll(/<si[\s\S]*?<\/si>/g)].map(m => m[0]);
  const sst = sis.map(si => {
    const ts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]);
    return ts.join('').replace(/\s+/g, ' ').trim();
  });

  const getCell = (ref: string) => {
    const re = new RegExp(`<c[^>]*r=\\"${ref}\\"[^>]*>[\\s\\S]*?<\\/c>`);
    return sheetXml.match(re)?.[0] ?? '';
  };

  const cellText = (cellXml: string) => {
    if (!cellXml) return '';
    const t = (cellXml.match(/t=\\"([^\\"]+)\\"/) || [])[1];
    const v = (cellXml.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    if (v == null) return '';
    const vv = v.trim();
    if (t === 's') return sst[parseInt(vv, 10)] ?? '';
    return vv;
  };

  const means = new Map<number, number>();
  const minimums = new Map<number, number>();

  for (const { row, section } of BWH_ROW_MAP) {
    if (section) continue;
    const b = cellText(getCell(`B${row}`));
    const c = cellText(getCell(`C${row}`));
    const meanVal = Number(b);
    const minVal = Number(c);
    if (!Number.isNaN(meanVal)) means.set(row, meanVal);
    if (!Number.isNaN(minVal)) minimums.set(row, minVal);
  }

  return { means, minimums };
}

type GridColorMode = 'global' | 'local';

function buildPgyGroupsFromComparisons(
  comparisons: ResidentComparison[]
): Array<{ pgy: number; label: string; residents: string[] }> {
  const byPgy = new Map<number, string[]>();
  for (const c of comparisons) {
    if (!c.pgy) continue;
    const list = byPgy.get(c.pgy) ?? [];
    list.push(c.residentName);
    byPgy.set(c.pgy, list);
  }

  const groups: Array<{ pgy: number; label: string; residents: string[] }> = [];
  for (const pgy of [7, 6, 5, 4, 3, 2, 1]) {
    const residents = byPgy.get(pgy);
    if (residents && residents.length > 0) {
      residents.sort((a, b) => a.localeCompare(b));
      groups.push({ pgy, label: `R${pgy}`, residents });
    }
  }

  return groups.length > 0 ? groups : DEFAULT_PGY_GROUPS;
}

async function exportBwhTemplateGridPdfBase(
  comparisons: ResidentComparison[],
  colorMode: GridColorMode
): Promise<void> {
  const { means, minimums } = await loadTemplateData();
  const pgyGroups = buildPgyGroupsFromComparisons(comparisons);

  // Build lookup from uploaded comparisons
  const byResident = new Map<string, { comparison: ResidentComparison; categoryMap: Map<string, number> }>();
  for (const c of comparisons) {
    const categoryMap = new Map<string, number>();
    for (const r of c.leadAndSeniorResults) {
      categoryMap.set(canonicalizeCategory(r.category), r.current);
    }
    byResident.set(nameKeyFirstLast(c.residentName), { comparison: c, categoryMap });
  }

  const valueFor = (residentName: string, key: string): number | null => {
    const entry = byResident.get(nameKeyFirstLast(residentName));
    if (!entry) return null;
    const normalizedKey = canonicalizeCategory(key);
    return entry.categoryMap.get(normalizedKey) ?? 0;
  };

  // Calculate column widths
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;

  const catW = 220; // Categories column (wider to fit full names)
  const meanW = 32; // Mean column
  const minW = 32; // Minimum column
  const progW = 32; // Program/Minimums column (shows PGY-specific minimums)
  const resW = 28; // Resident column
  const gap = 1;

  const rowH = 12;
  const headerH = 36; // Space for title + program info + 2 header rows

  // Colors
  const COLOR_GREEN = [146, 208, 80] as const;
  const COLOR_YELLOW = [255, 255, 161] as const;
  const COLOR_RED = [252, 165, 165] as const;
  const COLOR_GRAY = [200, 200, 200] as const;
  const COLOR_HEADER_GRAY = [235, 235, 235] as const;
  const COLOR_SECTION_GRAY = [180, 180, 180] as const;

  const pgyColors: Record<number, readonly [number, number, number]> = {
    7: [0, 112, 192],
    6: [0, 176, 80],
    5: [255, 192, 0],
    4: [255, 192, 0],
    3: [255, 153, 51],
    2: [255, 102, 102],
    1: [204, 153, 255],
  };

  const fill = (rgb: readonly [number, number, number]) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  const stroke = (rgb: readonly [number, number, number]) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);

  // Calculate total width needed for all columns
  const fixedW = catW + meanW + minW + gap * 2;
  let residentsW = 0;
  for (const g of pgyGroups) {
    residentsW += progW + g.residents.length * resW + gap * 2;
  }
  const totalW = fixedW + residentsW;

  // Scale factor if content is too wide
  const availableW = pageW - margin * 2;
  const scale = totalW > availableW ? availableW / totalW : 1;

  const s = (v: number) => v * scale; // scaled value helper

  let currentPage = 0;

  const headerLabel =
    colorMode === 'local' ? 'Versus Cohort Goal' : 'Versus Program Requirements';

  const drawPageHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(`BWH NSGY Resident Logs: ${headerLabel}`, margin, margin + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text('Program ID: 1602421036  Program Name: Brigham and Women\'s Hospital/Children\'s Hospital Program', margin, margin + 20);
    doc.setTextColor(0);
  };

  const drawTableHeaders = (startY: number) => {
    let x = margin;
    const y1 = startY; // PGY row
    const y2 = startY + rowH + gap; // Column headers row
    const centerText = (text: string, cellX: number, cellW: number, textY: number) => {
      doc.text(text, cellX + cellW / 2, textY, { align: 'center' });
    };

    // Fixed columns header (Categories, Mean, Minimum)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);

    // Empty space above Categories/Mean/Min for PGY row alignment
    // Categories header
    fill(COLOR_HEADER_GRAY);
    doc.rect(x, y2, s(catW), rowH, 'F');
    doc.setTextColor(0);
    doc.text('Categories', x + 2, y2 + 8);
    x += s(catW) + gap;

    // Mean
    fill(COLOR_HEADER_GRAY);
    doc.rect(x, y2, s(meanW), rowH, 'F');
    centerText('Mean', x, s(meanW), y2 + 8);
    x += s(meanW) + gap;

    // Minimum
    fill(COLOR_HEADER_GRAY);
    doc.rect(x, y2, s(minW), rowH, 'F');
    centerText('Min', x, s(minW), y2 + 8);
    x += s(minW) + gap;

    // PGY groups
    for (const g of pgyGroups) {
      const groupW = s(progW + g.residents.length * resW);
      const color = pgyColors[g.pgy] ?? [0, 112, 192];

      // PGY band row (colored header)
      fill(color);
      doc.rect(x, y1, groupW, rowH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      centerText(g.label, x, groupW, y1 + 8);

      // Sub-headers row
      doc.setFontSize(5.5);
      doc.setTextColor(0);

      // Program/Minimums column (shows "Goal" header, values are PGY-specific minimums)
      fill(COLOR_HEADER_GRAY);
      doc.rect(x, y2, s(progW), rowH, 'F');
      centerText('Goal', x, s(progW), y2 + 8);
      x += s(progW);

      // Resident columns
      for (const res of g.residents) {
        fill(COLOR_HEADER_GRAY);
        doc.rect(x, y2, s(resW), rowH, 'F');
        const initials = getInitials(res);
        centerText(initials, x, s(resW), y2 + 8);
        x += s(resW);
      }

      x += gap;
    }

    return y2 + rowH + 2;
  };

  const drawDataRows = (startY: number): number => {
    let y = startY;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    const centerText = (text: string, cellX: number, cellW: number, textY: number) => {
      doc.text(text, cellX + cellW / 2, textY, { align: 'center' });
    };

    for (const { row, key, section } of BWH_ROW_MAP) {
      if (y + rowH > pageH - margin) {
        doc.addPage();
        currentPage++;
        drawPageHeader();
        y = drawTableHeaders(margin + headerH - 10);
      }

      let x = margin;
      const label = section ?? CATEGORY_LABELS[row] ?? '';
      const meanVal = means.get(row);
      const minVal = minimums.get(row);

      // Section header row
      if (section) {
        fill(COLOR_SECTION_GRAY);
        let fullRowW = s(catW + meanW + minW) + gap * 2;
        for (const g of pgyGroups) {
          fullRowW += s(progW + g.residents.length * resW) + gap;
        }
        doc.rect(x, y, fullRowW, rowH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        doc.text(section, x + 2, y + 8);
        doc.setFont('helvetica', 'normal');
        y += rowH + 1;
        continue;
      }

      // Category label (use the exact label from template)
      fill([255, 255, 255]);
      doc.rect(x, y, s(catW), rowH, 'F');
      stroke([220, 220, 220]);
      doc.rect(x, y, s(catW), rowH, 'S');
      doc.setTextColor(0);
      const displayLabel = label.length > 55 ? label.slice(0, 52) + '...' : label;
      doc.text(displayLabel, x + 2, y + 8);
      x += s(catW) + gap;

      // Mean (green)
      fill([220, 255, 220]);
      doc.rect(x, y, s(meanW), rowH, 'F');
      doc.rect(x, y, s(meanW), rowH, 'S');
      centerText(meanVal != null ? String(Math.round(meanVal)) : '', x, s(meanW), y + 8);
      x += s(meanW) + gap;

      // Minimum (main column) (yellow)
      fill([255, 255, 220]);
      doc.rect(x, y, s(minW), rowH, 'F');
      doc.rect(x, y, s(minW), rowH, 'S');
      centerText(minVal != null ? String(Math.round(minVal)) : '', x, s(minW), y + 8);
      x += s(minW) + gap;

      // PGY groups
      for (const g of pgyGroups) {
        const pgyMin = PGY_MINIMUMS[g.pgy]?.[row];

        // Program/Minimums column (shows PGY-specific minimum)
        fill(COLOR_HEADER_GRAY);
        doc.rect(x, y, s(progW), rowH, 'F');
        stroke([220, 220, 220]);
        doc.rect(x, y, s(progW), rowH, 'S');
        centerText(pgyMin != null ? String(Math.round(pgyMin)) : '', x, s(progW), y + 8);
        x += s(progW);

        // Resident columns
        for (const res of g.residents) {
          const v = valueFor(res, key);
          const meanN = meanVal ?? 0;
          const globalMinN = minVal ?? 0;
          const localMinN = pgyMin ?? globalMinN;
          const minN = colorMode === 'local' ? localMinN : globalMinN;
          const effectiveMeanN =
            colorMode === 'local' ? Math.max(meanN, minN) : meanN;

          if (v == null) {
            fill(COLOR_GRAY);
          } else if (colorMode === 'local') {
            if (v < minN) {
              fill(COLOR_RED);
            } else {
              fill(COLOR_GREEN);
            }
          } else if (v < minN) {
            fill(COLOR_RED);
          } else if (v < effectiveMeanN) {
            fill(COLOR_YELLOW);
          } else {
            fill(COLOR_GREEN);
          }

          doc.rect(x, y, s(resW), rowH, 'F');
          stroke([220, 220, 220]);
          doc.rect(x, y, s(resW), rowH, 'S');
          doc.setTextColor(0);
          if (v == null) {
            doc.setFontSize(4);
            centerText('N/U', x, s(resW), y + 7);
            doc.setFontSize(5.5);
          } else {
            centerText(String(Math.round(v)), x, s(resW), y + 8);
          }
          x += s(resW);
        }

        x += gap;
      }

      y += rowH + 1;
    }

    return y;
  };

  // Start rendering
  drawPageHeader();
  let y = margin + headerH - 10;
  y = drawTableHeaders(y);
  drawDataRows(y);

  const label = colorMode === 'local' ? 'Local' : 'Global';
  doc.save(`BWH_Template_Report_${label}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportBwhTemplateGridPdf(
  comparisons: ResidentComparison[]
): Promise<void> {
  return exportBwhTemplateGridPdfBase(comparisons, 'global');
}

export async function exportBwhTemplateGridPdfLocal(
  comparisons: ResidentComparison[]
): Promise<void> {
  return exportBwhTemplateGridPdfBase(comparisons, 'local');
}
