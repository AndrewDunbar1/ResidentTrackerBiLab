import * as XLSX from 'xlsx';
import type { ResidentComparison } from '@/types/resident';

export function exportIndividualReport(comparison: ResidentComparison): void {
  const workbook = XLSX.utils.book_new();
  
  // Lead Requirements Sheet
  const leadData = [
    ['Category', 'Current', 'Minimum', 'Difference', '% Complete', 'Status'],
    ...comparison.leadResults.map(r => [
      r.category,
      r.current,
      r.minimum,
      r.status === 'no_minimum' ? 'N/A' : r.difference,
      r.status === 'no_minimum' ? 'N/A' : `${r.percentComplete}%`,
      r.status.toUpperCase(),
    ]),
    [],
    ['Overall Lead Completion', `${comparison.overallLeadPercentage}%`],
  ];
  
  const leadSheet = XLSX.utils.aoa_to_sheet(leadData);
  XLSX.utils.book_append_sheet(workbook, leadSheet, 'Lead Requirements');
  
  // Lead + Senior Requirements Sheet
  const leadAndSeniorData = [
    ['Category', 'Current', 'Minimum', 'Difference', '% Complete', 'Status'],
    ...comparison.leadAndSeniorResults.map(r => [
      r.category,
      r.current,
      r.minimum,
      r.status === 'no_minimum' ? 'N/A' : r.difference,
      r.status === 'no_minimum' ? 'N/A' : `${r.percentComplete}%`,
      r.status.toUpperCase(),
    ]),
    [],
    ['Overall Lead+Senior Completion', `${comparison.overallLeadAndSeniorPercentage}%`],
  ];
  
  const leadAndSeniorSheet = XLSX.utils.aoa_to_sheet(leadAndSeniorData);
  XLSX.utils.book_append_sheet(workbook, leadAndSeniorSheet, 'Lead+Senior Requirements');
  
  // Summary Sheet
  const summaryData = [
    ['Resident Case Log Summary'],
    [],
    ['Resident Name', comparison.residentName],
    ['Overall Lead Completion', `${comparison.overallLeadPercentage}%`],
    ['Overall Lead+Senior Completion', `${comparison.overallLeadAndSeniorPercentage}%`],
    ['Categories Met', `${comparison.totalCategoriesMet} / ${comparison.totalCategories}`],
  ];
  
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  
  XLSX.writeFile(workbook, `${comparison.residentName.replace(/\s+/g, '_')}_Case_Log_Report.xlsx`);
}

export function exportComparativeReport(comparisons: ResidentComparison[]): void {
  const workbook = XLSX.utils.book_new();
  
  // Rankings Overview
  const rankingsData = [
    ['Rank', 'Resident Name', 'Lead %', 'Lead+Senior %', 'Average %', 'Categories Met'],
    ...comparisons.map((c, i) => [
      i + 1,
      c.residentName,
      `${c.overallLeadPercentage}%`,
      `${c.overallLeadAndSeniorPercentage}%`,
      `${Math.round((c.overallLeadPercentage + c.overallLeadAndSeniorPercentage) / 2)}%`,
      `${c.totalCategoriesMet} / ${c.totalCategories}`,
    ]),
  ];
  
  const rankingsSheet = XLSX.utils.aoa_to_sheet(rankingsData);
  XLSX.utils.book_append_sheet(workbook, rankingsSheet, 'Rankings');
  
  // Category Breakdown - collect all unique categories
  const allCategories = new Set<string>();
  comparisons.forEach(c => {
    c.leadResults.forEach(r => allCategories.add(r.category));
  });
  
  const categoryHeaders = ['Category', ...comparisons.map(c => c.residentName)];
  const categoryData = [
    ['Lead Requirements - % Complete'],
    categoryHeaders,
    ...Array.from(allCategories).map(cat => [
      cat,
      ...comparisons.map(c => {
        const result = c.leadResults.find(r => r.category === cat);
        return result ? `${result.percentComplete}%` : 'N/A';
      }),
    ]),
  ];
  
  const categorySheet = XLSX.utils.aoa_to_sheet(categoryData);
  XLSX.utils.book_append_sheet(workbook, categorySheet, 'Category Comparison');
  
  XLSX.writeFile(workbook, `Residency_Comparative_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
}
