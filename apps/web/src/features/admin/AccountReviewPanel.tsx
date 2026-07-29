"use client";

import { UserCheck, UsersRound } from "lucide-react";
import { FormEvent } from "react";
import type {
  RegistrationRequest,
  ReviewRegistrationRequest,
} from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { CaregiverAccountFormState } from "./admin-governance-forms";

type AccountReviewPanelProps = {
  canReview: boolean;
  isBusy: boolean;
  onReviewRegistrationRequest: (
    request: RegistrationRequest,
    decision: ReviewRegistrationRequest["decision"],
    decisionReason: string,
  ) => Promise<void>;
  requests?: RegistrationRequest[];
};

export function AccountReviewPanel({
  canReview,
  isBusy,
  onReviewRegistrationRequest,
  requests,
}: AccountReviewPanelProps) {
  const requestsUnavailable = requests === undefined;
  const pendingRequests = requests?.filter(
    (request) => request.reviewStatus === "pending",
  );
  const recentRequests = requests?.slice(0, 6);
  const pendingRequestCount = pendingRequests?.length ?? 0;

  function review(
    request: RegistrationRequest,
    decision: ReviewRegistrationRequest["decision"],
  ) {
    const reason =
      decision === "approved"
        ? "机构已核验申请身份，准予开通。"
        : "申请资料需要补充，请重新提交。";
    void onReviewRegistrationRequest(request, decision, reason);
  }

  return (
    <Card tone="governance" className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck
              aria-hidden="true"
              className="h-5 w-5 text-[var(--accent-strong)]"
            />
            <StatusBadge status={requestsUnavailable ? "review" : pendingRequestCount ? "pending" : "ready"}>
              账号开通审核
            </StatusBadge>
          </div>
          <h3 className="mt-4 text-xl font-black text-[var(--ink-strong)]">
            待审核账号申请
          </h3>
          <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
            患者和家属提交申请后，机构审核通过才会创建正式登录账号。
          </p>
        </div>
        <StatusBadge status={requestsUnavailable ? "review" : pendingRequestCount ? "pending" : "complete"}>
          {requestsUnavailable
            ? "申请数据未加载"
            : pendingRequestCount
              ? `${pendingRequestCount} 个待处理`
              : "暂无待处理"}
        </StatusBadge>
      </div>

      {!canReview ? (
        <p className="mt-5 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 text-sm font-bold leading-6 text-[var(--warning)]">
          当前账号没有账号开通审核权限，只能查看已加载的申请状态。
        </p>
      ) : null}

      <div className="mt-5 grid gap-3">
        {recentRequests?.map((request) => (
          <article
            key={request.id}
            className="border-b border-[var(--line-subtle)] pb-4 last:border-b-0"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="break-words text-base font-black text-[var(--ink-strong)]">
                  {request.displayName} · {registrationRoleLabel(request.requestedRole)}
                </h4>
                <p className="mt-1 break-words text-sm font-bold leading-6 text-[var(--ink-soft)]">
                  账号 {request.account}
                  {request.mobilePhone ? ` · 手机 ${request.mobilePhone}` : ""}
                </p>
                <p className="mt-1 text-xs font-bold text-[var(--ink-subtle)]">
                  提交时间 {formatDateTime(request.createdAt)}
                </p>
              </div>
              <StatusBadge status={registrationStatusTone(request.reviewStatus)}>
                {registrationStatusLabel(request.reviewStatus)}
              </StatusBadge>
            </div>
            {request.reviewNote ? (
              <p className="mt-3 text-sm font-bold leading-6 text-[var(--ink-soft)]">
                处理说明：{request.reviewNote}
              </p>
            ) : null}
            {request.reviewStatus === "pending" ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  disabled={!canReview}
                  isLoading={isBusy}
                  onClick={() => review(request, "approved")}
                  size="sm"
                >
                  通过申请
                </Button>
                <Button
                  disabled={!canReview}
                  intent="secondary"
                  isLoading={isBusy}
                  onClick={() => review(request, "rejected")}
                  size="sm"
                >
                  退回申请
                </Button>
              </div>
            ) : null}
          </article>
        ))}
        {requestsUnavailable ? (
          <p className="rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-5 text-center text-sm font-bold text-[var(--warning)]">
            账号开通申请未加载，暂时无法显示申请状态。
          </p>
        ) : recentRequests?.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-muted)] p-5 text-center text-sm font-bold text-[var(--ink-subtle)]">
            暂无账号开通申请。申请人可在登录页提交开通申请。
          </p>
        ) : null}
      </div>
    </Card>
  );
}

export function CaregiverAccountCreatePanel({
  canCreateCaregiver,
  form,
  isBusy,
  onChange,
  onCreateCaregiverAccount,
}: {
  canCreateCaregiver: boolean;
  form: CaregiverAccountFormState;
  isBusy: boolean;
  onChange: (field: keyof CaregiverAccountFormState, value: string) => void;
  onCreateCaregiverAccount: (form: CaregiverAccountFormState) => Promise<void>;
}) {
  const canSubmit = canCreateCaregiver && isCaregiverAccountFormComplete(form);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isBusy) return;
    void onCreateCaregiverAccount(form);
  }

  return (
    <Card tone="governance" className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <UsersRound
              aria-hidden="true"
              className="h-5 w-5 text-[var(--accent-strong)]"
            />
            <StatusBadge status={canCreateCaregiver ? "pending" : "review"}>
              家属账号管理
            </StatusBadge>
          </div>
          <h3 className="mt-4 text-xl font-black text-[var(--ink-strong)]">
            新建待授权家属账号
          </h3>
          <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
            管理员只负责创建登录账号，患者签署家属共享授权并绑定后才可查看摘要。
          </p>
        </div>
      </div>
      {!canCreateCaregiver ? (
        <p className="mt-5 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 text-sm font-bold leading-6 text-[var(--warning)]">
          当前账号没有家属账号创建权限。
        </p>
      ) : null}
      <form onSubmit={submit}>
        <fieldset
          className="mt-5 grid gap-4 disabled:opacity-60"
          disabled={!canCreateCaregiver || isBusy}
        >
          <TextInput
            label="家属登录账号"
            value={form.account}
            onChange={(value) => onChange("account", value)}
          />
          <TextInput
            label="家属初始密码"
            type="password"
            value={form.initialPassword}
            onChange={(value) => onChange("initialPassword", value)}
          />
          <TextInput
            label="家属姓名"
            value={form.displayName}
            onChange={(value) => onChange("displayName", value)}
          />
          <TextInput
            label="家属手机号"
            value={form.mobilePhone}
            onChange={(value) => onChange("mobilePhone", value)}
          />
        </fieldset>
        <Button
          className="mt-5 w-full"
          disabled={!canSubmit}
          isLoading={isBusy}
          type="submit"
        >
          创建家属账号
        </Button>
      </form>
    </Card>
  );
}

function TextInput({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <input
        className="mt-2 min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-panel)] px-3 text-sm font-bold text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function isCaregiverAccountFormComplete(form: CaregiverAccountFormState) {
  return (
    form.account.trim().length >= 4 &&
    form.initialPassword.trim().length >= 6 &&
    form.displayName.trim().length > 0
  );
}

function registrationRoleLabel(value: RegistrationRequest["requestedRole"]) {
  if (value === "patient") return "患者";
  if (value === "caregiver") return "家属";
  return value;
}

function registrationStatusLabel(value: RegistrationRequest["reviewStatus"]) {
  if (value === "pending") return "待审核";
  if (value === "approved") return "已通过";
  if (value === "rejected") return "已退回";
  return value;
}

function registrationStatusTone(value: RegistrationRequest["reviewStatus"]) {
  if (value === "pending") return "pending";
  if (value === "approved") return "complete";
  return "blocked";
}

function formatDateTime(value?: string) {
  if (!value) return "待生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
