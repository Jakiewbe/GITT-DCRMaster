type ExportAnchor = {
  href: string;
  download: string;
  click: () => void;
};

type ExportDocument = {
  createElement: (tagName: 'a') => ExportAnchor;
  body: {
    appendChild: (element: ExportAnchor) => void;
    removeChild: (element: ExportAnchor) => void;
  };
};

type ExportUrl = {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
};

type ExportInvoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;

export type FileExportDependencies = {
  runtime?: 'browser' | 'tauri';
  invoke?: ExportInvoke;
  chunkSize?: number;
  document?: ExportDocument;
  url?: ExportUrl;
  schedule?: (callback: () => void, delayMs: number) => void;
};

export type FileExportResult =
  | { mode: 'tauri'; chunks: number }
  | { mode: 'browser' };

function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && isTauri();
}

function defaultInvoke(command: string, args: Record<string, unknown>): Promise<unknown> {
  return tauriInvoke(command, args);
}

export async function saveExportBlob(
  fileName: string,
  blob: Blob,
  dependencies: FileExportDependencies = {},
): Promise<FileExportResult> {
  const runtime = dependencies.runtime ?? (isDesktopRuntime() ? 'tauri' : 'browser');
  if (runtime === 'tauri') {
    const invoke = dependencies.invoke ?? defaultInvoke;
    const chunkSize = dependencies.chunkSize ?? 32 * 1024;
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      throw new RangeError('invalid_export_chunk_size');
    }
    const chunks = Math.max(1, Math.ceil(blob.size / chunkSize));
    for (let index = 0; index < chunks; index += 1) {
      const start = index * chunkSize;
      const end = Math.min(blob.size, start + chunkSize);
      const bytes = new Uint8Array(await blob.slice(start, end).arrayBuffer());
      await invoke('write_export_chunk', {
        fileName,
        bytes: Array.from(bytes),
        append: index > 0,
      });
    }
    return { mode: 'tauri', chunks };
  }

  const document = dependencies.document ?? (window.document as unknown as ExportDocument);
  const url = dependencies.url ?? URL;
  const schedule = dependencies.schedule ?? ((callback, delayMs) => window.setTimeout(callback, delayMs));
  const objectUrl = url.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    document.body.removeChild(anchor);
    schedule(() => url.revokeObjectURL(objectUrl), 0);
  }
  return { mode: 'browser' };
}
import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';
