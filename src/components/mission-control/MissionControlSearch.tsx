type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function MissionControlSearch({ value, onChange }: Props) {
  return (
    <label style={{ display: 'block' }}>
      <span className="mc-sr-only">Search everything in this section</span>
      <input
        className="mc-search"
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search everything in this section…"
        autoComplete="off"
        data-testid="mc-search"
      />
    </label>
  );
}
