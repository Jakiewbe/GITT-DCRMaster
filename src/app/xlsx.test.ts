import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js';
import { describe, expect, it } from 'vitest';
import { createXlsxWorkbook } from './xlsx';

describe('safe XLSX export', () => {
  it('writes a minimal OpenXML workbook with inline strings and numeric cells', async () => {
    const blob = await createXlsxWorkbook([
      {
        name: 'Results',
        columns: ['metric', 'value', 'qcCodes'],
        rows: [{ metric: '=DCR_first_sample', value: 56.42250934378531, qcCodes: ['review', 'latency_unknown'] }],
      },
      {
        name: 'Manifest',
        columns: ['key', 'value'],
        rows: [{ key: 'algorithmId', value: 'DCR_TWO_CURRENT_TERMINAL_V1' }],
      },
      {
        name: 'Gaps',
        columns: ['x', 'y'],
        rows: [{ x: null, y: 1 }, { x: 2, y: null }],
      },
    ]);
    const reader = new ZipReader(new BlobReader(blob));
    const entries = await reader.getEntries();
    expect(entries.map((entry) => entry.filename)).toEqual(expect.arrayContaining([
      '[Content_Types].xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]));
    const sheet = entries.find((entry) => entry.filename === 'xl/worksheets/sheet1.xml');
    expect(sheet).toBeDefined();
    if (!sheet || sheet.directory || !('getData' in sheet)) {
      throw new Error('sheet1.xml was not a readable ZIP entry');
    }
    const xml = await sheet.getData(new TextWriter());
    expect(xml).toContain('=DCR_first_sample');
    expect(xml).toContain('<v>56.42250934378531</v>');
    expect(xml).toContain('<dimension ref="A1:C2"/>');
    expect(xml).not.toContain('<f>');
    await reader.close();
  });

  it('leaves separator and padding cells truly empty for plotting programs', async () => {
    const blob = await createXlsxWorkbook([{
      name: 'Gaps',
      columns: ['x', 'y'],
      rows: [{ x: null, y: 1 }, { x: 2, y: null }],
    }]);
    const reader = new ZipReader(new BlobReader(blob));
    const entries = await reader.getEntries();
    const sheet = entries.find((entry) => entry.filename === 'xl/worksheets/sheet1.xml');
    expect(sheet).toBeDefined();
    if (!sheet || sheet.directory || !('getData' in sheet)) {
      throw new Error('gap sheet was not readable');
    }
    const xml = await sheet.getData(new TextWriter());
    expect(xml).not.toContain('r="A2"');
    expect(xml).not.toContain('r="B3"');
    expect(xml).toContain('r="B2"');
    expect(xml).toContain('r="A3"');
    await reader.close();
  });
});
