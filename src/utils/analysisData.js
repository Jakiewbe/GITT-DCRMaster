const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

export const normalizeAnalysisData = (rows, currentUnit = 'mA') => {
  let currentScale = 1;
  if (currentUnit === 'mA') {
    currentScale = 1 / 1000;
  } else if (currentUnit === 'uA') {
    currentScale = 1 / 1000000;
  }

  return rows.map((row) => ({
    ...row,
    current: isFiniteNumber(row.current) ? row.current * currentScale : row.current
  }));
};

export const convertCurrentFromAmp = (currentAmp, targetUnit = 'mA') => {
  if (!isFiniteNumber(currentAmp)) {
    return null;
  }

  if (targetUnit === 'mA') {
    return currentAmp * 1000;
  }
  if (targetUnit === 'uA') {
    return currentAmp * 1000000;
  }
  return currentAmp;
};

export const formatCurrentValue = (currentAmp, targetUnit = 'mA', digits = 4) => {
  const converted = convertCurrentFromAmp(currentAmp, targetUnit);
  if (converted === null) {
    return '-';
  }

  return `${converted.toFixed(digits)} ${targetUnit}`;
};

export const summarizeAnalysisData = (rows, steps) => {
  if (!rows || rows.length === 0) {
    return null;
  }

  const first = rows[0];
  const last = rows[rows.length - 1];
  let voltageMin = Number.POSITIVE_INFINITY;
  let voltageMax = Number.NEGATIVE_INFINITY;
  let peakCurrentAmp = 0;

  rows.forEach((row) => {
    if (isFiniteNumber(row.voltage)) {
      voltageMin = Math.min(voltageMin, row.voltage);
      voltageMax = Math.max(voltageMax, row.voltage);
    }

    if (isFiniteNumber(row.current)) {
      peakCurrentAmp = Math.max(peakCurrentAmp, Math.abs(row.current));
    }
  });

  return {
    rowCount: rows.length,
    stepCount: Array.isArray(steps) ? steps.length : 0,
    durationSeconds: Math.max(0, (last?.time ?? 0) - (first?.time ?? 0)),
    voltageMin: Number.isFinite(voltageMin) ? voltageMin : null,
    voltageMax: Number.isFinite(voltageMax) ? voltageMax : null,
    peakCurrentAmp
  };
};
