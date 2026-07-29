import type {
  CareCircleResponse,
  CaregiverSummaryResponse,
  CaregiverTrainingSession,
} from "@/types/api";
import type { CaregiverProgressStat } from "./CaregiverProgressPanel";
import type {
  CaregiverFamilyNote,
  CaregiverReminderItem,
} from "./CaregiverReminderPanel";

export type CaregiverWorkspaceModel = {
  careCircleAvailable: boolean;
  dailyDurationLabel: string;
  hasSummary: boolean;
  latestTrainingLabel: string;
  notes: CaregiverFamilyNote[];
  patientDisplayName: string;
  progressStats: CaregiverProgressStat[];
  recentTrainingLabel: string;
  reminderText: string;
  reminders: CaregiverReminderItem[];
  riskLabel: string;
  scopeItems: string[];
};

export function buildCaregiverWorkspaceModel(
  summary?: CaregiverSummaryResponse,
  circle?: CareCircleResponse,
): CaregiverWorkspaceModel {
  const patientDisplayName = summary?.patient.name ?? "等待授权";
  const recentTraining = summary?.recentTraining ?? [];
  const completedTraining = recentTraining.filter(isCompletedCaregiverTraining);
  const dailyDurationLabel = summary?.currentPlan
    ? `${summary.currentPlan.dailyDuration} 分钟`
    : "待安排";
  const reminderText = summary?.currentPlan
    ? `${patientDisplayName} 今日建议完成 ${summary.currentPlan.dailyDuration} 分钟训练。`
    : "医生确认安排后，家属可在这里查看今日提醒。";

  return {
    careCircleAvailable: circle !== undefined,
    dailyDurationLabel,
    hasSummary: Boolean(summary),
    latestTrainingLabel: recentTraining[0]?.gameContent.name ?? "等待首次训练",
    notes: buildCaregiverFamilyNotes(circle),
    patientDisplayName,
    progressStats: [
      {
        label: "完成次数",
        value: `${completedTraining.length} 次`,
        helper: "近 7 天训练记录",
      },
      {
        label: "最近一次",
        value: recentTraining[0]?.gameContent.name ?? "等待首次训练",
        helper: "医生确认后同步",
      },
      {
        label: "今日安排",
        value: dailyDurationLabel,
        helper: "按医生安排展示",
      },
    ],
    recentTrainingLabel: `${recentTraining.length} 次`,
    reminderText,
    reminders: buildCaregiverReminderItems(circle),
    riskLabel: caregiverRiskLabel(summary?.currentRisk),
    scopeItems: summary
      ? [
          "可查看医生确认后的训练进展",
          "可查看医生发布给家属的提醒",
          "不可调整训练安排，需联系医生处理",
        ]
      : [
          "等待患者授权后显示训练进展",
          "等待医生发布给家属的提醒",
          "未授权前不能查看照护摘要",
        ],
  };
}

function buildCaregiverReminderItems(
  circle?: CareCircleResponse,
): CaregiverReminderItem[] {
  return (circle?.precautions ?? [])
    .filter((item) => item.status === "published")
    .slice(0, 4)
    .map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      priorityLabel: carePriorityLabel(item.priority),
      categoryLabel: careCategoryLabel(item.category),
    }));
}

function buildCaregiverFamilyNotes(
  circle?: CareCircleResponse,
): CaregiverFamilyNote[] {
  return (circle?.posts ?? [])
    .filter((post) => post.moderationStatus === "visible")
    .slice(0, 4)
    .map((post) => ({
      id: post.id,
      authorName: post.author.displayName ?? "照护成员",
      body: post.body,
      createdAtLabel: formatCareDateTime(post.createdAt),
      moodLabel: post.mood ? careMoodLabel(post.mood) : undefined,
      reactions: post.reactions.map((reaction) => ({
        label: careReactionLabel(reaction.reactionType),
        count: reaction.count,
      })),
      comments: post.comments.slice(0, 2).map((comment) => ({
        id: comment.id,
        authorName: comment.author.displayName ?? "家属",
        body: comment.body,
      })),
    }));
}

function isCompletedCaregiverTraining(session: CaregiverTrainingSession) {
  return session.sessionStatus === "completed" || Boolean(session.result);
}

function caregiverRiskLabel(risk?: "low" | "moderate" | "high" | null) {
  if (risk === "high") return "高风险";
  if (risk === "moderate") return "中度风险";
  if (risk === "low") return "低风险";
  return "待评估";
}

function carePriorityLabel(value?: string) {
  if (value === "high") return "重点提醒";
  if (value === "low") return "日常建议";
  return "常规提醒";
}

function careCategoryLabel(value?: string) {
  if (value === "safety") return "安全照护";
  if (value === "training") return "训练配合";
  if (value === "medicine") return "用药提醒";
  if (value === "diet") return "饮食作息";
  return "照护建议";
}

function careMoodLabel(value?: string) {
  if (value === "positive") return "状态不错";
  if (value === "encouragement") return "家属鼓励";
  if (value === "concern") return "需要关注";
  return "照护记录";
}

function careReactionLabel(value?: string) {
  if (value === "encourage") return "鼓励";
  if (value === "like") return "收到";
  if (value === "hug") return "陪伴";
  return "回应";
}

function formatCareDateTime(value?: string) {
  if (!value) return "时间待同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待同步";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
