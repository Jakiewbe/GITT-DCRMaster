import type { CanonicalRowV1, QcFinding, RestDiagnosticsV1 } from '../contracts';
import { qcFinding, resultStateFromFindings } from '../qc';
import { medianAbsoluteDeviation, robustSigma, theilSenRegression } from '../math/statistics';
import { aggregateUniqueTicks, nanosecondsToSeconds } from './aggregation';
import { GITT_QC_POLICY_V1 as POLICY } from './policy';

export type RestAnalysis = {
  diagnostics: RestDiagnosticsV1;
  findings: QcFinding[];
  endPotentialStandardUncertaintyV: number | null;
};

function emptyDiagnostics(findings: QcFinding[]): RestDiagnosticsV1 {
  return {
    ...resultStateFromFindings(findings, 'not_computable'),
    restEndPotentialV: null,
    restSlopeMvPerMin: null,
    restVoltageMadMv: null,
    restVoltageRangeMv: null,
    voltageNoiseFloorV: null,
    uniqueTickCount: 0,
    sourceRowCount: 0,
    contributingRowIds: [],
  };
}

/** Robustly characterizes the tail of a rest step without claiming equilibrium. */
export function diagnoseRest(
  rows: CanonicalRowV1[],
  prefix: 'pre_rest' | 'post_rest',
  configuredVoltageResolutionV: number | null,
): RestAnalysis {
  const findings: QcFinding[] = [];
  const aggregated = aggregateUniqueTicks(rows);
  if (aggregated.length === 0) {
    findings.push(qcFinding(`${prefix}_absent`, 'rejected', null, 'Rest step contains no records.'));
    return { diagnostics: emptyDiagnostics(findings), findings, endPotentialStandardUncertaintyV: null };
  }

  const stepIds = new Set(aggregated.map((point) => point.analysisStepId));
  if (stepIds.size !== 1) {
    findings.push(
      qcFinding(
        `${prefix}_multiple_analysis_steps`,
        'rejected',
        stepIds.size,
        'A rest diagnostic must refer to exactly one analysis step.',
      ),
    );
    return { diagnostics: emptyDiagnostics(findings), findings, endPotentialStandardUncertaintyV: null };
  }

  const firstNs = aggregated[0].elapsedTimeNs;
  const lastNs = aggregated[aggregated.length - 1].elapsedTimeNs;
  const durationS = Math.max(0, nanosecondsToSeconds(lastNs - firstNs));
  const requestedTailS = Math.max(
    POLICY.restTail.minimumWindowS,
    durationS * POLICY.restTail.windowFraction,
  );
  const effectiveTailS = Math.min(durationS, requestedTailS);
  const tailStartNs = lastNs - BigInt(Math.round(effectiveTailS * 1_000_000_000));
  const tail = aggregated.filter((point) => point.elapsedTimeNs >= tailStartNs);
  const sourceRowCount = tail.reduce((sum, point) => sum + point.sourceRowCount, 0);
  const rowIds = tail.flatMap((point) => point.contributingRowIds);
  const voltages = tail.map((point) => point.voltageV);

  const pointStatus = tail.length >= POLICY.restTail.validUniqueTickMinimum
    ? 'valid'
    : tail.length >= POLICY.restTail.reviewUniqueTickMinimum
      ? 'review'
      : 'rejected';
  findings.push(
    qcFinding(
      `${prefix}_unique_tick_count`,
      pointStatus,
      tail.length,
      'Rest-tail stability uses unique physical ticks with equal tick weight.',
    ),
  );

  if (tail.length < POLICY.restTail.minimumRegressionTickCount) {
    findings.push(
      qcFinding(
        `${prefix}_theil_sen_unavailable`,
        'rejected',
        tail.length,
        'Theil-Sen rest-tail estimation requires at least two unique ticks.',
      ),
    );
    const diagnostics: RestDiagnosticsV1 = {
      ...resultStateFromFindings(findings, 'not_computable'),
      restEndPotentialV: null,
      restSlopeMvPerMin: null,
      restVoltageMadMv: voltages.length ? medianAbsoluteDeviation(voltages) * 1_000 : null,
      restVoltageRangeMv: voltages.length ? (Math.max(...voltages) - Math.min(...voltages)) * 1_000 : null,
      voltageNoiseFloorV: configuredVoltageResolutionV,
      uniqueTickCount: tail.length,
      sourceRowCount,
      contributingRowIds: rowIds,
    };
    return { diagnostics, findings, endPotentialStandardUncertaintyV: null };
  }

  const x = tail.map((point) => nanosecondsToSeconds(point.elapsedTimeNs - tail[0].elapsedTimeNs));
  const regression = theilSenRegression(x, voltages);
  if (!regression) {
    findings.push(qcFinding(`${prefix}_theil_sen_singular`, 'rejected'));
    return { diagnostics: emptyDiagnostics(findings), findings, endPotentialStandardUncertaintyV: null };
  }

  const predicted = x.map((value) => regression.intercept + regression.slope * value);
  const residuals = voltages.map((value, index) => value - predicted[index]);
  const residualSigmaV = robustSigma(residuals);
  const resolutionV = configuredVoltageResolutionV ?? 0;
  const voltageNoiseFloorV = Math.max(resolutionV, Number.isFinite(residualSigmaV) ? residualSigmaV : 0);
  const restEndPotentialV = regression.intercept + regression.slope * x[x.length - 1];
  const slopeMvPerMin = regression.slope * 60_000;
  const rangeMv = (Math.max(...voltages) - Math.min(...voltages)) * 1_000;
  const madMv = medianAbsoluteDeviation(voltages) * 1_000;
  const actualTailDurationS = x[x.length - 1] - x[0];
  const tailDriftMv = Math.abs(regression.slope) * actualTailDurationS * 1_000;
  const sigmaMv = Math.max(
    (Number.isFinite(residualSigmaV) ? residualSigmaV : 0) * 1_000,
    (resolutionV * 1_000) / Math.sqrt(12),
  );
  const validDriftLimitMv = Math.max(
    POLICY.restTail.validDriftFloorMv,
    POLICY.restTail.validDriftSigmaMultiplier * sigmaMv,
  );
  const validRangeLimitMv = Math.max(
    POLICY.restTail.validRangeFloorMv,
    POLICY.restTail.validRangeSigmaMultiplier * sigmaMv,
  );
  const reviewDriftLimitMv = Math.max(
    POLICY.restTail.reviewDriftFloorMv,
    POLICY.restTail.reviewDriftSigmaMultiplier * sigmaMv,
  );
  const reviewRangeLimitMv = Math.max(
    POLICY.restTail.reviewRangeFloorMv,
    POLICY.restTail.reviewRangeSigmaMultiplier * sigmaMv,
  );
  const stabilityStatus =
    tailDriftMv <= validDriftLimitMv && rangeMv <= validRangeLimitMv
      ? 'valid'
      : tailDriftMv <= reviewDriftLimitMv && rangeMv <= reviewRangeLimitMv
        ? 'review'
        : 'rejected';
  findings.push(
    qcFinding(
      `${prefix}_end_stability`,
      stabilityStatus,
      tailDriftMv,
      'This finding describes rest-end stability only; it does not confirm thermodynamic equilibrium.',
    ),
  );

  for (const point of tail) {
    if (
      point.sourceRowCount > 1 &&
      point.voltageSpanV >
        POLICY.duplicateTickVoltageNoiseMultiplier * Math.max(voltageNoiseFloorV, Number.EPSILON)
    ) {
      findings.push(
        qcFinding(
          `${prefix}_duplicate_tick_voltage_conflict`,
          'rejected',
          point.voltageSpanV,
          'Duplicate records at one rest tick disagree beyond three noise floors.',
        ),
      );
    }
  }

  const pointNoiseUncertaintyV = Math.max(
    Number.isFinite(residualSigmaV) ? residualSigmaV : 0,
    resolutionV / Math.sqrt(12),
  );
  const endPotentialStandardUncertaintyV = pointNoiseUncertaintyV / Math.sqrt(tail.length);
  const diagnostics: RestDiagnosticsV1 = {
    ...resultStateFromFindings(findings),
    restEndPotentialV,
    restSlopeMvPerMin: slopeMvPerMin,
    restVoltageMadMv: madMv,
    restVoltageRangeMv: rangeMv,
    voltageNoiseFloorV,
    uniqueTickCount: tail.length,
    sourceRowCount,
    contributingRowIds: rowIds,
  };
  return { diagnostics, findings, endPotentialStandardUncertaintyV };
}
