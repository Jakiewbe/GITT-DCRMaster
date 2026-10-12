import { describe, expect, it } from 'vitest';
import { assignDatasetColors, nextDatasetColor, removeDatasetsFromProject } from './datasetManagement';
import type { WorkbenchDatasetV1 } from './project';
import { createDefaultWorkbenchRecipe } from './recipe';
import { createAnalysisCache } from './analysisCache';
import { MAXIMUM_CONCURRENT_ANALYSES } from './useBatchAnalysis';

function file(id: string): WorkbenchDatasetV1 {
  return { id, fileName: 'same-name.ndax', canonical: { sourceFileHash: id } } as WorkbenchDatasetV1;
}

describe('project file lifecycle', () => {
  it('removes only requested files and their recipe choices without mutating originals', () => {
    const datasets = [file('a'), file('b')];
    const recipe = createDefaultWorkbenchRecipe();
    const choice = { materialConfirmation: null, activeMassOverrideMg: 1, selectedActiveMassSourceId: null, soc: null };
    recipe.datasetSelectionsBySourceFileHash = { a: choice, b: choice };
    const removed = removeDatasetsFromProject(datasets, recipe, new Set(['a']));
    expect(removed.datasets).toEqual([datasets[1]]);
    expect(Object.keys(removed.recipe.datasetSelectionsBySourceFileHash)).toEqual(['b']);
    expect(datasets).toHaveLength(2);
    expect(recipe.datasetSelectionsBySourceFileHash.a).toBe(choice);
  });
  it('clears all files and per-file overrides while retaining project defaults', () => {
    const result = removeDatasetsFromProject([file('a')], createDefaultWorkbenchRecipe(), new Set(['a']));
    expect(result.datasets).toEqual([]);
    expect(result.recipe.electrodeDiameterMm).toBe(12);
  });
  it('keeps file colors distinct beyond the palette and stable after another file is removed', () => {
    const files = assignDatasetColors(Array.from({ length: 30 }, (_, index) => file(String(index))));
    expect(new Set(files.map((dataset) => dataset.displayColor)).size).toBe(30);
    expect(assignDatasetColors(files.slice(1)).map((dataset) => dataset.displayColor)).toEqual(files.slice(1).map((dataset) => dataset.displayColor));
    expect(nextDatasetColor(new Set(files.map((dataset) => dataset.displayColor!)))).not.toBe(files[0].displayColor);
  });
  it('releases old and removed analysis outcomes, including clear-and-reimport', () => {
    const cache = createAnalysisCache();
    cache.set('old', { analysis: null, error: 'old settings' });
    cache.set('active', { analysis: null, error: null });
    cache.retain(new Set(['active']));
    expect(cache.peek('old')).toBeUndefined();
    expect(cache.size()).toBe(1);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.peek('active')).toBeUndefined();
    expect(MAXIMUM_CONCURRENT_ANALYSES).toBe(1);
  });
});
