import type { NewareCanonicalDataset } from '../adapters/neware/normalize';
import type { NewareAnalysisBundle, WorkbenchSettings } from './analyze';

export type AnalysisWorkerRequest = {
  requestId: string;
  dataset: NewareCanonicalDataset;
  settings: WorkbenchSettings;
};

export type AnalysisWorkerResponse =
  | {
      requestId: string;
      analysis: NewareAnalysisBundle;
      error: null;
    }
  | {
      requestId: string;
      analysis: null;
      error: string;
    };
