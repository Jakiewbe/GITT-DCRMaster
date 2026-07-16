import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const PATTERNS = {
  time: [
    /time/,
    /testtime/,
    /totaltime/,
    /elapsedtime/,
    /runtime/,
    /累计时间/,
    /总时间/,
    /工步时间/,
    /^t$/,
    /^ts$/,
    /hms/
  ],
  voltage: [
    /voltage/,
    /volt/,
    /电压/,
    /工作电压/,
    /^u$/,
    /^e$/,
    /^v$/,
    /cellv/
  ],
  current: [
    /current/,
    /curr/,
    /电流/,
    /工作电流/,
    /^i$/,
    /currentma/,
    /currenta/,
    /amps?/
  ],
  step: [
    /工步序号/,
    /工步号/,
    /stepindex/,
    /stepno/,
    /stepid/,
    /step/,
    /工步/,
    /步骤/,
    /序号/
  ],
  stepType: [
    /type/,
    /state/,
    /status/,
    /mode/,
    /stepname/,
    /工步类型/,
    /工步状态/,
    /状态/
  ],
  capacity: [
    /capacity/,
    /mah/,
    /mahg/,
    /wh/,
    /whg/,
    /容量/,
    /放电容量/,
    /比容量/
  ]
};

const cleanHeaderLabel = (value) =>
  String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeHeader = (value) =>
  cleanHeaderLabel(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s()[\]{}:/\\._-]+/g, '');

const scoreDecodedText = (text) => {
  const replacementChars = (text.match(/\uFFFD/g) || []).length;
  const suspiciousChars = (text.match(/[ÃÂÅÄÐØ�]/g) || []).length;
  const chineseChars = (text.match(/[\u4E00-\u9FFF]/g) || []).length;
  const knownKeywords = (text.match(/时间|电压|电流|工步|容量|current|voltage|step|capacity/gi) || []).length;

  return knownKeywords * 16 + chineseChars * 2 - replacementChars * 40 - suspiciousChars * 6;
};

const decodeTextBuffer = (arrayBuffer) => {
  const candidates = ['utf-8', 'gb18030', 'gbk'];
  let bestResult = null;

  candidates.forEach((encoding) => {
    try {
      const decoder = new TextDecoder(encoding, { fatal: encoding === 'utf-8' });
      const text = decoder.decode(arrayBuffer).replace(/^\uFEFF/, '');
      const score = scoreDecodedText(text);

      if (!bestResult || score > bestResult.score) {
        bestResult = { encoding, text, score };
      }
    } catch {
      // Ignore unsupported/invalid decoders and continue evaluating the remaining candidates.
    }
  });

  if (bestResult) {
    return bestResult;
  }

  const fallbackText = new TextDecoder('utf-8').decode(arrayBuffer).replace(/^\uFEFF/, '');
  return {
    encoding: 'utf-8',
    text: fallbackText,
    score: scoreDecodedText(fallbackText)
  };
};

const sanitizeRows = (rows) =>
  rows.map((row) =>
    Object.entries(row).reduce((acc, [key, value]) => {
      const cleanedKey = cleanHeaderLabel(key);
      if (!cleanedKey) {
        return acc;
      }

      acc[cleanedKey] = value;
      return acc;
    }, {})
  );

const collectHeaders = (rows) => {
  const seen = new Set();
  const headers = [];

  rows.slice(0, 20).forEach((row) => {
    Object.keys(row).forEach((header) => {
      const cleanedHeader = cleanHeaderLabel(header);
      if (!cleanedHeader || seen.has(cleanedHeader)) {
        return;
      }

      seen.add(cleanedHeader);
      headers.push(cleanedHeader);
    });
  });

  return headers;
};

const guessDelimiterLabel = (delimiter) => {
  if (delimiter === '\t') return 'tab';
  if (delimiter === ';') return 'semicolon';
  if (delimiter === '|') return 'pipe';
  return 'comma';
};

/**
 * Clean cell values and convert to standard numbers if applicable.
 */
const cleanValue = (val) => {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') return val;

  const str = String(val).trim();
  if (str === '') return null;

  const num = Number(str.replace(/,/g, ''));
  return Number.isNaN(num) ? str : num;
};

export const inferCurrentUnit = (header) => {
  const normalizedHeader = normalizeHeader(header);

  if (!normalizedHeader || normalizedHeader.includes('mah') || normalizedHeader.includes('mwh')) {
    return null;
  }

  const rawLower = String(header || '').toLowerCase();

  // 1. Direct Parentheses/Slash check for mA
  if (
    rawLower.includes('(ma)') ||
    rawLower.includes('[ma]') ||
    rawLower.includes('/ma') ||
    rawLower.includes('毫安')
  ) {
    return 'mA';
  }

  // 2. Direct Parentheses/Slash check for uA (microamperes)
  if (
    rawLower.includes('(ua)') ||
    rawLower.includes('[ua]') ||
    rawLower.includes('/ua') ||
    rawLower.includes('(μa)') ||
    rawLower.includes('[μa]') ||
    rawLower.includes('/μa') ||
    rawLower.includes('微安')
  ) {
    return 'uA';
  }

  // 3. Direct Parentheses/Slash check for A
  if (
    rawLower.includes('(a)') ||
    rawLower.includes('[a]') ||
    rawLower.includes('/a') ||
    rawLower.includes('安培')
  ) {
    return 'A';
  }

  // Fallback to normalized matching
  if (
    normalizedHeader.includes('currentma') ||
    normalizedHeader.includes('currma') ||
    normalizedHeader.includes('电流ma')
  ) {
    return 'mA';
  }

  if (
    normalizedHeader.includes('currentua') ||
    normalizedHeader.includes('currua') ||
    normalizedHeader.includes('电流ua') ||
    normalizedHeader.includes('电流μa')
  ) {
    return 'uA';
  }

  if (
    normalizedHeader.includes('currenta') ||
    normalizedHeader.includes('curra') ||
    normalizedHeader.includes('电流a') ||
    normalizedHeader.endsWith('a')
  ) {
    return 'A';
  }

  return null;
};

/**
 * Automatically maps raw headers to standard fields.
 */
export const autoMapHeaders = (headers) => {
  const mapping = {
    time: '',
    voltage: '',
    current: '',
    step: '',
    stepType: '',
    capacity: ''
  };

  for (const key of Object.keys(mapping)) {
    let bestHeader = '';
    let bestScore = -1;

    headers.forEach((header) => {
      const cleanedHeader = cleanHeaderLabel(header);
      const normalizedHeader = normalizeHeader(cleanedHeader);
      const regexes = PATTERNS[key];

      let matchIdx = -1;
      for (let i = 0; i < regexes.length; i++) {
        if (regexes[i].test(normalizedHeader) || regexes[i].test(cleanedHeader)) {
          matchIdx = i;
          break;
        }
      }

      if (matchIdx !== -1) {
        let score = 100 - matchIdx;

        if (key === 'step') {
          const isRowIndex = /数据|记录|行|row|index|data/i.test(cleanedHeader) || /数据|记录|行|row|index|data/i.test(normalizedHeader);
          const hasStepIndicator = /工步|step/i.test(cleanedHeader) || /工步|step/i.test(normalizedHeader);
          if (isRowIndex && !hasStepIndicator) {
            score -= 200; // heavily penalize plain row/data indexes
          }
        }

        if (key === 'capacity') {
          const isSpecificCapacity = /比|g|weight/i.test(cleanedHeader) || /比|g|weight/i.test(normalizedHeader);
          if (isSpecificCapacity) {
            score -= 50; // penalize specific capacity columns
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestHeader = cleanedHeader;
        }
      }
    });

    if (bestScore > 0) {
      mapping[key] = bestHeader;
    }
  }

  return mapping;
};

/**
 * Classifies a current value into a state: 'rest', 'charge', or 'discharge'.
 * Uses a threshold relative to the peak current in the dataset.
 */
const classifyCurrentState = (currentValue, restThreshold) => {
  if (Math.abs(currentValue) <= restThreshold) return 'rest';
  return currentValue > 0 ? 'charge' : 'discharge';
};

/**
 * Automatically creates step index if not present in the data,
 * based on transitions between charge/discharge/rest states.
 * Uses a noise-tolerant approach: only splits when the fundamental
 * electrochemical state changes (rest↔charge, rest↔discharge, charge↔discharge).
 */
export const generateStepIds = (rows, currentKey) => {
  if (rows.length === 0) return rows;

  let peakCurrent = 0;
  for (let i = 0; i < rows.length; i++) {
    const val = Math.abs(cleanValue(rows[i][currentKey]) || 0);
    if (val > peakCurrent) peakCurrent = val;
  }

  const restThreshold = peakCurrent * 0.02;

  let stepId = 1;
  let prevState = classifyCurrentState(cleanValue(rows[0][currentKey]) || 0, restThreshold);

  return rows.map((row, idx) => {
    const currentValue = cleanValue(row[currentKey]) || 0;
    const state = classifyCurrentState(currentValue, restThreshold);

    if (idx > 0 && state !== prevState) {
      stepId += 1;
      prevState = state;
    }

    return { ...row, _auto_step_: stepId };
  });
};

/**
 * Standardizes parsed row arrays into unified objects.
 */
export const standardizeData = (rows, mapping, timeUnitMode = 'auto') => {
  return standardizeDataWithMeta(rows, mapping, timeUnitMode).rows;
};

export const standardizeDataWithMeta = (rows, mapping, timeUnitMode = 'auto') => {
  const timeKey = mapping.time;
  const voltageKey = mapping.voltage;
  const currentKey = mapping.current;

  let stepKey = mapping.step;
  const stepTypeKey = mapping.stepType;
  const capacityKey = mapping.capacity;

  let processedRows = rows;
  if (!stepKey) {
    processedRows = generateStepIds(rows, currentKey);
    stepKey = '_auto_step_';
  }

  const standardizedRows = processedRows
    .map((row, idx) => {
      const timeVal = cleanValue(row[timeKey]);
      const voltageVal = cleanValue(row[voltageKey]);
      const currentVal = cleanValue(row[currentKey]);
      const stepVal = cleanValue(row[stepKey]);
      const stepTypeVal = stepTypeKey ? String(row[stepTypeKey] || '').trim() : '';
      const capacityVal = capacityKey ? cleanValue(row[capacityKey]) : null;

      if (typeof timeVal !== 'number' || typeof voltageVal !== 'number' || typeof currentVal !== 'number') {
        return null;
      }

      let inferredType = stepTypeVal;
      if (!inferredType) {
        if (Math.abs(currentVal) < 1e-4) {
          inferredType = 'Rest';
        } else if (currentVal < 0) {
          inferredType = 'CC_DChg';
        } else {
          inferredType = 'CC_Chg';
        }
      } else {
        const lowerType = inferredType.toLowerCase();
        if (lowerType.includes('rest') || lowerType.includes('静置') || lowerType.includes('搁置') || lowerType.includes('休息')) {
          inferredType = 'Rest';
        } else if (lowerType.includes('discharge') || lowerType.includes('dchg') || lowerType.includes('放电')) {
          inferredType = 'CC_DChg';
        } else if (lowerType.includes('charge') || lowerType.includes('chg') || lowerType.includes('充电')) {
          inferredType = 'CC_Chg';
        }
      }

      return {
        index: idx,
        time: timeVal,
        voltage: voltageVal,
        current: currentVal,
        step: stepVal,
        stepType: inferredType,
        capacity: capacityVal,
        raw: row
      };
    })
    .filter(Boolean);

  if (standardizedRows.length === 0) {
    return [];
  }

  // Smart time-unit auto-detection: seconds vs minutes vs hours
  const currentUnit = inferCurrentUnit(currentKey) || 'mA';
  const currentFactor = currentUnit === 'A' ? 1000 : (currentUnit === 'uA' ? 0.001 : 1); // factor to convert raw current to mA
  
  let totalDeltaCap = 0;
  let expectedDeltaCapSec = 0;
  
  for (let i = 1; i < standardizedRows.length; i++) {
    const prev = standardizedRows[i - 1];
    const curr = standardizedRows[i];
    
    // Only check active segments in the same step with valid capacity fields
    if (curr.stepType !== 'Rest' && curr.step === prev.step && curr.capacity !== null && prev.capacity !== null) {
      const dCap = Math.abs(curr.capacity - prev.capacity);
      const dt = curr.time - prev.time;
      if (dt > 0) {
        const avgCurrentmA = (Math.abs(curr.current) + Math.abs(prev.current)) / 2 * currentFactor;
        const dCapExpectedSec = (avgCurrentmA * dt) / 3600;
        totalDeltaCap += dCap;
        expectedDeltaCapSec += dCapExpectedSec;
      }
    }
  }

  const timeMeta = resolveTimeMeta(expectedDeltaCapSec, totalDeltaCap, timeUnitMode);

  if (timeMeta.scaleFactor !== 1) {
    standardizedRows.forEach(row => {
      row.time = row.time * timeMeta.scaleFactor;
    });
  }

  return {
    rows: standardizedRows,
    timeMeta
  };
};

const resolveTimeMeta = (expectedDeltaCapSec, totalDeltaCap, timeUnitMode = 'auto') => {
  if (timeUnitMode === 'seconds') {
    console.log('[Time Detector] Time unit manual override: seconds. No scaling (multiplier = 1).');
    return { sourceUnit: 'seconds', scaleFactor: 1, normalizedUnit: 'seconds' };
  }

  if (timeUnitMode === 'minutes') {
    console.log('[Time Detector] Time unit manual override: minutes. Scaling to seconds (multiplier = 60).');
    return { sourceUnit: 'minutes', scaleFactor: 60, normalizedUnit: 'seconds' };
  }

  if (timeUnitMode === 'hours') {
    console.log('[Time Detector] Time unit manual override: hours. Scaling to seconds (multiplier = 3600).');
    return { sourceUnit: 'hours', scaleFactor: 3600, normalizedUnit: 'seconds' };
  }

  if (expectedDeltaCapSec > 0) {
    const ratio = totalDeltaCap / expectedDeltaCapSec;
    if (Math.abs(ratio - 60) < 15) {
      console.log(`[Time Detector] Detected time unit: minutes. Scaling to seconds (multiplier = 60). Ratio = ${ratio.toFixed(3)}`);
      return { sourceUnit: 'minutes', scaleFactor: 60, normalizedUnit: 'seconds', ratio };
    }

    if (Math.abs(ratio - 3600) < 900) {
      console.log(`[Time Detector] Detected time unit: hours. Scaling to seconds (multiplier = 3600). Ratio = ${ratio.toFixed(3)}`);
      return { sourceUnit: 'hours', scaleFactor: 3600, normalizedUnit: 'seconds', ratio };
    }

    console.log(`[Time Detector] Detected time unit: seconds. No scaling required (multiplier = 1). Ratio = ${ratio.toFixed(3)}`);
    return { sourceUnit: 'seconds', scaleFactor: 1, normalizedUnit: 'seconds', ratio };
  }

  console.log('[Time Detector] Could not determine time unit, defaulting to seconds (no scaling).');
  return { sourceUnit: 'seconds', scaleFactor: 1, normalizedUnit: 'seconds', ratio: null };
};

const buildResolvedPayload = (rows, sourceType, meta = {}) => {
  const sanitizedRows = sanitizeRows(rows);
  if (sanitizedRows.length === 0) {
    throw new Error(sourceType === 'excel' ? 'Excel 文件为空。' : '文本文件为空。');
  }

  const headers = collectHeaders(sanitizedRows);
  return {
    headers,
    rows: sanitizedRows,
    type: sourceType,
    meta
  };
};

/**
 * Main parser entry point.
 */
export const parseBatteryFile = (file) =>
  new Promise((resolve, reject) => {
    const extension = file.name.split('.').pop().toLowerCase();

    if (extension === 'xlsx' || extension === 'xls') {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

          resolve(
            buildResolvedPayload(json, 'excel', {
              sheetName: firstSheetName,
              encoding: 'excel-internal',
              delimiter: null
            })
          );
        } catch (error) {
          reject(new Error(`Excel 解析失败: ${error.message}`));
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败。'));
      reader.readAsArrayBuffer(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target.result;
        const decoded = decodeTextBuffer(arrayBuffer);

        Papa.parse(decoded.text, {
          header: true,
          skipEmptyLines: 'greedy',
          delimiter: '',
          delimitersToGuess: [',', '\t', ';', '|'],
          dynamicTyping: false,
          transformHeader: cleanHeaderLabel,
          complete: (results) => {
            if (results.errors.length > 0 && results.data.length === 0) {
              reject(new Error(`CSV/TXT 解析失败: ${results.errors[0].message}`));
              return;
            }

            try {
              resolve(
                buildResolvedPayload(results.data, 'csv', {
                  encoding: decoded.encoding,
                  delimiter: guessDelimiterLabel(results.meta.delimiter),
                  suspiciousDecoding: decoded.score < 0
                })
              );
            } catch (error) {
              reject(error);
            }
          },
          error: (error) => reject(new Error(`PapaParse 错误: ${error.message}`))
        });
      } catch (error) {
        reject(new Error(`文件解码失败: ${error.message}`));
      }
    };

    reader.onerror = () => reject(new Error('文件读取失败。'));
    reader.readAsArrayBuffer(file);
  });
