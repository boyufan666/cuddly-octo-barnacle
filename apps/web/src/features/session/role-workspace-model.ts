import type { AdminWorkspaceId } from "@/features/admin/AdminOverviewPage";
import type { CaregiverWorkspaceSection } from "@/features/caregiver/CaregiverWorkspacePage";
import type { DoctorWorkspaceId } from "@/features/doctor/DoctorWorkspacePage";
import type { PatientWorkspaceScreen } from "@/features/patient/PatientWorkspacePage";
import type {
  RoleNavigationId,
  ScreenId,
} from "@/features/session/role-navigation";
import type {
  AdminPermission,
  CollectionCondition,
  RoleCode,
} from "@/types/api";

export function doctorWorkspaceFromNavId(
  navId: RoleNavigationId | null,
  activeScreen: ScreenId,
): DoctorWorkspaceId {
  if (navId === "assessmentReview" || activeScreen === "assessment") {
    return "assessment";
  }
  if (navId === "preparationManagement") {
    return "preparation";
  }
  if (
    navId === "planManagement" ||
    activeScreen === "plan" ||
    activeScreen === "match"
  ) {
    return "plan";
  }
  if (navId === "trainingReview" || activeScreen === "result") {
    return "review";
  }
  return "patients";
}

export function caregiverWorkspaceSectionFromNavId(
  navId: RoleNavigationId | null,
): CaregiverWorkspaceSection {
  if (navId === "familyProgress") return "progress";
  if (navId === "familyAlerts") return "alerts";
  if (navId === "familyProfile") return "profile";
  return "overview";
}

export function adminWorkspaceFromNavId(
  navId: RoleNavigationId | null,
): AdminWorkspaceId {
  if (navId === "contentGovernance") return "content";
  if (navId === "operationConfig") return "config";
  if (navId === "security") return "audit";
  return "accounts";
}

export function isPatientWorkspaceScreen(
  active: ScreenId,
): active is PatientWorkspaceScreen {
  return (
    active === "today" ||
    active === "prep" ||
    active === "game" ||
    active === "result" ||
    active === "profile"
  );
}

export function upsertCollectionCondition(
  current: CollectionCondition[],
  condition: CollectionCondition,
) {
  const byId = new Map(current.map((item) => [item.id, item]));
  byId.set(condition.id, condition);
  return Array.from(byId.values()).sort((a, b) => a.code.localeCompare(b.code));
}

export function mergeCollectionConditions(
  source?: CollectionCondition[],
  local: CollectionCondition[] = [],
) {
  if (source === undefined && local.length === 0) return undefined;
  const byId = new Map<string, CollectionCondition>();
  for (const condition of local) {
    byId.set(condition.id, condition);
  }
  for (const condition of source ?? []) {
    byId.set(condition.id, condition);
  }
  return Array.from(byId.values()).sort((a, b) => a.code.localeCompare(b.code));
}

export function gameContentStatusLabel(value?: string) {
  if (value === "active") return "已启用";
  if (value === "inactive") return "已下架";
  if (value === "archived") return "已归档";
  return value ?? "未知状态";
}

export function gameBuildStatusLabel(value?: string) {
  if (value === "pending_assets") return "待上传资源";
  if (value === "validating") return "校验中";
  if (value === "released") return "已发布";
  if (value === "rejected") return "已驳回";
  return value ?? "未知状态";
}

export function roleLabel(role?: RoleCode) {
  const labels: Record<RoleCode, string> = {
    patient: "患者端",
    caregiver: "家属端",
    doctor: "医师端",
    admin: "管理员",
    admin_super: "平台管理人员",
    admin_operator: "普通运营",
    admin_auditor: "审计查看人员",
  };
  return role ? labels[role] : "未登录";
}

export function hasAdminPermission(
  permissions: AdminPermission[],
  permission: AdminPermission,
) {
  return permissions.includes(permission);
}
