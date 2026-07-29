import { Bell, MessageCircle } from "lucide-react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";

export type CaregiverReminderItem = {
  categoryLabel: string;
  content: string;
  id: string;
  priorityLabel: string;
  title: string;
};

export type CaregiverFamilyNote = {
  authorName: string;
  body: string;
  comments: Array<{
    authorName: string;
    body: string;
    id: string;
  }>;
  createdAtLabel: string;
  id: string;
  moodLabel?: string;
  reactions: Array<{
    count: number;
    label: string;
  }>;
};

export type CaregiverNoteFormState = {
  body: string;
  mood: string;
};

type CaregiverReminderPanelProps = {
  commentForms: Record<string, string>;
  familyNoteTitle: string;
  isCreatingComment: boolean;
  isCreatingNote: boolean;
  isAvailable: boolean;
  noteForm: CaregiverNoteFormState;
  notes: CaregiverFamilyNote[];
  onCommentFormChange: (noteId: string, value: string) => void;
  onCreateComment: (noteId: string) => void;
  onCreateNote: () => void;
  onNoteFormChange: (field: keyof CaregiverNoteFormState, value: string) => void;
  reminders: CaregiverReminderItem[];
  sectionTitle: string;
};

export function CaregiverReminderPanel({
  commentForms,
  familyNoteTitle,
  isCreatingComment,
  isCreatingNote,
  isAvailable,
  noteForm,
  notes,
  onCommentFormChange,
  onCreateComment,
  onCreateNote,
  onNoteFormChange,
  reminders,
  sectionTitle,
}: CaregiverReminderPanelProps) {
  function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreateNote();
  }

  function handleCommentSubmit(
    event: FormEvent<HTMLFormElement>,
    noteId: string,
  ) {
    event.preventDefault();
    onCreateComment(noteId);
  }

  return (
    <div className="min-w-0">
      <Card tone="patient" className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <StatusBadge status={reminders.length ? "pending" : "review"}>
              {sectionTitle}
            </StatusBadge>
            <h3 className="mt-4 text-xl font-black text-[var(--ink-strong)]">
              医生发布给家属的注意事项
            </h3>
            <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
              有新的安全提醒、训练配合或日常照护建议时，会显示在这里。
            </p>
          </div>
          <Bell aria-hidden="true" className="h-6 w-6 text-[var(--accent-strong)]" />
        </div>
      </Card>

      <div className="mt-5 grid gap-3">
        {!isAvailable ? (
          <UnavailableCareCircleNotice />
        ) : reminders.length ? (
          reminders.map((item) => (
            <Card key={item.id} tone="plain" className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status="pending">{item.priorityLabel}</StatusBadge>
                <span className="text-xs font-black text-[var(--ink-subtle)]">
                  {item.categoryLabel}
                </span>
              </div>
              <h4 className="mt-3 break-words text-base font-black text-[var(--ink-strong)]">
                {item.title}
              </h4>
              <p className="mt-2 break-words text-sm font-bold leading-6 text-[var(--ink-soft)]">
                {item.content}
              </p>
            </Card>
          ))
        ) : (
          <EmptyState
            title="暂未收到医生提醒"
            description="医生发布给家属的提醒会出现在这里。"
          />
        )}
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <MessageCircle
            aria-hidden="true"
            className="h-5 w-5 text-[var(--accent-strong)]"
          />
          <h4 className="text-base font-black text-[var(--ink-strong)]">
            {familyNoteTitle}
          </h4>
        </div>
        <form
          className="mt-4 grid gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-4"
          onSubmit={handleNoteSubmit}
        >
          <label className="grid gap-2 text-sm font-black text-[var(--ink-strong)]">
            今日观察
            <textarea
              className="min-h-28 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-page)] px-3 py-3 text-sm font-bold leading-6 text-[var(--ink-strong)] outline-none transition placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
              maxLength={500}
              onChange={(event) => onNoteFormChange("body", event.target.value)}
              placeholder="记录今天的陪伴、训练配合或需要医生留意的变化。"
              value={noteForm.body}
            />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-[12rem] flex-1 gap-2 text-sm font-black text-[var(--ink-strong)]">
              状态
              <select
                className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-page)] px-3 text-sm font-bold text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
                onChange={(event) => onNoteFormChange("mood", event.target.value)}
                value={noteForm.mood}
              >
                <option value="">不选择状态</option>
                <option value="positive">状态不错</option>
                <option value="encouragement">鼓励陪伴</option>
                <option value="concern">需要关注</option>
              </select>
            </label>
            <Button
              disabled={!noteForm.body.trim()}
              isLoading={isCreatingNote}
              type="submit"
            >
              保存观察
            </Button>
          </div>
        </form>
        <div className="mt-4 grid gap-3">
          {!isAvailable ? (
            <UnavailableCareCircleNotice />
          ) : notes.length ? (
            notes.map((note) => (
              <Card key={note.id} tone="plain" className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-[var(--ink-strong)]">
                      {note.authorName}
                    </p>
                    <p className="text-xs font-bold text-[var(--ink-subtle)]">
                      {note.createdAtLabel}
                    </p>
                  </div>
                  {note.moodLabel ? (
                    <StatusBadge status="ready">{note.moodLabel}</StatusBadge>
                  ) : null}
                </div>
                <p className="mt-3 break-words text-sm font-bold leading-6 text-[var(--ink-soft)]">
                  {note.body}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {note.reactions.length ? (
                    note.reactions.map((reaction) => (
                      <StatusBadge key={reaction.label} status="complete">
                        {reaction.label} {reaction.count}
                      </StatusBadge>
                    ))
                  ) : (
                    <StatusBadge status="review">等待回应</StatusBadge>
                  )}
                </div>
                {note.comments.length ? (
                  <div className="mt-4 grid gap-2 border-t border-[var(--line-subtle)] pt-3">
                    {note.comments.map((comment) => (
                      <p
                        key={comment.id}
                        className="rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-bold leading-6 text-[var(--ink-soft)]"
                      >
                        <span className="font-black text-[var(--ink-strong)]">
                          {comment.authorName}
                        </span>
                        ：{comment.body}
                      </p>
                    ))}
                  </div>
                ) : null}
                <form
                  className="mt-4 grid gap-3 border-t border-[var(--line-subtle)] pt-3"
                  onSubmit={(event) => handleCommentSubmit(event, note.id)}
                >
                  <label className="grid gap-2 text-sm font-black text-[var(--ink-strong)]">
                    家庭回应
                    <textarea
                      className="min-h-20 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-page)] px-3 py-3 text-sm font-bold leading-6 text-[var(--ink-strong)] outline-none transition placeholder:text-[var(--ink-subtle)] focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
                      maxLength={500}
                      onChange={(event) =>
                        onCommentFormChange(note.id, event.target.value)
                      }
                      placeholder="补充一句回应，保存后会刷新列表。"
                      value={commentForms[note.id] ?? ""}
                    />
                  </label>
                  <div>
                    <Button
                      disabled={!(commentForms[note.id] ?? "").trim()}
                      isLoading={isCreatingComment}
                      size="sm"
                      type="submit"
                    >
                      保存回应
                    </Button>
                  </div>
                </form>
              </Card>
            ))
          ) : (
            <EmptyState
              title="还没有家庭观察"
              description="完成授权后，家属记录的陪伴和观察会显示在这里。"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function UnavailableCareCircleNotice() {
  return (
    <p className="rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-5 text-center text-sm font-bold text-[var(--warning)]">
      家庭照护记录未加载，暂时无法显示医生提醒和家庭观察。
    </p>
  );
}
