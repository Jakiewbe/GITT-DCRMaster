import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';

export type XlsxCellValue = string | number | boolean | null | undefined | string[];

export type XlsxSheet = {
  name: string;
  columns: string[];
  rows: Record<string, XlsxCellValue>[];
};

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function columnName(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function normalizedCellValue(value: XlsxCellValue): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.join(' | ');
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Object.is(value, -0) ? 0 : value;
  }
  return value;
}

function cellXml(reference: string, value: XlsxCellValue, style = 0): string {
  const normalized = normalizedCellValue(value);
  // Omit missing cells entirely. Some plotting programs import a styled but
  // valueless <c/> cell as numeric zero, which creates false drops and lines
  // across the pulse separators in the exported wide tables.
  if (normalized === null) return '';
  if (typeof normalized === 'number') {
    return `<c r="${reference}" s="${style}"><v>${String(normalized)}</v></c>`;
  }
  if (typeof normalized === 'boolean') {
    return `<c r="${reference}" s="${style}" t="b"><v>${normalized ? 1 : 0}</v></c>`;
  }
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(normalized)}</t></is></c>`;
}

function safeSheetName(value: string, fallback: string): string {
  const cleaned = value.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31);
  return cleaned || fallback;
}

function worksheetBlob(sheet: XlsxSheet): Blob {
  const headers = sheet.columns;
  const widths = headers.map((header, columnIndex) => {
    const maximum = sheet.rows.reduce((current, row) => {
      const value = normalizedCellValue(row[headers[columnIndex]]);
      return Math.max(current, value === null ? 0 : String(value).length);
    }, header.length);
    return Math.min(42, Math.max(10, maximum + 2));
  });
  const columnXml = widths.map((width, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
  ).join('');
  const lastCell = `${columnName(Math.max(0, headers.length - 1))}${sheet.rows.length + 1}`;
  const parts: BlobPart[] = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCell}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${columnXml}</cols>
  <sheetData>`];
  let pending = '';
  for (let rowIndex = 0; rowIndex <= sheet.rows.length; rowIndex += 1) {
    const cells = headers.map((header, columnIndex) => cellXml(`${columnName(columnIndex)}${rowIndex + 1}`,
      rowIndex === 0 ? header : sheet.rows[rowIndex - 1][header], rowIndex === 0 ? 1 : 0)).join('');
    pending += `<row r="${rowIndex + 1}">${cells}</row>`;
    if (pending.length >= 1 << 20) { parts.push(pending); pending = ''; }
  }
  if (pending.length) parts.push(pending);
  parts.push(`</sheetData>
  <autoFilter ref="A1:${lastCell}"/>
</worksheet>`);
  return new Blob(parts, { type: 'application/xml' });
}

function contentTypesXml(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets}
</Types>`;
}

function workbookXml(sheets: XlsxSheet[]): string {
  const names = new Set<string>();
  const sheetXml = sheets.map((sheet, index) => {
    let name = safeSheetName(sheet.name, `Sheet${index + 1}`);
    while (names.has(name)) name = safeSheetName(`${name.slice(0, 27)} ${index + 1}`, `Sheet${index + 1}`);
    names.add(name);
    return `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetXml}</sheets>
</workbook>`;
}

function workbookRelationshipsXml(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

const ROOT_RELATIONSHIPS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFF1F5F7"/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF202830"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export async function createXlsxWorkbook(sheets: XlsxSheet[]): Promise<Blob> {
  if (sheets.length === 0) throw new RangeError('xlsx_requires_at_least_one_sheet');
  if (sheets.some((sheet) => sheet.columns.length === 0)) {
    throw new RangeError('xlsx_sheet_requires_columns');
  }
  // The packaged WebView2 runtime can reject zip.js' blob worker/CompressionStream
  // path. XLSX does not require DEFLATE, so use stored entries and keep generation
  // on the current thread; this makes desktop export deterministic.
  const writer = new ZipWriter(new BlobWriter(XLSX_MIME), {
    compressionMethod: 0,
    useWebWorkers: false,
    useCompressionStream: false,
  });
  await writer.add('[Content_Types].xml', new TextReader(contentTypesXml(sheets.length)));
  await writer.add('_rels/.rels', new TextReader(ROOT_RELATIONSHIPS));
  await writer.add('xl/workbook.xml', new TextReader(workbookXml(sheets)));
  await writer.add('xl/_rels/workbook.xml.rels', new TextReader(workbookRelationshipsXml(sheets.length)));
  await writer.add('xl/styles.xml', new TextReader(STYLES));
  for (let index = 0; index < sheets.length; index += 1) {
    await writer.add(`xl/worksheets/sheet${index + 1}.xml`, new BlobReader(worksheetBlob(sheets[index])));
  }
  return writer.close();
}
