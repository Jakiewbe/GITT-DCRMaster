/**
 * GITT Calculation Engine
 *
 * References used to tighten the implementation:
 * - Weppner/Huggins short-time formulation as summarized in
 *   Verma et al., J. Electrochem. Soc. 164 (13) A3380-A3392 (2017), Eq. 1.
 * - Dees et al., J. Power Sources 189 (2009) 263-268 on assumptions/limitations.
 */

export const CF1_PRESETS = {
  name: 'Carbon Fluoride (CF1 / 氟化碳)',
  molarMass: 31.01,       // g/mol
  density: 2.7,           // g/cm3
  molarVolume: 11.48,     // cm3/mol
  specificCapacity: 865   // mAh/g
};

const CURRENT_EPS = 1e-12;
const CAPACITY_EPS = 1e-12;
const DEFAULT_GITT_FACTOR = 4 / Math.PI;
const DEFAULT_SHORT_TIME_FRACTION = 0.2;
const DEFAULT_MIN_FIT_POINTS = 4;
const CURRENT_LEVEL_RELATIVE_GAP = 0.15;
const CURRENT_LEVEL_ABS_MULTIPLIER = 5;

const hasValue = (value) => value !== undefined && value !== null && value !== '';

const normalizeStepToken = (value) => {
  if (!hasValue(value)) return null;
  return String(value).trim();
};

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);

const classifyRowState = (current, restThreshold) => {
  if (Math.abs(current) <= restThreshold) return 'Rest';
  return current < 0 ? 'CC_DChg' : 'CC_Chg';
};

const hasActiveLevelShift = (referenceCurrent, nextCurrent, restThreshold) => {
  const referenceMagnitude = Math.abs(referenceCurrent);
  const nextMagnitude = Math.abs(nextCurrent);

  if (referenceMagnitude <= restThreshold || nextMagnitude <= restThreshold) {
    return false;
  }

  const absoluteGap = Math.abs(nextMagnitude - referenceMagnitude);
  const relativeGap = absoluteGap / Math.max(referenceMagnitude, nextMagnitude, CURRENT_EPS);

  return absoluteGap > restThreshold * CURRENT_LEVEL_ABS_MULTIPLIER && relativeGap > CURRENT_LEVEL_RELATIVE_GAP;
};

const estimateSampleInterval = (rows) => {
  const intervals = [];

  for (let i = 1; i < rows.length; i++) {
    const dt = rows[i].time - rows[i - 1].time;
    if (dt > 0) {
      intervals.push(dt);
    }
  }

  if (intervals.length === 0) {
    return 0;
  }

  intervals.sort((a, b) => a - b);
  return intervals[Math.floor(intervals.length / 2)];
};

const inferRestThreshold = (rows) => {
  const activeMagnitudes = rows
    .map((row) => Math.abs(row.current))
    .filter((value) => value > CURRENT_EPS)
    .sort((a, b) => a - b);

  if (activeMagnitudes.length === 0) {
    return CURRENT_EPS;
  }

  const smallestActive = activeMagnitudes[0];
  const largestActive = activeMagnitudes[activeMagnitudes.length - 1];
  return Math.max(CURRENT_EPS, Math.min(largestActive * 0.01, smallestActive * 0.25));
};

const summarizeStep = (rows, stepId) => {
  const currents = rows.map((row) => row.current);
  const avgCurrent = mean(currents);
  const firstCapacity = rows[0]?.capacity;
  const lastCapacity = rows[rows.length - 1]?.capacity;
  const hasCapacitySeries = typeof firstCapacity === 'number' && typeof lastCapacity === 'number';
  const signedCapacityDelta = hasCapacitySeries ? lastCapacity - firstCapacity : null;
  const inferredState = Math.abs(avgCurrent) <= CURRENT_EPS ? 'Rest' : avgCurrent < 0 ? 'CC_DChg' : 'CC_Chg';

  return {
    stepId,
    sourceStepId: rows[0]?.step ?? null,
    stepType: inferredState,
    startTime: rows[0].time,
    endTime: rows[rows.length - 1].time,
    startVoltage: rows[0].voltage,
    endVoltage: rows[rows.length - 1].voltage,
    minVoltage: Math.min(...rows.map((row) => row.voltage)),
    maxVoltage: Math.max(...rows.map((row) => row.voltage)),
    avgCurrent,
    totalCapacity: hasCapacitySeries ? Math.abs(signedCapacityDelta) : 0,
    signedCapacityDelta,
    rows
  };
};

const hasUsableSourceStepIds = (rows) => {
  const tokens = rows.map((row) => normalizeStepToken(row.step)).filter(Boolean);
  if (tokens.length < 2) {
    return false;
  }

  let repeatedAdjacent = 0;
  let comparableAdjacent = 0;

  for (let i = 1; i < rows.length; i++) {
    const previous = normalizeStepToken(rows[i - 1].step);
    const current = normalizeStepToken(rows[i].step);
    if (!previous || !current) {
      continue;
    }

    comparableAdjacent += 1;
    if (previous === current) {
      repeatedAdjacent += 1;
    }
  }

  return comparableAdjacent > 0 && repeatedAdjacent / comparableAdjacent > 0.1;
};

const buildStepsFromSourceIds = (rows) => {
  const restThreshold = inferRestThreshold(rows);
  const grouped = [];
  let currentRows = [];
  let currentToken = null;
  let previousState = null;
  let referenceCurrent = null;

  rows.forEach((row) => {
    const token = normalizeStepToken(row.step);
    const state = classifyRowState(row.current, restThreshold);
    const shouldSplitForLevel = currentRows.length > 0 &&
      token === currentToken &&
      state === previousState &&
      state !== 'Rest' &&
      referenceCurrent !== null &&
      hasActiveLevelShift(referenceCurrent, row.current, restThreshold);

    if (!currentRows.length) {
      currentRows.push(row);
      currentToken = token;
      previousState = state;
      referenceCurrent = row.current;
      return;
    }

    if (token !== currentToken || state !== previousState || shouldSplitForLevel) {
      grouped.push(currentRows);
      currentRows = [row];
    } else {
      currentRows.push(row);
    }

    currentToken = token;
    if (currentRows.length === 1 || state === 'Rest') {
      referenceCurrent = row.current;
    } else {
      referenceCurrent = mean(currentRows.map((item) => item.current));
    }
    previousState = state;
  });

  if (currentRows.length > 0) {
    grouped.push(currentRows);
  }

  return grouped.map((stepRows, index) => summarizeStep(stepRows, index + 1));
};

const buildStepsFromCurrentStates = (rows) => {
  const restThreshold = inferRestThreshold(rows);
  const grouped = [];
  let currentRows = [];
  let previousState = null;
  let referenceCurrent = null;

  rows.forEach((row) => {
    const state = classifyRowState(row.current, restThreshold);
    const shouldSplitForLevel = currentRows.length > 0 &&
      state === previousState &&
      state !== 'Rest' &&
      referenceCurrent !== null &&
      hasActiveLevelShift(referenceCurrent, row.current, restThreshold);

    if (!currentRows.length || (state === previousState && !shouldSplitForLevel)) {
      currentRows.push(row);
      if (currentRows.length === 1 || state === 'Rest') {
        referenceCurrent = row.current;
      } else {
        referenceCurrent = mean(currentRows.map((item) => item.current));
      }
      previousState = state;
      return;
    }

    grouped.push(currentRows);
    currentRows = [row];
    previousState = state;
    referenceCurrent = row.current;
  });

  if (currentRows.length > 0) {
    grouped.push(currentRows);
  }

  return grouped.map((stepRows, index) => summarizeStep(stepRows, index + 1));
};

const buildCurrentBandMeta = (rank, totalClusters) => {
  if (totalClusters <= 1) {
    return { key: null, label: null };
  }

  if (totalClusters === 2) {
    return rank === 0
      ? { key: 'LOW', label: '小电流' }
      : { key: 'HIGH', label: '大电流' };
  }

  if (totalClusters === 3) {
    return [
      { key: 'LOW', label: '小电流' },
      { key: 'MEDIUM', label: '中电流' },
      { key: 'HIGH', label: '大电流' }
    ][rank];
  }

  return { key: `LEVEL_${rank + 1}`, label: `第${rank + 1}档电流` };
};

const annotateStepsWithCurrentBands = (steps) => {
  const annotated = steps.map((step) => ({ ...step }));
  const directions = [
    { stepType: 'CC_DChg', suffix: '放电' },
    { stepType: 'CC_Chg', suffix: '充电' }
  ];

  directions.forEach(({ stepType, suffix }) => {
    const members = annotated
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => step.stepType === stepType && Math.abs(step.avgCurrent) > CURRENT_EPS)
      .sort((a, b) => Math.abs(a.step.avgCurrent) - Math.abs(b.step.avgCurrent));

    if (!members.length) {
      return;
    }

    const clusters = [];

    members.forEach((member) => {
      const magnitude = Math.abs(member.step.avgCurrent);
      const lastCluster = clusters[clusters.length - 1];

      if (!lastCluster) {
        clusters.push({ representative: magnitude, members: [member] });
        return;
      }

      const relativeGap = Math.abs(magnitude - lastCluster.representative) / Math.max(magnitude, lastCluster.representative, CURRENT_EPS);
      if (relativeGap <= CURRENT_LEVEL_RELATIVE_GAP) {
        lastCluster.members.push(member);
        lastCluster.representative = mean(lastCluster.members.map((item) => Math.abs(item.step.avgCurrent)));
      } else {
        clusters.push({ representative: magnitude, members: [member] });
      }
    });

    clusters.forEach((cluster, rank) => {
      const bandMeta = buildCurrentBandMeta(rank, clusters.length);

      cluster.members.forEach(({ index }) => {
        const targetStep = annotated[index];
        targetStep.currentBandIndex = rank + 1;
        targetStep.currentBandCount = clusters.length;
        targetStep.currentBandKey = bandMeta.key;
        targetStep.currentBandLabel = bandMeta.label;
        targetStep.displayStepType = bandMeta.label ? `${bandMeta.label}${suffix}` : suffix;
        targetStep.detailedStepType = bandMeta.key ? `${stepType}_${bandMeta.key}` : stepType;
      });
    });
  });

  annotated.forEach((step) => {
    if (step.stepType === 'Rest') {
      step.currentBandIndex = null;
      step.currentBandCount = 0;
      step.currentBandKey = null;
      step.currentBandLabel = null;
      step.displayStepType = '静置';
      step.detailedStepType = 'Rest';
    } else if (!step.displayStepType) {
      step.displayStepType = step.stepType === 'CC_DChg' ? '放电' : '充电';
      step.detailedStepType = step.stepType;
    }
  });

  return annotated;
};

export const groupDataIntoSteps = (rows) => {
  if (!rows.length) {
    return [];
  }

  const groupedSteps = hasUsableSourceStepIds(rows)
    ? buildStepsFromSourceIds(rows)
    : buildStepsFromCurrentStates(rows);

  return annotateStepsWithCurrentBands(groupedSteps);
};

const getPulseCapacityMagnitudeMah = (pulseStep) => {
  if (pulseStep.totalCapacity > CAPACITY_EPS) {
    return pulseStep.totalCapacity;
  }

  const duration = Math.max(0, pulseStep.endTime - pulseStep.startTime);
  return (Math.abs(pulseStep.avgCurrent) * 1000 * duration) / 3600;
};

const getPulseMidpointVoltage = (pulseStep) => {
  if (!pulseStep?.rows?.length) {
    return null;
  }

  if (pulseStep.rows.length === 1) {
    return pulseStep.rows[0].voltage;
  }

  const midpointTime = pulseStep.startTime + Math.max(0, pulseStep.endTime - pulseStep.startTime) / 2;
  let previousRow = pulseStep.rows[0];

  if (midpointTime <= previousRow.time) {
    return previousRow.voltage;
  }

  for (let i = 1; i < pulseStep.rows.length; i++) {
    const currentRow = pulseStep.rows[i];

    if (midpointTime === currentRow.time) {
      return currentRow.voltage;
    }

    if (midpointTime < currentRow.time) {
      const interval = currentRow.time - previousRow.time;
      if (interval <= CURRENT_EPS) {
        return currentRow.voltage;
      }

      const ratio = (midpointTime - previousRow.time) / interval;
      return previousRow.voltage + (currentRow.voltage - previousRow.voltage) * ratio;
    }

    previousRow = currentRow;
  }

  return pulseStep.rows[pulseStep.rows.length - 1].voltage;
};

const assignRelativeSoc = (items, currentAccessor, capacityAccessor) => {
  if (!items.length) {
    return;
  }

  let segmentStart = 0;

  while (segmentStart < items.length) {
    const segmentSign = currentAccessor(items[segmentStart]) < 0 ? -1 : 1;
    let segmentEnd = segmentStart + 1;

    while (segmentEnd < items.length) {
      const nextSign = currentAccessor(items[segmentEnd]) < 0 ? -1 : 1;
      if (nextSign !== segmentSign) {
        break;
      }
      segmentEnd += 1;
    }

    const segmentItems = items.slice(segmentStart, segmentEnd);
    const totalCapacity = segmentItems.reduce((sum, item) => sum + capacityAccessor(item), 0);
    let runningCapacity = 0;

    segmentItems.forEach((item) => {
      runningCapacity += capacityAccessor(item);
      item.soc = segmentSign < 0
        ? Math.max(0, 100 - (runningCapacity / (totalCapacity || 1)) * 100)
        : Math.min(100, (runningCapacity / (totalCapacity || 1)) * 100);
    });

    segmentStart = segmentEnd;
  }
};

const getCharacteristicDiffusionLengthCm = (params, model, options = {}) => {
  const { mass, molarMass, molarVolume, area, particleRadius = 1.5, physicalThickness = 50.0 } = params;
  const { characteristicLengthMode = 'dense' } = options;

  if (model === 'spherical' || characteristicLengthMode === 'particle') {
    if (!(particleRadius > 0)) {
      throw new Error('球形颗粒模型要求颗粒半径 r_p > 0。');
    }
    return (particleRadius * 1e-4) / 3;
  }

  if (characteristicLengthMode === 'physical') {
    if (!(physicalThickness > 0)) {
      throw new Error('物理厚度模型要求极片物理厚度为正值。');
    }
    return physicalThickness * 1e-4; // Convert um to cm
  }

  if (!(mass > 0) || !(molarMass > 0) || !(molarVolume > 0) || !(area > 0)) {
    throw new Error('平面 GITT 模型要求 m、M、V_m、S 均为正值。');
  }

  return (mass * molarVolume) / (molarMass * area);
};

export const fitGittTransient = (pulseStep, options = {}) => {
  if (!pulseStep?.rows?.length) {
    return null;
  }

  const {
    fitStartDelay = 1,
    shortTimeFraction = DEFAULT_SHORT_TIME_FRACTION,
    minFitPoints = DEFAULT_MIN_FIT_POINTS,
    r2Threshold = 0.995
  } = options;

  const duration = Math.max(0, pulseStep.endTime - pulseStep.startTime);
  if (duration <= 0) {
    return null;
  }

  const sampleInterval = estimateSampleInterval(pulseStep.rows) || duration / Math.max(1, pulseStep.rows.length - 1);
  const baseVoltage = pulseStep.rows[0].voltage;
  const usablePoints = pulseStep.rows
    .map((row) => {
      const elapsed = row.time - pulseStep.startTime;
      return {
        t_elapsed: elapsed,
        sqrt_t: Math.sqrt(Math.max(0, elapsed)),
        voltage: row.voltage,
        deltaV: row.voltage - baseVoltage
      };
    })
    .filter((point) => point.t_elapsed > 0);

  if (usablePoints.length < 2) {
    return null;
  }

  let activeFitStartDelay = fitStartDelay;
  let candidatePoints = usablePoints.filter(
    (point) => point.t_elapsed >= activeFitStartDelay
  );

  // Dynamically reduce fitStartDelay if we don't have enough candidate points
  if (candidatePoints.length < 2 && activeFitStartDelay > 0) {
    activeFitStartDelay = 0;
    candidatePoints = usablePoints.filter((point) => point.t_elapsed >= activeFitStartDelay);
  }

  if (candidatePoints.length < 2) {
    return null;
  }

  const activeMinFitPoints = Math.min(minFitPoints, candidatePoints.length);
  const maxWindowEnd = Math.max(duration * shortTimeFraction, activeFitStartDelay + sampleInterval * activeMinFitPoints);

  // Adaptive R² window: expand until linearity degrades
  let bestFit = null;
  const stepSize = Math.max(1, Math.floor(candidatePoints.length / 12));

  for (let endIdx = activeMinFitPoints; endIdx <= candidatePoints.length; endIdx += stepSize) {
    const windowPoints = candidatePoints.slice(0, endIdx);
    const lastPoint = windowPoints[windowPoints.length - 1];

    if (lastPoint.t_elapsed > maxWindowEnd && bestFit) {
      break;
    }

    const fit = runLinearRegression(windowPoints);
    if (!fit) continue;

    if (!bestFit || fit.r2 >= r2Threshold) {
      bestFit = fit;
    } else {
      break;
    }
  }

  if (!bestFit && candidatePoints.length >= 2) {
    const fallbackEnd = Math.max(maxWindowEnd, sampleInterval * activeMinFitPoints);
    const fallbackPoints = candidatePoints.filter((p) => p.t_elapsed <= fallbackEnd);
    if (fallbackPoints.length >= 2) {
      bestFit = runLinearRegression(fallbackPoints);
    }
  }

  if (!bestFit) {
    return null;
  }

  return {
    points: usablePoints,
    fitPoints: bestFit.fitPoints,
    slope: bestFit.slope,
    intercept: bestFit.intercept,
    r2: bestFit.r2,
    fitWindowStart: bestFit.fitPoints[0].t_elapsed,
    fitWindowEnd: bestFit.fitPoints[bestFit.fitPoints.length - 1].t_elapsed
  };
};

function runLinearRegression(points) {
  const n = points.length;
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  points.forEach((point) => {
    sumX += point.sqrt_t;
    sumY += point.deltaV;
    sumXY += point.sqrt_t * point.deltaV;
    sumXX += point.sqrt_t * point.sqrt_t;
  });

  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) <= CURRENT_EPS) {
    return null;
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const avgY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;

  points.forEach((point) => {
    ssTot += Math.pow(point.deltaV - avgY, 2);
    const predicted = slope * point.sqrt_t + intercept;
    ssRes += Math.pow(point.deltaV - predicted, 2);
  });

  return {
    fitPoints: points,
    slope,
    intercept,
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 1
  };
}

export const solveGitt = (steps, params, options = {}) => {
  const {
    cutoffVoltage = 1.5,
    irCorrectionTime = 1,
    useIrCorrection = false,
    gittModel = 'planar',
    gittMethod = 'regression',
    gittFitDelay = 1,
    gittMultiplier = '4/pi',
    characteristicLengthMode = 'dense'
  } = options;

  const characteristicLengthCm = getCharacteristicDiffusionLengthCm(params, gittModel, options);
  const gittMultiplierValue = gittMultiplier === '1/pi' ? 1 / Math.PI :
                              gittMultiplier === '4' ? 4 :
                              gittMultiplier === '1' ? 1 : 4 / Math.PI;
  const pulsePairs = [];

  for (let i = 0; i < steps.length; i++) {
    const pulseStep = steps[i];
    if (pulseStep.stepType === 'Rest' || Math.abs(pulseStep.avgCurrent) <= CURRENT_EPS) {
      continue;
    }

    const previousStep = i > 0 ? steps[i - 1] : null;
    const nextStep = i < steps.length - 1 ? steps[i + 1] : null;
    const previousRest = previousStep?.stepType === 'Rest' ? previousStep : null;
    const relaxationStep = nextStep?.stepType === 'Rest' ? nextStep : null;

    pulsePairs.push({
      pulseStepId: pulseStep.stepId,
      relaxationStepId: relaxationStep?.stepId ?? null,
      current: pulseStep.avgCurrent,
      duration: Math.max(0, pulseStep.endTime - pulseStep.startTime),
      e0: previousRest?.endVoltage ?? null,
      e1: pulseStep.endVoltage,
      e2: relaxationStep?.endVoltage ?? null,
      medianVoltage: getPulseMidpointVoltage(pulseStep) ?? pulseStep.endVoltage,
      pulseStep,
      relaxationStep,
      precedingRest: previousRest,
      capacityDischarged: getPulseCapacityMagnitudeMah(pulseStep)
    });
  }

  assignRelativeSoc(pulsePairs, (pair) => pair.current, (pair) => pair.capacityDischarged);

  let cutoffIndex = pulsePairs.length;
  for (let i = 0; i < pulsePairs.length; i++) {
    const pair = pulsePairs[i];
    const sign = pair.current < 0 ? -1 : 1;
    const limitReached = sign < 0
      ? Math.min(pair.e1, pair.e2 ?? pair.e1) <= cutoffVoltage
      : Math.max(pair.e1, pair.e2 ?? pair.e1) >= cutoffVoltage;

    if (limitReached) {
      cutoffIndex = i + 1;
      break;
    }
  }

  const processedPairs = pulsePairs.map((pair, index) => {
    const fit = fitGittTransient(pair.pulseStep, { fitStartDelay: gittFitDelay });
    const analysisNotes = [];
    let dLi = null;
    let dEs = null;
    let dEt = null;

    if (pair.e0 === null) {
      analysisNotes.push('缺少脉冲前静置段，无法得到可靠 E0。');
    }
    if (pair.e2 === null) {
      analysisNotes.push('缺少脉冲后弛豫段，无法得到可靠 E2。');
    }
    if (pair.duration <= 0) {
      analysisNotes.push('脉冲持续时间为 0。');
    }

    const targetIrDelay = Math.min(pair.duration, Math.max(irCorrectionTime, fit?.fitWindowStart ?? 0));
    let e0Plus = null;
    if (pair.duration > 0) {
      const pulseRows = pair.pulseStep.rows;
      let closestRow = pulseRows[0];
      let minimumDelta = Math.abs((closestRow.time - pair.pulseStep.startTime) - targetIrDelay);

      for (const row of pulseRows) {
        const elapsed = row.time - pair.pulseStep.startTime;
        const delta = Math.abs(elapsed - targetIrDelay);
        if (delta < minimumDelta) {
          minimumDelta = delta;
          closestRow = row;
        }
      }

      e0Plus = closestRow.voltage;
    }

    if (pair.e0 !== null && pair.e2 !== null) {
      dEs = Math.abs(pair.e2 - pair.e0);
      dEt = Math.abs(pair.e1 - (useIrCorrection && e0Plus !== null ? e0Plus : pair.e0));
    }

    if (pair.duration > 0 && dEs !== null) {
      if (gittMethod === 'regression') {
        if (!fit) {
          analysisNotes.push('短时拟合区数据点不足，无法进行 E-√t 回归。');
        } else if (Math.abs(fit.slope) <= CURRENT_EPS) {
          analysisNotes.push('E-√t 回归斜率接近 0。');
        } else {
          dLi = gittMultiplierValue
            * Math.pow(characteristicLengthCm, 2)
            * Math.pow(dEs / Math.abs(fit.slope), 2)
            / Math.pow(pair.duration, 2);

          if (fit.r2 < 0.98) {
            analysisNotes.push(`短时线性区拟合度较低 (R² = ${fit.r2.toFixed(4)})。`);
          }
        }
      } else {
        if (!(dEt > CURRENT_EPS)) {
          analysisNotes.push('瞬态极化电压 ΔEτ 过小，无法使用终点法。');
        } else {
          dLi = gittMultiplierValue
            * Math.pow(characteristicLengthCm, 2)
            * Math.pow(dEs / dEt, 2)
            / pair.duration;
        }
      }
    }

    return {
      index,
      pulseStepId: pair.pulseStepId,
      relaxationStepId: pair.relaxationStepId,
      current: pair.current,
      duration: pair.duration,
      e0: pair.e0,
      e1: pair.e1,
      e2: pair.e2,
      e0_plus: e0Plus,
      medianVoltage: pair.medianVoltage,
      dEs,
      dEt,
      dLi,
      soc: pair.soc ?? null,
      isExcluded: index >= cutoffIndex,
      explanation: analysisNotes.join(' '),
      slope: fit?.slope ?? 0,
      r2: fit?.r2 ?? 0,
      fitWindowStart: fit?.fitWindowStart ?? null,
      fitWindowEnd: fit?.fitWindowEnd ?? null,
      pulseStep: pair.pulseStep,
      relaxationStep: pair.relaxationStep
    };
  });

  return {
    results: processedPairs,
    totalDischargeCapacity: pulsePairs.reduce((sum, pair) => sum + pair.capacityDischarged, 0),
    cutoffApplied: cutoffIndex < pulsePairs.length,
    retainedCount: cutoffIndex,
    totalCount: pulsePairs.length,
    characteristicLengthCm,
    model: gittModel,
    method: gittMethod
  };
};

export const getTheoreticalCapacity = (mass, specificCapacity = CF1_PRESETS.specificCapacity) =>
  mass * specificCapacity;
