export interface CaseCategory {
  category: string;
  leadResidentSurgeon: number;
  seniorResidentSurgeon: number;
  leadAndSeniorTotal: number;
  leadMinimum: number;
  leadAndSeniorMinimum: number;
  isSection?: boolean;
  isTotalRow?: boolean;
}

export interface ResidentData {
  residentName: string;
  program: string;
  asOfDate: string;
  pgy?: number;
  categories: CaseCategory[];
}

export interface ComparisonResult {
  category: string;
  current: number;
  minimum: number;
  difference: number;
  percentComplete: number;
  status: 'met' | 'below' | 'critical' | 'no_minimum';
  type: 'lead' | 'leadAndSenior';
}

export interface ResidentComparison {
  residentName: string;
  pgy?: number;
  leadResults: ComparisonResult[];
  leadAndSeniorResults: ComparisonResult[];
  overallLeadPercentage: number;
  overallLeadAndSeniorPercentage: number;
  totalCategoriesMet: number;
  totalCategories: number;
}
