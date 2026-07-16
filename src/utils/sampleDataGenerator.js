/**
 * High-fidelity synthetic battery data generator for GITT and DCR demonstrations.
 * Specifically simulates Carbon Fluoride (CFx) primary battery discharge characteristics.
 */

/**
 * Generates realistic GITT time-series data
 * CFx starts discharging around 3.1V, has a flat platform around 2.5V-2.7V, and drops sharply below 2.0V down to 1.2V.
 */
export const generateGittSample = () => {
  const data = [];
  let time = 0; // seconds
  let capacity = 0; // mAh
  
  // 15 GITT pulses
  const numSteps = 15;
  const pulseDuration = 300;     // 5 minutes pulse
  const relaxationDuration = 900; // 15 minutes relaxation
  
  // CFx discharge parameters
  const mass = 0.0012; // 1.2 mg
  const specCap = 800; // ~800 mAh/g practical
  const totalCap = mass * specCap; // ~0.96 mAh total capacity
  
  let currentStepId = 1;
  let ocv = 3.15; // Starting open circuit voltage

  for (let step = 0; step < numSteps; step++) {
    // A. Pre-pulse Rest Step (300 seconds)
    const restSec = 300;
    for (let t = 0; t < restSec; t += 2) {
      time += 2;
      data.push({
        time: time,
        voltage: ocv + (Math.random() - 0.5) * 0.0002, // slight noise
        current: 0,
        step: currentStepId,
        stepType: 'Rest',
        capacity: capacity
      });
    }
    currentStepId++;

    // B. Constant Current Pulse Step (300 seconds)
    // We apply -0.16 mA (~C/6 rate)
    const pulseCurrent = -0.16; // mA
    const startV = ocv;
    const irDrop = 0.045; // 45 mV ohmic drop
    
    // As capacity is discharged, the OCV drops
    const stepCapacity = Math.abs(pulseCurrent) * (pulseDuration / 3600); // mAh
    capacity += stepCapacity;
    const finalOcv = 3.15 - 1.8 * Math.pow(capacity / totalCap, 1.8); // discharge curve shape
    
    for (let t = 0; t < pulseDuration; t += 2) {
      time += 2;
      // Fickian diffusion voltage change: proportional to sqrt(t)
      const fractionalTime = t / pulseDuration;
      const diffusionPolarization = 0.06 * Math.sqrt(fractionalTime);
      const voltage = startV - irDrop - diffusionPolarization - (startV - finalOcv) * fractionalTime;

      data.push({
        time: time,
        voltage: voltage + (Math.random() - 0.5) * 0.0003,
        current: pulseCurrent,
        step: currentStepId,
        stepType: 'CC_DChg',
        capacity: capacity - stepCapacity * (1 - fractionalTime)
      });
    }
    ocv = finalOcv; // Update to the new stable OCV state
    currentStepId++;

    // C. Relaxation Rest Step (900 seconds)
    const relaxationStartV = data[data.length - 1].voltage;
    for (let t = 0; t < relaxationDuration; t += 5) {
      time += 5;
      // Relaxation recovery: exponential recovery towards the new OCV
      const recoveryFraction = 1 - Math.exp(-t / 120);
      const voltage = relaxationStartV + irDrop + (ocv - (relaxationStartV + irDrop)) * recoveryFraction;

      data.push({
        time: time,
        voltage: voltage + (Math.random() - 0.5) * 0.0001,
        current: 0,
        step: currentStepId,
        stepType: 'Rest',
        capacity: capacity
      });
    }
    currentStepId++;
  }

  return data;
};

/**
 * Generates DCR pulse characterization data
 * A sequence of 10s discharge pulses at high currents separated by rest periods
 */
export const generateDcrSample = () => {
  const data = [];
  let time = 0;
  let capacity = 0;
  let ocv = 3.12;
  let currentStepId = 1;

  const numPulses = 10;
  const pulseCurrent = -1.2; // mA (High 1C/2C current pulse)
  const pulseDuration = 10;  // 10s pulse
  const restDuration = 600;  // 10 minutes rest

  // Generate initial rest to establish baseline
  for (let t = 0; t < 120; t += 1) {
    time += 1;
    data.push({
      time: time,
      voltage: ocv + (Math.random() - 0.5) * 0.0001,
      current: 0,
      step: currentStepId,
      stepType: 'Rest',
      capacity: capacity
    });
  }
  currentStepId++;

  for (let p = 0; p < numPulses; p++) {
    // 1. DCR Pulse (10 seconds, 1s interval sampling)
    const baseV = ocv;
    // Polarization increases at higher discharge depths
    const dodFactor = 1 + 2.5 * Math.pow(p / numPulses, 2);
    const irDrop = 0.08 * dodFactor; // increasing internal resistance
    const diffDrop = 0.05 * dodFactor;

    for (let t = 0; t < pulseDuration; t += 0.5) {
      time += 0.5;
      const frac = t / pulseDuration;
      // Exponential drop for DCR pulse
      const polarization = irDrop * (1 - Math.exp(-t / 0.3)) + diffDrop * Math.sqrt(frac);
      const voltage = baseV - polarization;

      data.push({
        time: time,
        voltage: voltage + (Math.random() - 0.5) * 0.0002,
        current: pulseCurrent,
        step: currentStepId,
        stepType: 'CC_DChg',
        capacity: capacity
      });
    }
    
    // Update capacity and OCV
    capacity += Math.abs(pulseCurrent) * (pulseDuration / 3600);
    ocv = baseV - 0.15 * dodFactor; // permanent drop in voltage due to discharge
    currentStepId++;

    // 2. Post-pulse Recovery Rest (600 seconds)
    const endPulseV = data[data.length - 1].voltage;
    for (let t = 0; t < restDuration; t += 2) {
      time += 2;
      const recovery = 1 - Math.exp(-t / 40);
      const voltage = endPulseV + (ocv - endPulseV) * recovery;
      
      data.push({
        time: time,
        voltage: voltage + (Math.random() - 0.5) * 0.0001,
        current: 0,
        step: currentStepId,
        stepType: 'Rest',
        capacity: capacity
      });
    }
    currentStepId++;
  }

  return data;
};
