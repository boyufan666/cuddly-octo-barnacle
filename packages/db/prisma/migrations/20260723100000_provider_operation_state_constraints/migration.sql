BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "provider_operation"
    WHERE "operation" NOT IN (
      'assessment_draft',
      'conversation_turn',
      'speech_transcript',
      'tts_output'
    )
    OR "status" NOT IN (
      'accepted',
      'reserved',
      'dispatching',
      'completed',
      'provider_failed',
      'response_rejected',
      'outcome_unknown',
      'completed_confirmed',
      'closed_unconfirmed'
    )
    OR "canonicalRequestHmac" !~ '^[a-f0-9]{64}$'
    OR (
      "responseHmac" IS NOT NULL
      AND "responseHmac" !~ '^[a-f0-9]{64}$'
    )
    OR (
      "status" IN ('accepted', 'reserved')
      AND (
        "providerStartedAt" IS NOT NULL
        OR "providerRespondedAt" IS NOT NULL
        OR "completedAt" IS NOT NULL
        OR "finalizedAt" IS NOT NULL
      )
    )
    OR (
      "status" = 'dispatching'
      AND (
        "providerStartedAt" IS NULL
        OR "providerRespondedAt" IS NOT NULL
        OR "completedAt" IS NOT NULL
        OR "finalizedAt" IS NOT NULL
      )
    )
    OR (
      "status" IN (
        'completed',
        'provider_failed',
        'response_rejected',
        'outcome_unknown',
        'completed_confirmed',
        'closed_unconfirmed'
      )
      AND (
        "providerStartedAt" IS NULL
        OR "providerRespondedAt" IS NULL
        OR "completedAt" IS NULL
        OR "finalizedAt" IS NULL
      )
    )
    OR (
      "status" = 'completed'
      AND (
        "responseCiphertext" IS NULL
        OR "responseHmac" IS NULL
        OR "failureCategory" IS NOT NULL
      )
    )
    OR (
      "status" IN ('provider_failed', 'response_rejected', 'outcome_unknown')
      AND "failureCategory" IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Provider operation state constraint preflight failed: legacy rows violate the persisted lifecycle contract';
  END IF;
END $$;

ALTER TABLE "provider_operation"
  ADD CONSTRAINT "provider_operation_kind_check"
    CHECK (
      "operation" IN (
        'assessment_draft',
        'conversation_turn',
        'speech_transcript',
        'tts_output'
      )
    ),
  ADD CONSTRAINT "provider_operation_status_check"
    CHECK (
      "status" IN (
        'accepted',
        'reserved',
        'dispatching',
        'completed',
        'provider_failed',
        'response_rejected',
        'outcome_unknown',
        'completed_confirmed',
        'closed_unconfirmed'
      )
    ),
  ADD CONSTRAINT "provider_operation_request_hmac_format_check"
    CHECK ("canonicalRequestHmac" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "provider_operation_response_hmac_format_check"
    CHECK (
      "responseHmac" IS NULL
      OR "responseHmac" ~ '^[a-f0-9]{64}$'
    ),
  ADD CONSTRAINT "provider_operation_lifecycle_timestamp_check"
    CHECK (
      (
        "status" IN ('accepted', 'reserved')
        AND "providerStartedAt" IS NULL
        AND "providerRespondedAt" IS NULL
        AND "completedAt" IS NULL
        AND "finalizedAt" IS NULL
      )
      OR (
        "status" = 'dispatching'
        AND "providerStartedAt" IS NOT NULL
        AND "providerRespondedAt" IS NULL
        AND "completedAt" IS NULL
        AND "finalizedAt" IS NULL
      )
      OR (
        "status" IN (
          'completed',
          'provider_failed',
          'response_rejected',
          'outcome_unknown',
          'completed_confirmed',
          'closed_unconfirmed'
        )
        AND "providerStartedAt" IS NOT NULL
        AND "providerRespondedAt" IS NOT NULL
        AND "completedAt" IS NOT NULL
        AND "finalizedAt" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "provider_operation_completion_evidence_check"
    CHECK (
      "status" <> 'completed'
      OR (
        "responseCiphertext" IS NOT NULL
        AND "responseHmac" IS NOT NULL
        AND "failureCategory" IS NULL
      )
    ),
  ADD CONSTRAINT "provider_operation_failure_category_check"
    CHECK (
      "status" NOT IN (
        'provider_failed',
        'response_rejected',
        'outcome_unknown'
      )
      OR "failureCategory" IS NOT NULL
    );

COMMIT;
