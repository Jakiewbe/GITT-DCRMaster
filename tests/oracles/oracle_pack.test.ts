import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type {
  CanonicalRowV1,
  DcrRequestedMetricV1,
  GittPulseInputV1,
  MaterialPresetV1,
  SocBasisV1,
} from '../../src/science/contracts';
import { analyzeDcrEventV1 } from '../../src/science/dcr';
import { analyzeGittPulse } from '../../src/science/gitt';
import { GITT_QC_POLICY_V1 } from '../../src/science/gitt/policy';
import {
  canonicalizeScientificJson,
  createRowId,
  hashCanonicalDataset,
  hashCanonicalValue,
} from '../../src/science/hash';
import { computeSocTrajectory, integrateBoundaryAwareCapacity } from '../../src/science/soc';

type HashSourceFixture = {
  sourceFileHash: string;
  channelId: string | null;
  sourceStream: string;
  sourceSheet: string | null;
  sourceRowIndex: string;
  sourceRecordSequence: string;
};

type HashScientificRowFixture = {
  analysisStepId: string;
  canonicalStepType: CanonicalRowV1['canonicalStepType'];
  chargeCapacityAh: number | null;
  currentA: number;
  dischargeCapacityAh: number | null;
  elapsedTimeTicks: string;
  netCapacityAh: number | null;
  recordSequence: string;
  stepElapsedTimeTicks: string | null;
  temperatureC: number | null;
  timeResolutionNs: string;
  vendorStepId: string | null;
  vendorStepType: string | null;
  voltageV: number;
};

type DcrExpectedMetric = {
  calculationState: 'computed' | 'not_computable';
  actualOffsetNs?: string;
  deltaVoltageV?: number;
  deltaCurrentA?: number;
  resistanceOhm: number | null;
};

type OracleExpected = {
  oraclePackVersion: string;
  hash: {
    canonical: string;
    sha256: string;
    rowIds: string[];
    canonicalDatasetHash: string;
  };
  gitt: {
    fitPointCount: number;
    slopeVPerSqrtS: number;
    interceptV: number;
    rSquared: number;
    metricValueCm2PerS: number;
    predictedDeltaEAtTauV: number;
    observedDeltaEAtTauV: number;
    endpointConsistencyRelativeError: number;
    dimensionlessPulseTime: number;
    dimensionlessFitTime: number;
  };
  dcr: Record<string, DcrExpectedMetric>;
  soc: {
    incrementsAh: number[];
    cumulativeNetCapacityAh: number[];
    totalNetCapacityAh: number;
    diagnosticCandidateNetCapacityAh: number;
    totalThroughputAh: number;
    skippedBoundaryCount: number;
    boundaryGapCount: number;
    duplicateTickCount: number;
    integratedDurationS: number;
    expectedActivityDurationS: number;
    activityTimeCoverageFraction: number;
    socPct: number[];
    dodPct: number[];
  };
};

type OraclePack = {
  oraclePackVersion: string;
  inputs: {
    hash: {
      jcs: { decomposedText: string; bigintDecimal: string };
      sourceRows: HashSourceFixture[];
      canonicalRows: Array<{ sourceIndex: number; scientific: HashScientificRowFixture }>;
    };
    gitt: {
      activeMaterialEquivalentThicknessCm: number;
      activeMassG: number;
      electrodeDiameterCm: number;
      pulseDurationS: number;
      deltaEsV: number;
      voltageNoiseFloorV: number;
      fitWindowS: [number, number];
      pulseCurrentA: number;
      qrefAh: number;
      preRestPotentialV: number;
      postRestPotentialV: number;
      restTimesS: number[];
      pulsePoints: Array<{ timeS: number; voltageV: number }>;
    };
    dcr: {
      transitionTimeNs: string;
      baseline: { voltageV: number; currentA: number };
      restOffsetsNs: string[];
      pulsePoints: Array<{ offsetNs: string; voltageV: number; currentA: number }>;
      requests: Array<
        | { kind: 'first_sample'; label: string }
        | { kind: 'exact_time'; label: string; offsetNs: string }
      >;
    };
    soc: {
      socBasis: { qrefAh: number; initialSocPct: number };
      rows: Array<{
        rowId: string;
        elapsedNs: string;
        stepElapsedNs: string;
        recordSequence: string;
        currentA: number;
        analysisStepId: string;
        stepType: 'charge' | 'discharge';
      }>;
    };
  };
  expected: OracleExpected;
};

const packPath = fileURLToPath(new URL('./oracle_pack_v1.json', import.meta.url));
const pack = JSON.parse(readFileSync(packPath, 'utf8')) as OraclePack;

function expectClose(
  actual: number | null,
  expected: number,
  rtol = 1e-12,
  atol = 1e-16,
): void {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(
    atol + rtol * Math.abs(expected),
  );
}

function baseRow(args: {
  rowId: string;
  elapsedTimeTicks: bigint;
  stepElapsedTimeTicks: bigint | null;
  timeResolutionNs: bigint;
  recordSequence: bigint;
  voltageV: number;
  currentA: number;
  analysisStepId: string;
  canonicalStepType: CanonicalRowV1['canonicalStepType'];
}): CanonicalRowV1 {
  return {
    sourceFileId: 'oracle-pack-v1',
    sourceFileHash: 'b'.repeat(64),
    instrumentId: 'independent-oracle',
    channelId: '1',
    sourceStream: 'fixed-json',
    sourceSheet: null,
    sourceRowIndex: args.recordSequence,
    sourceRecordSequence: args.recordSequence,
    parserVersion: 'oracle-fixture-1.0.0',
    elapsedTimeTicks: args.elapsedTimeTicks,
    stepElapsedTimeTicks: args.stepElapsedTimeTicks,
    timeResolutionNs: args.timeResolutionNs,
    recordSequence: args.recordSequence,
    elapsedTimeS:
      Number(args.elapsedTimeTicks * args.timeResolutionNs) / 1_000_000_000,
    rowId: args.rowId,
    voltageV: args.voltageV,
    currentA: args.currentA,
    temperatureC: null,
    vendorStepId: args.analysisStepId,
    vendorStepType: args.canonicalStepType,
    analysisStepId: args.analysisStepId,
    canonicalStepType: args.canonicalStepType,
    chargeCapacityAh: null,
    dischargeCapacityAh: null,
    netCapacityAh: null,
  };
}

function hashFixtureRow(
  source: HashSourceFixture,
  scientific: HashScientificRowFixture,
  rowId: string,
): CanonicalRowV1 {
  const elapsedTimeTicks = BigInt(scientific.elapsedTimeTicks);
  const timeResolutionNs = BigInt(scientific.timeResolutionNs);
  return {
    sourceFileId: 'display-path-is-excluded',
    sourceFileHash: source.sourceFileHash,
    instrumentId: 'oracle',
    channelId: source.channelId,
    sourceStream: source.sourceStream,
    sourceSheet: source.sourceSheet,
    sourceRowIndex: BigInt(source.sourceRowIndex),
    sourceRecordSequence: BigInt(source.sourceRecordSequence),
    parserVersion: 'display-parser-evidence-is-excluded',
    elapsedTimeTicks,
    stepElapsedTimeTicks:
      scientific.stepElapsedTimeTicks === null ? null : BigInt(scientific.stepElapsedTimeTicks),
    timeResolutionNs,
    recordSequence: BigInt(scientific.recordSequence),
    elapsedTimeS: Number(elapsedTimeTicks * timeResolutionNs) / 1_000_000_000,
    rowId,
    voltageV: scientific.voltageV,
    currentA: scientific.currentA,
    temperatureC: scientific.temperatureC,
    vendorStepId: scientific.vendorStepId,
    vendorStepType: scientific.vendorStepType,
    analysisStepId: scientific.analysisStepId,
    canonicalStepType: scientific.canonicalStepType,
    chargeCapacityAh: scientific.chargeCapacityAh,
    dischargeCapacityAh: scientific.dischargeCapacityAh,
    netCapacityAh: scientific.netCapacityAh,
  };
}

function buildGittInput(): GittPulseInputV1 {
  const fixture = pack.inputs.gitt;
  const resolutionNs = 1_000_000_000n;
  let sequence = 1n;
  const preRestRows = fixture.restTimesS.map((timeS) =>
    baseRow({
      rowId: `gitt-pre-${sequence}`,
      elapsedTimeTicks: BigInt(timeS),
      stepElapsedTimeTicks: BigInt(timeS),
      timeResolutionNs: resolutionNs,
      recordSequence: sequence++,
      voltageV: fixture.preRestPotentialV,
      currentA: 0,
      analysisStepId: 'gitt-pre-rest',
      canonicalStepType: 'rest',
    }),
  );
  const pulseRows = fixture.pulsePoints.map((point) =>
    baseRow({
      rowId: `gitt-pulse-${sequence}`,
      elapsedTimeTicks: BigInt(100 + point.timeS),
      stepElapsedTimeTicks: BigInt(point.timeS),
      timeResolutionNs: resolutionNs,
      recordSequence: sequence++,
      voltageV: point.voltageV,
      currentA: fixture.pulseCurrentA,
      analysisStepId: 'gitt-pulse',
      canonicalStepType: 'charge',
    }),
  );
  const postRestRows = fixture.restTimesS.map((timeS) =>
    baseRow({
      rowId: `gitt-post-${sequence}`,
      elapsedTimeTicks: BigInt(200 + timeS),
      stepElapsedTimeTicks: BigInt(timeS),
      timeResolutionNs: resolutionNs,
      recordSequence: sequence++,
      voltageV: fixture.postRestPotentialV,
      currentA: 0,
      analysisStepId: 'gitt-post-rest',
      canonicalStepType: 'rest',
    }),
  );
  const material: MaterialPresetV1 = {
    materialPresetId: 'independent-layered-oracle-v1',
    materialFamily: 'layered_insertion',
    displayName: 'Independent layered insertion oracle',
    molarMassGPerMol: 1,
    densityGPerCm3: 1,
    densitySource: 'exact fixture definition',
    densityMethod: 'exact fixture definition',
    densityStandardUncertainty: 0,
    molarVolumeCm3PerMol: 1,
    molarVolumeAuthority: 'derived_from_density',
    theoreticalSpecificCapacityMahPerG: 1000,
    presetVersion: '1.0.0',
    userOverridden: false,
  };
  return {
    pulseId: 'independent-gitt-oracle-v1',
    preRestRows,
    pulseRows,
    postRestRows,
    material,
    config: {
      qcPolicyId: GITT_QC_POLICY_V1.id,
      currentResolutionA: 1e-9,
      voltageResolutionV: fixture.voltageNoiseFloorV,
      fitWindowOverride: null,
      qrefAh: fixture.qrefAh,
      activeMassG: fixture.activeMassG,
      electrodeDiameterCm: fixture.electrodeDiameterCm,
      activeMassStandardUncertaintyG: 0,
      electrodeDiameterStandardUncertaintyCm: 0,
    },
  };
}

function buildDcrRows(): {
  preRestRows: CanonicalRowV1[];
  pulseRows: CanonicalRowV1[];
} {
  const fixture = pack.inputs.dcr;
  const transitionNs = BigInt(fixture.transitionTimeNs);
  let sequence = 1n;
  const preRestRows = fixture.restOffsetsNs.map((offsetText, index) => {
    const offsetNs = BigInt(offsetText);
    return baseRow({
      rowId: `dcr-rest-${index}`,
      elapsedTimeTicks: transitionNs + offsetNs,
      stepElapsedTimeTicks: offsetNs + 60_000_000_000n,
      timeResolutionNs: 1n,
      recordSequence: sequence++,
      voltageV: fixture.baseline.voltageV,
      currentA: fixture.baseline.currentA,
      analysisStepId: 'dcr-rest',
      canonicalStepType: 'rest',
    });
  });
  const pulseRows = fixture.pulsePoints.map((point, index) => {
    const offsetNs = BigInt(point.offsetNs);
    return baseRow({
      rowId: `dcr-pulse-${index}`,
      elapsedTimeTicks: transitionNs + offsetNs,
      stepElapsedTimeTicks: offsetNs,
      timeResolutionNs: 1n,
      recordSequence: sequence++,
      voltageV: point.voltageV,
      currentA: point.currentA,
      analysisStepId: 'dcr-pulse',
      canonicalStepType: 'discharge',
    });
  });
  return { preRestRows, pulseRows };
}

function buildSocRows(): CanonicalRowV1[] {
  return pack.inputs.soc.rows.map((row) =>
    baseRow({
      rowId: row.rowId,
      elapsedTimeTicks: BigInt(row.elapsedNs),
      stepElapsedTimeTicks: BigInt(row.stepElapsedNs),
      timeResolutionNs: 1n,
      recordSequence: BigInt(row.recordSequence),
      voltageV: 3,
      currentA: row.currentA,
      analysisStepId: row.analysisStepId,
      canonicalStepType: row.stepType,
    }),
  );
}

describe('independent Python Oracle pack', () => {
  it('recomputes every committed golden without importing production modules', () => {
    const script = fileURLToPath(new URL('./reference_oracles.py', import.meta.url));
    const command = process.platform === 'win32' ? 'python' : 'python3';
    const result = spawnSync(command, [script, '--verify'], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (process.env.GITTDCR_REQUIRE_PYTHON_ORACLE === '1') {
        throw new Error('python_oracle_interpreter_missing');
      }
      return;
    }
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout) as OracleExpected).toEqual(pack.expected);
  });
});

describe('cross-language JCS and scientific identity golden', () => {
  it('matches canonical JSON, row identities, and the canonical dataset hash', () => {
    const fixture = pack.inputs.hash;
    const value = {
      a: [3, null, fixture.jcs.decomposedText],
      b: -0,
      big: BigInt(fixture.jcs.bigintDecimal),
      nested: { 伪: true },
    };
    expect(canonicalizeScientificJson(value)).toBe(pack.expected.hash.canonical);
    expect(hashCanonicalValue(value)).toBe(pack.expected.hash.sha256);

    const rowIds = fixture.sourceRows.map((source) =>
      createRowId({
        ...source,
        sourceRowIndex: BigInt(source.sourceRowIndex),
        sourceRecordSequence: BigInt(source.sourceRecordSequence),
      }),
    );
    expect(rowIds).toEqual(pack.expected.hash.rowIds);

    const rows = fixture.canonicalRows.map(({ sourceIndex, scientific }) =>
      hashFixtureRow(fixture.sourceRows[sourceIndex], scientific, rowIds[sourceIndex]),
    );
    expect(hashCanonicalDataset(rows)).toBe(pack.expected.hash.canonicalDatasetHash);
  });
});

describe('independent GITT endpoint and auxiliary regression golden', () => {
  it('matches the fixed manual endpoint scalar and E versus sqrt(t) diagnostics', () => {
    const expected = pack.expected.gitt;
    const result = analyzeGittPulse(buildGittInput());
    expect(result.calculationState).toBe('computed');
    expect(result.fitDiagnostics.fitUniqueTickCount).toBe(expected.fitPointCount);
    expect(result.fitDiagnostics.actualFitWindow).toEqual({
      startS: pack.inputs.gitt.fitWindowS[0],
      endS: pack.inputs.gitt.fitWindowS[1],
    });
    expectClose(result.fitDiagnostics.slopeVPerSqrtS, expected.slopeVPerSqrtS, 1e-12, 1e-15);
    expectClose(result.fitDiagnostics.interceptV, expected.interceptV, 1e-12, 1e-15);
    expectClose(result.fitDiagnostics.rSquared, expected.rSquared, 1e-12, 1e-15);
    expectClose(result.metricValueCm2PerS, expected.metricValueCm2PerS, 1e-10, 1e-16);
    expectClose(
      result.diagnosticCandidateMetricValueCm2PerS,
      expected.metricValueCm2PerS,
      1e-10,
      1e-16,
    );
    expectClose(
      result.predictedDeltaEAtTauV,
      expected.predictedDeltaEAtTauV,
      1e-12,
      1e-15,
    );
    expectClose(
      result.observedDeltaEAtTauV,
      expected.observedDeltaEAtTauV,
      1e-12,
      1e-15,
    );
    expectClose(
      result.endpointConsistencyRelativeError,
      expected.endpointConsistencyRelativeError,
      1e-12,
      1e-14,
    );
    expectClose(result.dimensionlessPulseTime, expected.dimensionlessPulseTime, 1e-10, 1e-14);
    expectClose(result.dimensionlessFitTime, expected.dimensionlessFitTime, 1e-10, 1e-14);
  });
});

describe('independent raw DCR exact-tick golden', () => {
  it('uses the raw float32 readings and leaves an absent 1 s target uncomputed', () => {
    const rows = buildDcrRows();
    const requestedMetrics: DcrRequestedMetricV1[] = pack.inputs.dcr.requests.map((request) =>
      request.kind === 'first_sample'
        ? { kind: 'first_sample' }
        : {
            kind: 'exact_time',
            label: request.label,
            offsetTicks: BigInt(request.offsetNs),
            offsetResolutionNs: 1n,
          },
    );
    const results = analyzeDcrEventV1({
      eventId: 'independent-dcr-oracle-v1',
      ...rows,
      protocolRole: 'dcr_pulse',
      config: {
        qcPolicyId: 'DCR_QC_POLICY_1_0_0',
        currentResolutionA: 1e-9,
        voltageResolutionV: 1e-7,
        requestedMetrics,
        transitionLatencyKnown: false,
        transitionTimeBasis: 'step_boundary_tick',
        expectedPulseDurationS: 30,
      },
    });
    const byName = Object.fromEntries(results.map((result) => [result.requestedMetric, result]));

    for (const [name, expected] of Object.entries(pack.expected.dcr)) {
      const actual = byName[name];
      expect(actual).toBeDefined();
      expect(actual.calculationState).toBe(expected.calculationState);
      if (expected.resistanceOhm === null) {
        expect(actual.resistanceOhm).toBeNull();
        expect(actual.qcCodes).toContain('target_sample_absent');
        continue;
      }
      expectClose(actual.deltaVoltageV, expected.deltaVoltageV as number, 1e-12, 1e-15);
      expectClose(actual.deltaCurrentA, expected.deltaCurrentA as number, 1e-12, 1e-18);
      expectClose(actual.resistanceOhm, expected.resistanceOhm, 1e-9, 1e-9);
      expectClose(
        actual.diagnosticCandidateResistanceOhm,
        expected.resistanceOhm,
        1e-9,
        1e-9,
      );
      expect(BigInt(Math.round((actual.actualElapsedFromTransitionS as number) * 1e9))).toBe(
        BigInt(expected.actualOffsetNs as string),
      );
    }
  });
});

describe('independent boundary-aware SOC integration golden', () => {
  it('does not interpolate across a step boundary and gives duplicate ticks zero charge', () => {
    const rows = buildSocRows();
    const expected = pack.expected.soc;
    const integration = integrateBoundaryAwareCapacity(rows);
    expect(integration.calculationState).toBe('computed');
    expect(integration.points).toHaveLength(expected.incrementsAh.length);
    integration.points.forEach((point, index) => {
      expectClose(point.incrementAh, expected.incrementsAh[index], 1e-12, 1e-16);
      expectClose(
        point.cumulativeNetCapacityAh,
        expected.cumulativeNetCapacityAh[index],
        1e-12,
        1e-16,
      );
    });
    expectClose(integration.totalNetCapacityAh, expected.totalNetCapacityAh, 1e-12, 1e-16);
    expectClose(
      integration.diagnosticCandidateNetCapacityAh,
      expected.diagnosticCandidateNetCapacityAh,
      1e-12,
      1e-16,
    );
    expectClose(integration.totalThroughputAh, expected.totalThroughputAh, 1e-12, 1e-16);
    expect(integration.skippedBoundaryCount).toBe(expected.skippedBoundaryCount);
    expect(integration.boundaryGapCount).toBe(expected.boundaryGapCount);
    expect(integration.duplicateTickCount).toBe(expected.duplicateTickCount);
    expectClose(integration.integratedDurationS, expected.integratedDurationS);
    expectClose(integration.expectedActivityDurationS, expected.expectedActivityDurationS);
    expectClose(integration.activityTimeCoverageFraction, expected.activityTimeCoverageFraction);

    const basis: SocBasisV1 = {
      qrefAh: pack.inputs.soc.socBasis.qrefAh,
      qrefSource: 'rated',
      initialSocPct: pack.inputs.soc.socBasis.initialSocPct,
      initialSocSource: 'user_input',
      integrationMode: 'net_coulomb',
      chargeCoulombicEfficiency: 1,
      dischargeCoulombicEfficiency: 1,
    };
    const trajectory = computeSocTrajectory(rows, basis);
    expect(trajectory.calculationState).toBe('computed');
    trajectory.points.forEach((point, index) => {
      expectClose(point.socPct, expected.socPct[index], 1e-12, 1e-12);
      expectClose(point.dodPct, expected.dodPct[index], 1e-12, 1e-12);
    });
  });
});
