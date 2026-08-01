export type ProjectAnalysisSummaryV1 = {
  value: number | '待重算' | '完成';
  label: '后台分析中' | 'GITT 待确认' | '参数已修改' | '分析状态';
};

export function summarizeProjectAnalysisStatusV1(input: {
  analysisPending: boolean;
  pendingAnalysisCount: number;
  blockedGittCount: number;
  recipeHasUncommittedChanges: boolean;
  gittDatasetCount: number;
}): ProjectAnalysisSummaryV1 {
  if (input.analysisPending) {
    return { value: input.pendingAnalysisCount, label: '后台分析中' };
  }
  if (input.blockedGittCount > 0) {
    return { value: input.blockedGittCount, label: 'GITT 待确认' };
  }
  if (input.recipeHasUncommittedChanges && input.gittDatasetCount > 0) {
    return { value: '待重算', label: '参数已修改' };
  }
  return { value: '完成', label: '分析状态' };
}
