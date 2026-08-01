import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildNewareDcrEvents,
  buildNewareGittPulses,
  classifyNewareProfile,
} from '../../src/adapters/neware/events';
import { buildNewareCfxGitt1200sProfile } from '../../src/adapters/neware/gitt1200sProfile';
import { normalizeNewareNdax } from '../../src/adapters/neware/normalize';
import { NEWARE_INDEPENDENT_EXPORT_PARITY_V1 } from '../../src/adapters/neware/qualification';
import type { CanonicalRowV1, DcrEventInputV1 } from '../../src/science/contracts';
import { analyzeDcrEventV1 } from '../../src/science/dcr';
import { analyzeGittPulse } from '../../src/science/gitt';
import { createCf1MaterialPreset } from '../../src/science/material';
import { analyzeCfxLiterature1200sGittProfile } from '../../src/product/cfx';
import {
  NEWARE_BATCH_QUALIFICATION_V1 as REPORT,
  type FrozenDcrMetrics,
} from './neware-batch-qualification-v1';

const dataDirectory = resolve(process.cwd(), '..', '260429 DCR');
const allFixtures = [...REPORT.dcrFiles, ...REPORT.gittFiles];

function compareRows(left: CanonicalRowV1, right: CanonicalRowV1): number {
  const leftNs = left.elapsedTimeTicks * left.timeResolutionNs;
  const rightNs = right.elapsedTimeTicks * right.timeResolutionNs;
  if (leftNs < rightNs) return -1;
  if (leftNs > rightNs) return 1;
  if (left.recordSequence < right.recordSequence) return -1;
  if (left.recordSequence > right.recordSequence) return 1;
  return 0;
}

function rawScalarDcrCandidates(event: DcrEventInputV1): FrozenDcrMetrics {
  const baseline = [...event.preRestRows].sort(compareRows).at(-1);
  if (!baseline) throw new Error(`Missing baseline for ${event.eventId}`);

  const groups = new Map<bigint, CanonicalRowV1[]>();
  for (const row of event.pulseRows) {
    if (row.stepElapsedTimeTicks === null) throw new Error(`Missing step tick for ${row.rowId}`);
    const offsetNs = row.stepElapsedTimeTicks * row.timeResolutionNs;
    const group = groups.get(offsetNs);
    if (group) group.push(row);
    else groups.set(offsetNs, [row]);
  }
  const points = [...groups.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([offsetNs, rows]) => ({
      offsetNs,
      voltageV: rows.reduce((sum, row) => sum + row.voltageV, 0) / rows.length,
      currentA: rows.reduce((sum, row) => sum + row.currentA, 0) / rows.length,
    }));

  const resistanceAt = (offsetNs: bigint | null): number | null => {
    const point = offsetNs === null
      ? points[0]
      : points.find((candidate) => candidate.offsetNs === offsetNs);
    if (!point) return null;
    const deltaCurrentA = point.currentA - baseline.currentA;
    return deltaCurrentA === 0
      ? null
      : (point.voltageV - baseline.voltageV) / deltaCurrentA;
  };

  return {
    DCR_first_sample: resistanceAt(null) as number,
    DCR_5s: resistanceAt(5_000_000_000n),
    DCR_10s: resistanceAt(10_000_000_000n),
    DCR_30s: resistanceAt(30_000_000_000n) as number,
  };
}

function expectNumericClose(actual: number | null, expected: number | null, atol: number, rtol: number): void {
  if (expected === null) {
    expect(actual).toBeNull();
    return;
  }
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(atol + rtol * Math.abs(expected));
}

function extractMassMg(text: string | null): number | null {
  if (text === null) return null;
  const match = /(?:^|[-_])([0-9]+(?:\.[0-9]+)?)mg(?:[-_.]|$)/i.exec(text);
  return match ? Number(match[1]) : null;
}

function hasMassConflict(evidenceMassMg: number | null, metadataMassMg: number): boolean {
  if (evidenceMassMg === null) return false;
  const toleranceMg = Math.max(0.01, 0.01 * metadataMassMg);
  return Math.abs(evidenceMassMg - metadataMassMg) > toleranceMg;
}

describe.skipIf(!existsSync(dataDirectory))('Neware real-data batch qualification', () => {
  it('freezes the complete 7-DCR/6-GITT inventory without approving the parser profile', async () => {
    const actualNames = readdirSync(dataDirectory)
      .filter((name) => name.toLowerCase().endsWith('.ndax'))
      .sort();
    expect(actualNames).toEqual(allFixtures.map((fixture) => fixture.fileName).sort());
    expect(REPORT.profileApprovalState).toBe('provisional');
    expect(REPORT.currentResolutionA).toBeNull();
    expect(REPORT.voltageResolutionV).toBeNull();
    expect(REPORT.materialDensityGPerCm3).toBe(2.25);
    expect(REPORT.materialDensitySource).toBe('user_provided_value_2026-07-17');

    for (const fixture of allFixtures) {
      const dataset = await normalizeNewareNdax(
        readFileSync(join(dataDirectory, fixture.fileName)),
        fixture.fileName,
      );
      const profile = classifyNewareProfile(dataset);
      expect(dataset.sourceFileHash).toBe(fixture.sha256);
      expect(dataset.rows).toHaveLength(fixture.rowCount);
      expect(dataset.metadata.parserProfileId).toBe(REPORT.parserProfileId);
      expect(dataset.metadata.parserProfileVersion).toBe(REPORT.parserProfileVersion);
      expect(dataset.metadata.approvalState).toBe('provisional');
      expect(profile.approvalState).toBe('provisional');
      expect(profile.independentQualificationState).toBe('independent-qualified');
      expect(profile.independentQualificationReceiptId).toBe(
        NEWARE_INDEPENDENT_EXPORT_PARITY_V1.receiptId,
      );
      expect(profile.independentQualificationReceiptHash).toBe(
        NEWARE_INDEPENDENT_EXPORT_PARITY_V1.receiptSha256,
      );
      expect(dataset.metadata.activeMassMg).toBeCloseTo(fixture.activeMassMg, 12);
      expect(dataset.metadata.remark).toBe(fixture.remark);
      expect(dataset.metadata.channelId).toBe(fixture.channelId);
      expect(dataset.warnings).toEqual([]);

      const metadataMassMg = dataset.metadata.activeMassMg;
      expect(metadataMassMg).not.toBeNull();
      expect(hasMassConflict(extractMassMg(fixture.fileName), metadataMassMg as number)).toBe(
        fixture.filenameMassConflict,
      );
      expect(hasMassConflict(extractMassMg(dataset.metadata.remark), metadataMassMg as number)).toBe(
        fixture.remarkMassConflict,
      );
    }
  }, 60_000);

  it('qualifies all 28 recognized DCR pulses and freezes raw-float32 signed candidates', async () => {
    let metricCount = 0;
    let missingExactTickCount = 0;

    for (const fixture of REPORT.dcrFiles) {
      const dataset = await normalizeNewareNdax(
        readFileSync(join(dataDirectory, fixture.fileName)),
        fixture.fileName,
      );
      expect(classifyNewareProfile(dataset)).toEqual({
        vendorProfileId: 'neware-bts8-dcr-30s-v1',
        approvalState: 'provisional',
        analysisKind: 'dcr',
        independentQualificationState: 'independent-qualified',
        independentQualificationReceiptId: NEWARE_INDEPENDENT_EXPORT_PARITY_V1.receiptId,
        independentQualificationReceiptHash: NEWARE_INDEPENDENT_EXPORT_PARITY_V1.receiptSha256,
      });

      const events = buildNewareDcrEvents(dataset);
      expect(events).toHaveLength(4);
      expect(events.map((event) => event.pulseRows[0]?.analysisStepId)).toEqual(
        fixture.events.map((event) => event.analysisStepId),
      );

      for (const [eventIndex, event] of events.entries()) {
        const frozen = fixture.events[eventIndex].rawFloat32ResistanceOhm;
        expect(event.protocolRole).toBe('dcr_pulse');
        expect(event.config.currentResolutionA).toBeGreaterThan(0);
        expect(event.config.voltageResolutionV).toBeGreaterThan(0);
        expect(event.config.currentResolutionEvidence).toMatchObject({
          source: 'record_storage_float32_full_scale_bound',
          provisional: true,
        });
        expect(event.config.voltageResolutionEvidence).toMatchObject({
          source: 'record_storage_float32_full_scale_bound',
          provisional: true,
        });

        const scalarOracle = rawScalarDcrCandidates(event);
        const production = Object.fromEntries(
          analyzeDcrEventV1(event).map((result) => [result.requestedMetric, result]),
        );

        for (const metric of Object.keys(frozen) as Array<keyof FrozenDcrMetrics>) {
          metricCount += 1;
          expectNumericClose(scalarOracle[metric], frozen[metric], 1e-9, 1e-12);
          const result = production[metric];
          expect(result).toBeDefined();
          expectNumericClose(result.diagnosticCandidateResistanceOhm, frozen[metric], 1e-9, 1e-12);

          if (frozen[metric] === null) {
            missingExactTickCount += 1;
            expect(result.calculationState).toBe('not_computable');
            expect(result.qcStatus).toBeNull();
            expect(result.qcCodes).toContain('target_sample_absent');
          } else {
            expect(result.calculationState).toBe('computed');
            expect(result.qcCodes).toEqual(
              expect.arrayContaining([
                'current_resolution_inferred_from_record_storage',
                'voltage_resolution_inferred_from_record_storage',
              ]),
            );
            expect(result.qcStatus).not.toBe('valid');
            expectNumericClose(result.resistanceOhm, frozen[metric], 1e-9, 1e-12);
          }
        }
      }
    }

    expect(REPORT.dcrFiles).toHaveLength(7);
    expect(REPORT.dcrFiles.reduce((sum, file) => sum + file.events.length, 0)).toBe(28);
    expect(metricCount).toBe(112);
    expect(missingExactTickCount).toBe(6);
  }, 60_000);

  it('keeps all CFx/FGS GITT results model-limited while reporting endpoint values with diagnostics', async () => {
    const material = createCf1MaterialPreset();
    expect(material.materialPresetId).toBe(REPORT.materialPresetId);
    expect(material.densityGPerCm3).toBe(REPORT.materialDensityGPerCm3);
    expect(material.densityMethod).toBe(REPORT.materialDensityMethod);
    expect(material.densityStandardUncertainty).toBe(REPORT.materialDensityStandardUncertainty);
    const idealCapacityFraction = (0.2 * 1_200 / 3_600) / 0.865;
    let fullPulseCount = 0;
    let timeLimitReachedCount = 0;
    let stopVoltageTerminatedCount = 0;
    let mainComparativeSequenceCount = 0;

    for (const fixture of REPORT.gittFiles) {
      const dataset = await normalizeNewareNdax(
        readFileSync(join(dataDirectory, fixture.fileName)),
        fixture.fileName,
      );
      expect(classifyNewareProfile(dataset)).toEqual({
        vendorProfileId: 'neware-bts8-gitt-1200s-v1',
        approvalState: 'provisional',
        analysisKind: 'gitt',
        independentQualificationState: 'independent-qualified',
        independentQualificationReceiptId: NEWARE_INDEPENDENT_EXPORT_PARITY_V1.receiptId,
        independentQualificationReceiptHash: NEWARE_INDEPENDENT_EXPORT_PARITY_V1.receiptSha256,
      });

      const pulses = buildNewareGittPulses(
        dataset,
        material,
        REPORT.gittPipelineElectrodeDiameterCm,
      );
      const results = pulses.map((pulse) => analyzeGittPulse(pulse));
      const semanticProfile = buildNewareCfxGitt1200sProfile(dataset, results);
      const retainedPulseIds = new Set(
        semanticProfile.events.map((event) => event.sourcePulseId),
      );
      const retainedResults = results.filter((result) => retainedPulseIds.has(result.pulseId));
      const programEventByPulseId = new Map(
        semanticProfile.events.map((event) => [event.sourcePulseId, event]),
      );
      const cfxLiteratureProfile = analyzeCfxLiterature1200sGittProfile({
        material,
        activeMassG: (dataset.metadata.activeMassMg as number) / 1000,
        pulseResults: retainedResults.map((result) => {
          const programEvent = programEventByPulseId.get(result.pulseId) ?? null;
          return {
            ...result,
            postRestDurationS: programEvent?.actualPostRestDurationS ?? null,
            pulseEndVoltageV: programEvent?.pulseEndVoltageV ?? result.pulseEndVoltageV,
            programEvent,
          };
        }),
      });
      const rawFullPulses = results.filter((result) => result.pulseDurationS === 1_200);
      const rawShortenedPulses = results.filter((result) => result.pulseDurationS !== 1_200);
      const fullPulses = retainedResults.filter((result) => result.pulseDurationS === 1_200);
      const fractions = fullPulses.map((result) => result.pulseCapacityFraction as number);

      expect(pulses).toHaveLength(fixture.pulseCount);
      expect(rawFullPulses).toHaveLength(fixture.fullPulseCount);
      expect(rawShortenedPulses).toHaveLength(fixture.shortenedPulseCount);
      expect(Math.min(...fractions)).toBeCloseTo(fixture.fullPulseCapacityFractionMinimum, 14);
      expect(Math.max(...fractions)).toBeCloseTo(fixture.fullPulseCapacityFractionMaximum, 14);
      expect(semanticProfile.programRecognized).toBe(true);
      expect(semanticProfile.summary).toMatchObject({
        submittedPulseCount: fixture.pulseCount,
        retainedPulseCount: fixture.timeLimitReachedPulseCount + 1,
        excludedAfterFirstCutoffCount:
          fixture.pulseCount - fixture.timeLimitReachedPulseCount - 1,
        timeLimitReachedCount: fixture.timeLimitReachedPulseCount,
        stopVoltageTerminatedCount: 1,
        mainComparativeSequenceCount: fixture.mainComparativeSequenceCount,
        fileEndTruncatedRestCount: 0,
        unknownEarlyTerminationCount: 0,
      });
      expect(semanticProfile.events.filter((event) => event.termination === 'time_limit_reached').every(
        (event) => (event.actualPulseDurationS ?? 0) >= 1_199,
      )).toBe(true);
      expect(semanticProfile.events.filter((event) => event.termination === 'stop_voltage_terminated').every(
        (event) => Math.abs((event.pulseEndVoltageV ?? 0) - 1.5) <= 0.005,
      )).toBe(true);
      expect(cfxLiteratureProfile.summary).toMatchObject({
        complete1200sPulseCount: fixture.mainComparativeSequenceCount,
        cutoffEarlyPulseCount: 1,
        postRestTruncatedPulseCount: 0,
        numericallyComputedComparativeIndexCount: fixture.mainComparativeSequenceCount,
      });
      timeLimitReachedCount += semanticProfile.summary.timeLimitReachedCount;
      stopVoltageTerminatedCount += semanticProfile.summary.stopVoltageTerminatedCount;
      mainComparativeSequenceCount += semanticProfile.summary.mainComparativeSequenceCount;

      for (const result of retainedResults) {
        expect(result.modelApplicability).toBe('limited');
        expect(result.interpretationScope).toBe('comparative_index_only');
        expect(result.metricKind).toBe('wh_comparative_transport_index');
        expect(result.qcStatus).toBe('rejected');
        if (result.calculationState === 'computed') {
          expect(result.metricValueCm2PerS).not.toBeNull();
          expectNumericClose(
            result.metricValueCm2PerS,
            result.diagnosticCandidateMetricValueCm2PerS,
            1e-12,
            1e-30,
          );
        } else {
          expect(result.metricValueCm2PerS).toBeNull();
        }
      }

      for (const result of fullPulses) {
        fullPulseCount += 1;
        expect(result.pulseCapacityFraction).not.toBeNull();
        expect(Math.abs((result.pulseCapacityFraction as number) - idealCapacityFraction)).toBeLessThan(2e-5);
        const capacityFinding = result.qcFindings.find(
          (finding) => finding.code === 'pulse_capacity_fraction',
        );
        expect(capacityFinding).toMatchObject({ status: 'rejected' });
        expect(capacityFinding?.metric).toBeGreaterThan(0.03);
      }
    }

    expect(REPORT.gittFiles).toHaveLength(6);
    expect(fullPulseCount).toBe(60);
    expect(timeLimitReachedCount).toBe(64);
    expect(stopVoltageTerminatedCount).toBe(6);
    expect(mainComparativeSequenceCount).toBe(64);
  }, 120_000);
});
