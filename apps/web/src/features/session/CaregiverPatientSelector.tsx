type CaregiverPatientSelectorProps = {
  onSelectPatient: (patientId: string) => void;
  options?: Array<{ id: string; name: string }>;
  selectedPatientId: string | null;
};

export function CaregiverPatientSelector({
  onSelectPatient,
  options,
  selectedPatientId,
}: CaregiverPatientSelectorProps) {
  if (options === undefined) {
    return (
      <p className="mb-5 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 text-sm font-bold text-[var(--warning)]">
        授权患者列表未加载，暂时无法选择照护患者。
      </p>
    );
  }
  if (!options.length) return null;

  return (
    <label className="mb-5 block max-w-md">
      <span className="mb-2 block text-sm font-black text-[var(--ink-strong)]">
        当前照护患者
      </span>
      <select
        aria-label="选择授权患者"
        className="min-h-12 w-full rounded-[8px] border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-4 text-sm font-bold text-[var(--ink-strong)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-strong)]/20"
        onChange={(event) => onSelectPatient(event.target.value)}
        value={selectedPatientId ?? ""}
      >
        <option disabled value="">
          请选择授权患者
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
