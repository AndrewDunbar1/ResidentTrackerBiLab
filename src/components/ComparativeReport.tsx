import { Download } from 'lucide-react';
import type { ResidentComparison } from '@/types/resident';
import { exportCohortStandardizedPdfReport } from '@/lib/exportPdf';
import { exportBwhTemplateGridPdf, exportBwhTemplateGridPdfLocal } from '@/lib/exportBwhTemplatePdf';
import { cn } from '@/lib/utils';

interface ComparativeReportProps {
  comparisons: ResidentComparison[];
}

export function ComparativeReport({ comparisons }: ComparativeReportProps) {
  if (comparisons.length === 0) return null;

  const avgLeadScore = Math.round(
    comparisons.reduce((acc, c) => acc + c.overallLeadPercentage, 0) / comparisons.length
  );
  
  const avgLeadSeniorScore = Math.round(
    comparisons.reduce((acc, c) => acc + c.overallLeadAndSeniorPercentage, 0) / comparisons.length
  );

  const overallScores = comparisons.map(
    c => (c.overallLeadPercentage + c.overallLeadAndSeniorPercentage) / 2
  );

  const getPercentileRank = (value: number, values: number[]) => {
    if (values.length <= 1) return 100;
    const sorted = [...values].sort((a, b) => a - b);
    const lessCount = sorted.filter(v => v < value).length;
    const equalCount = sorted.filter(v => v === value).length;
    const percentile = ((lessCount + 0.5 * equalCount) / values.length) * 100;
    return Math.round(percentile);
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden animate-slide-up">
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground">Comparative Report</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Comparing {comparisons.length} resident{comparisons.length > 1 ? 's' : ''}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportBwhTemplateGridPdf(comparisons)}
              className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Grid Global
            </button>
            <button
              onClick={() => exportBwhTemplateGridPdfLocal(comparisons)}
              className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Grid Local
            </button>
            <button
              onClick={() => exportCohortStandardizedPdfReport(comparisons)}
              className="flex items-center gap-2 px-4 py-2 gradient-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              <Download className="w-4 h-4" />
              Export Per-Resident Performance PDF
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-xs text-primary uppercase tracking-wide font-medium mb-1">Avg Lead Score</p>
            <span className="text-3xl font-bold text-primary">{avgLeadScore}%</span>
          </div>
          <div className="p-4 bg-accent/5 border border-accent/20 rounded-lg">
            <p className="text-xs text-accent uppercase tracking-wide font-medium mb-1">Avg Lead+Senior Score</p>
            <span className="text-3xl font-bold text-accent">{avgLeadSeniorScore}%</span>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-3 text-muted-foreground font-medium">Resident</th>
                <th className="text-center py-3 px-3 text-muted-foreground font-medium">PGY</th>
                <th className="text-center py-3 px-3 text-muted-foreground font-medium">Lead %</th>
                <th className="text-center py-3 px-3 text-muted-foreground font-medium">Lead+Senior %</th>
                <th className="text-center py-3 px-3 text-muted-foreground font-medium">Average</th>
                <th className="text-center py-3 px-3 text-muted-foreground font-medium">Overall Percentile</th>
                <th className="text-center py-3 px-3 text-muted-foreground font-medium">Categories Met</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((comparison, index) => {
                const avgScore = Math.round(
                  (comparison.overallLeadPercentage + comparison.overallLeadAndSeniorPercentage) / 2
                );
                const percentile = getPercentileRank(avgScore, overallScores);
                
                return (
                  <tr
                    key={comparison.residentName}
                    className={cn('border-b border-border/50', index % 2 === 0 && 'bg-muted/30')}
                  >
                    <td className="py-3 px-3 font-medium text-foreground">{comparison.residentName}</td>
                    <td className="py-3 px-3 text-center font-mono text-muted-foreground">
                      {comparison.pgy ? `PGY${comparison.pgy}` : '—'}
                    </td>
                    <td className="py-3 px-3 text-center font-mono">{comparison.overallLeadPercentage}%</td>
                    <td className="py-3 px-3 text-center font-mono">{comparison.overallLeadAndSeniorPercentage}%</td>
                    <td className="py-3 px-3 text-center">
                      <span className={cn(
                        'font-bold',
                        avgScore >= 100 ? 'text-success' : avgScore >= 50 ? 'text-warning' : 'text-destructive'
                      )}>
                        {avgScore}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-sm text-foreground">
                      {percentile}%
                    </td>
                    <td className="py-3 px-3 text-center text-muted-foreground">
                      {comparison.totalCategoriesMet}/{comparison.totalCategories}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
