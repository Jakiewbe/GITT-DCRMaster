import { describe, expect, it } from 'vitest';
import { getTrendYTickValues, shouldRenderTrendLines } from './BatchTrendPlot';

describe('BatchTrendPlot Y-axis direction', () => {
  it('returns low-to-high ticks when reverseY is enabled', () => {
    expect(getTrendYTickValues(1e-17, 1e-9, 'log10', true)).toEqual([
      1e-17,
      1e-15,
      1e-13,
      1e-11,
      1e-9,
    ]);
  });

  it('keeps high-to-low ticks in the normal direction', () => {
    expect(getTrendYTickValues(1e-17, 1e-9, 'log10', false)).toEqual([
      1e-9,
      1e-11,
      1e-13,
      1e-15,
      1e-17,
    ]);
  });

  it('supports a scatter-only mode without connecting independent voltage points', () => {
    expect(shouldRenderTrendLines(false, 6)).toBe(false);
    expect(shouldRenderTrendLines(true, 1)).toBe(false);
    expect(shouldRenderTrendLines(true, 2)).toBe(true);
  });
});
