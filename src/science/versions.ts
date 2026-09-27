import type { AnalysisVersionsV1 } from './contracts';

export const SCIENTIFIC_CONTRACT_VERSION = '1.5.0';
export const CANONICAL_SCHEMA_VERSION = '1.0.0';
export const SOC_CONTRACT_VERSION = '1.0.0';
export const STEP_SEGMENTATION_VERSION = '1.0.0';
export const UNCERTAINTY_MODEL_VERSION = '1.2.0';
export const MANIFEST_SCHEMA_VERSION = '1.0.0';
export const ORACLE_PACK_VERSION = '1.1.0-beta.1';

export const GITT_ALGORITHM = {
  id: 'WH_PLANAR_MANUAL_ENDPOINT',
  version: '1.1.0',
  qcPolicyId: 'GITT_QC_POLICY_CFX_1_1_0',
} as const;

export const GITT_AUXILIARY_FIT = {
  id: 'REGRESSION_WINDOW_VALIDATION_E_SQRT_T',
  version: '1.1.0',
} as const;

export const DCR_ALGORITHM = {
  id: 'DCR_TWO_CURRENT_TERMINAL_V1',
  version: '1.0.0',
  qcPolicyId: 'DCR_QC_POLICY_1_0_0',
} as const;

export function createVersionSet(
  partial: Pick<
    AnalysisVersionsV1,
    | 'appVersion'
    | 'buildCommit'
    | 'parserVersion'
    | 'vendorProfileId'
    | 'vendorProfileVersion'
    | 'algorithmId'
    | 'algorithmVersion'
    | 'qcPolicyId'
    | 'materialPresetId'
  >,
): AnalysisVersionsV1 {
  return {
    ...partial,
    scientificContractVersion: SCIENTIFIC_CONTRACT_VERSION,
    canonicalSchemaVersion: CANONICAL_SCHEMA_VERSION,
    stepSegmentationVersion: STEP_SEGMENTATION_VERSION,
    socContractVersion: SOC_CONTRACT_VERSION,
    uncertaintyModelVersion: UNCERTAINTY_MODEL_VERSION,
    manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    oraclePackVersion: ORACLE_PACK_VERSION,
  };
}
