"use client";

import { KeyRound } from "lucide-react";
import { FormEvent, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";

type LoginPanelProps = {
  dataStatus: string;
  onLogin: (account: string, password: string) => Promise<void>;
  onPasswordReset: (newPassword: string) => Promise<void>;
  passwordResetRequired: boolean;
};

async function consumeHookHandledError(action: () => Promise<void>) {
  try {
    await action();
    return true;
  } catch {
    return false;
  }
}

export async function runLoginSubmission(
  onLogin: LoginPanelProps["onLogin"],
  account: string,
  password: string,
) {
  await consumeHookHandledError(() => onLogin(account, password));
}

export function runPasswordResetSubmission(
  onPasswordReset: LoginPanelProps["onPasswordReset"],
  newPassword: string,
) {
  return consumeHookHandledError(() => onPasswordReset(newPassword));
}

export function LoginPanel({
  dataStatus,
  onLogin,
  onPasswordReset,
  passwordResetRequired,
}: LoginPanelProps) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const isClientReady = useClientReady();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isClientReady) return;
    const formData = new FormData(event.currentTarget);
    const submittedAccount = String(formData.get("account") ?? "");
    const submittedPassword = String(formData.get("password") ?? "");
    setIsSubmitting(true);
    try {
      await runLoginSubmission(onLogin, submittedAccount, submittedPassword);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) return;
    setIsSubmitting(true);
    try {
      const completed = await runPasswordResetSubmission(
        onPasswordReset,
        newPassword,
      );
      if (!completed) return;
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      className="h-full rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] p-5"
      data-testid="auth-login-panel"
    >
      <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-bold text-[var(--accent-strong)]">
        <KeyRound className="h-4 w-4" aria-hidden="true" />
        机构账号登录
      </div>
      <div className="mt-6">
        <h3 className="text-2xl font-black text-[var(--ink-strong)]">
          机构账号登录
        </h3>
      </div>
      {passwordResetRequired ? (
        <form onSubmit={submitPasswordReset}>
          <p className="mt-5 text-sm font-bold text-[var(--ink-soft)]">
            当前密码是管理员下发的临时密码。为保护账号，请设置新密码后重新登录。
          </p>
          <AuthInput
            label="新密码"
            name="new-password"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            disabled={isSubmitting}
          />
          <AuthInput
            label="确认新密码"
            name="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            disabled={isSubmitting}
          />
          {confirmPassword && newPassword !== confirmPassword ? (
            <p
              className="mt-2 text-sm font-bold text-[var(--danger-strong)]"
              role="alert"
            >
              两次输入的密码不一致。
            </p>
          ) : null}
          <Button
            className="mt-5 w-full"
            disabled={
              isSubmitting || !newPassword || newPassword !== confirmPassword
            }
            type="submit"
          >
            {isSubmitting ? dataStatus : "更新密码"}
          </Button>
        </form>
      ) : (
        <form onSubmit={submit}>
          <AuthInput
            label="账号"
            name="account"
            disabled={!isClientReady || isSubmitting}
            value={account}
            onChange={setAccount}
          />
          <AuthInput
            label="密码"
            name="password"
            disabled={!isClientReady || isSubmitting}
            type="password"
            value={password}
            onChange={setPassword}
          />
          <Button
            className="mt-5 w-full"
            disabled={isSubmitting || !isClientReady}
            type="submit"
          >
            {!isClientReady
              ? "登录准备中"
              : isSubmitting
                ? dataStatus
                : "进入工作台"}
          </Button>
        </form>
      )}
    </section>
  );
}

function AuthInput({
  disabled,
  label,
  name,
  onChange,
  type = "text",
  value,
}: {
  disabled?: boolean;
  label: string;
  name: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
  value: string;
}) {
  const inputId = `auth-${name}`;

  return (
    <div className="mt-5">
      <label
        className="text-sm font-black text-[var(--ink-soft)]"
        htmlFor={inputId}
      >
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] px-4 py-3 text-base font-bold text-[var(--ink-strong)] outline-none transition disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--ink-subtle)] focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[color:var(--accent-soft)]"
      />
    </div>
  );
}

function useClientReady() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}
