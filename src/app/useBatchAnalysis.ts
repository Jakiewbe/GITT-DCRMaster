import { useEffect, useMemo, useState } from 'react';
import {
  createAnalysisCache,
  createAnalysisCacheKey,
  type AnalysisCache,
  type AnalysisOutcome,
} from './analysisCache';
import type { AnalysisWorkerRequest, AnalysisWorkerResponse } from './analysisWorkerProtocol';
import type { NewareAnalysisBundle, WorkbenchSettings } from './analyze';
import type { WorkbenchDatasetV1 } from './project';
import {
  applyRecipePlanToWorkbenchSettings,
  buildDatasetRecipePlan,
  type DatasetRecipePlanV1,
  type RecipeResolvedWorkbenchSettingsV1,
  type WorkbenchRecipeV1,
} from './recipe';
import {
  classifyNewareProfile,
  type NewareProfileClassification,
} from '../adapters/neware/events';

export type ClassifiedDatasetV1 = {
  loaded: WorkbenchDatasetV1;
  classification: NewareProfileClassification;
};

export type BatchAnalysisEntryV1 = ClassifiedDatasetV1 & {
  /**
   * A missing key means no worker was allowed to start.  This is distinct
   * from a worker failure: an incomplete experimental recipe is a deliberate
   * scientific gate, not an analysis error.
   */
  cacheKey: string | null;
  recipePlan: DatasetRecipePlanV1;
  resolvedSettings: RecipeResolvedWorkbenchSettingsV1 | null;
  blockedReasonCodes: string[];
  analysis: NewareAnalysisBundle | null;
  error: string | null;
  pending: boolean;
};

type BatchAnalysisRequestV1 = ClassifiedDatasetV1 & {
  cacheKey: string | null;
  recipePlan: DatasetRecipePlanV1;
  resolvedSettings: RecipeResolvedWorkbenchSettingsV1 | null;
  blockedReasonCodes: string[];
};

export const MAXIMUM_CONCURRENT_ANALYSES = 1;

/**
 * Turns a project-level recipe into one immutable, per-file analysis request.
 *
 * The important property is that GITT has no fallback route: when geometry,
 * material, or mass evidence has not been confirmed, `resolvedSettings` and
 * `cacheKey` are both null and no worker can receive the old 12 mm default.
 */
export function buildBatchAnalysisRequests(
  datasets: readonly WorkbenchDatasetV1[],
  settings: WorkbenchSettings,
  recipe: WorkbenchRecipeV1,
): BatchAnalysisRequestV1[] {
  return datasets.map((loaded) => {
    const classification = classifyNewareProfile(loaded.canonical);
    const recipePlan = buildDatasetRecipePlan(loaded.canonical, classification, recipe);
    const base: ClassifiedDatasetV1 = { loaded, classification };

    if (classification.analysisKind === 'unknown' || !recipePlan.readyToAnalyze) {
      return {
        ...base,
        recipePlan,
        cacheKey: null,
        resolvedSettings: null,
        blockedReasonCodes: recipePlan.blocking.map((blocking) => blocking.code),
      };
    }

    try {
      const resolvedSettings = applyRecipePlanToWorkbenchSettings(settings, recipePlan);
      return {
        ...base,
        recipePlan,
        cacheKey: createAnalysisCacheKey(loaded.canonical, resolvedSettings),
        resolvedSettings,
        blockedReasonCodes: [],
      };
    } catch (error) {
      const code = error instanceof Error && 'code' in error
        ? String((error as { code?: unknown }).code)
        : 'recipe_settings_resolution_failed';
      return {
        ...base,
        recipePlan,
        cacheKey: null,
        resolvedSettings: null,
        blockedReasonCodes: [code],
      };
    }
  });
}

/**
 * Runs the scientific worker for every recognized dataset in a small bounded
 * queue.  The product UI can therefore show a batch trend without changing
 * the pure science core or pretending that an unanalysed file is a result.
 */
export function useBatchAnalysis(
  datasets: readonly WorkbenchDatasetV1[],
  settings: WorkbenchSettings,
  recipe: WorkbenchRecipeV1,
  paused = false,
): {
  entries: BatchAnalysisEntryV1[];
  cache: AnalysisCache;
  pendingCount: number;
} {
  // Retain exactly the current requests below, not 48 historical full results.
  const [cache] = useState(() => createAnalysisCache(Number.MAX_SAFE_INTEGER));
  const [revision, setRevision] = useState(0);

  const requests = useMemo(
    () => buildBatchAnalysisRequests(datasets, settings, recipe),
    [datasets, recipe, settings],
  );

  useEffect(() => {
    cache.retain(new Set(requests.flatMap((request) => request.cacheKey === null ? [] : [request.cacheKey])));
    if (paused) return undefined;
    const pending = requests.filter(
      (request) =>
        request.cacheKey !== null &&
        request.resolvedSettings !== null &&
        cache.peek(request.cacheKey) === undefined,
    );
    if (pending.length === 0) return undefined;

    let cancelled = false;
    let cursor = 0;
    const activeWorkers = new Set<Worker>();

    const launchNext = () => {
      if (cancelled || cursor >= pending.length) return;
      const next = pending[cursor];
      cursor += 1;
      // Both values are guaranteed by the pending predicate above. Keeping
      // this check here makes the worker boundary safe even if this queue is
      // refactored later.
      if (next.cacheKey === null || next.resolvedSettings === null) {
        launchNext();
        return;
      }
      const cacheKey = next.cacheKey;
      const resolvedSettings = next.resolvedSettings;

      let worker: Worker;
      try {
        worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), {
          type: 'module',
          name: 'gitt-dcr-science-analysis',
        });
      } catch (error) {
        cache.set(cacheKey, {
          analysis: null,
          error: error instanceof Error ? error.message : 'analysis_worker_unavailable',
        });
        setRevision((current) => current + 1);
        launchNext();
        return;
      }

      activeWorkers.add(worker);
      const finish = () => {
        activeWorkers.delete(worker);
        worker.terminate();
        launchNext();
      };

      worker.onmessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
        if (cancelled || event.data.requestId !== cacheKey) return;
        const identityMatches =
          event.data.analysis === null || event.data.analysis.analysisInputHash === cacheKey;
        cache.set(cacheKey, {
          analysis: identityMatches ? event.data.analysis : null,
          error: identityMatches ? event.data.error : 'analysis_worker_identity_mismatch',
        });
        setRevision((current) => current + 1);
        finish();
      };
      worker.onerror = (event) => {
        if (cancelled) return;
        cache.set(cacheKey, {
          analysis: null,
          error: event.message || 'analysis_worker_failed',
        });
        setRevision((current) => current + 1);
        finish();
      };
      worker.onmessageerror = () => {
        if (cancelled) return;
        cache.set(cacheKey, { analysis: null, error: 'analysis_worker_message_decode_failed' });
        setRevision((current) => current + 1);
        finish();
      };

      const request: AnalysisWorkerRequest = {
        requestId: cacheKey,
        dataset: next.loaded.canonical,
        settings: resolvedSettings,
      };
      try {
        worker.postMessage(request);
      } catch (error) {
        cache.set(cacheKey, { analysis: null, error: error instanceof Error ? error.message : 'analysis_worker_send_failed' });
        setRevision((current) => current + 1);
        finish();
      }
    };

    for (let index = 0; index < Math.min(MAXIMUM_CONCURRENT_ANALYSES, pending.length); index += 1) {
      launchNext();
    }

    return () => {
      cancelled = true;
      for (const worker of activeWorkers) worker.terminate();
    };
  }, [cache, paused, requests, settings]);

  const entries = useMemo<BatchAnalysisEntryV1[]>(
    () => requests.map((request) => {
      const outcome: AnalysisOutcome | undefined = request.cacheKey === null
        ? undefined
        : cache.peek(request.cacheKey);
      return {
        ...request,
        analysis: outcome?.analysis ?? null,
        error: outcome?.error ?? null,
        pending:
          request.cacheKey !== null &&
          request.resolvedSettings !== null &&
          outcome === undefined,
      };
    }),
    // `revision` deliberately represents a mutation to the in-memory cache.
    [cache, requests, revision],
  );

  return {
    entries,
    cache,
    pendingCount: entries.filter((entry) => entry.pending).length,
  };
}
