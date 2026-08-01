import { analyzeNewareDataset } from '../app/analyze';
import type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
} from '../app/analysisWorkerProtocol';

const workerScope = self as unknown as {
  postMessage: (response: AnalysisWorkerResponse) => void;
};

self.onmessage = (event: MessageEvent<AnalysisWorkerRequest>) => {
  const { requestId, dataset, settings } = event.data;
  try {
    workerScope.postMessage({
      requestId,
      analysis: analyzeNewareDataset(dataset, settings),
      error: null,
    });
  } catch (error) {
    workerScope.postMessage({
      requestId,
      analysis: null,
      error: error instanceof Error ? error.message : 'analysis_worker_failed',
    });
  }
};

export {};
