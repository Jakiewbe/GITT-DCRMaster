import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalizeNewareNdax } from './normalize';
import { analyzeNewareDataset } from '../../app/analyze';
import { createCf1MaterialPreset } from '../../science/material';

type Oracle = {
  fields: string[];
  sources: Array<{ fileKey: string; sourceFileHash: string; pulseCount: number }>;
  signatures: Array<{ fileKey: string; pulseIndex: number; sha256: string }>;
};

const root = process.cwd();
const oracle = JSON.parse(
  readFileSync(path.resolve(root, 'tests/fixtures/cfx10-real-regression-oracle-v1.json'), 'utf8'),
) as Oracle;

const settings = {
  electrodeDiameterCm: 1.2,
  electrodeDiameterStandardUncertaintyCm: null,
  activeMassStandardUncertaintyG: null,
  currentResolutionA: null,
  voltageResolutionV: null,
  material: createCf1MaterialPreset(),
  initialSocPct: null,
  initialSocSource: 'unknown' as const,
  datasetStartsAtFreshCell: false,
  regressionManualWindow: undefined,
};

function signature(row: Record<string, unknown>): string {
  const frozenFields = oracle.fields.filter((field) =>
    !['endpointD', 'deltaEtV', 'methodDivergenceDecades'].includes(field),
  );
  const values = Object.fromEntries(frozenFields.map((field) => [field, row[field] ?? null]));
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

describe('CFx10s real-data regression oracle', () => {
  it('keeps all frozen auxiliary fields unchanged while Endpoint fields are audited separately', async () => {
    const actualSignatures: Array<{ fileKey: string; pulseIndex: number; sha256: string }> = [];
    let totalRows = 0;
    let primaryReviewCount = 0;
    let primaryRejectedCount = 0;
    let eligibleWithWarningsCount = 0;
    let excludedCount = 0;

    for (const source of oracle.sources) {
      const filePath = path.resolve(root, '260429 GITT', source.fileKey);
      const dataset = await normalizeNewareNdax(readFileSync(filePath), source.fileKey);
      expect(dataset.sourceFileHash).toBe(source.sourceFileHash);
      const analysis = analyzeNewareDataset(dataset, settings);
      const program = analysis.cfxLiterature1200s?.programExecution;
      expect(program).not.toBeUndefined();
      expect(analysis.gittResults).toHaveLength(program?.allEvents.length ?? 0);
      const profile = analysis.cfxLiterature1200s?.comparativeProfile;
      expect(profile).not.toBeNull();
      const profilePulses = profile?.pulses ?? [];
      const retainedPulseIds = new Set((program?.events ?? []).map((event) => event.sourcePulseId));
      const oracleResults = analysis.gittResults.filter((result) => retainedPulseIds.has(result.pulseId));
      expect(oracleResults).toHaveLength(source.pulseCount);
      for (const [index, result] of oracleResults.entries()) {
        const pulse = profilePulses.find((candidate) => candidate.sourcePulseId === result.pulseId);
        const cfx10s = result.regressionWindows.find((window) => window.windowId === 'cfx_10s');
        const row = {
          endpointD: result.metricValueCm2PerS,
          deltaEtV: result.deltaEtV,
          deltaEsV: result.deltaEsV,
          medianVoltageV: result.medianVoltageV,
          pulseDurationS: result.pulseDurationS,
          cfx10D: cfx10s?.metricValueCm2PerS ?? null,
          cfx10Slope: cfx10s?.slopeVPerSqrtS ?? null,
          cfx10R2: cfx10s?.rSquared ?? null,
          cfx10ActualStartS: cfx10s?.actualStartS ?? null,
          cfx10ActualEndS: cfx10s?.actualEndS ?? null,
          windowStabilityDecades: result.windowStabilityDecades,
          methodDivergenceDecades: result.methodDivergenceDecades,
          initialObservedDropV: result.initialObservedDropV,
        };
        actualSignatures.push({
          fileKey: source.fileKey,
          pulseIndex: pulse?.sourceOrder ?? index + 1,
          sha256: signature(row),
        });
        totalRows += 1;
        if (result.primaryEndpointQcStatus === 'review') primaryReviewCount += 1;
        if (result.primaryEndpointQcStatus === 'rejected') primaryRejectedCount += 1;
        if (result.primaryComparisonEligibility === 'included_with_warnings') eligibleWithWarningsCount += 1;
        if (result.primaryComparisonEligibility === 'excluded') excludedCount += 1;
      }
    }

    expect(actualSignatures).toEqual(oracle.signatures);
    expect({ totalRows, primaryReviewCount, primaryRejectedCount, eligibleWithWarningsCount, excludedCount }).toEqual({
      totalRows: 39,
      primaryReviewCount: 37,
      primaryRejectedCount: 2,
      eligibleWithWarningsCount: 37,
      excludedCount: 2,
    });
  }, 30_000);
});
