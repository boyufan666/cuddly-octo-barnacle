import type { ComponentType, ReactNode, SVGProps } from "react";
import { PatientTaskLayout } from "@/components/layout/PatientTaskLayout";
import { cn } from "@/lib/utils";

export type RoleShellRole =
  | "patient"
  | "caregiver"
  | "doctor"
  | "admin"
  | "admin_super"
  | "admin_operator"
  | "admin_auditor";

export type RoleShellScreenId =
  | "login"
  | "profile"
  | "device"
  | "assessment"
  | "match"
  | "today"
  | "prep"
  | "game"
  | "result"
  | "family"
  | "doctor"
  | "plan"
  | "admin"
  | "security";

export type RoleShellNavigationId =
  | RoleShellScreenId
  | "assessmentReview"
  | "registrationReview"
  | "planManagement"
  | "preparationManagement"
  | "trainingReview"
  | "contentGovernance"
  | "operationConfig"
  | "familyProgress"
  | "familyAlerts"
  | "familyProfile";

export type RoleShellNavigationItem = {
  activeScreenIds?: RoleShellScreenId[];
  href?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  id: RoleShellScreenId;
  label: string;
  navId: RoleShellNavigationId;
  screenId: RoleShellScreenId;
  stepLabel?: string;
};

export type RoleShellNavigationSection = {
  items: RoleShellNavigationItem[];
  title: string;
};

type RoleShellProps = {
  actionStatus: string | null;
  activeNavId: RoleShellNavigationId | null;
  children: ReactNode;
  className?: string;
  dataError?: string | null;
  headerMeta: {
    roleLabel: string;
    userLabel?: string;
  };
  navigationSections: RoleShellNavigationSection[];
  onLogout?: () => void;
  onNavigate: (
    screen: RoleShellScreenId,
    navId?: RoleShellNavigationId,
  ) => void;
  patientLikeShell: boolean;
  role?: RoleShellRole;
};

export function RoleShell({
  actionStatus,
  activeNavId,
  children,
  className,
  dataError,
  headerMeta,
  navigationSections,
  onLogout,
  onNavigate,
  patientLikeShell,
  role,
}: RoleShellProps) {
  const patientTaskNavigation =
    patientLikeShell && role ? (
      <PatientTaskNavigation
        activeNavId={activeNavId}
        items={navigationSections.flatMap((section) => section.items)}
        onChange={(screen, navId) => onNavigate(screen, navId)}
      />
    ) : null;

  return (
    <div
      className={cn(
        "relative mx-auto flex h-full min-h-0 flex-col px-4 py-4 sm:px-5",
        patientLikeShell ? "max-w-[1180px]" : "max-w-[1320px]",
        className,
      )}
    >
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line-subtle)] pb-4">
          <div>
            <p className="text-sm font-bold text-[var(--accent-strong)]">
              {headerMeta.roleLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {headerMeta.userLabel ? (
              <>
                <span className="rounded-[8px] border border-[var(--line-subtle)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-bold text-[var(--ink-soft)]">
                  {headerMeta.userLabel}
                </span>
                {onLogout ? (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="min-h-10 rounded-[8px] border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-4 py-2 text-sm font-bold text-[var(--ink-soft)] transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-strong)]/20"
                  >
                    退出登录
                  </button>
                ) : null}
              </>
            ) : (
              <span className="rounded-[8px] border border-[var(--line-subtle)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-bold text-[var(--ink-soft)]">
                请使用机构分配的账号登录
              </span>
            )}
          </div>
        </header>

        {!patientLikeShell ? (
          <AppNavigation
            activeNavId={activeNavId}
            onChange={(screen, navId) => onNavigate(screen, navId)}
            sections={navigationSections}
          />
        ) : null}

        <PatientTaskLayout
          className={patientLikeShell ? undefined : "pb-0"}
          navigation={patientTaskNavigation}
        >
          {dataError ? (
            <div className="mb-4 rounded-[8px] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-5 py-4 font-bold text-[var(--warning-strong)]">
              {dataError}
            </div>
          ) : null}
          {actionStatus ? (
            <div
              aria-live="polite"
              className="mb-4 rounded-[8px] border border-[var(--success-line)] bg-[var(--success-soft)] px-5 py-4 font-bold text-[var(--success-strong)]"
              role="status"
            >
              {actionStatus}
            </div>
          ) : null}

          <div className="min-h-0 flex-1">{children}</div>
        </PatientTaskLayout>
      </section>
    </div>
  );
}

function AppNavigation({
  activeNavId,
  onChange,
  sections,
}: {
  activeNavId: RoleShellNavigationId | null;
  onChange: (screen: RoleShellScreenId, navId: RoleShellNavigationId) => void;
  sections: RoleShellNavigationSection[];
}) {
  return (
    <nav
      aria-label="工作台导航"
      className="mb-4 grid gap-2"
      data-testid="app-nav"
    >
      {sections.map((section) => (
        <section
          key={section.title}
          className="min-w-0 border-b border-[var(--line-subtle)] pb-3"
        >
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <p className="text-xs font-bold text-[var(--accent-strong)]">
              {section.title}
            </p>
          </div>
          <div
            className="grid grid-cols-2 gap-2 pb-1 sm:flex sm:flex-wrap"
            data-testid="app-nav-items"
          >
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeNavId === item.navId;
              return (
                <button
                  key={item.navId}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onChange(item.id, item.navId)}
                  className={cn(
                    "inline-flex min-h-12 min-w-0 w-full items-center justify-center gap-2 rounded-[8px] border px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-strong)]/20 sm:w-auto sm:shrink-0 sm:px-4",
                    isActive
                      ? "border-[var(--ink-strong)] bg-[var(--ink-strong)] text-[var(--ink-inverse)]"
                      : "border-[var(--line-subtle)] bg-[var(--surface-paper)] text-[var(--ink-soft)] hover:bg-[var(--surface-muted)]",
                  )}
                  type="button"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

function PatientTaskNavigation({
  activeNavId,
  items,
  onChange,
}: {
  activeNavId: RoleShellNavigationId | null;
  items: RoleShellNavigationItem[];
  onChange: (screen: RoleShellScreenId, navId: RoleShellNavigationId) => void;
}) {
  return (
    <nav
      aria-label="患者任务导航"
      className="z-40 grid shrink-0 grid-cols-5 gap-2 rounded-[8px] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-2 shadow-[var(--shadow-panel)]"
      data-testid="patient-task-nav"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeNavId === item.navId;
        return (
          <button
            key={item.navId}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => onChange(item.screenId, item.navId)}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[8px] px-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-strong)]/20",
              isActive
                ? "bg-[var(--ink-strong)] text-[var(--ink-inverse)]"
                : "text-[var(--ink-soft)] hover:bg-[var(--surface-muted)]",
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
