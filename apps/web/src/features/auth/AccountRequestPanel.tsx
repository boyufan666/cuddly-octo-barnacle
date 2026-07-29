"use client";

import { KeyRound } from "lucide-react";
import { FormEvent, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";

export type AccountRequestFormState = {
  requestedRole: "patient" | "caregiver";
  account: string;
  initialPassword: string;
  displayName: string;
  mobilePhone: string;
  gender: string;
  age: string;
  caregiverName: string;
  caregiverPhone: string;
  healthSummary: string;
};

type AccountRequestPanelProps = {
  form: AccountRequestFormState;
  isBusy: boolean;
  onChange: <K extends keyof AccountRequestFormState>(
    field: K,
    value: AccountRequestFormState[K],
  ) => void;
  onSubmit: (form: AccountRequestFormState) => Promise<void>;
};

export function AccountRequestPanel({
  form,
  isBusy,
  onChange,
  onSubmit,
}: AccountRequestPanelProps) {
  const canSubmit = isAccountRequestFormComplete(form);
  const isClientReady = useClientReady();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isBusy || !isClientReady) return;
    void onSubmit(form);
  }

  return (
    <section
      className="mt-4 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] p-5"
      data-testid="auth-account-request"
    >
      <div>
        <div>
          <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-bold text-[var(--accent-strong)]">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            申请开通
          </div>
          <h3 className="mt-4 text-2xl font-black text-[var(--ink-strong)]">
            没有账号？先提交申请开通
          </h3>
        </div>
      </div>
      <form onSubmit={submit}>
        <fieldset
          disabled={isBusy || !isClientReady}
          className="mt-5 grid gap-x-4 disabled:opacity-60 md:grid-cols-2"
        >
          <AuthSelect
            label="申请身份"
            name="requestedRole"
            value={form.requestedRole}
            onChange={(value) =>
              onChange("requestedRole", value as AccountRequestFormState["requestedRole"])
            }
            options={[
              ["patient", "患者本人"],
              ["caregiver", "家属照护人"],
            ]}
          />
          <AuthInput
            label="姓名"
            name="displayName"
            value={form.displayName}
            onChange={(value) => onChange("displayName", value)}
          />
          <AuthInput
            label="登录账号"
            name="account"
            value={form.account}
            onChange={(value) => onChange("account", value)}
          />
          <AuthInput
            label="初始密码"
            name="initialPassword"
            type="password"
            value={form.initialPassword}
            onChange={(value) => onChange("initialPassword", value)}
          />
          <AuthInput
            label="手机号"
            name="mobilePhone"
            value={form.mobilePhone}
            onChange={(value) => onChange("mobilePhone", value)}
          />
          {form.requestedRole === "patient" ? (
            <>
              <AuthInput
                label="年龄"
                name="age"
                type="number"
                value={form.age}
                onChange={(value) => onChange("age", value)}
              />
              <AuthSelect
                label="性别"
                name="gender"
                value={form.gender}
                onChange={(value) => onChange("gender", value)}
                options={[
                  ["", "请选择"],
                  ["female", "女"],
                  ["male", "男"],
                  ["other", "其他"],
                ]}
              />
              <AuthInput
                label="紧急联系人"
                name="caregiverName"
                value={form.caregiverName}
                onChange={(value) => onChange("caregiverName", value)}
              />
              <AuthInput
                label="紧急联系电话"
                name="caregiverPhone"
                value={form.caregiverPhone}
                onChange={(value) => onChange("caregiverPhone", value)}
              />
            </>
          ) : null}
        </fieldset>
        <AuthTextArea
          label="补充说明"
          name="healthSummary"
          value={form.healthSummary}
          onChange={(value) => onChange("healthSummary", value)}
          readOnly={isBusy || !isClientReady}
        />
        <div className="mt-5 flex justify-end">
          <Button disabled={!canSubmit || isBusy || !isClientReady} type="submit">
            {isBusy ? "正在提交审核" : "提交审核"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function AuthInput({
  label,
  name,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  name: keyof AccountRequestFormState;
  onChange: (value: string) => void;
  type?: "text" | "password" | "number";
  value: string;
}) {
  const inputId = `account-request-${label}`;

  return (
    <div className="mt-5">
      <label className="text-sm font-black text-[var(--ink-soft)]" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] px-4 py-3 text-base font-bold text-[var(--ink-strong)] outline-none transition disabled:bg-[var(--surface-muted)] disabled:text-[var(--ink-subtle)] focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[color:var(--accent-soft)]"
      />
    </div>
  );
}

function AuthSelect({
  label,
  name,
  onChange,
  options,
  value,
}: {
  label: string;
  name: keyof AccountRequestFormState;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  const selectId = `account-request-${label}`;

  return (
    <div className="mt-5">
      <label className="text-sm font-black text-[var(--ink-soft)]" htmlFor={selectId}>
        {label}
      </label>
      <select
        id={selectId}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] px-4 py-3 text-base font-bold text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[color:var(--accent-soft)]"
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </div>
  );
}

function AuthTextArea({
  label,
  name,
  onChange,
  readOnly,
  value,
}: {
  label: string;
  name: keyof AccountRequestFormState;
  onChange: (value: string) => void;
  readOnly?: boolean;
  value: string;
}) {
  const textareaId = `account-request-${label}`;

  return (
    <div className="mt-5">
      <label className="text-sm font-black text-[var(--ink-soft)]" htmlFor={textareaId}>
        {label}
      </label>
      <textarea
        id={textareaId}
        name={name}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-28 w-full rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] px-4 py-3 text-base font-bold leading-6 text-[var(--ink-strong)] outline-none transition read-only:bg-[var(--surface-muted)] read-only:text-[var(--ink-subtle)] focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[color:var(--accent-soft)]"
      />
    </div>
  );
}

function isAccountRequestFormComplete(form: AccountRequestFormState) {
  const baseComplete =
    form.account.trim().length >= 4 &&
    form.initialPassword.length >= 6 &&
    form.displayName.trim().length > 0;
  if (form.requestedRole === "caregiver") {
    return baseComplete;
  }
  const age = Number(form.age);
  return (
    baseComplete &&
    form.gender.trim().length > 0 &&
    Number.isInteger(age) &&
    age >= 1 &&
    age <= 120
  );
}

function useClientReady() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}
