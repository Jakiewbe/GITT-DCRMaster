import { createProjectArchive, openProjectFile } from '../app/projectArchive';
import type { ProjectWorkerRequest, ProjectWorkerResponse } from '../app/projectWorker';

const scope = self as unknown as { postMessage: (response: ProjectWorkerResponse) => void };
self.onmessage = async (event: MessageEvent<ProjectWorkerRequest>) => {
  try {
    const request = event.data;
    const result = request.action === 'save'
      ? { action: 'save' as const, blob: await createProjectArchive(request.settings, request.datasets, request.recipe) }
      : { action: 'open' as const, project: await openProjectFile(request.file) };
    scope.postMessage({ result, error: null });
  } catch (error) {
    scope.postMessage({ result: null, error: error instanceof Error ? error.message : 'project_worker_failed' });
  }
};
