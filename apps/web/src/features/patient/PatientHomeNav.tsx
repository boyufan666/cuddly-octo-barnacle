import { CalendarCheck2, ClipboardList, Home, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

type PatientHomeNavItem = {
  id: string;
  label: string;
  onClick: () => void;
};

const icons = [Home, ClipboardList, CalendarCheck2, UserRound];

export function PatientHomeNav({
  activeId,
  items,
}: {
  activeId: string;
  items: PatientHomeNavItem[];
}) {
  return (
    <nav
      aria-label="患者任务导航"
      className="fixed inset-x-4 bottom-4 z-40 grid grid-cols-4 gap-2 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-2 shadow-[var(--shadow-panel)] md:hidden"
    >
      {items.map((item, index) => {
        const Icon = icons[index] ?? Home;
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={item.onClick}
            className={cn(
              "grid min-h-14 place-items-center rounded-[var(--radius-control)] px-2 text-xs font-black",
              active
                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                : "text-[var(--ink-soft)]",
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
