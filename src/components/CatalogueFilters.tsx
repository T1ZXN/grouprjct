import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";

/**
 * Generic catalogue filter panel.
 *
 * Each list route declares a small local config (FilterField[]) and hands the
 * panel the current search params + an onChange that pushes URL search params
 * (so filters are shareable / back-button friendly). The panel collapses
 * behind a "Filters" toggle on small screens and renders as a sidebar on
 * larger ones.
 */
export interface FilterField {
  /** Search-param key, e.g. "diameter". */
  key: string;
  label: string;
  type: "select" | "text" | "number";
  /** For type "select": { value: "" } is rendered as "All". */
  options?: { value: string; label: string }[];
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface CatalogueFiltersProps {
  fields: FilterField[];
  /** Current search-param values keyed by field key (undefined = unset). */
  values: Record<string, string | undefined>;
  /** Called with (key, value); pass undefined to clear a filter. */
  onChange: (key: string, value: string | undefined) => void;
  /** Clear every filter (keeps ?q= and ?vehicle= context). */
  onClearAll: () => void;
  /** Number of active filters (drives the "Filters (N)" badge). */
  activeCount: number;
}

/** A number input that commits to the URL on blur/Enter (no janky per-keystroke navigates). */
function NumberField({
  field,
  value,
  onCommit,
}: {
  field: FilterField;
  value: string | undefined;
  onCommit: (v: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const commit = () => {
    const t = draft.trim();
    onCommit(t === "" ? undefined : t);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      min={field.min}
      max={field.max}
      step={field.step ?? 1}
      placeholder={field.placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className="field-input"
      aria-label={field.label}
    />
  );
}

export function CatalogueFilters({ fields, values, onChange, onClearAll, activeCount }: CatalogueFiltersProps) {
  const [open, setOpen] = useState(false);
  const set = (key: string, value: string | undefined) => onChange(key, value);

  const controls = (
    <div className="space-y-5">
      {fields.map((field) => (
        <div key={field.key}>
          <label htmlFor={`filter-${field.key}`} className="field-label">
            {field.label}
          </label>
          {field.type === "select" && (
            <select
              id={`filter-${field.key}`}
              value={values[field.key] ?? ""}
              onChange={(e) => set(field.key, e.target.value || undefined)}
              className="field-input cursor-pointer"
            >
              <option value="">All</option>
              {field.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {field.type === "text" && (
            <input
              id={`filter-${field.key}`}
              type="search"
              value={values[field.key] ?? ""}
              onChange={(e) => set(field.key, e.target.value === "" ? undefined : e.target.value)}
              placeholder={field.placeholder}
              className="field-input"
              autoComplete="off"
            />
          )}
          {field.type === "number" && (
            <NumberField field={field} value={values[field.key]} onCommit={(v) => set(field.key, v)} />
          )}
        </div>
      ))}
      <div className="border-t border-line pt-4">
        <button
          type="button"
          onClick={onClearAll}
          disabled={activeCount === 0}
          className="btn btn-outline w-full !py-2.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear all filters
        </button>
      </div>
    </div>
  );

  return (
    <aside className="w-full lg:w-64 lg:shrink-0">
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="btn btn-outline mb-4 w-full justify-between lg:hidden"
      >
        <span>Filters</span>
        <span className="text-xs font-bold text-race-bright">
          {activeCount > 0 ? `(${activeCount} active)` : ""}
        </span>
      </button>

      <div className={open ? "block" : "hidden lg:block"}>{controls}</div>
    </aside>
  );
}

/** Sort dropdown for the results toolbar. "" = featured/source order. */
export function SortSelect({
  value,
  onChange,
  options,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      aria-label="Sort results"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="field-input w-auto cursor-pointer !py-2 text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          Sort: {o.label}
        </option>
      ))}
    </select>
  );
}