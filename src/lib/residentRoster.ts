export type ResidentRosterEntry = {
  name: string;
  pgy: number;
};

// Internal roster / knowledge bank for PGY mapping.
// NOTE: Keep names in "First Last" form as they typically appear in the case logs.
export const RESIDENT_ROSTER: ResidentRosterEntry[] = [
  // PGY7
  { name: 'Joshua Bernstock', pgy: 7 },
  { name: 'Melissa Chua', pgy: 7 },
  { name: 'Saksham Gupta', pgy: 7 },

  // PGY6
  { name: 'Marcelle Altshuler', pgy: 6 },
  { name: 'Joshua Chalif', pgy: 6 },
  { name: 'Jason Chen', pgy: 6 },

  // PGY5
  { name: 'Casey Jarvis', pgy: 5 },
  { name: 'Sean Lyne', pgy: 5 },
  { name: 'James Tanner McMahon', pgy: 5 },

  // PGY4
  { name: 'Adam Glaser', pgy: 4 },
  { name: 'David Liu', pgy: 4 },
  { name: 'Gabrielle Luiselli', pgy: 4 },

  // PGY3
  { name: 'Eric Chalif', pgy: 3 },
  { name: 'Ron Gadot', pgy: 3 },
  { name: 'Chibueze Nwagwu', pgy: 3 },
  { name: 'Maren Loe', pgy: 3 },

  // PGY2
  { name: 'Sarah Blitz', pgy: 2 },
  { name: 'Alexander Yearley', pgy: 2 },
  { name: 'Eduardo Maury', pgy: 2 },

  // PGY1
  { name: 'Ruchit V. Patel', pgy: 1 },
  { name: 'Solomiia Savchuk', pgy: 1 },
];

const normalizeName = (name: string) => {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // drop punctuation
    .replace(/\s+/g, ' ')
    .trim();
};

const nameTokens = (name: string) =>
  normalizeName(name)
    .split(' ')
    // drop single-letter middle initials (e.g. "v")
    .filter(t => t.length > 1);

const buildIndex = () => {
  const byFull = new Map<string, number>();
  const byFirstLast = new Map<string, number>();

  for (const entry of RESIDENT_ROSTER) {
    const full = normalizeName(entry.name);
    byFull.set(full, entry.pgy);

    const tokens = nameTokens(entry.name);
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    if (first && last) {
      byFirstLast.set(`${first}|${last}`, entry.pgy);
    }
  }

  return { byFull, byFirstLast };
};

const rosterIndex = buildIndex();

export function lookupPgy(residentName: string): number | undefined {
  const normalized = normalizeName(residentName);
  const direct = rosterIndex.byFull.get(normalized);
  if (direct) return direct;

  const tokens = nameTokens(residentName);
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  if (!first || !last) return undefined;

  return rosterIndex.byFirstLast.get(`${first}|${last}`);
}
