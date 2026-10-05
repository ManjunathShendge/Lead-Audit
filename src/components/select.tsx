'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export type SelectOption = { value: string; label: string };

/**
 * Themed dropdown used instead of the native <select>.
 * Button + listbox with the WAI-ARIA keyboard model: arrows, Home/End, Enter/Space, Esc, type to jump.
 */
export function Select({
  id,
  value,
  options,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
}: {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const auto = useId();
  const buttonId = id ?? `select-${auto}`;
  const listId = `${buttonId}-list`;
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [active, setActive] = useState(0);
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  useEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted option visible inside the list without scrolling the page.
  useEffect(() => {
    const box = list.current;
    const item = box?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!open || !box || !item) return;
    if (item.offsetTop < box.scrollTop) box.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > box.scrollTop + box.clientHeight)
      box.scrollTop = item.offsetTop + item.offsetHeight - box.clientHeight;
  }, [open, active]);

  function show() {
    if (disabled) return;
    // Open upwards when the viewport has no room below.
    const box = button.current?.getBoundingClientRect();
    setUp(!!box && window.innerHeight - box.bottom < 60 + options.length * 48 && box.top > window.innerHeight / 2);
    setActive(selected);
    setOpen(true);
  }

  function close(refocus = true) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  function choose(index: number) {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    close();
  }

  function onListKey(e: React.KeyboardEvent) {
    const last = options.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      Home: 0,
      End: last,
    };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    } else if (e.key.length === 1) {
      const key = e.key.toLowerCase();
      const next = options.findIndex((o, i) => i > active && o.label.toLowerCase().startsWith(key));
      const found = next >= 0 ? next : options.findIndex((o) => o.label.toLowerCase().startsWith(key));
      if (found >= 0) setActive(found);
    }
  }

  return (
    <div className={`select${open ? ' open' : ''}${up ? ' up' : ''}`} ref={root}>
      <button
        ref={button}
        id={buttonId}
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className="select-value">{options[selected]?.label}</span>
        <ChevronDown size={18} className="select-chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul
          ref={list}
          id={listId}
          className="select-list"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={ariaLabel ? undefined : buttonId}
          aria-label={ariaLabel}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKey}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === selected}
              className={i === active ? 'select-option active' : 'select-option'}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <span>{o.label}</span>
              {i === selected && <Check size={16} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
