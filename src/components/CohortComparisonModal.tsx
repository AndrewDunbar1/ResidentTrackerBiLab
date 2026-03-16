import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { ResidentComparison } from '@/types/resident';
import {
  buildCohortStats,
  getResidentCohortComparisons,
  getResidentResult,
  getCategoryOrder,
  getPercentMinimumsMet,
  formatMetric,
  type CohortCategoryStats,
  type RequirementType,
} from '@/lib/exportPdf';
import { cn } from '@/lib/utils';

interface CohortComparisonModalProps {
  resident: ResidentComparison | null;
  comparisons: ResidentComparison[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CohortBar({
  category,
  residentValue,
  stats,
  minRequirement,
  isNoMinimum,
}: {
  category: string;
  residentValue: number;
  stats: CohortCategoryStats;
  minRequirement: number;
  isNoMinimum: boolean;
}) {
  const domainMax = Math.max(stats.max, minRequirement, 1);

  const toPercent = (value: number) => {
    const clamped = Math.max(0, Math.min(value, domainMax));
    return (clamped / domainMax) * 100;
  };

  const rangeMinPct = toPercent(stats.min);
  const rangeMaxPct = toPercent(stats.max);
  const meanPct = toPercent(Math.min(Math.max(stats.mean, stats.min), stats.max));
  const reqPct = toPercent(minRequirement);
  const resPct = toPercent(residentValue);

  const minText = isNoMinimum || minRequirement === 0 ? '—' : formatMetric(minRequirement);

  return (
    <div className="group py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-foreground truncate mr-3 max-w-[200px]">
          {category}
        </span>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono shrink-0">
          <span>
            You: <span className="font-semibold text-blue-500">{formatMetric(residentValue)}</span>
          </span>
          <span>Min: {minText}</span>
          <span>Mean: {formatMetric(stats.mean)}</span>
          <span>Range: {formatMetric(stats.min)}–{formatMetric(stats.max)}</span>
        </div>
      </div>

      {/* Bar visualization */}
      <div className="relative h-5 rounded-full bg-muted/60 overflow-visible">
        {/* Cohort range segment */}
        <div
          className="absolute top-0 h-full rounded-full bg-gray-300/70"
          style={{
            left: `${rangeMinPct}%`,
            width: `${Math.max(0.5, rangeMaxPct - rangeMinPct)}%`,
          }}
        />

        {/* Range boundary ticks */}
        <div
          className="absolute top-[-3px] w-[1.5px] bg-gray-400"
          style={{ left: `${rangeMinPct}%`, height: 'calc(100% + 6px)' }}
        />
        <div
          className="absolute top-[-3px] w-[1.5px] bg-gray-400"
          style={{ left: `${rangeMaxPct}%`, height: 'calc(100% + 6px)' }}
        />

        {/* ACGME minimum requirement marker (black) */}
        {!isNoMinimum && minRequirement > 0 && (
          <div
            className="absolute top-[-4px] w-[2px] bg-gray-800"
            style={{ left: `${reqPct}%`, height: 'calc(100% + 8px)' }}
          />
        )}

        {/* Mean marker (red) */}
        <div
          className="absolute top-[-4px] w-[2px] bg-red-500"
          style={{ left: `${meanPct}%`, height: 'calc(100% + 8px)' }}
        />

        {/* Resident marker (blue diamond) */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
          style={{ left: `${resPct}%` }}
        >
          <div className="w-3 h-3 bg-blue-500 rotate-45 rounded-[1px] shadow-sm" />
        </div>
      </div>
    </div>
  );
}

function SectionView({
  resident,
  comparisons,
  type,
  title,
}: {
  resident: ResidentComparison;
  comparisons: ResidentComparison[];
  type: RequirementType;
  title: string;
}) {
  const cohortComparisons = getResidentCohortComparisons(resident, comparisons);
  const statsMap = buildCohortStats(cohortComparisons, type);
  const order = getCategoryOrder(cohortComparisons, type);

  const rows: Array<{
    category: string;
    current: number;
    minRequirement: number;
    stats: CohortCategoryStats;
    isNoMinimum: boolean;
  }> = [];

  for (const category of order) {
    const stats = statsMap.get(category);
    const r = getResidentResult(resident, category, type);
    if (!stats || !r) continue;
    rows.push({
      category,
      current: r.current,
      minRequirement: stats.minRequirement,
      stats,
      isNoMinimum: r.status === 'no_minimum' || r.minimum === 0,
    });
  }

  if (rows.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-2 px-3">{title}</h3>
      <div className="space-y-0">
        {rows.map((row) => (
          <CohortBar
            key={row.category}
            category={row.category}
            residentValue={row.current}
            stats={row.stats}
            minRequirement={row.minRequirement}
            isNoMinimum={row.isNoMinimum}
          />
        ))}
      </div>
    </div>
  );
}

export function CohortComparisonModal({
  resident,
  comparisons,
  open,
  onOpenChange,
}: CohortComparisonModalProps) {
  const [activeTab, setActiveTab] = useState<'leadAndSenior' | 'lead'>('leadAndSenior');

  if (!resident) return null;

  const percentMet = getPercentMinimumsMet(resident);
  const cohortComparisons = getResidentCohortComparisons(resident, comparisons);
  const cohortSize = cohortComparisons.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border bg-gradient-to-br from-card to-muted/30">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {resident.residentName}
            </DialogTitle>
            <DialogDescription className="mt-1">
              {resident.pgy ? `PGY${resident.pgy} ` : ''}Cohort Comparison Report
            </DialogDescription>
          </DialogHeader>

          {/* Summary stats */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="p-3 bg-card rounded-lg border border-border shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Minimums Met
              </p>
              <p className="text-xl font-bold text-foreground mt-0.5">
                {percentMet}%
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({resident.totalCategoriesMet}/{resident.totalCategories})
                </span>
              </p>
            </div>
            <div className="p-3 bg-card rounded-lg border border-border shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Lead Score
              </p>
              <p className={cn(
                'text-xl font-bold mt-0.5',
                resident.overallLeadPercentage >= 100 ? 'text-success' :
                resident.overallLeadPercentage >= 50 ? 'text-warning' : 'text-destructive'
              )}>
                {resident.overallLeadPercentage}%
              </p>
            </div>
            <div className="p-3 bg-card rounded-lg border border-border shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Lead+Senior Score
              </p>
              <p className={cn(
                'text-xl font-bold mt-0.5',
                resident.overallLeadAndSeniorPercentage >= 100 ? 'text-success' :
                resident.overallLeadAndSeniorPercentage >= 50 ? 'text-warning' : 'text-destructive'
              )}>
                {resident.overallLeadAndSeniorPercentage}%
              </p>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="px-6 pt-3 flex items-center gap-1 bg-card">
          <button
            onClick={() => setActiveTab('leadAndSenior')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2',
              activeTab === 'leadAndSenior'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Lead + Senior
          </button>
          <button
            onClick={() => setActiveTab('lead')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2',
              activeTab === 'lead'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Lead Surgeon
          </button>
          <div className="ml-auto text-[10px] text-muted-foreground">
            Cohort: {cohortSize} resident{cohortSize !== 1 ? 's' : ''}
            {resident.pgy ? ` (PGY${resident.pgy})` : ''}
          </div>
        </div>

        {/* Legend */}
        <div className="px-6 py-2 flex items-center gap-4 text-[10px] text-muted-foreground border-b border-border bg-card">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-2.5 rounded-sm bg-gray-300/70" />
            Cohort range
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-[2px] h-3 bg-red-500" />
            Cohort mean
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-[2px] h-3 bg-gray-800" />
            ACGME minimum
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 bg-blue-500 rotate-45 rounded-[1px]" />
            This resident
          </span>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === 'leadAndSenior' ? (
            <SectionView
              resident={resident}
              comparisons={comparisons}
              type="leadAndSenior"
              title="Lead + Senior (PGY Cohort Range vs Minimum)"
            />
          ) : (
            <SectionView
              resident={resident}
              comparisons={comparisons}
              type="lead"
              title="Lead Surgeon (PGY Cohort Range vs Minimum)"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
