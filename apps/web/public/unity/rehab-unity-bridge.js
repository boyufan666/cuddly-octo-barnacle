(function attachRehabUnityBridge(global) {
  "use strict";

  var protocolVersion = "1.0.0";
  var eventType = "training_result";
  var resultContractVersion = "rehab-unity-result-v2";
  var requiredMetricTypes = [
    "reaction_time_ms",
    "target_hit_rate",
    "arm_raise_accuracy",
    "duration_seconds",
    "difficulty_level",
  ];

  function requireObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(label + " must be an object.");
    }
    return value;
  }

  function requireString(value, label) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(label + " must be a non-empty string.");
    }
    return value.trim();
  }

  function requireExactString(value, label) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(label + " must be a non-empty string.");
    }
    return value;
  }

  function readOptionalString(value) {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value !== "string") {
      throw new Error("optional string value must be a string.");
    }
    var normalized = value.trim();
    return normalized ? normalized : undefined;
  }

  function requireNumber(value, label, min, max) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(label + " must be a finite number.");
    }
    if (value < min || value > max) {
      throw new Error(label + " must be between " + min + " and " + max + ".");
    }
    return value;
  }

  function requirePositiveNumber(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(label + " must be greater than 0.");
    }
    return value;
  }

  function requireIsoDate(value, label) {
    var text = requireString(value, label);
    if (Number.isNaN(new Date(text).getTime())) {
      throw new Error(label + " must be a valid ISO date string.");
    }
    return text;
  }

  function requireIntensity(value) {
    if (value !== "low" && value !== "moderate" && value !== "high") {
      throw new Error("exerciseIntensity must be low, moderate, or high.");
    }
    return value;
  }

  function normalizeMetric(metric, index) {
    requireObject(metric, "motionMetrics[" + index + "]");
    var normalized = {
      metricType: requireString(
        metric.metricType,
        "motionMetrics[" + index + "].metricType",
      ),
      metricValue: requireNumber(
        metric.metricValue,
        "motionMetrics[" + index + "].metricValue",
        -Number.MAX_VALUE,
        Number.MAX_VALUE,
      ),
      confidence: requireNumber(
        metric.confidence,
        "motionMetrics[" + index + "].confidence",
        0,
        1,
      ),
    };

    if (metric.rawSummary !== undefined) {
      normalized.rawSummary = requireObject(
        metric.rawSummary,
        "motionMetrics[" + index + "].rawSummary",
      );
    }
    if (metric.unit !== undefined) {
      normalized.unit = requireString(
        metric.unit,
        "motionMetrics[" + index + "].unit",
      );
    }
    if (metric.sampleCount !== undefined) {
      normalized.sampleCount = requireNumber(
        metric.sampleCount,
        "motionMetrics[" + index + "].sampleCount",
        1,
        Number.MAX_SAFE_INTEGER,
      );
      if (Math.floor(normalized.sampleCount) !== normalized.sampleCount) {
        throw new Error("motionMetrics[" + index + "].sampleCount must be an integer.");
      }
    }
    normalized.windowStartedAt = requireIsoDate(
      metric.windowStartedAt,
      "motionMetrics[" + index + "].windowStartedAt",
    );
    normalized.windowEndedAt = requireIsoDate(
      metric.windowEndedAt,
      "motionMetrics[" + index + "].windowEndedAt",
    );
    if (
      normalized.windowStartedAt &&
      normalized.windowEndedAt &&
      new Date(normalized.windowStartedAt).getTime() >
        new Date(normalized.windowEndedAt).getTime()
    ) {
      throw new Error("motion metric windowStartedAt must not be later than windowEndedAt.");
    }
    if (metric.qualityFlag !== undefined) {
      normalized.qualityFlag = requireString(
        metric.qualityFlag,
        "motionMetrics[" + index + "].qualityFlag",
      );
    }
    if (metric.bodyPart !== undefined) {
      normalized.bodyPart = requireString(
        metric.bodyPart,
        "motionMetrics[" + index + "].bodyPart",
      );
    }
    if (metric.jointName !== undefined) {
      normalized.jointName = requireString(
        metric.jointName,
        "motionMetrics[" + index + "].jointName",
      );
    }

    return normalized;
  }

  function validateRequiredMetricTypes(metrics) {
    var metricTypes = metrics.map(function readMetricType(metric) {
      return metric.metricType;
    });
    for (var index = 0; index < requiredMetricTypes.length; index += 1) {
      if (metricTypes.indexOf(requiredMetricTypes[index]) === -1) {
        throw new Error(
          "motionMetrics must include " + requiredMetricTypes[index] + ".",
        );
      }
    }
  }

  function validateDynamicDifficultyEvidence(value) {
    var dynamicDifficultyEvidence = requireObject(
      value,
      "metricsSummary.dynamicDifficultyEvidence",
    );
    if (dynamicDifficultyEvidence.schemaVersion !== "1.0.0") {
      throw new Error("dynamicDifficultyEvidence.schemaVersion must be 1.0.0.");
    }
    if (
      !Array.isArray(dynamicDifficultyEvidence.events) ||
      dynamicDifficultyEvidence.events.length === 0
    ) {
      throw new Error("dynamicDifficultyEvidence.events must be a non-empty array.");
    }
    return {
      schemaVersion: "1.0.0",
      events: dynamicDifficultyEvidence.events.map(normalizeDynamicDifficultyEvent),
    };
  }

  function normalizeDynamicDifficultyEvent(event, index) {
    requireObject(event, "dynamicDifficultyEvidence.events[" + index + "]");
    var before = normalizeDifficultySnapshot(
      event.before,
      "dynamicDifficultyEvidence.events[" + index + "].before",
    );
    var after = normalizeDifficultySnapshot(
      event.after,
      "dynamicDifficultyEvidence.events[" + index + "].after",
    );
    var normalized = {
      startingLevel: requireInteger(
        event.startingLevel,
        "dynamicDifficultyEvidence.events[" + index + "].startingLevel",
        1,
        3,
      ),
      startingLevelSource: requireStartingLevelSource(
        event.startingLevelSource,
        "dynamicDifficultyEvidence.events[" + index + "].startingLevelSource",
      ),
      approvedPlanItemId: requireString(
        event.approvedPlanItemId,
        "dynamicDifficultyEvidence.events[" + index + "].approvedPlanItemId",
      ),
      assessmentSourceId: requireString(
        event.assessmentSourceId,
        "dynamicDifficultyEvidence.events[" + index + "].assessmentSourceId",
      ),
      triggerReason: requireTriggerReason(
        event.triggerReason,
        "dynamicDifficultyEvidence.events[" + index + "].triggerReason",
      ),
      before: before,
      after: after,
      adjustedAt: requireIsoDate(
        event.adjustedAt,
        "dynamicDifficultyEvidence.events[" + index + "].adjustedAt",
      ),
      runtimeFrameId: requireString(
        event.runtimeFrameId,
        "dynamicDifficultyEvidence.events[" + index + "].runtimeFrameId",
      ),
      runtimeWindowId: requireString(
        event.runtimeWindowId,
        "dynamicDifficultyEvidence.events[" + index + "].runtimeWindowId",
      ),
    };
    var unchanged =
      before.speed === after.speed &&
      before.complexityLevel === after.complexityLevel;
    var safetyClampReason = readOptionalString(event.safetyClampReason);
    if (safetyClampReason) {
      normalized.safetyClampReason = safetyClampReason;
    }
    if (unchanged && !normalized.safetyClampReason) {
      throw new Error(
        "dynamicDifficultyEvidence.events[" +
          index +
          "].safetyClampReason is required when difficulty is unchanged.",
      );
    }
    return normalized;
  }

  function normalizeDifficultySnapshot(value, label) {
    var snapshot = requireObject(value, label);
    return {
      speed: requirePositiveNumber(snapshot.speed, label + ".speed"),
      complexityLevel: requireInteger(snapshot.complexityLevel, label + ".complexityLevel", 1, 3),
    };
  }

  function requireInteger(value, label, min, max) {
    var normalized = requireNumber(value, label, min, max);
    if (Math.floor(normalized) !== normalized) {
      throw new Error(label + " must be an integer.");
    }
    return normalized;
  }

  function requireStartingLevelSource(value, label) {
    if (
      value !== "clinician_approved_plan" &&
      value !== "clinician_approved_assessment"
    ) {
      throw new Error(label + " is invalid.");
    }
    return value;
  }

  function requireTriggerReason(value, label) {
    if (
      value !== "prior_assessment" &&
      value !== "reaction_slow" &&
      value !== "accuracy_high" &&
      value !== "accuracy_low" &&
      value !== "fatigue_risk" &&
      value !== "clinician_limit"
    ) {
      throw new Error(label + " is invalid.");
    }
    return value;
  }

  function buildTrainingResultEvent(result) {
    requireObject(result, "result");

    if (result.resultContractVersion !== resultContractVersion) {
      throw new Error(
        "resultContractVersion must be " + resultContractVersion + ".",
      );
    }
    var sessionId = requireString(result.sessionId, "sessionId");
    var collectionBatchId = requireExactString(
      result.collectionBatchId,
      "collectionBatchId",
    );
    var gameRunId = requireString(result.gameRunId, "gameRunId");
    var gameVersion = requireString(result.gameVersion, "gameVersion");
    var clientGeneratedAt = requireIsoDate(
      result.clientGeneratedAt,
      "clientGeneratedAt",
    );
    var rawPayloadHash = requireString(result.rawPayloadHash, "rawPayloadHash");
    var metricsSummary = requireObject(result.metricsSummary, "metricsSummary");
    if (metricsSummary.resultContractVersion !== resultContractVersion) {
      throw new Error(
        "metricsSummary.resultContractVersion must be " +
          resultContractVersion +
          ".",
      );
    }
    var metricsSummaryCollectionBatchId = requireExactString(
      metricsSummary.collectionBatchId,
      "metricsSummary.collectionBatchId",
    );
    if (metricsSummaryCollectionBatchId !== collectionBatchId) {
      throw new Error("collectionBatchId fields must match.");
    }
    metricsSummary.source = "unity_webgl";
    metricsSummary.gameRunId = gameRunId;
    metricsSummary.gameVersion = gameVersion;
    metricsSummary.protocolVersion = protocolVersion;
    metricsSummary.clientGeneratedAt = clientGeneratedAt;
    metricsSummary.rawPayloadHash = rawPayloadHash;
    metricsSummary.dynamicDifficultyEvidence = validateDynamicDifficultyEvidence(
      metricsSummary.dynamicDifficultyEvidence,
    );
    var motionMetrics = result.motionMetrics;
    if (!Array.isArray(motionMetrics) || motionMetrics.length === 0) {
      throw new Error("motionMetrics must be a non-empty array.");
    }
    var normalizedMotionMetrics = motionMetrics.map(normalizeMetric);
    validateRequiredMetricTypes(normalizedMotionMetrics);

    return {
      type: eventType,
      action: eventType,
      protocolVersion: protocolVersion,
      resultContractVersion: resultContractVersion,
      sessionId: sessionId,
      collectionBatchId: collectionBatchId,
      gameRunId: gameRunId,
      gameVersion: gameVersion,
      clientGeneratedAt: clientGeneratedAt,
      rawPayloadHash: rawPayloadHash,
      score: requireNumber(result.score, "score", 0, 100),
      completionRate: requireNumber(result.completionRate, "completionRate", 0, 1),
      durationSeconds: requirePositiveNumber(
        result.durationSeconds,
        "durationSeconds",
      ),
      reactionTimeMs: requirePositiveNumber(
        result.reactionTimeMs,
        "reactionTimeMs",
      ),
      motionAccuracy: requireNumber(result.motionAccuracy, "motionAccuracy", 0, 1),
      exerciseIntensity: requireIntensity(result.exerciseIntensity),
      metricsSummary: metricsSummary,
      motionMetrics: normalizedMotionMetrics,
    };
  }

  function postTrainingResult(result, targetWindow) {
    var message = buildTrainingResultEvent(result);
    var destination = targetWindow || global.parent || global;
    destination.postMessage(message, global.location.origin);
    return message;
  }

  function postTrainingResultJson(json, targetWindow) {
    if (typeof json !== "string") {
      throw new Error("json must be a string.");
    }
    return postTrainingResult(JSON.parse(json), targetWindow);
  }

  function getRuntimeConfig() {
    var config = global.RehabTrainingRuntimeConfig;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("RehabTrainingRuntimeConfig is not available.");
    }
    return config;
  }

  global.RehabUnityBridge = {
    protocolVersion: protocolVersion,
    resultContractVersion: resultContractVersion,
    eventType: eventType,
    buildTrainingResultEvent: buildTrainingResultEvent,
    postTrainingResult: postTrainingResult,
    postTrainingResultJson: postTrainingResultJson,
    getRuntimeConfig: getRuntimeConfig,
  };
})(window);
