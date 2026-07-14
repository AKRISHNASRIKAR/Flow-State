import { Button, inputClass } from '../../components/ui';

export interface KeyValueRow {
  key: string;
  value: string;
}

interface KeyValueEditorProps {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = 'Header name',
  valuePlaceholder = 'Value',
}: KeyValueEditorProps) {
  const update = (index: number, patch: Partial<KeyValueRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2">
          <input
            className={inputClass}
            placeholder={keyPlaceholder}
            value={row.key}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder={valuePlaceholder}
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <Button size="sm" variant="ghost" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            ✕
          </Button>
        </div>
      ))}
      <Button size="sm" onClick={() => onChange([...rows, { key: '', value: '' }])}>
        + Add header
      </Button>
    </div>
  );
}
