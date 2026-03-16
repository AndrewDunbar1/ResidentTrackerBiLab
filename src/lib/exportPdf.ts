import { jsPDF } from 'jspdf';
import type { ComparisonResult, ResidentComparison } from '@/types/resident';

export type RequirementType = 'lead' | 'leadAndSenior';

export type CohortCategoryStats = {
  category: string;
  type: RequirementType;
  minRequirement: number; // requirement threshold (min)
  values: number[]; // cohort current values
  min: number;
  max: number;
  mean: number;
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function formatMetric(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, '');
}

export function getPercentMinimumsMet(c: ResidentComparison): number {
  if (!c.totalCategories) return 0;
  return Math.round((c.totalCategoriesMet / c.totalCategories) * 100);
}

export function getCategoryOrder(comparisons: ResidentComparison[], type: RequirementType): string[] {
  const primary = comparisons[0];
  const list = type === 'lead' ? primary.leadResults : primary.leadAndSeniorResults;
  const order: string[] = [];
  for (const r of list) {
    if (!order.includes(r.category)) order.push(r.category);
  }

  // Add any categories that appear only in other residents (rare, but possible)
  for (const c of comparisons) {
    const results = type === 'lead' ? c.leadResults : c.leadAndSeniorResults;
    for (const r of results) {
      if (!order.includes(r.category)) order.push(r.category);
    }
  }

  return order;
}

export function buildCohortStats(
  comparisons: ResidentComparison[],
  type: RequirementType
): Map<string, CohortCategoryStats> {
  const map = new Map<string, CohortCategoryStats>();
  const order = getCategoryOrder(comparisons, type);

  for (const category of order) {
    const values: number[] = [];
    const requirements: number[] = [];

    for (const c of comparisons) {
      const results = type === 'lead' ? c.leadResults : c.leadAndSeniorResults;
      const r = results.find(x => x.category === category);
      if (!r) continue;
      values.push(r.current);
      requirements.push(r.minimum);
    }

    const minRequirement = requirements.length ? Math.max(...requirements) : 0;
    const sorted = [...values].sort((a, b) => a - b);
    const m = mean(values);

    map.set(category, {
      category,
      type,
      minRequirement,
      values: sorted,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      mean: m,
    });
  }

  return map;
}

export function getResidentCohortComparisons(
  resident: ResidentComparison,
  comparisons: ResidentComparison[]
): ResidentComparison[] {
  if (!resident.pgy) return comparisons;

  const samePgy = comparisons.filter(c => c.pgy === resident.pgy);
  return samePgy.length > 0 ? samePgy : comparisons;
}

export function getResidentResult(
  comparison: ResidentComparison,
  category: string,
  type: RequirementType
): ComparisonResult | undefined {
  const results = type === 'lead' ? comparison.leadResults : comparison.leadAndSeniorResults;
  return results.find(r => r.category === category);
}

export function exportCohortStandardizedPdfReport(comparisons: ResidentComparison[]): void {
  if (comparisons.length === 0) return;

  // Landscape to reduce per-resident scrolling while keeping bars readable.
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Slightly tighter margins to fit each section on a single page more often.
  const marginX = 36;
  const marginTop = 34;
  const marginBottom = 34;

  const headerHeight = 46;
  const sectionTitleHeight = 18;
  const legendHeight = 10;
  const rowHeight = 21;
  const barHeight = 7;
  const gapAfterRow = 1;

  const columnsGap = 14;
  const usableWidth = pageWidth - marginX * 2;
  const colW = (usableWidth - columnsGap) / 2;

  const drawHeader = (resident: ResidentComparison) => {
    const percentMet = getPercentMinimumsMet(resident);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Resident Cohort Report', marginX, marginTop);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(
      `Resident: ${resident.residentName}${resident.pgy ? ` (PGY${resident.pgy})` : ''}`,
      marginX,
      marginTop + 18
    );
    doc.text(`Percent of Minimums Met: ${percentMet}%`, marginX, marginTop + 34);

    doc.setDrawColor(220);
    doc.line(marginX, marginTop + headerHeight - 8, pageWidth - marginX, marginTop + headerHeight - 8);
  };

  const valueToX = (value: number, maxDomain: number, barLeft: number, barWidth: number) => {
    if (maxDomain <= 0) return barLeft;
    const clamped = Math.max(0, Math.min(value, maxDomain));
    return barLeft + (clamped / maxDomain) * barWidth;
  };

  const drawBarRow = (
    x: number,
    y: number,
    categoryLabel: string,
    residentValue: number,
    stats: CohortCategoryStats,
    minRequirement: number,
    isNoMinimum: boolean
  ) => {
    const domainMax = Math.max(stats.max, minRequirement, 1);

    const labelW = 175;
    const barX = x + labelW + 10;
    const barW = x + colW - barX;

    // Left label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.25);
    doc.setTextColor(0);
    doc.text(categoryLabel, x, y + 9, { maxWidth: labelW });

    // Right-side compact values (single line, avoids extra vertical space)
    doc.setFontSize(7.25);
    doc.setTextColor(90);
    const minText = isNoMinimum || minRequirement === 0 ? '—' : formatMetric(minRequirement);
    const meanText = formatMetric(stats.mean);
    const rangeText = `${formatMetric(stats.min)}–${formatMetric(stats.max)}`;
    const info = `You ${formatMetric(residentValue)}  •  Min ${minText}  •  Mean ${meanText}  •  Range ${rangeText}`;
    doc.text(info, barX, y + 9, { maxWidth: barW });
    doc.setTextColor(0);

    // Bar track
    const barY = y + 12;
    doc.setDrawColor(220);
    doc.setFillColor(242, 242, 242);
    doc.rect(barX, barY, barW, barHeight, 'F');

    // Cohort range segment (min -> max)
    const rangeMinX = valueToX(stats.min, domainMax, barX, barW);
    const rangeMaxX = valueToX(stats.max, domainMax, barX, barW);
    doc.setFillColor(200, 200, 200);
    doc.rect(rangeMinX, barY, Math.max(1, rangeMaxX - rangeMinX), barHeight, 'F');

    // Range boundary ticks (helps visually confirm mean lies inside the range)
    doc.setDrawColor(120);
    doc.line(rangeMinX, barY - 2, rangeMinX, barY + barHeight + 2);
    doc.line(rangeMaxX, barY - 2, rangeMaxX, barY + barHeight + 2);

    // Minimum requirement marker (black dash)
    if (!isNoMinimum && minRequirement > 0) {
      const rx = valueToX(minRequirement, domainMax, barX, barW);
      doc.setDrawColor(20, 20, 20);
      doc.line(rx, barY - 3, rx, barY + barHeight + 3);
    }

    // Resident marker (triangle) - centered within the bar, smaller so it doesn't obstruct.
    const px = valueToX(residentValue, domainMax, barX, barW);
    const triSize = 3;
    const centerY = barY + barHeight / 2;
    const tipY = centerY - triSize;
    const baseY = centerY + triSize;
    doc.setFillColor(17, 116, 255);
    doc.setDrawColor(17, 116, 255);
    doc.triangle(px, tipY, px - triSize, baseY, px + triSize, baseY, 'FD');

    // Mean marker (red dash) - draw last so it remains visible even when it overlaps the resident marker.
    const meanVal = Math.min(Math.max(stats.mean, stats.min), stats.max);
    const meanX = valueToX(meanVal, domainMax, barX, barW);
    doc.setDrawColor(220, 38, 38);
    doc.line(meanX, barY - 3, meanX, barY + barHeight + 3);
  };

  const renderResidentSectionTwoColumn = (
    resident: ResidentComparison,
    type: RequirementType,
    pageTitle: string
  ) => {
    const cohortComparisons = getResidentCohortComparisons(resident, comparisons);
    const statsMap = buildCohortStats(cohortComparisons, type);

    drawHeader(resident);

    const order = getCategoryOrder(cohortComparisons, type);
    const startY = marginTop + headerHeight;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(pageTitle, marginX, startY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.25);
    doc.setTextColor(80);
    doc.text(
      'Gray = range for this PGY cohort. Red = PGY cohort mean. Black = minimum requirement. Blue = this resident.',
      marginX,
      startY + sectionTitleHeight
    );
    doc.setTextColor(0);

    const y0 = startY + sectionTitleHeight + legendHeight;
    const maxRowsPerCol = Math.floor((pageHeight - marginBottom - y0) / (rowHeight + gapAfterRow));
    const leftX = marginX;
    const rightX = marginX + colW + columnsGap;

    const visibleRows: Array<{ category: string; current: number; minRequirement: number; stats: CohortCategoryStats; isNoMinimum: boolean }> = [];
    for (const category of order) {
      const stats = statsMap.get(category);
      const r = getResidentResult(resident, category, type);
      if (!stats || !r) continue;
      visibleRows.push({
        category,
        current: r.current,
        minRequirement: stats.minRequirement,
        stats,
        isNoMinimum: r.status === 'no_minimum' || r.minimum === 0,
      });
    }

    // Split into two columns by count, capped by rows-per-column to keep a single clean page.
    // If there are more rows than fit, we continue on additional pages for that section.
    let idx = 0;
    while (idx < visibleRows.length) {
      let yL = y0;
      let yR = y0;

      for (let r = 0; r < maxRowsPerCol && idx < visibleRows.length; r++, idx++) {
        const row = visibleRows[idx];
        drawBarRow(leftX, yL, row.category, row.current, row.stats, row.minRequirement, row.isNoMinimum);
        yL += rowHeight + gapAfterRow;
      }

      for (let r = 0; r < maxRowsPerCol && idx < visibleRows.length; r++, idx++) {
        const row = visibleRows[idx];
        drawBarRow(rightX, yR, row.category, row.current, row.stats, row.minRequirement, row.isNoMinimum);
        yR += rowHeight + gapAfterRow;
      }

      if (idx < visibleRows.length) {
        doc.addPage();
        drawHeader(resident);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(pageTitle, marginX, startY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(80);
        doc.text(
          'Gray = range for this PGY cohort. Red = PGY cohort mean. Black = minimum requirement. Blue = this resident.',
          marginX,
          startY + sectionTitleHeight
        );
        doc.setTextColor(0);
      }
    }
  };

  comparisons.forEach((resident, idx) => {
    if (idx > 0) doc.addPage();
    // Page 1: Lead+Senior (most actionable)
    renderResidentSectionTwoColumn(resident, 'leadAndSenior', 'Lead + Senior (PGY Cohort Range vs Minimum)');
    // Page 2: Lead
    doc.addPage();
    renderResidentSectionTwoColumn(resident, 'lead', 'Lead Surgeon (PGY Cohort Range vs Minimum)');
  });

  const filename = `Resident_Cohort_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
