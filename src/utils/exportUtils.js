import * as XLSX from 'xlsx';
import { convertCurrentFromAmp } from './analysisData';

const formatDateStamp = () => new Date().toISOString().slice(0, 10);

const sanitizeSheetName = (value, fallback) => {
  const cleaned = String(value || fallback)
    .replace(/[:\\/?*\[\]]/g, ' ')
    .trim();

  return (cleaned || fallback).slice(0, 31);
};

const getGittStatus = (result) => {
  if (result.isExcluded) {
    return 'Excluded (After cutoff)';
  }

  if (result.explanation) {
    return `Review: ${result.explanation}`;
  }

  return 'Active';
};

const toLog10 = (value) => {
  if (!(value > 0)) {
    return null;
  }

  return Math.log10(value);
};

const getPulseCurrent = (currentAmp, currentUnit) => {
  const converted = convertCurrentFromAmp(currentAmp, currentUnit);
  return converted === null ? null : converted;
};

const buildGittPlotRows = (solvedFilesList, currentUnit) =>
  solvedFilesList.flatMap((file) => {
    const results = file.solvedGitt?.results ?? [];

    return results.map((result) => ({
      'File Name': file.fileName,
      Visible: file.visible !== false ? 'Yes' : 'No',
      'Pulse Step ID': result.pulseStepId,
      'Relaxation Step ID': result.relaxationStepId ?? '',
      'SOC (%)': result.soc ?? null,
      'Median Voltage (V)': result.medianVoltage ?? null,
      'D_Li+ (cm2/s)': result.dLi ?? null,
      'log10(D_Li+)': toLog10(result.dLi),
      [`Pulse Current (${currentUnit})`]: getPulseCurrent(result.current, currentUnit),
      'Pulse Duration (s)': result.duration,
      'Pre-pulse OCV E_0 (V)': result.e0 ?? null,
      'End-of-pulse E_1 (V)': result.e1 ?? null,
      'End-of-relaxation E_2 (V)': result.e2 ?? null,
      'Delta E_s (V)': result.dEs ?? null,
      'Delta E_t (V)': result.dEt ?? null,
      'Fickian Slope (V/s^0.5)': result.slope ?? null,
      'Fickian R2': result.r2 ?? null,
      'Included In Chart': !result.isExcluded && result.dLi !== null && result.dLi > 0 ? 'Yes' : 'No',
      Status: getGittStatus(result)
    }));
  });

const buildGittDetailRows = (file, currentUnit) => {
  const results = file.solvedGitt?.results ?? [];

  return results.map((result) => ({
    'Pulse Step ID': result.pulseStepId,
    'Relaxation Step ID': result.relaxationStepId ?? '',
    [`Pulse Current (${currentUnit})`]: getPulseCurrent(result.current, currentUnit),
    'Pulse Duration (s)': result.duration,
    'SOC (%)': result.soc ?? null,
    'Median Voltage (V)': result.medianVoltage ?? null,
    'D_Li+ (cm2/s)': result.dLi ?? null,
    'log10(D_Li+)': toLog10(result.dLi),
    'Pre-pulse OCV E_0 (V)': result.e0 ?? null,
    'End-of-pulse E_1 (V)': result.e1 ?? null,
    'End-of-relaxation E_2 (V)': result.e2 ?? null,
    'Delta E_s (V)': result.dEs ?? null,
    'Delta E_t (V)': result.dEt ?? null,
    'Fickian Slope (V/s^0.5)': result.slope ?? null,
    'Fickian R2': result.r2 ?? null,
    'Fit Window Start (s)': result.fitWindowStart ?? null,
    'Fit Window End (s)': result.fitWindowEnd ?? null,
    Status: getGittStatus(result)
  }));
};

const buildGittSummaryRows = (solvedFilesList) =>
  solvedFilesList.map((file) => {
    const solvedGitt = file.solvedGitt;
    const results = solvedGitt?.results ?? [];
    const plotReadyCount = results.filter((result) => !result.isExcluded && result.dLi !== null && result.dLi > 0).length;

    return {
      'File Name': file.fileName,
      Visible: file.visible !== false ? 'Yes' : 'No',
      'Pulse Pairs': solvedGitt?.totalCount ?? 0,
      'Retained Before Cutoff': solvedGitt?.retainedCount ?? 0,
      'Cutoff Applied': solvedGitt?.cutoffApplied ? 'Yes' : 'No',
      'Plot-ready Points': plotReadyCount,
      'Characteristic Length (cm)': solvedGitt?.characteristicLengthCm ?? null,
      Model: solvedGitt?.model ?? '',
      Method: solvedGitt?.method ?? ''
    };
  });

const appendSheet = (workbook, rows, sheetName) => {
  const sheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Notice: 'No data' }]);
  XLSX.utils.book_append_sheet(workbook, sheet, sanitizeSheetName(sheetName, 'Sheet'));
};

export const exportGittBatchWorkbook = ({ solvedFilesList = [], activeFileId = null, currentUnit = 'mA' }) => {
  const exportableFiles = solvedFilesList.filter((file) => (file.solvedGitt?.results?.length ?? 0) > 0);
  if (exportableFiles.length === 0) {
    return false;
  }

  const workbook = XLSX.utils.book_new();
  const activeFile = exportableFiles.find((file) => file.id === activeFileId) ?? exportableFiles[0];

  appendSheet(workbook, buildGittSummaryRows(exportableFiles), 'Summary');
  appendSheet(workbook, buildGittPlotRows(exportableFiles, currentUnit), 'GITT_Plot_Data');
  appendSheet(workbook, buildGittDetailRows(activeFile, currentUnit), `Active_${activeFile.fileName}`);

  exportableFiles.forEach((file, index) => {
    appendSheet(workbook, buildGittDetailRows(file, currentUnit), `${String(index + 1).padStart(2, '0')}_${file.fileName}`);
  });

  XLSX.writeFile(workbook, `GITT_Batch_Export_${formatDateStamp()}.xlsx`);
  return true;
};
