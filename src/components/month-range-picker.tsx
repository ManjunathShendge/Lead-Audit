'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import {
  MAX_PERIOD_MONTHS,
  monthLabel,
  monthsBetween,
  periodLabel,
  selectableMonths,
  type Period,
} from '@/lib/period';

/** Month-range field: pick a start month, then an end month, then Apply. Null means the default window. */
export function MonthRangePicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: Period | null;
  onChange: (next: Period | null) => void;
}) {
  const months = useMemo(() => selectableMonths(new Date()), []);
  const rows = useMemo(
    () => Array.from({ length: Math.ceil(months.length / 3) }, (_, i) => months.slice(i * 3, i * 3 + 3)),
    [months],
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Period | null>(value);
  // True after the first click, while the end month is still to be chosen.
  const [picking, setPicking] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setPicking(false);
  };
  const toggle = () => {
    if (open) return close();
    setDraft(value);
    setPicking(false);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // Open on the chosen range, or on the latest months.
    const target = list.current?.querySelector('[data-selected="true"]') ?? list.current?.lastElementChild;
    target?.scrollIntoView({ block: 'nearest' });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (month: string) => {
    if (!picking || !draft) {
      setDraft({ from: month, to: month });
      setPicking(true);
      return;
    }
    setDraft(month < draft.from ? { from: month, to: draft.from } : { from: draft.from, to: month });
    setPicking(false);
  };
  const tooLong = (month: string) =>
    picking &&
    !!draft &&
    (month < draft.from ? monthsBetween(month, draft.from) : monthsBetween(draft.from, month)) >
      MAX_PERIOD_MONTHS;

  return (
    <div className={open ? 'mrp open' : 'mrp'} ref={root}>
      <div className="mrp-field">
        <fieldset className="mrp-outline" aria-hidden="true">
          <legend>
            <span>Time period</span>
          </legend>
        </fieldset>
        <span className="mrp-float">Time period</span>
        <button
          id={id}
          type="button"
          className="mrp-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Time period: ${periodLabel(value)}`}
          onClick={toggle}
        >
          <CalendarDays size={20} />
          <span className="mrp-value">{periodLabel(open ? draft : value)}</span>
          <span className="mrp-caret" />
        </button>
      </div>
      {open && (
        <div className="mrp-panel" role="dialog" aria-label="Choose time period">
          <div className="mrp-months" ref={list}>
            {rows.map((row) => (
              <div className="mrp-row" key={row[0]}>
                {row.map((month) => {
                  const inRange = !!draft && month >= draft.from && month <= draft.to;
                  const start = draft?.from === month;
                  const end = draft?.to === month;
                  return (
                    <div
                      key={month}
                      className={[
                        'mrp-cell',
                        inRange && draft!.from !== draft!.to ? 'in-range' : '',
                        start ? 'start' : '',
                        end ? 'end' : '',
                      ].join(' ')}
                      data-selected={start || undefined}
                    >
                      <button
                        type="button"
                        className={start || end ? 'mrp-month edge' : 'mrp-month'}
                        aria-pressed={inRange}
                        disabled={tooLong(month)}
                        onClick={() => choose(month)}
                      >
                        {monthLabel(month)}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="mrp-hint">
            {picking ? 'Now choose the last month.' : `Choose up to ${MAX_PERIOD_MONTHS} months.`}
          </p>
          <div className="mrp-actions">
            <button
              type="button"
              className="mrp-reset"
              onClick={() => {
                onChange(null);
                close();
              }}
            >
              Last 30 days
            </button>
            <button type="button" className="mrp-button" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="mrp-button primary"
              disabled={!draft}
              onClick={() => {
                onChange(draft);
                close();
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
