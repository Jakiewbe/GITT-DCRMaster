import { normalizeLandCex } from '../adapters/land/cex';
import { normalizeNewareNdax } from '../adapters/neware/normalize';
import type {
  NormalizeWorkerRequest,
  NormalizeWorkerResponse,
} from '../app/normalizeWorkerProtocol';

const workerScope = self as unknown as {
  postMessage: (response: NormalizeWorkerResponse) => void;
};

self.onmessage = async (event: MessageEvent<NormalizeWorkerRequest>) => {
  const { requestId, fileName, bytes } = event.data;
  try {
    workerScope.postMessage({
      requestId,
      canonical: await (fileName.toLowerCase().endsWith('.cex')
        ? normalizeLandCex(bytes, fileName)
        : normalizeNewareNdax(bytes, fileName)),
      error: null,
    });
  } catch (error) {
    workerScope.postMessage({
      requestId,
      canonical: null,
      error: error instanceof Error ? error.message : 'normalization_worker_failed',
    });
  }
};

export {};
