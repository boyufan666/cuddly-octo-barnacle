"use client";

import { AccountRequestPanel, type AccountRequestFormState } from "./AccountRequestPanel";
import { LoginPanel } from "./LoginPanel";

export type { AccountRequestFormState } from "./AccountRequestPanel";

type AuthEntryPanelProps = {
  dataStatus: string;
  isCreatingRegistrationRequest: boolean;
  onCreateRegistrationRequest: (
    form: AccountRequestFormState,
  ) => Promise<void>;
  onLogin: (account: string, password: string) => Promise<void>;
  onPasswordReset: (newPassword: string) => Promise<void>;
  passwordResetRequired: boolean;
  onRegistrationRequestFormChange: <K extends keyof AccountRequestFormState>(
    field: K,
    value: AccountRequestFormState[K],
  ) => void;
  registrationRequestForm: AccountRequestFormState;
};

export function AuthEntryPanel({
  dataStatus,
  isCreatingRegistrationRequest,
  onCreateRegistrationRequest,
  onLogin,
  onPasswordReset,
  passwordResetRequired,
  onRegistrationRequestFormChange,
  registrationRequestForm,
}: AuthEntryPanelProps) {
  return (
    <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.88fr)_minmax(360px,0.62fr)]">
      <div className="min-w-0">
        <LoginPanel
          onLogin={onLogin}
          onPasswordReset={onPasswordReset}
          passwordResetRequired={passwordResetRequired}
          dataStatus={dataStatus}
        />
      </div>
      <AccountRequestPanel
        form={registrationRequestForm}
        onChange={onRegistrationRequestFormChange}
        onSubmit={onCreateRegistrationRequest}
        isBusy={isCreatingRegistrationRequest}
      />
    </section>
  );
}
