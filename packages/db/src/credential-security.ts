import { argon2id, hash, verify } from 'argon2';

const ARGON2ID_PREFIX = '$argon2id$';

export const ARGON2ID_PARAMETERS = Object.freeze({
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

export const CREDENTIAL_PASSWORD_MIN_LENGTH = 8;
export const CREDENTIAL_PASSWORD_MAX_LENGTH = 128;

export class CredentialPasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialPasswordPolicyError';
  }
}

export function validateCredentialPassword(value: unknown): string {
  if (typeof value !== 'string') {
    throw new CredentialPasswordPolicyError('Password must be a string.');
  }
  if (
    value.length < CREDENTIAL_PASSWORD_MIN_LENGTH ||
    value.length > CREDENTIAL_PASSWORD_MAX_LENGTH
  ) {
    throw new CredentialPasswordPolicyError(
      `Password length must be between ${CREDENTIAL_PASSWORD_MIN_LENGTH} and ${CREDENTIAL_PASSWORD_MAX_LENGTH} characters.`,
    );
  }
  return value;
}

export function hashCredential(password: string) {
  return hash(validateCredentialPassword(password), {
    type: argon2id,
    ...ARGON2ID_PARAMETERS,
  });
}

export async function verifyCredential(
  passwordHash: string,
  password: string,
) {
  if (!passwordHash.startsWith(ARGON2ID_PREFIX)) return false;
  return verify(passwordHash, password);
}
