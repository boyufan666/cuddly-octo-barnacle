import {
  ARGON2ID_PARAMETERS,
  hashCredential,
  validateCredentialPassword,
  verifyCredential,
} from './credential-security';

describe('credential security', () => {
  it('hashes new credentials with Argon2id and verifies them', async () => {
    const hash = await hashCredential('Correct-Horse-253913!');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyCredential(hash, 'Correct-Horse-253913!')).resolves.toBe(
      true,
    );
    await expect(verifyCredential(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('rejects legacy SHA-256 digests without a compatibility path', async () => {
    await expect(
      verifyCredential(
        'ab89db279a359801e5e6596142e8a8a430b61c8d67c11e8a4b307b5b6c45f569',
        '253913',
      ),
    ).resolves.toBe(false);
  });

  it('uses the locked Argon2id work factors', async () => {
    const credentialHash = await hashCredential('Correct-Horse-253913!');

    expect(ARGON2ID_PARAMETERS).toEqual({
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    expect(credentialHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it.each([
    ['12345678', 8],
    ['x'.repeat(128), 128],
    [' padded ', 8],
  ])('accepts a %i-character password without trimming', (password) => {
    expect(validateCredentialPassword(password)).toBe(password);
  });

  it.each([undefined, null, 12345678, {}, []])(
    'rejects a non-string password body: %p',
    (password) => {
      expect(() => validateCredentialPassword(password)).toThrow(
        /must be a string/i,
      );
    },
  );

  it.each(['1234567', 'x'.repeat(129)])(
    'rejects a password outside 8..128 characters',
    (password) => {
      expect(() => validateCredentialPassword(password)).toThrow(/8.*128/);
    },
  );
});
