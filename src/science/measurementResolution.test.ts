import { describe, expect, it } from 'vitest';

import {
  advancedUserResolutionEvidence,
  float32FullScaleSpacing,
  recordStorageFloat32ResolutionEvidence,
  resolutionEvidenceFindings,
} from './measurementResolution';

describe('measurement-resolution evidence', () => {
  it('uses a conservative float32 spacing bound at the declared full-scale range', () => {
    expect(float32FullScaleSpacing(0.05)).toBeCloseTo(3.725290298461914e-9, 18);
    expect(float32FullScaleSpacing(5)).toBeCloseTo(4.76837158203125e-7, 18);

    const evidence = recordStorageFloat32ResolutionEvidence(0.05, 'Current');
    expect(evidence).toMatchObject({
      value: 3.725290298461914e-9,
      basisValue: 0.05,
      source: 'record_storage_float32_full_scale_bound',
      provisional: true,
    });
    expect(evidence.message).toContain('not a manufacturer measurement-resolution');
  });

  it('forces review when a record-storage bound is used for a calculation', () => {
    const evidence = recordStorageFloat32ResolutionEvidence(5, 'Voltage');
    expect(resolutionEvidenceFindings('voltage', evidence.value, evidence)).toEqual([
      expect.objectContaining({
        code: 'voltage_resolution_inferred_from_record_storage',
        status: 'review',
      }),
    ]);
  });

  it('keeps an advanced override reviewable and rejects a mismatched value', () => {
    const evidence = advancedUserResolutionEvidence(1e-6, 'Voltage');
    expect(resolutionEvidenceFindings('voltage', 1e-6, evidence)[0]).toMatchObject({
      code: 'voltage_resolution_advanced_override',
      status: 'review',
    });
    expect(resolutionEvidenceFindings('voltage', 2e-6, evidence)[0]).toMatchObject({
      code: 'voltage_resolution_evidence_value_mismatch',
      status: 'rejected',
    });
  });
});
