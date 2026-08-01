export type LinearRegressionResult = {
  slope: number;
  intercept: number;
  rSquared: number;
  rmse: number;
  slopeStandardError: number;
  predicted: number[];
  residuals: number[];
};

export function mean(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function quantile(values: number[], probability: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * Math.min(1, Math.max(0, probability));
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function medianAbsoluteDeviation(values: number[]): number {
  const center = median(values);
  if (!Number.isFinite(center)) return Number.NaN;
  return median(values.map((value) => Math.abs(value - center)));
}

export function robustSigma(values: number[]): number {
  return 1.4826 * medianAbsoluteDeviation(values);
}

export function linearRegression(x: number[], y: number[]): LinearRegressionResult | null {
  if (x.length !== y.length || x.length < 2) return null;
  const xMean = mean(x);
  const yMean = mean(y);
  let sxx = 0;
  let sxy = 0;
  for (let index = 0; index < x.length; index += 1) {
    const dx = x[index] - xMean;
    sxx += dx * dx;
    sxy += dx * (y[index] - yMean);
  }
  if (!(sxx > 0)) return null;
  const slope = sxy / sxx;
  const intercept = yMean - slope * xMean;
  const predicted = x.map((value) => intercept + slope * value);
  const residuals = y.map((value, index) => value - predicted[index]);
  const sse = residuals.reduce((sum, value) => sum + value * value, 0);
  const sst = y.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  const rSquared = sst > 0 ? 1 - sse / sst : sse === 0 ? 1 : 0;
  const rmse = Math.sqrt(sse / x.length);
  const slopeStandardError = x.length > 2 ? Math.sqrt((sse / (x.length - 2)) / sxx) : Number.POSITIVE_INFINITY;
  return { slope, intercept, rSquared, rmse, slopeStandardError, predicted, residuals };
}

export function theilSenRegression(x: number[], y: number[]): { slope: number; intercept: number } | null {
  if (x.length !== y.length || x.length < 2) return null;
  const slopes: number[] = [];
  for (let left = 0; left < x.length - 1; left += 1) {
    for (let right = left + 1; right < x.length; right += 1) {
      const deltaX = x[right] - x[left];
      if (deltaX !== 0) slopes.push((y[right] - y[left]) / deltaX);
    }
  }
  if (slopes.length === 0) return null;
  const slope = median(slopes);
  const intercept = median(x.map((value, index) => y[index] - slope * value));
  return { slope, intercept };
}

function solve3x3(matrix: number[][], vector: number[]): number[] | null {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-20) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const pivotValue = augmented[column][column];
    for (let index = column; index < 4; index += 1) augmented[column][index] /= pivotValue;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index < 4; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map((row) => row[3]);
}

export function quadraticRegression(
  x: number[],
  y: number[],
): { intercept: number; linear: number; quadratic: number; residuals: number[] } | null {
  if (x.length !== y.length || x.length < 3) return null;
  const n = x.length;
  const sx = x.reduce((sum, value) => sum + value, 0);
  const sx2 = x.reduce((sum, value) => sum + value ** 2, 0);
  const sx3 = x.reduce((sum, value) => sum + value ** 3, 0);
  const sx4 = x.reduce((sum, value) => sum + value ** 4, 0);
  const sy = y.reduce((sum, value) => sum + value, 0);
  const sxy = x.reduce((sum, value, index) => sum + value * y[index], 0);
  const sx2y = x.reduce((sum, value, index) => sum + value ** 2 * y[index], 0);
  const solved = solve3x3(
    [
      [n, sx, sx2],
      [sx, sx2, sx3],
      [sx2, sx3, sx4],
    ],
    [sy, sxy, sx2y],
  );
  if (!solved) return null;
  const [intercept, linear, quadratic] = solved;
  const residuals = y.map((value, index) => value - (intercept + linear * x[index] + quadratic * x[index] ** 2));
  return { intercept, linear, quadratic, residuals };
}

export function durbinWatson(residuals: number[]): number | null {
  if (residuals.length < 3) return null;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < residuals.length; index += 1) {
    denominator += residuals[index] ** 2;
    if (index > 0) numerator += (residuals[index] - residuals[index - 1]) ** 2;
  }
  return denominator > 0 ? numerator / denominator : null;
}

export function robustCoefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const center = median(values);
  if (center === 0 || !Number.isFinite(center)) return null;
  return Math.abs(robustSigma(values) / center);
}

