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

  // Find resident name, program, and header row
  for (let i = 0; i < Math.min(20, jsonData.length); i++) {
    const row = jsonData[i];
    if (!row) continue;
    
    const rowText = row.map(c => String(c || '')).join(' ');
    
    if (rowText.includes('Program -') || rowText.includes('Hospital Program')) {
      program = rowText.trim();
    }
    
    if (rowText.includes('Resident:')) {
      const match = rowText.match(/Resident:\s*(.+?)(?:\s*$|\s{2,})/);
      if (match) residentName = match[1].trim();
    }
    
    if (rowText.includes('As of')) {
      const match = rowText.match(/As of\s*([\d\/]+)/);
      if (match) asOfDate = match[1].trim();
    }
    
    if (rowText.includes('Category') && (rowText.includes('Lead') || rowText.includes('Minimum'))) {
      headerRowIndex = i;
    }
  }

  // Parse data rows
  if (headerRowIndex >= 0) {
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.length < 3) continue;
      
      const categoryName = String(row[0] || '').trim();
      if (!categoryName || categoryName === 'Category') continue;
      
      // Find numeric values in the row
      const nums = row.slice(1).map(v => {
        const n = parseFloat(String(v || '0').replace(/[^\d.-]/g, ''));
        return isNaN(n) ? 0 : n;
      });
      
      const isSectionHeader = categoryName === 'Cranial' || categoryName === 'Spinal' || 
                              categoryName === 'Other' || categoryName === 'Critical Care' ||
                              categoryName === 'ALL DEFINED CASE PROCEDURES';
      const isTotalRow = categoryName.startsWith('Total') || categoryName.startsWith('**Total');
      
      if (!isSectionHeader || isTotalRow) {
        categories.push({
          category: categoryName.replace(/\*\*/g, ''),
          leadResidentSurgeon: nums[0] || 0,
          seniorResidentSurgeon: nums[1] || 0,
          leadAndSeniorTotal: nums[2] || 0,
          leadMinimum: nums[3] || 0,
          leadAndSeniorMinimum: nums[4] || 0,
          isSection: isSectionHeader,
          isTotalRow,
        });
      }
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
  
  // Set worker path
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
  
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => {
        if ('str' in item && typeof item.str === 'string') {
          return item.str;
        }
        return '';
      })
      .join(' ');
    fullText += pageText + '\n';
  }

  // Extract resident name
  let residentName = 'Unknown Resident';
  const residentMatch = fullText.match(/Resident:\s*([A-Za-z\s]+?)(?:\s{2,}|As of)/i);
  if (residentMatch) residentName = residentMatch[1].trim();

  // Extract program
  let program = 'Unknown Program';
  const programMatch = fullText.match(/([\w\s\/]+Hospital[\w\s\/]+Program\s*-\s*\d+)/i);
  if (programMatch) program = programMatch[1].trim();

  // Extract date
  let asOfDate = new Date().toLocaleDateString();
  const dateMatch = fullText.match(/As of\s*([\d\/]+)/i);
  if (dateMatch) asOfDate = dateMatch[1].trim();

  // Parse categories from text - this is simplified, real implementation would need table extraction
  const categories: CaseCategory[] = [];
  
  // Common neurosurgery categories
  const categoryPatterns = [
    { name: 'Cranial: Tumor General', pattern: /Cranial:\s*Tumor\s*General\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i },
    { name: 'Cranial: Tumor Sellar/Parasellar', pattern: /Cranial:\s*Tumor\s*Sellar\/Parasellar\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i },
    { name: 'Cranial: Trauma/Other', pattern: /Cranial:\s*Trauma\/Other\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i },
    { name: 'Cranial: Vascular Total', pattern: /Cranial:\s*Vascular\s*Total\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i },
    { name: 'Total Cranial', pattern: /Total\s*Cranial\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i },
    { name: 'Total Spinal', pattern: /Total\s*Spinal\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i },
  ];

  for (const { name, pattern } of categoryPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      categories.push({
        category: name,
        leadResidentSurgeon: parseInt(match[1]) || 0,
        seniorResidentSurgeon: parseInt(match[2]) || 0,
        leadAndSeniorTotal: parseInt(match[3]) || 0,
        leadMinimum: parseInt(match[4]) || 0,
        leadAndSeniorMinimum: parseInt(match[5]) || 0,
        isTotalRow: name.startsWith('Total'),
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
