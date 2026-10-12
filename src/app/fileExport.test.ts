import { describe, expect, it, vi } from 'vitest';
import { saveExportBlob } from './fileExport';

describe('file export runtime bridge', () => {
  it('writes a large Tauri export in bounded chunks instead of one IPC payload', async () => {
    const invoke = vi.fn().mockResolvedValue('C:/Users/test/Downloads/result.xlsx');
    const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'application/octet-stream' });
    // Reading the entire Blob would recreate the large-export memory peak.
    const wholeBlobRead = vi.spyOn(blob, 'arrayBuffer').mockRejectedValue(new Error('whole_blob_read_forbidden'));

    const result = await saveExportBlob('result.xlsx', blob, {
      runtime: 'tauri',
      invoke,
      chunkSize: 2,
    });

    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke).toHaveBeenNthCalledWith(1, 'write_export_chunk', {
      fileName: 'result.xlsx',
      bytes: [1, 2],
      append: false,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, 'write_export_chunk', {
      fileName: 'result.xlsx',
      bytes: [5],
      append: true,
    });
    expect(result).toEqual({ mode: 'tauri', chunks: 3 });
    expect(wholeBlobRead).not.toHaveBeenCalled();
  });

  it('keeps the browser download path when the desktop bridge is absent', async () => {
    const click = vi.fn();
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const createObjectURL = vi.fn().mockReturnValue('blob:test');
    const revokeObjectURL = vi.fn();
    const anchor = { href: '', download: '', click };
    const blob = new Blob(['csv'], { type: 'text/csv' });

    const result = await saveExportBlob('result.csv', blob, {
      invoke: undefined,
      document: {
        createElement: vi.fn().mockReturnValue(anchor),
        body: { appendChild, removeChild },
      },
      url: { createObjectURL, revokeObjectURL },
      schedule: (callback) => callback(),
    });

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.download).toBe('result.csv');
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledOnce();
    expect(removeChild).toHaveBeenCalledWith(anchor);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(result).toEqual({ mode: 'browser' });
  });
});
