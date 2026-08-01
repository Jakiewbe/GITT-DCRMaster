export const NEWARE_INDEPENDENT_EXPORT_PARITY_V1 = {
  receiptId: 'NEWARE_INDEPENDENT_EXPORT_PARITY_2026_07_17_V1',
  receiptSha256: 'fc42e7967d12b536bf1fa8bed5efcadeae68a26f65eacd84268c3d1a8d8f08bb',
  evidenceKind: 'independent_export_parity',
  exporterId: 'neware-independent-export-parity',
  exporterVersion: '1.0.0',
  newareNdaVersion: 'v2026.06.11',
  sourceFileHashes: [
    '898b61e30127de6a48f8ffbb3e7bfcbdaa69ad75454f32be7790c1dc37d056cc',
    '1db9384f6bf85e5ae74725f21d3156aabe0d429c2bd2471cd17588069027fb11',
    '661d9efa7724a34746babc66576dfb0e6fbf56ae99215770a3b1dd2b8c7d18e6',
    'e3e7501907e2f0d783a1542e1d5d380ca88a47ea4ed0d5d509ce72a08918322b',
    'd38afbc2b67f3419c16d9e9425d20569e2c7910e74827cc0f2ab64c1e276b4f8',
    '87f535c2a9b296d97cf3023ddbf817897b4a4f244b6cc4f2bab0303f6af43b90',
    'b0e377fd0332e8ab956d21d78bf3eb2986770dccc9edae53103b486441fa6a1d',
    '072a3a3a3034cdc6140903193429326be7591be7427c29f0609ccaa17da3c086',
    '02c94edcaa763549075bce24a616f31365fff7cafa60531579f6929a4fa30388',
    '0dd6ec2c0fdf68fef98fa270a5267e15ae289bcf0dfdcf72016e8840d32ceae9',
    '33515536353e77babc77c40af3350a27b8cc48eca907fdfae10aa7b6d7484ccf',
    '132144670db7769e0e762707071ca4187706a11776e53b18e4f72baa9899a283',
    'ae3527a3e95884d7ff3e8f71f333f7bc9383e06976f38b495f9753a58f7368e5',
  ],
} as const;

export type NewareIndependentQualification = {
  independentQualificationState: 'independent-qualified' | 'not-qualified';
  independentQualificationReceiptId: string | null;
  independentQualificationReceiptHash: string | null;
};

const qualifiedSourceHashes = new Set<string>(
  NEWARE_INDEPENDENT_EXPORT_PARITY_V1.sourceFileHashes,
);

/**
 * Attach an independent-export evidence state without changing parser approval.
 *
 * This receipt proves row-level parity for the frozen source bytes only. It is
 * neither a vendor-official export nor an approval of the provisional parser
 * profile for arbitrary NDAX files.
 */
export function assessNewareIndependentQualification(
  sourceFileHash: string,
): NewareIndependentQualification {
  if (!qualifiedSourceHashes.has(sourceFileHash)) {
    return {
      independentQualificationState: 'not-qualified',
      independentQualificationReceiptId: null,
      independentQualificationReceiptHash: null,
    };
  }
  return {
    independentQualificationState: 'independent-qualified',
    independentQualificationReceiptId: NEWARE_INDEPENDENT_EXPORT_PARITY_V1.receiptId,
    independentQualificationReceiptHash: NEWARE_INDEPENDENT_EXPORT_PARITY_V1.receiptSha256,
  };
}
