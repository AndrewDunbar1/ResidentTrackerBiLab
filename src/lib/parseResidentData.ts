import * as XLSX from 'xlsx';
import type { ResidentData, CaseCategory } from '@/types/resident';

export async function parseExcelFile(file: File): Promise<ResidentData> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

  let residentName = '';
  let program = '';
  let asOfDate = '';
  const categories: CaseCategory[] = [];
  let headerRowIndex = -1;
  let colIndices = { category: 0, lead: -1, senior: -1, leadAndSenior: -1, leadMin: -1, leadAndSeniorMin: -1 };

  // Find resident name, program, date and header row
  for (let i = 0; i < Math.min(20, jsonData.length); i++) {
    const row = jsonData[i];
    if (!row) continue;
    
    const rowText = row.map(c => String(c || '')).join(' ');
    
    if (rowText.includes('Program -') || rowText.includes('Hospital Program')) {
      program = rowText.replace(/\s+/g, ' ').trim();
    }
    
    if (rowText.includes('Resident:')) {
      const match = rowText.match(/Resident:\s*([A-Za-z\s]+?)(?:\s{2,}|$)/);
      if (match) residentName = match[1].trim();
    }
    
    if (rowText.includes('As of')) {
      const match = rowText.match(/As of\s*([\d\/]+)/);
      if (match) asOfDate = match[1].trim();
    }
    
    // Find header row by looking for specific column names
    if (rowText.includes('Category') && (rowText.includes('Lead') || rowText.includes('Minimum'))) {
      headerRowIndex = i;
      // Identify column indices from header
      for (let j = 0; j < row.length; j++) {
        const cellText = String(row[j] || '').toLowerCase().replace(/\s+/g, ' ');
        if (cellText.includes('lead') && cellText.includes('resident') && cellText.includes('surgeon')) {
          colIndices.lead = j;
        } else if (cellText.includes('senior') && cellText.includes('resident') && cellText.includes('surgeon')) {
          colIndices.senior = j;
        } else if (cellText.includes('lead and senior') && cellText.includes('total')) {
          colIndices.leadAndSenior = j;
        } else if (cellText.includes('lead') && cellText.includes('minimum') && !cellText.includes('senior')) {
          colIndices.leadMin = j;
        } else if (cellText.includes('lead and senior') && cellText.includes('minimum')) {
          colIndices.leadAndSeniorMin = j;
        }
      }
    }
  }

  // Define section headers to skip
  const sectionHeaders = ['cranial', 'spinal', 'other', 'critical care', 'pediatric', 'all defined case procedures'];

  // Parse data rows
  if (headerRowIndex >= 0) {
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.length < 3) continue;
      
      const categoryName = String(row[0] || '').trim();
      if (!categoryName || categoryName.toLowerCase() === 'category') continue;
      
      // Skip section headers (non-data rows)
      const isSection = sectionHeaders.some(sh => categoryName.toLowerCase() === sh);
      if (isSection) continue;
      
      // Helper to parse number from cell
      const parseNum = (idx: number) => {
        if (idx < 0) return 0;
        const val = row[idx];
        const n = parseFloat(String(val || '0').replace(/[^\d.-]/g, ''));
        return isNaN(n) ? 0 : n;
      };
      
      const isTotalRow = categoryName.toLowerCase().startsWith('total') || categoryName.includes('**Total');
      
      categories.push({
        category: categoryName.replace(/\*\*/g, ''),
        leadResidentSurgeon: parseNum(colIndices.lead),
        seniorResidentSurgeon: parseNum(colIndices.senior),
        leadAndSeniorTotal: parseNum(colIndices.leadAndSenior),
        leadMinimum: parseNum(colIndices.leadMin),
        leadAndSeniorMinimum: parseNum(colIndices.leadAndSeniorMin),
        isSection: false,
        isTotalRow,
      });
    }
  }

  return {
    residentName: residentName || 'Unknown Resident',
    program: program || 'Unknown Program',
    asOfDate: asOfDate || new Date().toLocaleDateString(),
    categories,
  };
}

export async function parsePDFFile(file: File): Promise<ResidentData> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsModule = await import('pdfjs-dist');
  // pdfjs-dist has different module shapes depending on bundler/target; prefer default export when present.
  const pdfjsLib = ((pdfjsModule as unknown as { default?: unknown }).default ?? pdfjsModule) as typeof pdfjsModule;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc =
    `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf = await (pdfjsLib as any).getDocument({ data: arrayBuffer }).promise;
  
  // Extract text with position info to reconstruct table rows
  type TextItem = { str: string; x: number; y: number };
  const allItems: TextItem[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageHeight = (await page.getViewport({ scale: 1 })).height;
    
    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string' && item.str.trim()) {
        const transform = item.transform as number[];
        allItems.push({
          str: item.str,
          x: transform[4],
          y: pageHeight * i - transform[5], // Normalize Y across pages
        });
      }
    }
  }
  
  // Sort by Y position (top to bottom) then X (left to right)
  allItems.sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) < 2) return a.x - b.x;
    return yDiff;
  });
  
  // Group into rows based on Y position
  const rows: string[][] = [];
  let currentRow: TextItem[] = [];
  let lastY = -1;
  
  for (const item of allItems) {
    // Tighter tolerance helps avoid accidentally merging adjacent table rows.
    if (lastY === -1 || Math.abs(item.y - lastY) < 3) {
      currentRow.push(item);
    } else {
      if (currentRow.length > 0) {
        currentRow.sort((a, b) => a.x - b.x);
        rows.push(currentRow.map(i => i.str));
      }
      currentRow = [item];
    }
    lastY = item.y;
  }
  if (currentRow.length > 0) {
    currentRow.sort((a, b) => a.x - b.x);
    rows.push(currentRow.map(i => i.str));
  }
  
  // Join rows into text for metadata extraction
  const fullText = rows.map(r => r.join(' ')).join('\n');
  
  // Extract metadata
  let residentName = 'Unknown Resident';
  const residentMatch = fullText.match(/Resident:\s*([A-Za-z\s]+?)(?:\n|As of)/i);
  if (residentMatch) residentName = residentMatch[1].trim();

  let program = 'Unknown Program';
  const programMatch = fullText.match(/([A-Za-z\s\/]+Hospital[A-Za-z\s\/]+Program\s*-\s*\d+)/i);
  if (programMatch) program = programMatch[1].trim();

  let asOfDate = new Date().toLocaleDateString();
  const dateMatch = fullText.match(/As of\s*([\d\/]+)/i);
  if (dateMatch) asOfDate = dateMatch[1].trim();

  // Parse categories - look for rows with 5 numeric values
  const categories: CaseCategory[] = [];
  const sectionHeaders = ['cranial', 'spinal', 'other', 'critical care', 'pediatric', 'all defined case procedures'];
  const sectionTitleMap: Record<string, string> = {
    cranial: 'Cranial',
    spinal: 'Spinal',
    other: 'Other',
    'critical care': 'Critical Care',
    pediatric: 'Pediatric',
    'all defined case procedures': 'All Defined Case Procedures',
  };
  
  const normalizeCategoryText = (text: string) => {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\bLead Resident Surgeon\b/gi, '')
      .replace(/\bSenior Resident Surgeon\b/gi, '')
      .replace(/\bLead and Senior Total\b/gi, '')
      .replace(/\bLead Minimum\b/gi, '')
      .replace(/\bLead and Senior Minimum\b/gi, '')
      .replace(/:\s*$/g, '')
      .replace(/\*\*/g, '')
      .trim();
  };

  const isNumericCell = (cell: string) => {
    const cleaned = cell.replace(/\s+/g, '');
    return /^-?\d+(\.\d+)?\*?$/.test(cleaned);
  };

  const parseNumericCell = (cell: string) => {
    const sanitized = cell.replace(/[^\d.-]/g, '');
    const value = parseFloat(sanitized);
    return isNaN(value) ? 0 : value;
  };

  let pendingCategoryParts: string[] = [];
  let pendingNumbers: number[] = [];
  let currentSection: string | null = null;

  // Start parsing only after the table header row; prevents metadata numbers from polluting state.
  const headerRowIndex = rows.findIndex(r => {
    const t = r.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
    return (
      t.includes('category') &&
      t.includes('lead resident surgeon') &&
      t.includes('senior resident surgeon') &&
      (t.includes('lead and senior total') || t.includes('lead and senior')) &&
      t.includes('lead minimum')
    );
  });
  const dataRows = headerRowIndex >= 0 ? rows.slice(headerRowIndex + 1) : rows;

  const resetPending = () => {
    pendingCategoryParts = [];
    pendingNumbers = [];
  };

  const buildCategoryName = () => {
    const raw = normalizeCategoryText(pendingCategoryParts.join(' '));
    if (!raw) return '';

    const normalized = raw.toLowerCase();
    if (sectionHeaders.some(sh => normalized === sh)) {
      return '';
    }

    if (currentSection) {
      const sectionLower = currentSection.toLowerCase();
      if (
        !normalized.startsWith('total ') &&
        !raw.toLowerCase().startsWith(sectionLower) &&
        !raw.includes(':')
      ) {
        return `${currentSection}: ${raw}`;
      }
    }

    return raw;
  };

  const flushCategory = () => {
    const categoryName = buildCategoryName();
    if (!categoryName || pendingNumbers.length < 3) {
      resetPending();
      return;
    }

    const numbers = [...pendingNumbers];
    while (numbers.length < 5) {
      numbers.push(0);
    }

    const [lead, senior, total, leadMin, leadSeniorMin] = numbers.slice(0, 5);
    const normalizedCategory = categoryName.toLowerCase();
    const isTotalRow =
      normalizedCategory.startsWith('total') || normalizedCategory.includes(' total');

    categories.push({
      category: categoryName,
      leadResidentSurgeon: lead || 0,
      seniorResidentSurgeon: senior || 0,
      leadAndSeniorTotal: total || 0,
      leadMinimum: leadMin || 0,
      leadAndSeniorMinimum: leadSeniorMin || 0,
      isTotalRow,
    });

    resetPending();
  };

  for (const row of dataRows) {
    const cleanedRow = row.map(cell => cell.trim()).filter(Boolean);
    if (!cleanedRow.length) continue;

    const numericCells = cleanedRow.filter(isNumericCell).map(parseNumericCell);

    const leadingText: string[] = [];
    for (const cell of cleanedRow) {
      if (isNumericCell(cell)) break;
      leadingText.push(cell);
    }

    const normalizedLeading = normalizeCategoryText(leadingText.join(' '));
    const normalizedLeadingLower = normalizedLeading.toLowerCase();

    if (normalizedLeading && normalizedLeadingLower === 'category') {
      resetPending();
      continue;
    }

    if (
      normalizedLeading &&
      sectionHeaders.some(sh => normalizedLeadingLower === sh)
    ) {
      currentSection = sectionTitleMap[normalizedLeadingLower] ?? null;
      resetPending();
      continue;
    }

    if (normalizedLeading) {
      pendingCategoryParts.push(normalizedLeading);
    }

    if (numericCells.length) {
      pendingNumbers.push(...numericCells);
    }

    if (pendingNumbers.length >= 5 && pendingCategoryParts.length) {
      flushCategory();
    }
  }

  if (pendingCategoryParts.length && pendingNumbers.length) {
    flushCategory();
  }

  // Fallback: if positional reconstruction still drops rows, extract any "Category + 5 numbers" sequences from text.
  // This reliably captures lines like "Cranial: Vascular Open 3 12 15 0 10" when present.
  const existingKeys = new Set(categories.map(c => c.category.toLowerCase()));
  const rowRegex =
    /([A-Za-z][A-Za-z0-9/()'&.,\\-\\s:]+?)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(fullText)) !== null) {
    const categoryName = normalizeCategoryText(match[1] || '');
    if (!categoryName) continue;
    const normalized = categoryName.toLowerCase();
    if (normalized === 'category') continue;
    if (sectionHeaders.some(sh => normalized === sh)) continue;
    if (existingKeys.has(normalized)) continue;

    categories.push({
      category: categoryName,
      leadResidentSurgeon: parseInt(match[2] || '0', 10) || 0,
      seniorResidentSurgeon: parseInt(match[3] || '0', 10) || 0,
      leadAndSeniorTotal: parseInt(match[4] || '0', 10) || 0,
      leadMinimum: parseInt(match[5] || '0', 10) || 0,
      leadAndSeniorMinimum: parseInt(match[6] || '0', 10) || 0,
      isTotalRow: normalized.startsWith('total') || normalized.includes(' total'),
    });
    existingKeys.add(normalized);
  }

  return {
    residentName,
    program,
    asOfDate,
    categories,
  };
}

export async function parseResidentFile(file: File): Promise<ResidentData> {
  const fileName = file.name.toLowerCase();
  
  if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
    return parseExcelFile(file);
  } else if (fileName.endsWith('.pdf')) {
    return parsePDFFile(file);
  } else {
    throw new Error('Unsupported file format. Please upload Excel (.xls, .xlsx) or PDF files.');
  }
}
