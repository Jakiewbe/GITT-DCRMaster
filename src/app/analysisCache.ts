import type { NewareCanonicalDataset } from '../adapters/neware/normalize';
import type { AppBuildMetadata, NewareAnalysisBundle, WorkbenchSettings } from './analyze';
import { createNewareAnalysisIdentity } from './analyze';

export type AnalysisOutcome = {
  analysis: NewareAnalysisBundle | null;
  error: string | null;
};

export type AnalysisCache = {
  get: (key: string) => AnalysisOutcome | undefined;
  peek: (key: string) => AnalysisOutcome | undefined;
  set: (key: string, value: AnalysisOutcome) => void;
  size: () => number;
};

export function createAnalysisCache(maximumEntries = 24): AnalysisCache {
  if (!Number.isInteger(maximumEntries) || maximumEntries < 1) {
    throw new Error('analysis_cache_size_invalid');
  }

  const entries = new Map<string, AnalysisOutcome>();
  return {
    get(key) {
      const value = entries.get(key);
      if (value === undefined) return undefined;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    peek(key) {
      return entries.get(key);
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > maximumEntries) {
        const oldestKey = entries.keys().next().value as string | undefined;
        if (oldestKey === undefined) break;
        entries.delete(oldestKey);
      }
    },
    size() {
      return entries.size;
    },
  };
}

export function createAnalysisCacheKey(
  dataset: NewareCanonicalDataset,
  settings: WorkbenchSettings,
  appBuildMetadata?: AppBuildMetadata,
): string {
  return createNewareAnalysisIdentity(dataset, settings, appBuildMetadata).analysisInputHash;
}
