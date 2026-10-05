/**
 * Tolerant field reader for third-party responses whose schema is not contractually fixed.
 * Brief section 0.4: try several candidate field names and warn when none matches, rather than
 * guessing one name and silently producing a wrong number.
 */
export type Candidate = string;

function at(source: unknown, path: Candidate): unknown {
  let value = source;
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

export class FieldPicker {
  /** Labels whose candidate names all failed to match, surfaced as collector warnings. */
  readonly missing: string[] = [];
  readonly matched: Record<string, string> = {};

  constructor(private readonly source: unknown) {}

  private find(label: string, candidates: Candidate[]): unknown {
    for (const candidate of candidates) {
      const value = at(this.source, candidate);
      if (value !== undefined && value !== null) {
        this.matched[label] = candidate;
        return value;
      }
    }
    this.missing.push(label);
    return undefined;
  }

  /** Counts: negative or unparseable means the platform hid the value, which is null, never zero. */
  number(label: string, candidates: Candidate[]): number | null {
    const value = this.find(label, candidates);
    if (value === undefined) return null;
    const n = typeof value === 'string' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
    return n;
  }

  /** Structured values (arrays, objects) that the caller interprets itself. */
  raw(label: string, candidates: Candidate[]): unknown {
    return this.find(label, candidates);
  }

  text(label: string, candidates: Candidate[]): string | null {
    const value = this.find(label, candidates);
    return typeof value === 'string' ? value : value == null ? null : String(value);
  }

  bool(label: string, candidates: Candidate[]): boolean | null {
    const value = this.find(label, candidates);
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (Array.isArray(value)) return value.length > 0;
    return null;
  }

  /** Unix seconds or milliseconds, or an ISO string, to an ISO string. */
  date(label: string, candidates: Candidate[]): string | null {
    const value = this.find(label, candidates);
    if (value === undefined) return null;
    if (typeof value === 'number') {
      const ms = value > 1e12 ? value : value * 1000;
      return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
    }
    if (typeof value !== 'string') return null;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 1e8)
      return new Date(numeric > 1e12 ? numeric : numeric * 1000).toISOString();
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }

  url(label: string, candidates: Candidate[]): string | null {
    const value = this.text(label, candidates);
    if (!value) return null;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  /** One warning per response, naming only the fields that could not be read at all. */
  warnings(scope: string): string[] {
    const unique = [...new Set(this.missing)];
    return unique.length
      ? [`${scope}: no known field matched for ${unique.join(', ')}; stored as Not measured.`]
      : [];
  }
}
