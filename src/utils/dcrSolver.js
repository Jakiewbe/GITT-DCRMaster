/**
 * DCR (Direct Current Resistance) Calculation Engine
 * Supports both Multi-Step DCR (Low current -> High current)
 * and Single-Pulse DCR (Rest -> Active current pulse)
 * and calculates DCR at multiple time offsets.
 */

const CURRENT_EPS = 1e-12;
const CAPACITY_EPS = 1e-12;

const getPulseCapacityMagnitudeMah = (pulseStep) => {
  if (pulseStep.totalCapacity > CAPACITY_EPS) {
    return pulseStep.totalCapacity;
  }

  const duration = Math.max(0, pulseStep.endTime - pulseStep.startTime);
  return (Math.abs(pulseStep.avgCurrent) * 1000 * duration) / 3600;
};

const assignRelativeSoc = (items) => {
  if (!items.length) {
    return;
  }

  let segmentStart = 0;

  while (segmentStart < items.length) {
    const sign = items[segmentStart].avgCurrent < 0 ? -1 : 1;
    let segmentEnd = segmentStart + 1;

    while (segmentEnd < items.length) {
      const nextSign = items[segmentEnd].avgCurrent < 0 ? -1 : 1;
      if (nextSign !== sign) {
        break;
      }
      segmentEnd += 1;
    }

    const segmentItems = items.slice(segmentStart, segmentEnd);
    const totalCapacity = segmentItems.reduce((sum, item) => sum + item.capacityDischarged, 0);
    let runningCapacity = 0;

    segmentItems.forEach((item) => {
      const startFraction = runningCapacity / (totalCapacity || 1);
      const socStart = sign < 0
        ? Math.max(0, 100 - startFraction * 100)
        : Math.min(100, startFraction * 100);

      runningCapacity += item.capacityDischarged;
      const endFraction = runningCapacity / (totalCapacity || 1);
      const socEnd = sign < 0
        ? Math.max(0, 100 - endFraction * 100)
        : Math.min(100, endFraction * 100);

      item.socStart = socStart;
      item.socEnd = socEnd;
      item.soc = socStart;
    });

    segmentStart = segmentEnd;
  }
};

const findRowAtElapsed = (rows, startTime, elapsedSeconds) => {
  if (!rows || rows.length === 0) return null;
  let closestRow = rows[0];
  let minDiff = Math.abs((closestRow.time - startTime) - elapsedSeconds);
  for (const row of rows) {
    const diff = Math.abs((row.time - startTime) - elapsedSeconds);
    if (diff < minDiff) {
      minDiff = diff;
      closestRow = row;
    }
  }
  return closestRow;
};

export const solveDcr = (steps, options = {}) => {
  const dcrResults = [];
  const dcrTimeOffsets = options.dcrTimeOffsets || [0.1, 1.0, 3.0, 5.0, 10.0];

  for (let i = 0; i < steps.length; i++) {
    const pulseStep = steps[i];
    if (pulseStep.stepType === 'Rest' || Math.abs(pulseStep.avgCurrent) <= CURRENT_EPS) {
      continue;
    }

    // Find preceding steps
    const previousRestStep = (() => {
      for (let j = i - 1; j >= 0; j--) {
        if (steps[j].stepType === 'Rest') {
          return steps[j];
        }
      }
      return null;
    })();

    const previousActiveStep = (() => {
      for (let j = i - 1; j >= 0; j--) {
        if (steps[j].stepType !== 'Rest' && Math.abs(steps[j].avgCurrent) > CURRENT_EPS) {
          return steps[j];
        }
      }
      return null;
    })();

    let V_pre = null;
    let I_pre = 0;
    let referenceStepId = null;
    let referenceMode = '';

    // Determine the baseline step and values
    if (previousActiveStep && (!previousRestStep || steps.indexOf(previousActiveStep) > steps.indexOf(previousRestStep))) {
      // The preceding active step is closer than any preceding rest step, and has same direction but smaller current
      const sameDirection = previousActiveStep.stepType === pulseStep.stepType;
      const isLargerCurrent = Math.abs(pulseStep.avgCurrent) > Math.abs(previousActiveStep.avgCurrent) * 1.05;

      if (sameDirection && isLargerCurrent) {
        const lastRow = previousActiveStep.rows[previousActiveStep.rows.length - 1];
        V_pre = lastRow.voltage;
        I_pre = previousActiveStep.avgCurrent;
        referenceStepId = previousActiveStep.stepId;
        referenceMode = 'small-to-large';
      }
    }

    // Fallback: use preceding Rest step as baseline (Single-Pulse DCR)
    if (V_pre === null && previousRestStep) {
      const lastRow = previousRestStep.rows[previousRestStep.rows.length - 1];
      V_pre = lastRow.voltage;
      I_pre = 0;
      referenceStepId = previousRestStep.stepId;
      referenceMode = 'rest-to-active';
    }

    // Skip if no valid baseline is found
    if (V_pre === null) {
      continue;
    }

    const pulseDuration = Math.max(0, pulseStep.endTime - pulseStep.startTime);
    const E2 = pulseStep.endVoltage;
    const I2 = pulseStep.avgCurrent;
    const deltaV = E2 - V_pre;
    const deltaI = I2 - I_pre;
    const dcrValue = Math.abs(deltaI) > CURRENT_EPS ? Math.abs(deltaV / deltaI) : null;

    // Calculate DCR at multiple time offsets
    const dcrValues = {};
    dcrTimeOffsets.forEach((offset) => {
      const row = findRowAtElapsed(pulseStep.rows, pulseStep.startTime, offset);
      if (row) {
        const actualElapsed = row.time - pulseStep.startTime;
        const isLastRow = row.index === pulseStep.rows[pulseStep.rows.length - 1].index;
        
        // If the closest row is the last row of the pulse, and actual elapsed is less than 85% of the target, treat as out-of-bounds
        if (isLastRow && actualElapsed < offset * 0.85) {
          dcrValues[offset] = null;
        } else {
          const v_offset = row.voltage;
          const i_offset = row.current;
          const dV = v_offset - V_pre;
          const dI = i_offset - I_pre;
          dcrValues[offset] = Math.abs(dI) > CURRENT_EPS ? Math.abs(dV / dI) : null;
        }
      } else {
        dcrValues[offset] = null;
      }
    });

    dcrValues['end'] = dcrValue;

    dcrResults.push({
      stepId: pulseStep.stepId,
      stepType: pulseStep.stepType,
      detailedStepType: pulseStep.detailedStepType ?? pulseStep.stepType,
      displayStepType: pulseStep.displayStepType ?? (pulseStep.stepType === 'CC_DChg' ? '放电' : '充电'),
      currentBandLabel: pulseStep.currentBandLabel ?? null,
      currentBandKey: pulseStep.currentBandKey ?? null,
      currentBandIndex: pulseStep.currentBandIndex ?? null,
      currentBandCount: pulseStep.currentBandCount ?? 0,
      startTime: pulseStep.startTime,
      pulseDuration,
      avgCurrent: pulseStep.avgCurrent,
      V_pre,
      I_pre,
      referenceStepId,
      V_end: E2,
      E1: V_pre,
      E2,
      I1: I_pre,
      I2,
      dcrValue,
      dcrValues,
      referenceMode,
      capacityDischarged: getPulseCapacityMagnitudeMah(pulseStep)
    });
  }

  assignRelativeSoc(dcrResults);

  return {
    results: dcrResults,
    totalDischargeCapacity: dcrResults.reduce((sum, item) => sum + item.capacityDischarged, 0)
  };
};
