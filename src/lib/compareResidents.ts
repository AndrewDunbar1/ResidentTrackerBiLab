import type { ResidentData, ComparisonResult, ResidentComparison, CaseCategory } from '@/types/resident';

function calculateComparison(
  category: CaseCategory,
  type: 'lead' | 'leadAndSenior'
): ComparisonResult | null {
  const current = type === 'lead' ? category.leadResidentSurgeon : category.leadAndSeniorTotal;
  const minimum = type === 'lead' ? category.leadMinimum : category.leadAndSeniorMinimum;
  
  // Keep rows even when there is no minimum requirement, so the output matches the source PDF.
  // These rows should not affect overall completion calculations.
  if (minimum === 0) {
    return {
      category: category.category,
      current,
      minimum,
      difference: 0,
      percentComplete: 0,
      status: 'no_minimum',
      type,
    };
  }
  
  const difference = current - minimum;
  const percentComplete = Math.min(100, Math.round((current / minimum) * 100));
  
  let status: 'met' | 'below' | 'critical';
  if (percentComplete >= 100) {
    status = 'met';
  } else if (percentComplete >= 50) {
    status = 'below';
  } else {
    status = 'critical';
  }
  
  return {
    category: category.category,
    current,
    minimum,
    difference,
    percentComplete,
    status,
    type,
  };
}

export function compareResident(data: ResidentData): ResidentComparison {
  const leadResults: ComparisonResult[] = [];
  const leadAndSeniorResults: ComparisonResult[] = [];
  
  for (const category of data.categories) {
    if (category.isSection) continue;
    
    const leadResult = calculateComparison(category, 'lead');
    if (leadResult) leadResults.push(leadResult);
    
    const leadAndSeniorResult = calculateComparison(category, 'leadAndSenior');
    if (leadAndSeniorResult) leadAndSeniorResults.push(leadAndSeniorResult);
  }
  
  const requiredLeadResults = leadResults.filter(r => r.status !== 'no_minimum');
  const requiredLeadAndSeniorResults = leadAndSeniorResults.filter(r => r.status !== 'no_minimum');

  const totalLeadMet = requiredLeadResults.filter(r => r.status === 'met').length;
  const totalLeadAndSeniorMet = requiredLeadAndSeniorResults.filter(r => r.status === 'met').length;
  const totalCategories = requiredLeadResults.length + requiredLeadAndSeniorResults.length;
  const totalCategoriesMet = totalLeadMet + totalLeadAndSeniorMet;
  
  const overallLeadPercentage = requiredLeadResults.length > 0
    ? Math.round(requiredLeadResults.reduce((acc, r) => acc + r.percentComplete, 0) / requiredLeadResults.length)
    : 0;
    
  const overallLeadAndSeniorPercentage = requiredLeadAndSeniorResults.length > 0
    ? Math.round(requiredLeadAndSeniorResults.reduce((acc, r) => acc + r.percentComplete, 0) / requiredLeadAndSeniorResults.length)
    : 0;
  
  return {
    residentName: data.residentName,
    leadResults,
    leadAndSeniorResults,
    overallLeadPercentage,
    overallLeadAndSeniorPercentage,
    totalCategoriesMet,
    totalCategories,
  };
}

export function rankResidents(comparisons: ResidentComparison[]): ResidentComparison[] {
  return [...comparisons].sort((a, b) => {
    const aScore = (a.overallLeadPercentage + a.overallLeadAndSeniorPercentage) / 2;
    const bScore = (b.overallLeadPercentage + b.overallLeadAndSeniorPercentage) / 2;
    return bScore - aScore;
  });
}
