import { describe, expect, it } from 'vitest';

import type { CanonicalRowV1 } from '../science/contracts';
import { createCf1MaterialPreset } from '../science/material';
import type { NewareCanonicalDataset } from '../adapters/neware/normalize';
import {
  analyzeNewareDataset,
  createNewareAnalysisIdentity,
  type WorkbenchSettings,
} from './analyze';

const SOURCE_FILE_HASH = 'recipe-integration-source-hash';

function settings(overrides: Partial<WorkbenchSettings> = {}): WorkbenchSettings {
  return {
    electrodeDiameterCm: 1.2,
    electrodeDiameterStandardUncertaintyCm: null,
    activeMassStandardUncertaintyG: null,
    currentResolutionA: null,
    voltageResolutionV: null,
    material: createCf1MaterialPreset(),
    initialSocPct: null,
    initialSocSource: 'unknown',
    datasetStartsAtFreshCell: false,
    ...overrides,
  };
}

function makeRow(
  sequence: number,
  analysisStepId: string,
  vendorStepId: string,
  canonicalStepType: CanonicalRowV1['canonicalStepType'],
  elapsedS: number,
  stepElapsedS: number,
  voltageV: number,
  currentA: number,
): CanonicalRowV1 {
  return {
    sourceFileId: 'CFx-GITT-200ma-1.000mg.ndax',
    sourceFileHash: SOURCE_FILE_HASH,
    instrumentId: 'BTS8',
    channelId: '1',
    sourceStream: 'fixture',
    sourceSheet: null,
    sourceRowIndex: BigInt(sequence),
    sourceRecordSequence: BigInt(sequence),
    parserVersion: '0.1.2-provisional',
    elapsedTimeTicks: BigInt(elapsedS),
    stepElapsedTimeTicks: BigInt(stepElapsedS),
    timeResolutionNs: 1_000_000_000n,
    recordSequence: BigInt(sequence),
    elapsedTimeS: elapsedS,
    rowId: `row-${sequence}`,
    voltageV,
    currentA,
    temperatureC: null,
    vendorStepId,
    vendorStepType: canonicalStepType === 'rest' ? 'Rest' : 'CC_DChg',
    analysisStepId,
    canonicalStepType,
    chargeCapacityAh: null,
    dischargeCapacityAh: null,
    netCapacityAh: null,
  };
}

function cfxGittDataset(): NewareCanonicalDataset {
  let sequence = 0;
  const rows: CanonicalRowV1[] = [];
  for (let timeS = 0; timeS <= 300; timeS += 10) {
    rows.push(makeRow(sequence, 'pre-rest', '1', 'rest', timeS, timeS, 3, 0));
    sequence += 1;
  }
  for (let timeS = 0; timeS <= 1200; timeS += 100) {
    rows.push(
      makeRow(
        sequence,
        'pulse',
        '2',
        'discharge',
        300 + timeS,
        timeS,
        3 - 0.01 * Math.sqrt(timeS),
        -0.0002,
      ),
    );
    sequence += 1;
  }
  for (let timeS = 0; timeS <= 14_400; timeS += 600) {
    rows.push(makeRow(sequence, 'post-rest', '3', 'rest', 1500 + timeS, timeS, 2.8, 0));
    sequence += 1;
  }

  return {
    sourceFileHash: SOURCE_FILE_HASH,
    canonicalDatasetHash: 'canonical-recipe-integration',
    normalizationReceiptHash: 'receipt-recipe-integration',
    warnings: [],
    metadata: {
      parserProfileId: 'neware-ndax-ndc17-v1',
      parserProfileVersion: '0.1.2-provisional',
      approvalState: 'provisional',
      instrumentId: 'BTS8',
      channelId: '1',
      testId: null,
      testGuid: null,
      clientVersion: null,
      serverVersion: null,
      firmwareVersion: null,
      activeMassMg: 1,
      remark: null,
      currentRangeMa: 100,
      voltageRangeV: 5,
      sourceTimeResolutionNs: 1_000_000_000n,
      programSteps: [
        { stepId: 1, stepTypeCode: 4, recordIntervalMs: 10_000, durationMs: 300_000, currentMa: 0 },
        {
          stepId: 2,
          stepTypeCode: 2,
          recordIntervalMs: 100_000,
          durationMs: 1_200_000,
          currentMa: -0.2,
          stopVoltageV: 1.5,
          stopVoltageRaw: 15_000,
        },
        { stepId: 3, stepTypeCode: 4, recordIntervalMs: 600_000, durationMs: 14_400_000, currentMa: 0 },
        {
          stepId: 4,
          stepTypeCode: 7,
          recordIntervalMs: null,
          durationMs: null,
          currentMa: null,
          loop: { startStepId: 2, cycleCount: 1_000 },
        },
      ],
    },
    rows,
  };
}

describe('analysis recipe integration', () => {
  it('uses a resolved recipe mass ahead of Neware metadata and keeps its provenance auditable', () => {
    const dataset = cfxGittDataset();
    const metadataAnalysis = analyzeNewareDataset(dataset, settings());
    const recipeAnalysis = analyzeNewareDataset(
      dataset,
      settings({
        activeMassOverrideG: 0.002,
        activeMassSourceId: 'filename',
        recipeVersion: '1.0.0',
        recipeSourceFileHash: dataset.sourceFileHash,
        recipeAnalysisKind: 'gitt',
        recipeMaterialProfileId: 'cf1',
      }),
    );

    expect(metadataAnalysis.activeMassProvenance).toEqual({
      activeMassG: 0.001,
      sourceId: 'neware_metadata',
      resolution: 'neware_metadata',
    });
    expect(recipeAnalysis.activeMassProvenance).toEqual({
      activeMassG: 0.002,
      sourceId: 'filename',
      resolution: 'recipe_override',
    });
    expect(recipeAnalysis.gittResults[0]).toMatchObject({
      activeMassG: 0.002,
      activeMassSourceId: 'filename',
    });
    expect(recipeAnalysis.cfxLiterature1200s).toMatchObject({
      activeMassProvenance: {
        activeMassG: 0.002,
        sourceId: 'filename',
        resolution: 'recipe_override',
      },
      recipe: { recipeVersion: '1.0.0', materialProfileId: 'cf1' },
      comparativeProfile: {
        materialAssessment: {
          modelApplicability: 'limited',
          interpretationScope: 'comparative_index_only',
          intrinsicDiffusivityClaim: false,
        },
      },
    });
    expect(recipeAnalysis.cfxLiterature1200s?.programExecution.summary).toMatchObject({
      submittedPulseCount: 1,
      timeLimitReachedCount: 1,
      mainComparativeSequenceCount: 1,
    });
    expect(recipeAnalysis.cfxLiterature1200s?.comparativeProfile.qref.qrefAh).toBeCloseTo(0.00173, 15);
    expect(recipeAnalysis.configHash).not.toBe(metadataAnalysis.configHash);
    expect(recipeAnalysis.analysisInputHash).not.toBe(metadataAnalysis.analysisInputHash);
    expect(recipeAnalysis.resultHash).not.toBe(metadataAnalysis.resultHash);
  });

  it('makes recipe and CFx profile revisions part of the GITT input identity', () => {
    const dataset = cfxGittDataset();
    const base = settings({
      activeMassOverrideG: 0.001,
      activeMassSourceId: 'neware_metadata',
      recipeVersion: '1.0.0',
      recipeSourceFileHash: dataset.sourceFileHash,
      recipeAnalysisKind: 'gitt',
      recipeMaterialProfileId: 'cf1',
    });
    const changedRecipe = { ...base, recipeVersion: '1.0.1' };

    const first = createNewareAnalysisIdentity(dataset, base);
    const changed = createNewareAnalysisIdentity(dataset, changedRecipe);

    expect(first.configHash).not.toBe(changed.configHash);
    expect(first.analysisInputHash).not.toBe(changed.analysisInputHash);
  });
});
