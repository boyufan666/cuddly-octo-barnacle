"use client";

import { CaregiverProgressPanel } from "./CaregiverProgressPanel";
import {
  CaregiverReminderPanel,
  type CaregiverNoteFormState,
} from "./CaregiverReminderPanel";
import { CaregiverScopePanel } from "./CaregiverScopePanel";
import { CaregiverSummaryPanel } from "./CaregiverSummaryPanel";
import type { CaregiverWorkspaceModel } from "./caregiver-workspace-model";

export type CaregiverWorkspaceSection = "overview" | "progress" | "alerts" | "profile";

type CaregiverWorkspacePageProps = {
  activeSection: CaregiverWorkspaceSection;
  commentForms: Record<string, string>;
  isCreatingComment: boolean;
  isCreatingNote: boolean;
  model: CaregiverWorkspaceModel;
  noteForm: CaregiverNoteFormState;
  onCommentFormChange: (noteId: string, value: string) => void;
  onCreateComment: (noteId: string) => void;
  onCreateNote: () => void;
  onNoteFormChange: (field: keyof CaregiverNoteFormState, value: string) => void;
};

const caregiverSectionCopy: Record<
  CaregiverWorkspaceSection,
  { eyebrow: string; title: string; subtitle: string }
> = {
  overview: {
    eyebrow: "照护",
    title: "今日照护",
    subtitle: "查看授权患者、今日提醒和医生确认后的照护重点。",
  },
  progress: {
    eyebrow: "进展",
    title: "训练进展",
    subtitle: "查看医生确认后的训练记录和今日安排。",
  },
  alerts: {
    eyebrow: "提醒",
    title: "医生注意事项",
    subtitle: "查看医生发布给家属的提醒和家庭观察记录。",
  },
  profile: {
    eyebrow: "我的",
    title: "授权范围",
    subtitle: "查看照护关系、授权状态和可见范围。",
  },
};

export function CaregiverWorkspacePage({
  activeSection,
  commentForms,
  isCreatingComment,
  isCreatingNote,
  model,
  noteForm,
  onCommentFormChange,
  onCreateComment,
  onCreateNote,
  onNoteFormChange,
}: CaregiverWorkspacePageProps) {
  const copy = caregiverSectionCopy[activeSection];

  return (
    <section className="min-w-0">
      <p className="text-xs font-black text-[var(--accent-strong)]">
        {copy.eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-black text-[var(--ink-strong)] md:text-3xl">
        {copy.title}
      </h2>
      <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-[var(--ink-soft)] md:text-base md:leading-7">
        {copy.subtitle}
      </p>

      <div className="mt-6 grid gap-5" data-testid="caregiver-primary-workspace">
        {activeSection === "overview" ? (
          <section id="family-overview">
            <CaregiverSummaryPanel
              dailyDurationLabel={model.dailyDurationLabel}
              hasSummary={model.hasSummary}
              patientDisplayName={model.patientDisplayName}
              recentTrainingLabel={model.recentTrainingLabel}
              reminderText={model.reminderText}
              riskLabel={model.riskLabel}
              sectionTitle="授权患者"
            />
          </section>
        ) : null}

        {activeSection === "progress" ? (
          <section id="family-progress">
            <CaregiverProgressPanel
              latestTrainingLabel={model.latestTrainingLabel}
              sectionTitle="进展"
              stats={model.progressStats}
              trendTitle="近期情况"
            />
          </section>
        ) : null}

        {activeSection === "alerts" ? (
          <section id="family-alerts">
            <CaregiverReminderPanel
              isAvailable={model.careCircleAvailable}
              commentForms={commentForms}
              familyNoteTitle="家庭观察"
              isCreatingComment={isCreatingComment}
              isCreatingNote={isCreatingNote}
              noteForm={noteForm}
              notes={model.notes}
              onCommentFormChange={onCommentFormChange}
              onCreateComment={onCreateComment}
              onCreateNote={onCreateNote}
              onNoteFormChange={onNoteFormChange}
              reminders={model.reminders}
              sectionTitle="提醒"
            />
          </section>
        ) : null}

        {activeSection === "profile" ? (
          <section id="family-profile">
            <CaregiverScopePanel
              hasSummary={model.hasSummary}
              patientDisplayName={model.patientDisplayName}
              scopeItems={model.scopeItems}
              sectionTitle="我的"
              visibleScopeTitle="可见范围"
            />
          </section>
        ) : null}
      </div>
    </section>
  );
}
