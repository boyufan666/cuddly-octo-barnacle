import {
  Brain,
  Camera,
  ClipboardCheck,
  Gamepad2,
  HeartPulse,
  History,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  ShieldCheck,
  Stethoscope,
  UsersRound,
  Video,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { AuthenticatedSession, RoleCode } from "@/types/api";

export type ScreenId =
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

export type ScreenMeta = {
  id: ScreenId;
  label: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  stepLabel?: string;
};

export type NavigationSection = {
  title: string;
  items: NavigationItemMeta[];
};

export type RoleNavigationId =
  | ScreenId
  | "assessmentReview"
  | "planManagement"
  | "preparationManagement"
  | "trainingReview"
  | "contentGovernance"
  | "operationConfig"
  | "familyProgress"
  | "familyAlerts"
  | "familyProfile";

export type RoleNavigationItem = {
  id: RoleNavigationId;
  label: string;
  screenId: ScreenId;
  activeScreenIds?: ScreenId[];
  href?: string;
};

export type NavigationItemMeta = ScreenMeta & {
  activeScreenIds?: ScreenId[];
  navId: RoleNavigationId;
  screenId: ScreenId;
};

export const screens: ScreenMeta[] = [
  {
    id: "login",
    label: "机构登录",
    description: "使用机构账号进入对应工作台",
    icon: KeyRound,
    stepLabel: "访问",
  },
  {
    id: "profile",
    label: "档案与授权",
    description: "患者资料、知情同意和家属共享范围",
    icon: ShieldCheck,
    stepLabel: "建档",
  },
  {
    id: "device",
    label: "设备与授权",
    description: "摄像头、麦克风和姿态识别检查",
    icon: Video,
    stepLabel: "设备",
  },
  {
    id: "assessment",
    label: "评估记录",
    description: "量表记录、语音录入和待复核评估建议",
    icon: Brain,
    stepLabel: "评估",
  },
  {
    id: "match",
    label: "方案建议",
    description: "基于评估形成待确认训练方案",
    icon: ClipboardCheck,
    stepLabel: "建议",
  },
  {
    id: "today",
    label: "今日训练",
    description: "查看今日训练处方和完成情况",
    icon: HeartPulse,
    stepLabel: "今日",
  },
  {
    id: "prep",
    label: "训练准备",
    description: "完成设备检测并创建训练会话",
    icon: Camera,
    stepLabel: "准备",
  },
  {
    id: "game",
    label: "进行训练",
    description: "按今日安排完成训练任务",
    icon: Gamepad2,
    stepLabel: "训练",
  },
  {
    id: "result",
    label: "训练记录",
    description: "查看训练结果、趋势和复核状态",
    icon: History,
    stepLabel: "回看",
  },
  {
    id: "family",
    label: "照护摘要",
    description: "家属查看授权范围内的进展与提醒",
    icon: UsersRound,
    stepLabel: "照护",
  },
  {
    id: "doctor",
    label: "患者",
    description: "医师查看负责患者和待处理事项",
    icon: Stethoscope,
    stepLabel: "患者",
  },
  {
    id: "plan",
    label: "计划",
    description: "调整、确认并下发康复计划",
    icon: ClipboardCheck,
    stepLabel: "计划",
  },
  {
    id: "admin",
    label: "账号",
    description: "账号审核、角色启用和家属账号管理",
    icon: LayoutDashboard,
    stepLabel: "账号",
  },
  {
    id: "security",
    label: "审计",
    description: "权限、脱敏导出和操作追踪",
    icon: LockKeyhole,
    stepLabel: "审计",
  },
];

export const patientTaskNavItems: RoleNavigationItem[] = [
  { id: "today", label: "今日", screenId: "today" },
  { id: "prep", label: "训练", screenId: "prep", activeScreenIds: ["prep", "game", "device"] },
  { id: "result", label: "记录", screenId: "result", activeScreenIds: ["result", "assessment", "match"] },
  { id: "profile", label: "我的", screenId: "profile" },
];

export const doctorNavItems: RoleNavigationItem[] = [
  { id: "doctor", label: "患者", screenId: "doctor" },
  { id: "assessmentReview", label: "评估", screenId: "assessment" },
  {
    id: "planManagement",
    label: "计划",
    screenId: "plan",
    activeScreenIds: ["plan", "match"],
  },
  {
    id: "preparationManagement",
    label: "准备",
    screenId: "plan",
  },
  { id: "trainingReview", label: "复核", screenId: "result" },
];

export const adminNavItems: RoleNavigationItem[] = [
  { id: "admin", label: "账号", screenId: "admin" },
  { id: "contentGovernance", label: "内容", screenId: "admin" },
  { id: "operationConfig", label: "配置", screenId: "admin" },
  { id: "security", label: "审计", screenId: "security" },
];

export const caregiverNavItems: RoleNavigationItem[] = [
  { id: "family", label: "照护", screenId: "family" },
  { id: "familyProgress", label: "进展", screenId: "family" },
  { id: "familyAlerts", label: "提醒", screenId: "family" },
  { id: "familyProfile", label: "我的", screenId: "family" },
];

export const roleHome: Record<RoleCode, ScreenId> = {
  patient: "today",
  caregiver: "family",
  doctor: "doctor",
  admin: "admin",
  admin_super: "admin",
  admin_operator: "admin",
  admin_auditor: "security",
};

export const visibleScreensByRole: Record<RoleCode, ScreenId[]> = {
  patient: patientTaskNavItems.map((item) => item.screenId),
  caregiver: caregiverNavItems.map((item) => item.screenId),
  doctor: doctorNavItems.map((item) => item.screenId),
  admin: adminNavItems.map((item) => item.screenId),
  admin_super: adminNavItems.map((item) => item.screenId),
  admin_operator: adminNavItems.map((item) => item.screenId),
  admin_auditor: adminNavItems.map((item) => item.screenId),
};

export function resolveHomeScreen(session: AuthenticatedSession) {
  return roleHome[session.context.primaryRole ?? "patient"];
}

export function resolveActiveRoleNavId(
  role: RoleCode | undefined,
  active: ScreenId,
  currentNavId: RoleNavigationId | null,
  roleItems: RoleNavigationItem[] | undefined,
): RoleNavigationId | null {
  if (!roleItems) return active;

  const currentItem = currentNavId
    ? roleItems.find((item) => item.id === currentNavId)
    : undefined;
  if (currentItem && roleNavigationItemMatchesScreen(currentItem, active)) {
    return currentItem.id;
  }

  return (
    roleItems.find((item) => roleNavigationItemMatchesScreen(item, active))
      ?.id ?? null
  );
}

export function roleNavigationItemMatchesScreen(
  item: RoleNavigationItem,
  active: ScreenId,
) {
  return item.screenId === active || Boolean(item.activeScreenIds?.includes(active));
}

export function buildNavigationSections(
  role: RoleCode | undefined,
  availableScreens: ScreenMeta[],
  roleItems: RoleNavigationItem[] | undefined,
): NavigationSection[] {
  const availableById = new Map(availableScreens.map((screen) => [screen.id, screen]));
  if (!role) {
    return [
      {
        title: "机构访问",
        items: availableScreens.map((screen) => ({
          ...screen,
          navId: screen.id,
          screenId: screen.id,
        })),
      },
    ];
  }

  if (!roleItems) {
    return [
      {
        title: "工作台导航",
        items: availableScreens.map((screen) => ({
          ...screen,
          navId: screen.id,
          screenId: screen.id,
        })),
      },
    ];
  }

  return [
    {
      title: resolveRoleNavigationTitle(role),
      items: roleItems
        .map((item): NavigationItemMeta | undefined => {
          const screen = availableById.get(item.screenId);
          return screen
            ? {
                ...screen,
                activeScreenIds: item.activeScreenIds,
                label: item.label,
                navId: item.id,
                screenId: item.screenId,
              }
            : undefined;
        })
        .filter((item): item is NavigationItemMeta => Boolean(item)),
    },
  ];
}

export function resolveRoleNavigationItems(role: RoleCode): RoleNavigationItem[] | undefined {
  if (role === "patient") return patientTaskNavItems;
  if (role === "caregiver") return caregiverNavItems;
  if (role === "doctor") return doctorNavItems;
  if (isAdminRole(role)) {
    return adminNavItems;
  }
}

export function resolveAuthorizedRoleNavigationItems(
  session: AuthenticatedSession,
  selectedPatientId?: string,
) {
  const role = session.context.primaryRole;
  if (!role) return [];
  if (role === "caregiver") {
    return caregiverNavItems.filter((item) => {
      if (item.id === "familyProfile") return true;
      if (!selectedPatientId) return false;
      if (item.id === "family") {
        return hasCaregiverPatientScope(session, selectedPatientId, "summary");
      }
      if (item.id === "familyProgress") {
        return hasCaregiverPatientScope(session, selectedPatientId, "progress");
      }
      if (item.id === "familyAlerts") {
        return hasCaregiverPatientScope(session, selectedPatientId, "reminders");
      }
      return false;
    });
  }
  if (isAdminRole(role)) {
    const permissions = new Set(session.context.adminPermissions);
    return adminNavItems.filter((item) => {
      if (item.id === "admin") return permissions.has("user.manage");
      if (item.id === "contentGovernance" || item.id === "operationConfig") {
        return permissions.has("game.manage");
      }
      if (item.id === "security") {
        return (
          permissions.has("dashboard.view") ||
          permissions.has("audit.read") ||
          permissions.has("data.export") ||
          permissions.has("quality_evidence.manage")
        );
      }
      return false;
    });
  }
  return resolveRoleNavigationItems(role) ?? [];
}

export function hasCaregiverPatientScope(
  session: AuthenticatedSession,
  patientId: string,
  scope: "summary" | "reminders" | "progress",
) {
  if (!session.context.caregiverPatientIds.includes(patientId)) return false;
  const value = session.context.caregiverScopes[patientId];
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)[scope] === true
  );
}

export function resolveRoleNavigationTitle(role: RoleCode) {
  if (role === "doctor") return "医师工作台";
  if (isAdminRole(role)) return "治理工作台";
  if (role === "caregiver") return "家属照护";
  return "患者任务";
}

export function isAdminRole(role?: RoleCode) {
  return (
    role === "admin" ||
    role === "admin_super" ||
    role === "admin_operator" ||
    role === "admin_auditor"
  );
}

export function isPatientLikeRole(role?: RoleCode) {
  return role === "patient" || role === "caregiver";
}
