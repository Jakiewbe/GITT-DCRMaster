import { describe, expect, it } from 'vitest';
import { buildReportSheets } from './reportExport';

describe('report export sheet plan', () => {
  it('keeps DCR export separate and exposes the two direct plotting datasets', () => {
    const sheets = buildReportSheets({
      scope: 'dcr',
      dcrResults: [{ fileName: 'dcr.ndax', 'DCR / Ω': 0.12 }],
      dcrTimeVoltage: [{ 'dcr.ndax | Time / min': 0, 'dcr.ndax | Voltage / V': 3 }],
      dcrTimeDcr: [{ 'dcr.ndax | Time / min': 50, 'dcr.ndax | DCR / Ω': 0.12 }],
      gittSummary: [{ fileName: 'gitt.ndax', pulseOrder: 1 }],
      gittTimeVoltage: [{ fileName: 'gitt.ndax', 'Time / min': 0, 'Voltage / V': 3 }],
      gittPulseResponse: [{ fileName: 'gitt.ndax', 'Time / min': 0, 'Voltage / V': 3 }],
      gittTauVoltage: [{ fileName: 'gitt.ndax', 'τ¹ᐟ² / s¹ᐟ²': Math.sqrt(10), 'Voltage / V': 2.9 }],
      gittMedianDli: [{ fileName: 'gitt.ndax', 'Median voltage / V': 2.8, 'D_Li / cm²·s^-1': 1e-10 }],
      gittMedianDliCommon: [{ fileName: 'gitt.ndax', 'Median voltage / V': 2.8, 'D_Li / cm²·s^-1': 1e-10 }],
      cfxProfile: [],
      manifest: [{ key: 'scope', value: 'dcr' }],
    });

    expect(sheets.map((sheet) => sheet.name)).toEqual([
      'DCR Results',
      'DCR 时间-电压',
      'DCR 时间-DCR',
      'Manifest',
    ]);
    expect(sheets.find((sheet) => sheet.name === 'DCR 时间-电压')?.rows[0]).toMatchObject({
      'dcr.ndax | Time / min': 0,
      'dcr.ndax | Voltage / V': 3,
    });
    expect(sheets.find((sheet) => sheet.name === 'DCR 时间-DCR')?.rows[0]).toMatchObject({
      'dcr.ndax | Time / min': 50,
      'dcr.ndax | DCR / Ω': 0.12,
    });
    expect(sheets.map((sheet) => sheet.name)).not.toContain('GITT 时间-电压');
  });

  it('creates the requested GITT plotting sheets plus full and common DLi datasets', () => {
    const sheets = buildReportSheets({
      scope: 'gitt',
      projectOverview: [],
      dcrResults: [],
      dcrTimeVoltage: [],
      dcrTimeDcr: [],
      gittSummary: [{ fileName: 'gitt.ndax', pulseOrder: 1 }],
      gittTimeVoltage: [{ fileName: 'gitt.ndax', 'Time / min': 0, 'Voltage / V': 3 }],
      gittPulseResponse: [{ fileName: 'gitt.ndax', 'Time / min': 0, 'Voltage / V': 3 }],
      gittTauVoltage: [{ fileName: 'gitt.ndax', 'τ¹ᐟ² / s¹ᐟ²': Math.sqrt(10), 'Voltage / V': 2.9 }],
      gittMedianDli: [{ fileName: 'gitt.ndax', 'Median voltage / V': 2.8, 'D_Li / cm²·s^-1': 1e-10 }],
      gittMedianDliCommon: [{ fileName: 'gitt.ndax', 'Median voltage / V': 2.8, 'D_Li / cm²·s^-1': 1e-10 }],
      cfxProfile: [],
      manifest: [{ key: 'scope', value: 'project' }],
    });

    expect(sheets.map((sheet) => sheet.name)).toEqual([
      'GITT 时间-电压',
      'GITT 静置-脉冲-静置',
      'GITT τ-电压',
      'Full_Eligible_Data',
      'Common_Voltage_Range',
    ]);
    expect(sheets.find((sheet) => sheet.name === 'GITT 静置-脉冲-静置')?.rows[0]).toMatchObject({ 'Time / min': 0, 'Voltage / V': 3 });
    expect(sheets.find((sheet) => sheet.name === 'GITT τ-电压')?.rows[0]).toMatchObject({ 'τ¹ᐟ² / s¹ᐟ²': Math.sqrt(10), 'Voltage / V': 2.9 });
    expect(sheets.find((sheet) => sheet.name === 'Full_Eligible_Data')?.rows[0]).toMatchObject({ 'Median voltage / V': 2.8, 'D_Li / cm²·s^-1': 1e-10 });
    expect(sheets.find((sheet) => sheet.name === 'Common_Voltage_Range')?.rows[0]).toMatchObject({ 'Median voltage / V': 2.8, 'D_Li / cm²·s^-1': 1e-10 });
  });

  it('uses generic adjacent XY fallback columns for empty GITT sheets', () => {
    const sheets = buildReportSheets({
      scope: 'gitt',
      dcrResults: [],
      dcrTimeVoltage: [],
      dcrTimeDcr: [],
      gittTimeVoltage: [],
      gittPulseResponse: [],
      gittTauVoltage: [],
      gittMedianDli: [],
      gittMedianDliCommon: [],
      manifest: [],
    });

    expect(sheets.map((sheet) => sheet.columns)).toEqual([
      ['Time / min', 'Voltage / V'],
      ['Time / min', 'Voltage / V'],
      ['τ¹ᐟ² / s¹ᐟ²', 'Voltage / V'],
      ['Median voltage / V', 'D_Li / cm²·s^-1'],
      ['Median voltage / V', 'D_Li / cm²·s^-1'],
    ]);
  });
});
