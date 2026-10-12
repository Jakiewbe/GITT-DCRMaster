import { BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter } from '@zip.js/zip.js';
import type { WorkbenchSettings } from './analyze';
import type { WorkbenchRecipeV1 } from './recipe';
import { createWorkbenchProject, parseWorkbenchProject, validateWorkbenchProject, type WorkbenchDatasetV1, type WorkbenchProjectV1 } from './project';

export const PROJECT_ARCHIVE_SCHEMA = 'pulselab-project-archive-v1';
export const PROJECT_ROW_PAGE_SIZE = 10_000;

function json(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item);
}

/** Each JSON string is bounded to one row page, never the entire project. */
export async function createProjectArchive(
  settings: WorkbenchSettings, datasets: WorkbenchDatasetV1[], recipe: WorkbenchRecipeV1,
): Promise<Blob> {
  const project = createWorkbenchProject(settings, datasets, recipe);
  const writer = new ZipWriter(new BlobWriter('application/zip'), {
    useWebWorkers: false, compressionMethod: 0, useCompressionStream: false,
  });
  try {
    const descriptors = [];
    for (let index = 0; index < datasets.length; index += 1) {
      const { canonical, ...descriptor } = datasets[index];
      const { rows, ...metadata } = canonical;
      const pages = Math.ceil(rows.length / PROJECT_ROW_PAGE_SIZE);
      descriptors.push({ ...descriptor, canonical: metadata, rowCount: rows.length, pages });
      for (let page = 0; page < pages; page += 1) {
        await writer.add(`datasets/${index}/rows-${page}.json`, new TextReader(json(
          rows.slice(page * PROJECT_ROW_PAGE_SIZE, (page + 1) * PROJECT_ROW_PAGE_SIZE),
        )));
      }
    }
    await writer.add('manifest.json', new TextReader(json({
      archiveSchema: PROJECT_ARCHIVE_SCHEMA,
      pageSize: PROJECT_ROW_PAGE_SIZE,
      project: { ...project, datasets: descriptors },
    })));
    return await writer.close();
  } catch (error) {
    await writer.close().catch(() => undefined);
    throw error;
  }
}

export async function openProjectFile(file: Blob): Promise<WorkbenchProjectV1> {
  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) return parseWorkbenchProject(await file.text());
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false });
  try {
    const entries = await reader.getEntries();
    const byName = new Map(entries.map((entry) => [entry.filename, entry]));
    if (byName.size !== entries.length) throw new Error('project_archive_duplicate_entry');
    const readJson = async (name: string): Promise<unknown> => {
      const entry = byName.get(name);
      if (!entry || entry.directory || entry.uncompressedSize > 64 * 1024 * 1024) {
        throw new Error(`project_archive_entry_invalid:${name}`);
      }
      return JSON.parse(await entry.getData(new TextWriter(), { checkSignature: true }));
    };
    const manifest = await readJson('manifest.json') as {
      archiveSchema?: string; pageSize?: number;
      project?: { datasets?: Array<{ rowCount: number; pages: number; canonical: Record<string, unknown> }> };
    };
    if (manifest.archiveSchema !== PROJECT_ARCHIVE_SCHEMA || manifest.pageSize !== PROJECT_ROW_PAGE_SIZE ||
      !manifest.project || !Array.isArray(manifest.project.datasets)) throw new Error('project_archive_manifest_invalid');
    const datasets = [];
    for (const [index, descriptor] of manifest.project.datasets.entries()) {
      if (!Number.isSafeInteger(descriptor.rowCount) || descriptor.rowCount < 0 ||
        descriptor.pages !== Math.ceil(descriptor.rowCount / PROJECT_ROW_PAGE_SIZE)) throw new Error('project_archive_page_count_invalid');
      const rows: unknown[] = [];
      for (let page = 0; page < descriptor.pages; page += 1) {
        const values = await readJson(`datasets/${index}/rows-${page}.json`);
        if (!Array.isArray(values) || values.length !== Math.min(PROJECT_ROW_PAGE_SIZE, descriptor.rowCount - page * PROJECT_ROW_PAGE_SIZE)) {
          throw new Error('project_archive_row_count_invalid');
        }
        for (const value of values) rows.push(value);
      }
      datasets.push({ ...descriptor, canonical: { ...descriptor.canonical, rows } });
    }
    // Reuse strict field validation and canonical hash checks, not a new science parser.
    return validateWorkbenchProject({ ...manifest.project, datasets });
  } finally {
    await reader.close();
  }
}
