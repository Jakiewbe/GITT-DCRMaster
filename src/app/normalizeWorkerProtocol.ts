import type { NewareCanonicalDataset } from '../adapters/neware/normalize';

export type NormalizeWorkerRequest = {
  requestId: string;
  fileName: string;
  bytes: ArrayBuffer;
};

export type NormalizeWorkerResponse =
  | {
      requestId: string;
      canonical: NewareCanonicalDataset;
      error: null;
    }
  | {
      requestId: string;
      canonical: null;
      error: string;
    };
