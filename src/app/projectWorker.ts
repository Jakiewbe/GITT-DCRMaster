import type { WorkbenchSettings } from './analyze';
import type { WorkbenchDatasetV1, WorkbenchProjectV1 } from './project';
import type { WorkbenchRecipeV1 } from './recipe';

export type ProjectWorkerRequest =
  | { action: 'save'; settings: WorkbenchSettings; datasets: WorkbenchDatasetV1[]; recipe: WorkbenchRecipeV1 }
  | { action: 'open'; file: Blob };
export type ProjectWorkerResult =
  | { action: 'save'; blob: Blob }
  | { action: 'open'; project: WorkbenchProjectV1 };
export type ProjectWorkerResponse = { result: ProjectWorkerResult | null; error: string | null };

export function runProjectWorker(request: ProjectWorkerRequest): Promise<ProjectWorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/project.worker.ts', import.meta.url), { type: 'module', name: 'pulselab-project-storage' });
    const fail = (message: string) => { worker.terminate(); reject(new Error(message)); };
    worker.onmessage = (event: MessageEvent<ProjectWorkerResponse>) => {
      worker.terminate();
      if (event.data.result === null) reject(new Error(event.data.error ?? 'project_worker_failed'));
      else resolve(event.data.result);
    };
    worker.onerror = (event) => fail(event.message || 'project_worker_failed');
    worker.onmessageerror = () => fail('project_worker_message_decode_failed');
    try { worker.postMessage(request); } catch (error) { fail(error instanceof Error ? error.message : 'project_worker_send_failed'); }
  });
}
