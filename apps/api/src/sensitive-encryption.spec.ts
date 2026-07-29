import * as sharedContract from '@rehab-platform/db';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as sensitiveEncryption from './sensitive-encryption';
import {
  createPhoneLookupHmac,
  decryptSensitiveJson,
  encryptSensitiveJson,
  SENSITIVE_ENCRYPTION_MAX_CIPHERTEXT_BYTES,
  type SensitiveEncryptionAad,
  type SensitiveEncryptionEnvelope,
  type SensitiveEncryptionKey,
} from './sensitive-encryption';
import {
  requireMimoApiKey,
  ProductionRuntimeDependencyConfigurationError,
  requireSensitiveEncryptionKey,
  validateProductionRuntimeConfiguration,
} from './config';
import * as configModule from './config';

const sensitiveEncryptionKeyToken = 'SENSITIVE_ENCRYPTION_KEY';

describe('API sensitive encryption boundary', () => {
  it('exports one Nest provider backed directly by the strict key loader', () => {
    expect(configModule).toMatchObject({
      SENSITIVE_ENCRYPTION_KEY: sensitiveEncryptionKeyToken,
      sensitiveEncryptionKeyProvider: {
        provide: sensitiveEncryptionKeyToken,
        useFactory: requireSensitiveEncryptionKey,
      },
    });
  });

  it('is a strict thin re-export of the shared database crypto contract', () => {
    expect(encryptSensitiveJson).toBe(sharedContract.encryptSensitiveJson);
    expect(decryptSensitiveJson).toBe(sharedContract.decryptSensitiveJson);
    expect(createPhoneLookupHmac).toBe(sharedContract.createPhoneLookupHmac);
    expect(SENSITIVE_ENCRYPTION_MAX_CIPHERTEXT_BYTES).toBe(
      sharedContract.SENSITIVE_ENCRYPTION_MAX_CIPHERTEXT_BYTES,
    );

    expect(Object.keys(sensitiveEncryption).sort()).toEqual([
      'SENSITIVE_ENCRYPTION_MAX_CIPHERTEXT_BYTES',
      'createPhoneLookupHmac',
      'decryptSensitiveJson',
      'encryptSensitiveJson',
    ]);
    expect(sensitiveEncryption).not.toHaveProperty(
      'requireSensitiveEncryptionConfig',
    );
  });

  it('requires explicit key material and never reads runtime environment config', () => {
    const key: SensitiveEncryptionKey = {
      kid: 'api-sensitive-key-2026-07',
      key: Buffer.alloc(32, 4),
    };
    const aad: SensitiveEncryptionAad = {
      tableName: 'registration_request',
      recordId: '67e55044-10b1-426f-9247-bb680e5fe0c8',
      fieldName: 'profileSnapshot',
    };
    const originalKey = process.env.SENSITIVE_DATA_KEY;
    const originalKeyRef = process.env.SENSITIVE_DATA_KEY_REF;
    delete process.env.SENSITIVE_DATA_KEY;
    delete process.env.SENSITIVE_DATA_KEY_REF;

    try {
      const envelope: SensitiveEncryptionEnvelope = encryptSensitiveJson(
        { mobilePhone: '13800138000' },
        aad,
        key,
      );
      expect(decryptSensitiveJson(envelope, aad, key)).toEqual({
        mobilePhone: '13800138000',
      });
    } finally {
      if (originalKey === undefined) delete process.env.SENSITIVE_DATA_KEY;
      else process.env.SENSITIVE_DATA_KEY = originalKey;
      if (originalKeyRef === undefined)
        delete process.env.SENSITIVE_DATA_KEY_REF;
      else process.env.SENSITIVE_DATA_KEY_REF = originalKeyRef;
    }
  });

  it('loads one explicit canonical 32-byte runtime key with its exact key id', () => {
    process.env.SENSITIVE_DATA_KEY_REF =
      'secret-manager://rehab/unit-sensitive-key';
    process.env.SENSITIVE_DATA_KEY = Buffer.alloc(32, 7).toString('base64');

    const key = requireSensitiveEncryptionKey();

    expect(key.kid).toBe('secret-manager://rehab/unit-sensitive-key');
    expect(Buffer.from(key.key)).toEqual(Buffer.alloc(32, 7));
  });

  it.each([
    {
      label: 'missing key id',
      keyRef: undefined,
      key: Buffer.alloc(32, 7).toString('base64'),
    },
    {
      label: 'blank key id',
      keyRef: ' ',
      key: Buffer.alloc(32, 7).toString('base64'),
    },
    {
      label: 'missing key',
      keyRef: 'secret-manager://rehab/unit-sensitive-key',
      key: undefined,
    },
    {
      label: 'non-canonical key encoding',
      keyRef: 'secret-manager://rehab/unit-sensitive-key',
      key: Buffer.alloc(32, 7).toString('base64').replace(/=$/, ''),
    },
    {
      label: 'wrong key length',
      keyRef: 'secret-manager://rehab/unit-sensitive-key',
      key: Buffer.alloc(31, 7).toString('base64'),
    },
  ])('hard-fails $label without a default key', ({ keyRef, key }) => {
    if (keyRef === undefined) delete process.env.SENSITIVE_DATA_KEY_REF;
    else process.env.SENSITIVE_DATA_KEY_REF = keyRef;
    if (key === undefined) delete process.env.SENSITIVE_DATA_KEY;
    else process.env.SENSITIVE_DATA_KEY = key;

    expect(() => requireSensitiveEncryptionKey()).toThrow(
      /SENSITIVE_DATA_KEY_REF|SENSITIVE_DATA_KEY/,
    );
  });

  describe('production Secret File sources', () => {
    let secretDirectory: string;

    beforeEach(() => {
      secretDirectory = mkdtempSync(join(tmpdir(), 'rehab-api-secret-'));
    });

    afterEach(() => {
      rmSync(secretDirectory, { recursive: true, force: true });
    });

    it('loads the sensitive encryption key only from an approved production Secret File', () => {
      const filePath = join(secretDirectory, 'sensitive_data_key');
      const encodedKey = Buffer.alloc(32, 9).toString('base64');
      writeFileSync(filePath, encodedKey, 'utf8');

      const key = requireSensitiveEncryptionKey(
        {
          NODE_ENV: 'production',
          SENSITIVE_DATA_KEY_REF:
            'secret-manager://rehab/prod-sensitive-data-v1',
          SENSITIVE_DATA_KEY_FILE: filePath,
        },
        { secretDirectory },
      );

      expect(key.kid).toBe('secret-manager://rehab/prod-sensitive-data-v1');
      expect(key.key).toEqual(Buffer.alloc(32, 9));
    });

    it('rejects production raw sensitive-key variables even when a Secret File exists', () => {
      const filePath = join(secretDirectory, 'sensitive_data_key');
      writeFileSync(filePath, Buffer.alloc(32, 9).toString('base64'), 'utf8');

      expect(() =>
        requireSensitiveEncryptionKey(
          {
            NODE_ENV: 'production',
            SENSITIVE_DATA_KEY_REF:
              'secret-manager://rehab/prod-sensitive-data-v1',
            SENSITIVE_DATA_KEY_FILE: filePath,
            SENSITIVE_DATA_KEY: 'must-not-be-used',
          },
          { secretDirectory },
        ),
      ).toThrow(/SENSITIVE_DATA_KEY must not be defined in production/);
    });

    it('rejects Secret File paths outside the approved directory and non-file targets', () => {
      const nestedDirectory = join(secretDirectory, 'directory-target');
      mkdirSync(nestedDirectory);

      expect(() =>
        requireMimoApiKey(
          {
            NODE_ENV: 'production',
            MIMO_API_KEY_REF: 'secret-manager://rehab/prod-mimo-v1',
            MIMO_API_KEY_FILE: nestedDirectory,
          },
          { secretDirectory },
        ),
      ).toThrow(/must point to a regular file/);

      expect(() =>
        requireMimoApiKey(
          {
            NODE_ENV: 'production',
            MIMO_API_KEY_REF: 'secret-manager://rehab/prod-mimo-v1',
            MIMO_API_KEY_FILE: join(tmpdir(), 'outside-rehab-secret'),
          },
          { secretDirectory },
        ),
      ).toThrow(/must point to a file directly under/);
    });

    it('rejects nested Secret File paths and symbolic links', () => {
      const nestedDirectory = join(secretDirectory, 'nested');
      const targetPath = join(secretDirectory, 'mimo_api_key_target');
      const nestedFile = join(nestedDirectory, 'mimo_api_key');
      const linkPath = join(secretDirectory, 'mimo_api_key_link');
      mkdirSync(nestedDirectory);
      writeFileSync(targetPath, 'production-mimo-secret', 'utf8');
      writeFileSync(nestedFile, 'production-mimo-secret', 'utf8');
      symlinkSync(targetPath, linkPath);

      expect(() =>
        requireMimoApiKey(
          {
            NODE_ENV: 'production',
            MIMO_API_KEY_REF: 'secret-manager://rehab/prod-mimo-v1',
            MIMO_API_KEY_FILE: nestedFile,
          },
          { secretDirectory },
        ),
      ).toThrow(/must point to a file directly under/);

      expect(() =>
        requireMimoApiKey(
          {
            NODE_ENV: 'production',
            MIMO_API_KEY_REF: 'secret-manager://rehab/prod-mimo-v1',
            MIMO_API_KEY_FILE: linkPath,
          },
          { secretDirectory },
        ),
      ).toThrow(/must point to a regular file/);
    });

    it('loads one MiMo Secret File and rejects all legacy raw provider credentials', () => {
      const filePath = join(secretDirectory, 'mimo_api_key');
      writeFileSync(filePath, 'production-mimo-secret', 'utf8');

      expect(
        requireMimoApiKey(
          {
            NODE_ENV: 'production',
            MIMO_API_KEY_REF: 'secret-manager://rehab/prod-mimo-v1',
            MIMO_API_KEY_FILE: filePath,
          },
          { secretDirectory },
        ),
      ).toEqual({
        ref: 'secret-manager://rehab/prod-mimo-v1',
        key: 'production-mimo-secret',
      });

      expect(() =>
        requireMimoApiKey(
          {
            NODE_ENV: 'production',
            MIMO_API_KEY_REF: 'secret-manager://rehab/prod-mimo-v1',
            MIMO_API_KEY_FILE: filePath,
            AI_API_KEY: 'legacy-raw-secret',
          },
          { secretDirectory },
        ),
      ).toThrow(/AI_API_KEY must not be defined in production/);
    });

    it('allows an explicit MiMo local secret only outside production', () => {
      expect(
        requireMimoApiKey({
          NODE_ENV: 'test',
          MIMO_API_KEY_REF: 'secret-manager://rehab/test-mimo-v1',
          MIMO_API_KEY: 'test-mimo-secret',
        }),
      ).toEqual({
        ref: 'secret-manager://rehab/test-mimo-v1',
        key: 'test-mimo-secret',
      });
    });

    it('validates every required MiMo launch setting before production startup', () => {
      const mimoFile = join(secretDirectory, 'mimo_api_key');
      const sensitiveFile = join(secretDirectory, 'sensitive_data_key');
      writeFileSync(mimoFile, 'production-mimo-secret', 'utf8');
      writeFileSync(
        sensitiveFile,
        Buffer.alloc(32, 11).toString('base64'),
        'utf8',
      );
      const env = {
        NODE_ENV: 'production',
        COOKIE_SECURE: 'true',
        WEB_ORIGIN: 'https://rehab.customer.example',
        PORT: '10000',
        MIMO_API_KEY_REF: 'secret-manager://rehab/prod-mimo-v1',
        MIMO_API_KEY_FILE: mimoFile,
        SENSITIVE_DATA_KEY_REF: 'secret-manager://rehab/prod-sensitive-data-v1',
        SENSITIVE_DATA_KEY_FILE: sensitiveFile,
        MIMO_ALLOWED_HOSTS: 'mimo.customer.example',
        AI_REQUIRED_FOR_LAUNCH: 'true',
        AI_HUMAN_REVIEW_REQUIRED: 'true',
        AI_PROVIDER: 'xiaomi-mimo',
        AI_MODEL_VERSION: 'mimo-v2.5',
        AI_MODEL_ENDPOINT: 'https://mimo.customer.example/v1',
        AI_PROMPT_VERSION: 'cognitive-assessment-2026-07',
        SPEECH_REQUIRED_FOR_LAUNCH: 'true',
        SPEECH_PROVIDER: 'xiaomi-mimo-audio-understanding',
        SPEECH_MODEL_VERSION: 'mimo-v2.5',
        SPEECH_TO_TEXT_ENDPOINT:
          'https://mimo.customer.example/v1/chat/completions',
        TTS_REQUIRED_FOR_LAUNCH: 'true',
        TTS_PROVIDER: 'xiaomi-mimo-tts',
        TTS_MODEL_VERSION: 'mimo-v2.5-tts',
        TTS_ENDPOINT: 'https://mimo.customer.example/v1/chat/completions',
        TTS_VOICE_ID: 'approved-voice',
        TTS_OUTPUT_FORMAT: 'wav',
        AI_PROVIDER_TIMEOUT_MS: '15000',
        AI_PROVIDER_MAX_RESPONSE_BYTES: '1048576',
        SPEECH_PROVIDER_TIMEOUT_MS: '15000',
        SPEECH_PROVIDER_MAX_RESPONSE_BYTES: '14680064',
        STT_MAX_DECODED_AUDIO_BYTES: '10485760',
        STT_MAX_DURATION_SECONDS: '600',
        TTS_PROVIDER_TIMEOUT_MS: '15000',
        TTS_PROVIDER_MAX_RESPONSE_BYTES: '14680064',
        MIMO_KEY_VALUE_URL: 'redis://key-value.internal:6379',
        MIMO_USAGE_KEY_PREFIX: 'rehab:mimo:production',
        MIMO_USAGE_WINDOW_MS: '60000',
        MIMO_KEY_VALUE_PROBE_TIMEOUT_MS: '1000',
        MIMO_USER_REQUEST_LIMIT: '10',
        MIMO_PATIENT_REQUEST_LIMIT: '10',
        MIMO_ORGANIZATION_REQUEST_LIMIT: '100',
        MIMO_SPEECH_SECONDS_LIMIT: '600',
        MIMO_TTS_CHARACTERS_LIMIT: '2000',
        MIMO_USER_BUDGET_UNITS_LIMIT: '1000',
        MIMO_PATIENT_BUDGET_UNITS_LIMIT: '1000',
        MIMO_ORGANIZATION_BUDGET_UNITS_LIMIT: '10000',
        MIMO_AI_COST_UNITS_PER_REQUEST: '5',
        MIMO_SPEECH_COST_UNITS_PER_SECOND: '2',
        MIMO_TTS_COST_UNITS_PER_CHARACTER: '1',
        MIMO_HIGH_COST_USER_OPERATION_REQUEST_LIMIT: '20',
        MIMO_HIGH_COST_USER_OPERATION_WINDOW_MS: '60000',
        PROVIDER_TELEMETRY_RETENTION_DAYS: '30',
        PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS: '120000',
      };

      expect(() =>
        validateProductionRuntimeConfiguration(env, { secretDirectory }),
      ).not.toThrow();

      for (const name of [
        'STT_MAX_DECODED_AUDIO_BYTES',
        'STT_MAX_DURATION_SECONDS',
        'MIMO_HIGH_COST_USER_OPERATION_REQUEST_LIMIT',
        'MIMO_HIGH_COST_USER_OPERATION_WINDOW_MS',
      ]) {
        const missing = { ...env };
        delete missing[name as keyof typeof missing];
        expect(() =>
          validateProductionRuntimeConfiguration(missing, { secretDirectory }),
        ).toThrow(name);
      }

      expect(() =>
        validateProductionRuntimeConfiguration(
          { ...env, TTS_REQUIRED_FOR_LAUNCH: 'false' },
          { secretDirectory },
        ),
      ).toThrow(/TTS_REQUIRED_FOR_LAUNCH must be exactly true/);

      expect(() =>
        validateProductionRuntimeConfiguration(
          { ...env, AI_MODEL_ENDPOINT: 'https://unapproved.example/v1' },
          { secretDirectory },
        ),
      ).toThrow(/AI_MODEL_ENDPOINT must use HTTPS and an approved host/);

      expect(() =>
        validateProductionRuntimeConfiguration(
          { ...env, COOKIE_SECURE: 'false' },
          { secretDirectory },
        ),
      ).toThrow(/COOKIE_SECURE must be exactly true/);

      expect(() =>
        validateProductionRuntimeConfiguration(
          { ...env, WEB_ORIGIN: 'http://rehab.customer.example' },
          { secretDirectory },
        ),
      ).toThrow(/WEB_ORIGIN/);

      expect(() =>
        validateProductionRuntimeConfiguration(
          { ...env, PORT: '65536' },
          { secretDirectory },
        ),
      ).toThrow(/PORT/);

      expect(() =>
        validateProductionRuntimeConfiguration(
          { ...env, MIMO_KEY_VALUE_URL: 'redis://127.0.0.1:6379' },
          { secretDirectory },
        ),
      ).toThrow(/MIMO_KEY_VALUE_URL/);

      try {
        validateProductionRuntimeConfiguration(
          { ...env, MIMO_KEY_VALUE_URL: 'redis://127.0.0.1:6379' },
          { secretDirectory },
        );
        throw new Error('Expected Key Value configuration rejection.');
      } catch (error) {
        expect(error).toBeInstanceOf(
          ProductionRuntimeDependencyConfigurationError,
        );
        expect(error).toMatchObject({ dependency: 'key_value' });
      }

      try {
        validateProductionRuntimeConfiguration(
          {
            ...env,
            MIMO_API_KEY_FILE: join(secretDirectory, 'missing-mimo-key'),
          },
          { secretDirectory },
        );
        throw new Error('Expected MiMo Secret File rejection.');
      } catch (error) {
        expect(error).toBeInstanceOf(
          ProductionRuntimeDependencyConfigurationError,
        );
        expect(error).toMatchObject({ dependency: 'mimo_api_key' });
      }

      expect(() =>
        validateProductionRuntimeConfiguration(
          { ...env, TTS_PROVIDER_MAX_RESPONSE_BYTES: '16777217' },
          { secretDirectory },
        ),
      ).toThrow(/TTS_PROVIDER_MAX_RESPONSE_BYTES/);

      expect(() =>
        validateProductionRuntimeConfiguration(
          { ...env, STT_MAX_DECODED_AUDIO_BYTES: '11796481' },
          { secretDirectory },
        ),
      ).toThrow(/STT_MAX_DECODED_AUDIO_BYTES/);

      expect(() =>
        validateProductionRuntimeConfiguration(
          {
            ...env,
            MIMO_ALLOWED_HOSTS: 'mimo.customer.example, mimo.secondary.example',
          },
          { secretDirectory },
        ),
      ).toThrow(/MIMO_ALLOWED_HOSTS/);

      expect(() =>
        validateProductionRuntimeConfiguration(
          { ...env, PROVIDER_TELEMETRY_RETENTION_DAYS: '29' },
          { secretDirectory },
        ),
      ).toThrow(/PROVIDER_TELEMETRY_RETENTION_DAYS/);

      expect(() =>
        validateProductionRuntimeConfiguration(
          { ...env, PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS: '0' },
          { secretDirectory },
        ),
      ).toThrow(/PROVIDER_TELEMETRY_RETENTION_TIMEOUT_MS/);
    });
  });
});
