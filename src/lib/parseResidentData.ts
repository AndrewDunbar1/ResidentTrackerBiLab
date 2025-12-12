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
  const pdfjsLib = await import('pdfjs-dist');
  
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
  
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
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
    if (Math.abs(yDiff) < 5) return a.x - b.x;
    return yDiff;
  });
  
  // Group into rows based on Y position
  const rows: string[][] = [];
  let currentRow: TextItem[] = [];
  let lastY = -1;
  
  for (const item of allItems) {
    if (lastY === -1 || Math.abs(item.y - lastY) < 8) {
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
  
  for (const row of rows) {
    // Find numbers in the row
    const numbers = row.filter(cell => /^\*?\*?\d+\*?\*?$/.test(cell.replace(/\s/g, '')))
      .map(n => parseInt(n.replace(/\*/g, ''), 10));
    
    if (numbers.length >= 5) {
      // Get category name from non-numeric cells at the start
      const categoryParts: string[] = [];
      for (const cell of row) {
        if (/^\*?\*?\d+\*?\*?$/.test(cell.replace(/\s/g, ''))) break;
        categoryParts.push(cell);
      }
      
      let categoryName = categoryParts.join(' ').replace(/\*\*/g, '').trim();
      if (!categoryName || categoryName.toLowerCase() === 'category') continue;
      
      // Skip pure section headers
      const isSection = sectionHeaders.some(sh => categoryName.toLowerCase() === sh);
      if (isSection) continue;
      
      const isTotalRow = categoryName.toLowerCase().startsWith('total');
      
      categories.push({
        category: categoryName,
        leadResidentSurgeon: numbers[0] || 0,
        seniorResidentSurgeon: numbers[1] || 0,
        leadAndSeniorTotal: numbers[2] || 0,
        leadMinimum: numbers[3] || 0,
        leadAndSeniorMinimum: numbers[4] || 0,
        isTotalRow,
      });
    }
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
