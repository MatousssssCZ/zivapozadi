import { useEffect, useState, type ReactNode } from 'react';

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="row" title={hint}><span className="row-label">{label}</span><span className="row-field">{children}</span></label>;
}

export function NumField({ value, onCommit, step = 1, min, max, testId }: { value: number; onCommit: (v: number) => void; step?: number; min?: number; max?: number; testId?: string }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(Math.round(value * 1000) / 1000)), [value]);
  const commit = () => {
    const v = Number(txt.replace(',', '.'));
    if (!Number.isFinite(v)) { setTxt(String(value)); return; }
    const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    if (c !== value) onCommit(c); else setTxt(String(value));
  };
  return <input data-testid={testId} type="number" step={step} min={min} max={max} value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />;
}

export function TextField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [txt, setTxt] = useState(value);
  useEffect(() => setTxt(value), [value]);
  return <input type="text" value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={() => txt !== value && onCommit(txt)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />;
}

export function Select<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return <select value={value} onChange={(e) => onChange(e.target.value as T)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}

export function Check({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return <label className="check"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {label}</label>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div className="section"><div className="section-title">{title}</div>{children}</div>;
}
