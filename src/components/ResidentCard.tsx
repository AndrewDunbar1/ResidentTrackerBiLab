import { CheckCircle2, AlertCircle, XCircle, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { ResidentComparison, ComparisonResult } from '@/types/resident';
import { exportIndividualReport } from '@/lib/exportExcel';
import { cn } from '@/lib/utils';

interface ResidentCardProps {
  comparison: ResidentComparison;
  rank?: number;
}

function StatusBadge({ status }: { status: 'met' | 'below' | 'critical' | 'no_minimum' }) {
  const config = {
    met: { icon: CheckCircle2, label: 'Met', className: 'bg-success/10 text-success' },
    below: { icon: AlertCircle, label: 'Below', className: 'bg-warning/10 text-warning' },
    critical: { icon: XCircle, label: 'Critical', className: 'bg-destructive/10 text-destructive' },
    no_minimum: { icon: AlertCircle, label: 'No minimum', className: 'bg-muted text-muted-foreground' },
  };
  
  const { icon: Icon, label, className } = config[status];
  
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', className)}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function ProgressBar({ value, status }: { value: number; status: 'met' | 'below' | 'critical' | 'no_minimum' }) {
  if (status === 'no_minimum') {
    return <div className="h-2 bg-muted rounded-full overflow-hidden" />;
  }

  const gradientClass = {
    met: 'gradient-success',
    below: 'gradient-warning',
    critical: 'gradient-danger',
  }[status];
  
  return (
    <div className="h-2 bg-muted rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-500', gradientClass)}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

function CategoryTable({ results, title }: { results: ComparisonResult[]; title: string }) {
  if (results.length === 0) return null;
  
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Category</th>
              <th className="text-center py-2 px-3 text-muted-foreground font-medium">Current</th>
              <th className="text-center py-2 px-3 text-muted-foreground font-medium">Min</th>
              <th className="text-center py-2 px-3 text-muted-foreground font-medium">Diff</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium w-32">Progress</th>
              <th className="text-center py-2 px-3 text-muted-foreground font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, index) => (
              <tr key={result.category} className={cn('border-b border-border/50', index % 2 === 0 && 'bg-muted/30')}>
                <td className="py-2 px-3 text-foreground">{result.category}</td>
                <td className="py-2 px-3 text-center font-mono">{result.current}</td>
                <td className="py-2 px-3 text-center font-mono">{result.minimum}</td>
                <td className={cn(
                  'py-2 px-3 text-center font-mono font-medium',
                  result.status === 'no_minimum' && 'text-muted-foreground',
                  result.status !== 'no_minimum' && (result.difference >= 0 ? 'text-success' : 'text-destructive')
                )}>
                  {result.status === 'no_minimum' ? '—' : `${result.difference >= 0 ? '+' : ''}${result.difference}`}
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <ProgressBar value={result.percentComplete} status={result.status} />
                    <span className="text-xs text-muted-foreground w-10">
                      {result.status === 'no_minimum' ? 'N/A' : `${result.percentComplete}%`}
                    </span>
                  </div>
                </td>
                <td className="py-2 px-3 text-center">
                  <StatusBadge status={result.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ResidentCard({ comparison, rank }: ResidentCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  const overallScore = Math.round(
    (comparison.overallLeadPercentage + comparison.overallLeadAndSeniorPercentage) / 2
  );
  
  const overallStatus = overallScore >= 100 ? 'met' : overallScore >= 50 ? 'below' : 'critical';

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden animate-slide-up">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {rank && (
              <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold">
                #{rank}
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold text-foreground">{comparison.residentName}</h3>
              <p className="text-sm text-muted-foreground">
                {comparison.totalCategoriesMet} of {comparison.totalCategories} categories met
              </p>
            </div>
          </div>
          
          <button
            onClick={() => exportIndividualReport(comparison)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Lead Surgeon</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">{comparison.overallLeadPercentage}%</span>
              <StatusBadge status={comparison.overallLeadPercentage >= 100 ? 'met' : comparison.overallLeadPercentage >= 50 ? 'below' : 'critical'} />
            </div>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Lead + Senior</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">{comparison.overallLeadAndSeniorPercentage}%</span>
              <StatusBadge status={comparison.overallLeadAndSeniorPercentage >= 100 ? 'met' : comparison.overallLeadAndSeniorPercentage >= 50 ? 'below' : 'critical'} />
            </div>
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Hide Details
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              View Details
            </>
          )}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border p-5 bg-muted/20 space-y-6">
          <CategoryTable results={comparison.leadResults} title="Lead Surgeon Requirements" />
          <CategoryTable results={comparison.leadAndSeniorResults} title="Lead + Senior Requirements" />
        </div>
      )}
    </div>
  );
}
