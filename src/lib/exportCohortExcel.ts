import * as XLSX from 'xlsx-js-style';
import type { ComparisonResult, ResidentComparison } from '@/types/resident';

type RequirementType = 'leadAndSenior';

const YELLOW_FILL = { patternType: 'solid', fgColor: { rgb: 'FFFDE68A' } }; // soft yellow
const RED_FILL = { patternType: 'solid', fgColor: { rgb: 'FFFCA5A5' } }; // soft red
const HEADER_FILL = { patternType: 'solid', fgColor: { rgb: 'FFE5E7EB' } }; // gray-200

const headerStyle = {
  font: { bold: true },
  fill: HEADER_FILL,
  alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { rgb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { rgb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { rgb: 'FFCBD5E1' } },
  },
};

const baseCellBorder = {
  top: { style: 'thin', color: { rgb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { rgb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { rgb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { rgb: 'FFCBD5E1' } },
};

function getCategoryOrder(comparisons: ResidentComparison[], type: RequirementType): string[] {
  const order: string[] = [];
  for (const c of comparisons) {
    const results = type === 'leadAndSenior' ? c.leadAndSeniorResults : [];
    for (const r of results) {
      if (!order.includes(r.category)) order.push(r.category);
    }
  }
  return order;
}

function getResult(
  comparison: ResidentComparison,
  category: string,
  type: RequirementType
): ComparisonResult | undefined {
  const results = type === 'leadAndSenior' ? comparison.leadAndSeniorResults : [];
  return results.find(r => r.category === category);
}

function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ws as any)['!cols'] = widths.map(wch => ({ wch }));
}

function setRowHeights(ws: XLSX.WorkSheet, heights: number[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ws as any)['!rows'] = heights.map(hpt => ({ hpt }));
}

function styleCell(ws: XLSX.WorkSheet, address: string, style: object) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cell = (ws as any)[address];
  if (!cell) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (cell as any).s = style;
}

function safeSheetName(name: string): string {
  // Excel sheet name rules: <=31 chars, no : \ / ? * [ ]
  return name.replace(/[:\\/?*\[\]]/g, '').slice(0, 31);
}

export function exportCohortExcelByPgy(comparisons: ResidentComparison[]): void {
  if (comparisons.length === 0) return;

  const workbook = XLSX.utils.book_new();
  const type: RequirementType = 'leadAndSenior';

  // Group by PGY; unknown PGY goes into "Unknown"
  const groups = new Map<string, ResidentComparison[]>();
  for (const c of comparisons) {
    const key = c.pgy ? `PGY${c.pgy}` : 'Unknown';
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  const groupKeys = Array.from(groups.keys()).sort((a, b) => {
    const ap = a.startsWith('PGY') ? parseInt(a.slice(3), 10) : 999;
    const bp = b.startsWith('PGY') ? parseInt(b.slice(3), 10) : 999;
    return ap - bp;
  });

  for (const groupKey of groupKeys) {
    const group = groups.get(groupKey) ?? [];
    if (group.length === 0) continue;

    // Stable ordering within group
    const residents = [...group].sort((a, b) => a.residentName.localeCompare(b.residentName));

    const categories = getCategoryOrder(residents, type);

    // Header: Category | Mean | Minimum | <Resident columns...>
    const headerRow = ['Category', 'Mean', 'Minimum', ...residents.map(r => r.residentName)];

    const aoa: (string | number)[][] = [headerRow];

    for (const category of categories) {
      const values: number[] = [];
      const mins: number[] = [];

      for (const r of residents) {
        const result = getResult(r, category, type);
        if (!result) continue;
        values.push(result.current);
        mins.push(result.minimum);
      }

      const mean =
        values.length > 0 ? Math.round(values.reduce((acc, v) => acc + v, 0) / values.length) : '';
      const minRequirement = mins.length > 0 ? Math.max(...mins) : 0;

      const row: (string | number)[] = [category, mean, minRequirement];
      for (const r of residents) {
        const result = getResult(r, category, type);
        row.push(result ? result.current : '');
      }

      aoa.push(row);
    }

    const sheetName = safeSheetName(`${groupKey} Lead+Senior`);
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Column widths for readability
    const widths = [
      48, // Category
      10, // Mean
      10, // Minimum
      ...residents.map(() => 14),
    ];
    setColWidths(ws, widths);
    setRowHeights(ws, Array.from({ length: aoa.length }, () => 18));

    // Apply styles: header row
    for (let c = 0; c < headerRow.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      styleCell(ws, addr, headerStyle);
    }

    // Apply styles: data cells
    for (let r = 1; r < aoa.length; r++) {
      // Category column left-aligned
      const catAddr = XLSX.utils.encode_cell({ r, c: 0 });
      styleCell(ws, catAddr, {
        alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
        border: baseCellBorder,
      });

      // Mean + Minimum centered
      for (let c = 1; c <= 2; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        styleCell(ws, addr, {
          alignment: { vertical: 'center', horizontal: 'center' },
          border: baseCellBorder,
        });
      }

      const minimumCell = aoa[r][2];
      const minRequirement = typeof minimumCell === 'number' ? minimumCell : 0;

      // Resident value cells: color by min requirement
      for (let c = 3; c < headerRow.length; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const v = aoa[r][c];
        const current = typeof v === 'number' ? v : null;

        const fill =
          minRequirement > 0 && current !== null
            ? current >= minRequirement
              ? YELLOW_FILL
              : RED_FILL
            : undefined;

        styleCell(ws, addr, {
          alignment: { vertical: 'center', horizontal: 'center' },
          border: baseCellBorder,
          ...(fill ? { fill } : {}),
        });
      }
    }

    XLSX.utils.book_append_sheet(workbook, ws, sheetName);
  }

  XLSX.writeFile(workbook, `Resident_Cohort_LeadSenior_ByPGY_${new Date().toISOString().slice(0, 10)}.xlsx`);
}


