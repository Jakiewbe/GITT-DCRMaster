import { describe, expect, it } from 'vitest';
import { getTrendYTickValues, shouldRenderTrendLines, trendExtent } from './BatchTrendPlot';

describe('BatchTrendPlot Y-axis direction', () => {
  it('computes a large-series extent without spreading an unbounded argument list', () => {
    expect(trendExtent(Array.from({ length: 300_000 }, (_, index) => index))).toEqual([-17999.94, 317998.94]);
  });
  it('uses whole powers of ten even for non-decade data bounds', () => {
    expect(getTrendYTickValues(9.3e-15, 1.9e-11, 'log10', true)).toEqual([1e-14, 1e-13, 1e-12, 1e-11]);
  });
  it('returns low-to-high ticks when reverseY is enabled', () => {
    expect(getTrendYTickValues(1e-17, 1e-9, 'log10', true)).toEqual([
      1e-17,
      1e-16,
      1e-15,
      1e-14,
      1e-13,
      1e-12,
      1e-11,
      1e-10,
      1e-9,
    ]);
  });

  it('keeps high-to-low ticks in the normal direction', () => {
    expect(getTrendYTickValues(1e-17, 1e-9, 'log10', false)).toEqual([
      1e-9,
      1e-10,
      1e-11,
      1e-12,
      1e-13,
      1e-14,
      1e-15,
      1e-16,
      1e-17,
    ]);
  });

  it('supports a scatter-only mode without connecting independent voltage points', () => {
    expect(shouldRenderTrendLines(false, 6)).toBe(false);
    expect(shouldRenderTrendLines(true, 1)).toBe(false);
    expect(shouldRenderTrendLines(true, 2)).toBe(true);
  });
});
