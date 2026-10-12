import type { WorkbenchDatasetV1 } from './project';
import type { WorkbenchRecipeV1 } from './recipe';

const COLORS = ['#43b5c5', '#d783c5', '#f2b65c', '#8cce99', '#a998f2', '#ef8d78', '#83baff', '#c4cf64', '#ef9fce', '#7bd6bf', '#d5a755', '#c3b4a3'];

export function nextDatasetColor(used: ReadonlySet<string>): string {
  let index = 0;
  while (true) {
    const color = COLORS[index] ?? `hsl(${(index * 137.508).toFixed(3)} 65% 70%)`;
    if (!used.has(color)) return color;
    index += 1;
  }
}

export function assignDatasetColors(datasets: readonly WorkbenchDatasetV1[]): WorkbenchDatasetV1[] {
  const used = new Set(datasets.flatMap((dataset) => dataset.displayColor ? [dataset.displayColor] : []));
  return datasets.map((dataset) => {
    if (dataset.displayColor) return dataset;
    const displayColor = nextDatasetColor(used);
    used.add(displayColor);
    return { ...dataset, displayColor };
  });
}

export function removeDatasetsFromProject(
  datasets: readonly WorkbenchDatasetV1[],
  recipe: WorkbenchRecipeV1,
  ids: ReadonlySet<string>,
): { datasets: WorkbenchDatasetV1[]; recipe: WorkbenchRecipeV1 } {
  const remaining = datasets.filter((dataset) => !ids.has(dataset.id));
  const hashes = new Set(remaining.map((dataset) => dataset.canonical.sourceFileHash));
  return {
    datasets: remaining,
    recipe: {
      ...recipe,
      datasetSelectionsBySourceFileHash: Object.fromEntries(
        Object.entries(recipe.datasetSelectionsBySourceFileHash).filter(([hash]) => hashes.has(hash)),
      ),
    },
  };
}
