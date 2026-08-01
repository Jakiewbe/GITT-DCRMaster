import { describe, expect, it } from 'vitest';
import { summarizeProjectAnalysisStatusV1 } from './projectStatus';

describe('project analysis status', () => {
  it('does not report completion while GITT physical facts still require confirmation', () => {
    expect(summarizeProjectAnalysisStatusV1({
      analysisPending: false,
      pendingAnalysisCount: 0,
      blockedGittCount: 2,
      recipeHasUncommittedChanges: false,
      gittDatasetCount: 2,
    })).toEqual({ value: 2, label: 'GITT 待确认' });
  });

  it('distinguishes a changed recipe from a running analysis', () => {
    expect(summarizeProjectAnalysisStatusV1({
      analysisPending: false,
      pendingAnalysisCount: 0,
      blockedGittCount: 0,
      recipeHasUncommittedChanges: true,
      gittDatasetCount: 1,
    })).toEqual({ value: '待重算', label: '参数已修改' });
  });

  it('prioritizes an active worker over other states', () => {
    expect(summarizeProjectAnalysisStatusV1({
      analysisPending: true,
      pendingAnalysisCount: 3,
      blockedGittCount: 1,
      recipeHasUncommittedChanges: true,
      gittDatasetCount: 4,
    })).toEqual({ value: 3, label: '后台分析中' });
  });
});
