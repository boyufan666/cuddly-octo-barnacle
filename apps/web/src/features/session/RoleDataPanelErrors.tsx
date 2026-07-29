import type { RoleDataPanelError } from "./useRoleData";

export function RoleDataPanelErrors({
  errors,
}: {
  errors: RoleDataPanelError[];
}) {
  if (!errors.length) return null;

  return (
    <section
      aria-label="部分业务面板加载失败"
      className="mb-5 rounded-[8px] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-5 py-4 text-[var(--warning-strong)]"
    >
      <h2 className="font-black">部分内容未能加载</h2>
      <ul className="mt-2 grid gap-1 text-sm font-bold">
        {errors.map((error) => (
          <li key={error.panel}>
            <strong>{error.label}加载失败：</strong>
            <span>{error.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
