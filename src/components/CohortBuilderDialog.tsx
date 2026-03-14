import { useMemo, useState } from 'react';
import { Settings2, Pencil, Check } from 'lucide-react';
import { RESIDENT_ROSTER, type ResidentRosterEntry } from '@/lib/residentRoster';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type CohortMember = {
  name: string;
  pgy: number;
  included: boolean;
};

function defaultCohort(): CohortMember[] {
  return RESIDENT_ROSTER.map(r => ({ name: r.name, pgy: r.pgy, included: true }));
}

function byPgyThenName(a: ResidentRosterEntry, b: ResidentRosterEntry) {
  return b.pgy - a.pgy || a.name.localeCompare(b.name);
}

export function CohortBuilderDialog({
  value,
  onChange,
}: {
  value: CohortMember[] | undefined;
  onChange: (next: CohortMember[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const initial = useMemo(() => value ?? defaultCohort(), [value]);
  const [draft, setDraft] = useState<CohortMember[]>(initial);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const rosterSorted = useMemo(() => [...RESIDENT_ROSTER].sort(byPgyThenName), []);

  const setIncludedAll = (included: boolean) => {
    setDraft(prev => prev.map(m => ({ ...m, included })));
  };

  const updateMember = (name: string, patch: Partial<CohortMember>) => {
    setDraft(prev =>
      prev.map(m => (m.name === name ? { ...m, ...patch } : m))
    );
  };

  const startEditing = (name: string) => {
    setEditingName(name);
    setEditingValue(name);
  };

  const finishEditing = () => {
    if (editingName && editingValue.trim()) {
      setDraft(prev =>
        prev.map(m => (m.name === editingName ? { ...m, name: editingValue.trim() } : m))
      );
    }
    setEditingName(null);
    setEditingValue('');
  };

  const ensureDraftHasAllRoster = () => {
    const map = new Map(draft.map(m => [m.name, m]));
    // Also check if any current draft names match roster names
    const rosterNames = new Set(rosterSorted.map(r => r.name));
    const existingDraft = draft.filter(m => !rosterNames.has(m.name) || map.has(m.name));
    
    const merged: CohortMember[] = rosterSorted.map(r => {
      const existing = map.get(r.name);
      if (existing) return existing;
      return { name: r.name, pgy: r.pgy, included: true };
    });
    
    // Add any custom names that aren't in roster
    for (const m of existingDraft) {
      if (!rosterNames.has(m.name) && !merged.find(x => x.name === m.name)) {
        merged.push(m);
      }
    }
    
    setDraft(merged);
  };

  const handleApply = () => {
    onChange(draft);
    setOpen(false);
  };

  const handleReset = () => {
    const reset = defaultCohort();
    setDraft(reset);
    onChange(reset);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) ensureDraftHasAllRoster(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Settings2 className="w-4 h-4" />
          Cohort Builder
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select residents included in this analysis</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Choose who is "in cohort" (affects cohort mean/range and grid exports). Click the pencil to edit names.
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIncludedAll(true)}>
              Select all
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIncludedAll(false)}>
              Select none
            </Button>
          </div>
        </div>

        <div className="max-h-[55vh] overflow-auto border border-border rounded-lg">
          <div className="grid grid-cols-[1fr_110px_90px] gap-2 p-3 text-xs font-semibold text-muted-foreground border-b border-border bg-muted/30">
            <div>Resident</div>
            <div className="text-center">PGY</div>
            <div className="text-center">Include</div>
          </div>

          <div className="divide-y divide-border">
            {draft.map((m) => (
              <div key={m.name} className="grid grid-cols-[1fr_110px_90px] gap-2 p-3 items-center">
                <div className="flex items-center gap-2">
                  {editingName === m.name ? (
                    <>
                      <Input
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') finishEditing();
                          if (e.key === 'Escape') {
                            setEditingName(null);
                            setEditingValue('');
                          }
                        }}
                        className="h-8 text-sm"
                        autoFocus
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={finishEditing}>
                        <Check className="w-4 h-4 text-green-600" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-foreground">{m.name}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-50 hover:opacity-100" onClick={() => startEditing(m.name)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex justify-center">
                  <Select
                    value={String(m.pgy)}
                    onValueChange={(v) => updateMember(m.name, { pgy: parseInt(v, 10) })}
                  >
                    <SelectTrigger className="w-[96px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[7, 6, 5, 4, 3, 2, 1].map(pgy => (
                        <SelectItem key={pgy} value={String(pgy)}>
                          PGY{pgy}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-center">
                  <Checkbox
                    checked={m.included}
                    onCheckedChange={(checked) => updateMember(m.name, { included: Boolean(checked) })}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleReset}>
            Reset
          </Button>
          <Button onClick={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
