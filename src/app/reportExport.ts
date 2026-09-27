import type { XlsxCellValue, XlsxSheet } from './xlsx';

export type ReportExportScopeV1 = 'dcr' | 'gitt' | 'project';
export type ReportRowV1 = Record<string, XlsxCellValue>;

export type ReportSheetInputV1 = {
  scope: ReportExportScopeV1;
  projectOverview?: ReportRowV1[];
  dcrResults: ReportRowV1[];
  dcrTimeVoltage: ReportRowV1[];
  dcrTimeDcr: ReportRowV1[];
  /** Retained as an in-memory compatibility field; it is not exported as a sheet. */
  gittSummary?: ReportRowV1[];
  gittTimeVoltage: ReportRowV1[];
  gittPulseResponse: ReportRowV1[];
  gittTauVoltage: ReportRowV1[];
  gittMedianDli: ReportRowV1[];
  gittMedianDliCommon: ReportRowV1[];
  /** Retained as an in-memory compatibility field; it is not exported as a sheet. */
  cfxProfile?: ReportRowV1[];
  manifest: ReportRowV1[];
};

const FALLBACK_COLUMNS: Record<string, string[]> = {
  'Project overview': ['fileName'],
  'DCR Results': ['fileName'],
  'DCR 时间-电压': ['Time / min', 'Voltage / V'],
  'DCR 时间-DCR': ['Time / min', 'DCR / Ω'],
  'GITT 时间-电压': ['Time / min', 'Voltage / V'],
  'GITT 静置-脉冲-静置': ['Time / min', 'Voltage / V'],
  'GITT τ-电压': ['τ¹ᐟ² / s¹ᐟ²', 'Voltage / V'],
  Full_Eligible_Data: ['Median voltage / V', 'D_Li / cm²·s^-1'],
  Common_Voltage_Range: ['Median voltage / V', 'D_Li / cm²·s^-1'],
  Manifest: ['key', 'value'],
};

function sheet(name: string, rows: ReportRowV1[]): XlsxSheet {
  const columns = rows.reduce<string[]>((ordered, row) => {
    for (const key of Object.keys(row)) {
      if (!ordered.includes(key)) ordered.push(key);
    }
    return ordered;
  }, []);
  return {
    name,
    columns: rows.length > 0 ? columns : FALLBACK_COLUMNS[name],
    rows,
  };
}

export function buildReportSheets(input: ReportSheetInputV1): XlsxSheet[] {
  const sheets: XlsxSheet[] = [];
  if (input.scope === 'project') {
    sheets.push(sheet('Project overview', input.projectOverview ?? []));
  }
  if (input.scope === 'dcr' || input.scope === 'project') {
    sheets.push(sheet('DCR Results', input.dcrResults));
    sheets.push(sheet('DCR 时间-电压', input.dcrTimeVoltage));
    sheets.push(sheet('DCR 时间-DCR', input.dcrTimeDcr));
  }
  if (input.scope === 'gitt' || input.scope === 'project') {
    sheets.push(sheet('GITT 时间-电压', input.gittTimeVoltage));
    sheets.push(sheet('GITT 静置-脉冲-静置', input.gittPulseResponse));
    sheets.push(sheet('GITT τ-电压', input.gittTauVoltage));
    sheets.push(sheet('Full_Eligible_Data', input.gittMedianDli));
    sheets.push(sheet('Common_Voltage_Range', input.gittMedianDliCommon));
  }
  if (input.scope !== 'gitt') sheets.push(sheet('Manifest', input.manifest));
  return sheets;
}
