export type FrozenDcrMetrics = {
  DCR_first_sample: number;
  DCR_5s: number | null;
  DCR_10s: number | null;
  DCR_30s: number;
};

export type FrozenDcrEvent = {
  analysisStepId: string;
  rawFloat32ResistanceOhm: FrozenDcrMetrics;
};

export type FrozenDcrFile = {
  fileName: string;
  sha256: string;
  rowCount: number;
  activeMassMg: number;
  remark: string | null;
  channelId: string;
  filenameMassConflict: boolean;
  remarkMassConflict: boolean;
  events: FrozenDcrEvent[];
};

export type FrozenGittFile = {
  fileName: string;
  sha256: string;
  rowCount: number;
  activeMassMg: number;
  remark: string | null;
  channelId: string;
  filenameMassConflict: boolean;
  remarkMassConflict: boolean;
  pulseCount: number;
  /** Exact 1200.0 s records retained for raw-file inventory continuity. */
  fullPulseCount: number;
  shortenedPulseCount: number;
  /** Program-semantic count: includes controller records at 1200.1 s. */
  timeLimitReachedPulseCount: number;
  stopVoltageTerminatedPulseCount: number;
  mainComparativeSequenceCount: number;
  fileEndTruncatedRestCount: number;
  fullPulseCapacityFractionMinimum: number;
  fullPulseCapacityFractionMaximum: number;
};

/**
 * Frozen observations from the 2026-07-17 real-data qualification run.
 *
 * DCR values use the signed Rest-last-row scalar formula directly on the raw
 * NDC float32 voltage/current values. They are diagnostic candidates only:
 * NDC17 float32 storage bounds now allow provisional DCR calculations, but
 * they are not manufacturer device-resolution evidence and force review.
 * The parser profile remains provisional and the values are not formal
 * approved-profile results.
 *
 * GITT capacity fractions use the metadata active mass and theoretical
 * 865 mAh/g Qref. The 1.2 cm diameter used by the pipeline test is an explicit
 * test-only geometry assumption and does not qualify the WH metric physically.
 */
export const NEWARE_BATCH_QUALIFICATION_V1 = {
  reportId: 'NEWARE_REAL_DATA_QUALIFICATION_2026_07_17_V1',
  parserProfileId: 'neware-ndax-ndc17-v1',
  parserProfileVersion: '0.1.2-provisional',
  profileApprovalState: 'provisional',
  currentResolutionA: null,
  voltageResolutionV: null,
  materialPresetId: 'CF1_PRESET_USER_DENSITY_2026_07_17',
  materialDensityGPerCm3: 2.25,
  materialDensitySource: 'user_provided_value_2026-07-17',
  materialDensityMethod: null,
  materialDensityStandardUncertainty: null,
  gittPipelineElectrodeDiameterCm: 1.2,
  dcrFiles: [
    {
      fileName: 'CFx-DCR-1.136mg-1_127.0.0.1-BTS85-23-1-6-879.ndax',
      sha256: '898b61e30127de6a48f8ffbb3e7bfcbdaa69ad75454f32be7790c1dc37d056cc',
      rowCount: 21_132,
      activeMassMg: 1.136,
      remark: null,
      channelId: '6',
      filenameMassConflict: false,
      remarkMassConflict: false,
      events: [
        {
          analysisStepId: 'neware-step-4',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 56.42250934378531,
            DCR_5s: 500.9170483918735,
            DCR_10s: 632.5288220307922,
            DCR_30s: 643.2224468003695,
          },
        },
        {
          analysisStepId: 'neware-step-8',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 51.000929460852284,
            DCR_5s: 389.0781179644273,
            DCR_10s: 570.295016140592,
            DCR_30s: 611.8457932981205,
          },
        },
        {
          analysisStepId: 'neware-step-12',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 47.93247916542512,
            DCR_5s: 312.4434796360606,
            DCR_10s: 504.06773189371864,
            DCR_30s: 591.7736370825932,
          },
        },
        {
          analysisStepId: 'neware-step-16',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 45.91086257112817,
            DCR_5s: 264.85293906505177,
            DCR_10s: 443.60173343148307,
            DCR_30s: 589.4969677139783,
          },
        },
      ],
    },
    {
      fileName: 'CFx-DCR-1.136mg-7_127.0.0.1-BTS85-23-1-5-880.ndax',
      sha256: '1db9384f6bf85e5ae74725f21d3156aabe0d429c2bd2471cd17588069027fb11',
      rowCount: 21_097,
      activeMassMg: 1.16,
      remark: 'FCM-DCR-1.416mg-li',
      channelId: '5',
      filenameMassConflict: true,
      remarkMassConflict: true,
      events: [
        {
          analysisStepId: 'neware-step-4',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 55.92119169928165,
            DCR_5s: 510.0292852781062,
            DCR_10s: 621.6947532392325,
            DCR_30s: 626.835414632958,
          },
        },
        {
          analysisStepId: 'neware-step-8',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 52.3167944742559,
            DCR_5s: 390.30337408167736,
            DCR_10s: 558.3990147577521,
            DCR_30s: 592.1046915275945,
          },
        },
        {
          analysisStepId: 'neware-step-12',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 46.375285541429484,
            DCR_5s: 311.40601911090334,
            DCR_10s: 489.0625067210998,
            DCR_30s: 562.3951281351679,
          },
        },
        {
          analysisStepId: 'neware-step-16',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 42.98659941145499,
            DCR_5s: 258.2804982056467,
            DCR_10s: 429.20646292744414,
            DCR_30s: 540.0160531653218,
          },
        },
      ],
    },
    {
      fileName: 'CFx-DCR-1.176mg-10_127.0.0.1-BTS85-23-1-8-878.ndax',
      sha256: '661d9efa7724a34746babc66576dfb0e6fbf56ae99215770a3b1dd2b8c7d18e6',
      rowCount: 21_136,
      activeMassMg: 1.176,
      remark: null,
      channelId: '8',
      filenameMassConflict: false,
      remarkMassConflict: false,
      events: [
        {
          analysisStepId: 'neware-step-4',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 47.48892682027236,
            DCR_5s: 493.616178871725,
            DCR_10s: 611.0931340024741,
            DCR_30s: 617.16516949234,
          },
        },
        {
          analysisStepId: 'neware-step-8',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 44.86061750650986,
            DCR_5s: 378.20700896682047,
            DCR_10s: 546.7818680259834,
            DCR_30s: 581.7920528820664,
          },
        },
        {
          analysisStepId: 'neware-step-12',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 37.5217696039989,
            DCR_5s: 295.56738864914865,
            DCR_10s: 474.3691806596255,
            DCR_30s: 550.4029471500522,
          },
        },
        {
          analysisStepId: 'neware-step-16',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 33.50552351704822,
            DCR_5s: 245.1316307868222,
            DCR_10s: 415.79846714514883,
            DCR_30s: 528.2291522003919,
          },
        },
      ],
    },
    {
      fileName: 'CFx-DCR-1.216mg-3_127.0.0.1-BTS85-23-1-7-881.ndax',
      sha256: 'e3e7501907e2f0d783a1542e1d5d380ca88a47ea4ed0d5d509ce72a08918322b',
      rowCount: 20_868,
      activeMassMg: 1.216,
      remark: 'FCM-DCR-1.416mg-li',
      channelId: '7',
      filenameMassConflict: false,
      remarkMassConflict: true,
      events: [
        {
          analysisStepId: 'neware-step-4',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 25.860605368806073,
            DCR_5s: 202.7899259553089,
            DCR_10s: 337.39762685072674,
            DCR_30s: 523.2397511150306,
          },
        },
        {
          analysisStepId: 'neware-step-8',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 25.00989854336276,
            DCR_5s: null,
            DCR_10s: null,
            DCR_30s: 664.5642100994413,
          },
        },
        {
          analysisStepId: 'neware-step-12',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 25.80386756732089,
            DCR_5s: 181.61079691761404,
            DCR_10s: 297.8486303630473,
            DCR_30s: 593.1145307152295,
          },
        },
        {
          analysisStepId: 'neware-step-16',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 35.98125046699488,
            DCR_5s: 293.2554565370754,
            DCR_10s: 425.980666124634,
            DCR_30s: 626.9642713023121,
          },
        },
      ],
    },
    {
      fileName: 'FGS-DCR-0.544mg-6_127.0.0.1-BTS85-23-1-3-873.ndax',
      sha256: '072a3a3a3034cdc6140903193429326be7591be7427c29f0609ccaa17da3c086',
      rowCount: 12_313,
      activeMassMg: 0.544,
      remark: 'FCM-DCR-1.416mg-li',
      channelId: '3',
      filenameMassConflict: false,
      remarkMassConflict: true,
      events: [
        {
          analysisStepId: 'neware-step-4',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 56.64695753837575,
            DCR_5s: null,
            DCR_10s: null,
            DCR_30s: 920.7444918292404,
          },
        },
        {
          analysisStepId: 'neware-step-8',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 59.11325499521609,
            DCR_5s: 584.5541451059156,
            DCR_10s: 807.4426045394757,
            DCR_30s: 953.5367804317227,
          },
        },
        {
          analysisStepId: 'neware-step-12',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 47.50862277108195,
            DCR_5s: 525.5222668840214,
            DCR_10s: null,
            DCR_30s: 942.5218261816972,
          },
        },
        {
          analysisStepId: 'neware-step-16',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 49.38285252479676,
            DCR_5s: 463.07349992712454,
            DCR_10s: null,
            DCR_30s: 968.4772270420709,
          },
        },
      ],
    },
    {
      fileName: 'FGS-DCR-0.584mg-5_127.0.0.1-BTS85-23-1-2-871.ndax',
      sha256: '02c94edcaa763549075bce24a616f31365fff7cafa60531579f6929a4fa30388',
      rowCount: 21_224,
      activeMassMg: 0.584,
      remark: 'FCM-DCR-1.416mg-li',
      channelId: '2',
      filenameMassConflict: false,
      remarkMassConflict: true,
      events: [
        {
          analysisStepId: 'neware-step-4',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 57.672643490499844,
            DCR_5s: 642.9615347522656,
            DCR_10s: 800.0569474205379,
            DCR_30s: 900.1083949300908,
          },
        },
        {
          analysisStepId: 'neware-step-8',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 53.67105094546095,
            DCR_5s: 571.7082982961138,
            DCR_10s: 782.7048198976414,
            DCR_30s: 916.6744592941468,
          },
        },
        {
          analysisStepId: 'neware-step-12',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 48.39288955673812,
            DCR_5s: 503.19363820414327,
            DCR_10s: 747.258505042684,
            DCR_30s: 920.4290967078853,
          },
        },
        {
          analysisStepId: 'neware-step-16',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 48.933610453372886,
            DCR_5s: 456.46585458227077,
            DCR_10s: 724.541300426802,
            DCR_30s: 938.4038122566383,
          },
        },
      ],
    },
    {
      fileName: 'FGS-DCR-0.608mg-7_127.0.0.1-BTS85-23-1-4-874.ndax',
      sha256: '0dd6ec2c0fdf68fef98fa270a5267e15ae289bcf0dfdcf72016e8840d32ceae9',
      rowCount: 21_174,
      activeMassMg: 0.608,
      remark: 'FCM-DCR-1.416mg-li',
      channelId: '4',
      filenameMassConflict: false,
      remarkMassConflict: true,
      events: [
        {
          analysisStepId: 'neware-step-4',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 49.06009268459357,
            DCR_5s: 593.0420064465256,
            DCR_10s: 759.6884126883118,
            DCR_30s: 863.9320686511406,
          },
        },
        {
          analysisStepId: 'neware-step-8',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 46.64583398588106,
            DCR_5s: 521.9057900082149,
            DCR_10s: 735.9051429346748,
            DCR_30s: 877.7226394083888,
          },
        },
        {
          analysisStepId: 'neware-step-12',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 45.31493282371492,
            DCR_5s: 464.2725770837354,
            DCR_10s: 704.0163684585347,
            DCR_30s: 879.63247031617,
          },
        },
        {
          analysisStepId: 'neware-step-16',
          rawFloat32ResistanceOhm: {
            DCR_first_sample: 42.57558626129599,
            DCR_5s: 418.52785444078967,
            DCR_10s: 673.6013069616937,
            DCR_30s: 891.2096651530189,
          },
        },
      ],
    },
  ] satisfies FrozenDcrFile[],
  gittFiles: [
    {
      fileName: 'CFx-GITT-200ma-1.032mg-2_127.0.0.1-BTS85-23-8-6-868.ndax',
      sha256: 'd38afbc2b67f3419c16d9e9425d20569e2c7910e74827cc0f2ab64c1e276b4f8',
      rowCount: 22_449,
      activeMassMg: 1.032,
      remark: 'GITT-CFCO2-Na-0.976mg-50mAg-2',
      channelId: '62',
      filenameMassConflict: false,
      remarkMassConflict: true,
      pulseCount: 42,
      fullPulseCount: 13,
      shortenedPulseCount: 29,
      timeLimitReachedPulseCount: 13,
      stopVoltageTerminatedPulseCount: 29,
      mainComparativeSequenceCount: 13,
      fileEndTruncatedRestCount: 1,
      fullPulseCapacityFractionMinimum: 0.07706347107413446,
      fullPulseCapacityFractionMaximum: 0.0770664809725723,
    },
    {
      fileName: 'CFx-GITT-200ma-1.096mg-8_127.0.0.1-BTS85-23-8-8-870.ndax',
      sha256: '87f535c2a9b296d97cf3023ddbf817897b4a4f244b6cc4f2bab0303f6af43b90',
      rowCount: 22_301,
      activeMassMg: 1.096,
      remark: null,
      channelId: '64',
      filenameMassConflict: false,
      remarkMassConflict: false,
      pulseCount: 43,
      fullPulseCount: 11,
      shortenedPulseCount: 32,
      timeLimitReachedPulseCount: 12,
      stopVoltageTerminatedPulseCount: 31,
      mainComparativeSequenceCount: 12,
      fileEndTruncatedRestCount: 1,
      fullPulseCapacityFractionMinimum: 0.07706945881541044,
      fullPulseCapacityFractionMaximum: 0.07707164711017124,
    },
    {
      fileName: 'CFx-GITT-200ma-1.152mg-9_127.0.0.1-BTS85-23-8-7-869.ndax',
      sha256: 'b0e377fd0332e8ab956d21d78bf3eb2986770dccc9edae53103b486441fa6a1d',
      rowCount: 22_230,
      activeMassMg: 1.152,
      remark: 'GITT-CFCO2-Na-0.976mg-50mAg-2',
      channelId: '63',
      filenameMassConflict: false,
      remarkMassConflict: true,
      pulseCount: 43,
      fullPulseCount: 10,
      shortenedPulseCount: 33,
      timeLimitReachedPulseCount: 11,
      stopVoltageTerminatedPulseCount: 32,
      mainComparativeSequenceCount: 11,
      fileEndTruncatedRestCount: 1,
      fullPulseCapacityFractionMinimum: 0.07707038933736658,
      fullPulseCapacityFractionMaximum: 0.0770723445885135,
    },
    {
      fileName: 'FGS-GITT-200ma-0.512mg-4_127.0.0.1-BTS85-23-8-5-867.ndax',
      sha256: '33515536353e77babc77c40af3350a27b8cc48eca907fdfae10aa7b6d7484ccf',
      rowCount: 22_168,
      activeMassMg: 0.512,
      remark: 'GITT-CFCO2-Na-0.976mg-50mAg-2',
      channelId: '61',
      filenameMassConflict: false,
      remarkMassConflict: true,
      pulseCount: 43,
      fullPulseCount: 11,
      shortenedPulseCount: 32,
      timeLimitReachedPulseCount: 11,
      stopVoltageTerminatedPulseCount: 32,
      mainComparativeSequenceCount: 11,
      fileEndTruncatedRestCount: 1,
      fullPulseCapacityFractionMinimum: 0.07706490119170392,
      fullPulseCapacityFractionMaximum: 0.07706757564581104,
    },
    {
      fileName: 'FGS-GITT-200ma-0.56mg-3_127.0.0.1-BTS85-23-8-4-866.ndax',
      sha256: '132144670db7769e0e762707071ca4187706a11776e53b18e4f72baa9899a283',
      rowCount: 36_349,
      activeMassMg: 0.56,
      remark: null,
      channelId: '60',
      filenameMassConflict: false,
      remarkMassConflict: false,
      pulseCount: 72,
      fullPulseCount: 8,
      shortenedPulseCount: 64,
      timeLimitReachedPulseCount: 10,
      stopVoltageTerminatedPulseCount: 62,
      mainComparativeSequenceCount: 10,
      fileEndTruncatedRestCount: 1,
      fullPulseCapacityFractionMinimum: 0.07707599523271531,
      fullPulseCapacityFractionMaximum: 0.07707837929796135,
    },
    {
      fileName: 'FGS-GITT-200ma-0.696mg-2_127.0.0.1-BTS85-23-8-3-865.ndax',
      sha256: 'ae3527a3e95884d7ff3e8f71f333f7bc9383e06976f38b495f9753a58f7368e5',
      rowCount: 21_825,
      activeMassMg: 0.696,
      remark: null,
      channelId: '59',
      filenameMassConflict: false,
      remarkMassConflict: false,
      pulseCount: 43,
      fullPulseCount: 7,
      shortenedPulseCount: 36,
      timeLimitReachedPulseCount: 7,
      stopVoltageTerminatedPulseCount: 36,
      mainComparativeSequenceCount: 7,
      fileEndTruncatedRestCount: 1,
      fullPulseCapacityFractionMinimum: 0.07706228914357667,
      fullPulseCapacityFractionMaximum: 0.07706505404063807,
    },
  ] satisfies FrozenGittFile[],
} as const;
