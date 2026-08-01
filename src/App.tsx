import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Database,
  Download,
  FileArchive,
  FilePlus2,
  FlaskConical,
  FolderOpen,
  Gauge,
  Hash,
  Info,
  LoaderCircle,
  Microscope,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type { CfxLiterature1200sAnalysisV1, WorkbenchSettings } from './app/analyze';
import { useBatchAnalysis, type BatchAnalysisEntryV1 } from './app/useBatchAnalysis';
import {
  buildDatasetRecipePlan,
  createDefaultWorkbenchRecipe,
  type WorkbenchRecipeV1,
} from './app/recipe';
import type {
  CfxRecipeMaterialProfileIdV1,
  MinimalRecipeAutoResolvedV1,
  RecipeGeometryInputModeV1,
  RecipeMaterialSelectionV1,
} from './product/recipe';
import {
  parseWorkbenchProject,
  serializeWorkbenchProject,
  type WorkbenchDatasetV1,
} from './app/project';
import type {
  NormalizeWorkerRequest,
  NormalizeWorkerResponse,
} from './app/normalizeWorkerProtocol';
import { buildReleaseExportModel, serializeAuditRowsToCsv } from './app/exportRows';
import { canonicalizeScientificJson } from './science/hash';
import { createCf1MaterialPreset } from './science/material';
import { summarizeProjectAnalysisStatusV1 } from './product/projectStatus';
import {
  DCR_BATCH_STANDARD_POINT_SPECS_V1,
  buildDcrBatchWorkbenchViewModelV1,
  type DcrBatchEventV1,
  type DcrBatchPointKeyV1,
  type DcrBatchPointStateV1,
} from './product/dcr';
import { BatchTrendPlot, type BatchTrendPoint } from './components/workbench/BatchTrendPlot';
import { GittLiteratureDiagnostics } from './components/workbench/GittLiteratureDiagnostics';
import { ResultsTable } from './components/workbench/ResultsTable';
import { StatusBadge } from './components/workbench/StatusBadge';
import { TimelinePlot } from './components/workbench/TimelinePlot';
import {
  buildGittOverviewVoltagePointsV1,
  buildGittPlotExportBundleV1,
  buildGittPulsePlotModelV1,
} from './product/gitt';
import './product-workbench.css';

type WorkspacePage = 'data' | 'dcr' | 'gitt' | 'report';
type BusyAction =
  | 'import'
  | 'open-project'
  | 'save-project'
  | 'export-csv'
  | 'export-xlsx'
  | 'export-manifest'
  | 'export-project';
type DcrFilter = 'all' | DcrBatchPointStateV1;
type GittEventFilter = 'all' | 'main' | 'cutoff' | 'rest';

type AuditFocus = {
  eventKey?: string;
  metricKey?: DcrBatchPointKeyV1;
  pulseId?: string;
} | null;

type GittLiteratureProfileEntry = {
  entry: BatchAnalysisEntryV1;
  program: CfxLiterature1200sAnalysisV1['programExecution'];
  profile: CfxLiterature1200sAnalysisV1['comparativeProfile'];
};

const DEFAULT_SETTINGS: WorkbenchSettings = {
  // Legacy base value only. The recipe gate never allows this field to reach
  // a GITT worker until a project geometry has been explicitly confirmed.
  electrodeDiameterCm: 1.2,
  electrodeDiameterStandardUncertaintyCm: null,
  activeMassStandardUncertaintyG: null,
  currentResolutionA: null,
  voltageResolutionV: null,
  material: createCf1MaterialPreset(),
  initialSocPct: null,
  initialSocSource: 'unknown',
  datasetStartsAtFreshCell: false,
};

const PAGE_COPY: Record<WorkspacePage, { label: string; description: string }> = {
  data: { label: '项目 / 数据', description: '导入、识别并管理实验文件' },
  dcr: { label: 'DCR 工作台', description: '查看指定协议下的脉冲电阻趋势与异常' },
  gitt: { label: 'CFₓ 文献 GITT', description: '自动适配 1200 s 上限、1.5 V 截止与 4 h 静置，生成同协议比较序列' },
  report: { label: '报告导出', description: '导出面向实验决策的汇总与可审计附件' },
};

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function shortFileName(fileName: string, maximum = 28) {
  if (fileName.length <= maximum) return fileName;
  const extensionIndex = fileName.lastIndexOf('.');
  const extension = extensionIndex >= 0 ? fileName.slice(extensionIndex) : '';
  return `${fileName.slice(0, Math.max(6, maximum - extension.length - 1))}…${extension}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatNumber(value: number | null | undefined, digits = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: digits }).format(value);
}

function formatScientific(value: number | null | undefined, digits = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute < 0.001 || absolute >= 10_000)) {
    return value.toExponential(Math.max(0, digits - 1));
  }
  return formatNumber(value, digits);
}

function formatPotential(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value * 1000, 4)} mV`;
}

function formatPercent(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value * 100, digits)}%`;
}

function formatResistance(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const absolute = Math.abs(value);
  if (absolute > 0 && absolute < 1) return `${formatNumber(value * 1000, 4)} mΩ`;
  if (absolute >= 1000) return `${formatNumber(value / 1000, 4)} kΩ`;
  return `${formatNumber(value, 4)} Ω`;
}

function formatSeconds(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 3600) return `${formatNumber(value / 3600, 4)} h`;
  if (value >= 60) return `${formatNumber(value / 60, 4)} min`;
  return `${formatNumber(value, 4)} s`;
}

function formatRecipeFactValue(fact: MinimalRecipeAutoResolvedV1) {
  if (fact.value === null) return '—';
  const numeric = typeof fact.value === 'number' ? formatNumber(fact.value, 5) : fact.value;
  if (fact.id === 'cf1_density_reference_2_25_g_per_cm3') return `${numeric} g/cm³`;
  if (fact.id === 'material_density_user_override') return `${numeric} g/cm³`;
  if (fact.id === 'material_molar_mass_user_override') return `${numeric} g/mol`;
  if (fact.id === 'cf1_theoretical_capacity_865_mah_per_g') return `${numeric} mAh/g`;
  if (fact.id === 'electrode_diameter_project_value') return `${numeric} mm`;
  if (fact.id === 'electrode_area_project_value') return `${numeric} cm²`;
  if (fact.id === 'neware_active_mass_metadata') return `${numeric} mg`;
  if (fact.id === 'active_mass_user_override') return `${numeric} mg`;
  return numeric;
}

function pointStateLabel(state: DcrBatchPointStateV1) {
  if (state === 'usable') return '已计算';
  if (state === 'review') return '已计算 · 有提示';
  return '目标点缺失';
}

function pointStateForTrend(state: DcrBatchPointStateV1): BatchTrendPoint['state'] {
  if (state === 'usable') return 'valid';
  if (state === 'review') return 'review';
  return 'not_computable';
}

function cfxGittEventLabel(eventClassification: string): string {
  if (eventClassification === 'complete_1200s_standard_rest') return '主比较序列';
  if (eventClassification === 'excluded_cutoff_early') return '1.5 V 截止早停';
  if (eventClassification === 'excluded_post_rest_truncated') return '静置未完成';
  if (eventClassification === 'excluded_nonstandard_post_rest') return '非标准静置';
  return '未达到完整工步';
}

function cfxGittEventTone(eventClassification: string): 'comparative' | 'review' | 'missing' {
  if (eventClassification === 'complete_1200s_standard_rest') return 'comparative';
  if (eventClassification === 'excluded_cutoff_early') return 'review';
  return 'missing';
}

function newareTerminationLabel(termination: string | null | undefined): string {
  if (termination === 'time_limit_reached') return '达到 1200 s 上限';
  if (termination === 'stop_voltage_terminated') return '触发 1.5 V 截止';
  if (termination === 'unknown_early_termination') return '提前结束，原因未知';
  return '未识别程序证据';
}

function newareRestLabel(postRestState: string | null | undefined): string {
  if (postRestState === 'completed_standard_rest') return '4 h 静置完成';
  if (postRestState === 'file_end_truncated') return '文件末尾静置截断';
  if (postRestState === 'ended_before_standard_rest') return '静置未达到 4 h';
  return '后静置缺失';
}

function resultStatus(entry: BatchAnalysisEntryV1): { label: string; tone: string } {
  if (entry.classification.analysisKind === 'gitt' && !entry.recipePlan.readyToAnalyze) {
    return { label: '等待确认实验信息', tone: 'caution' };
  }
  if (entry.pending) return { label: '分析中', tone: 'neutral' };
  if (entry.error) return { label: '分析失败', tone: 'negative' };
  if (!entry.analysis) return { label: '未分析', tone: 'neutral' };
  const { counts } = entry.analysis;
  const computedCount = counts.valid + counts.review + counts.rejected;
  if (computedCount > 0 && counts.notComputable > 0) return { label: '部分完成计算', tone: 'caution' };
  if (computedCount > 0) return { label: '已完成计算', tone: 'positive' };
  return { label: '没有可计算结果', tone: 'neutral' };
}

function rowsThroughFirstGittCutoff(
  rows: WorkbenchDatasetV1['canonical']['rows'],
  program: CfxLiterature1200sAnalysisV1['programExecution'] | null | undefined,
): WorkbenchDatasetV1['canonical']['rows'] {
  const firstCutoff = program?.events.find(
    (event) => event.termination === 'stop_voltage_terminated',
  );
  if (!firstCutoff) return rows;
  const endStepId = firstCutoff.postRestAnalysisStepId ?? firstCutoff.pulseAnalysisStepId;
  let lastIncludedIndex = -1;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].analysisStepId === endStepId) lastIncludedIndex = index;
  }
  return lastIncludedIndex >= 0 ? rows.slice(0, lastIncludedIndex + 1) : rows;
}

function downloadText(fileName: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  downloadBlob(fileName, blob);
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function jsonWithBigInt(value: unknown) {
  return JSON.stringify(value, (_key, entry) => (typeof entry === 'bigint' ? entry.toString() : entry), 2);
}

function nextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="product-empty-state">
      <div className="product-empty-state__trace" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
      <span className="product-eyebrow">READY WHEN YOU ARE</span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </section>
  );
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState<WorkspacePage>('data');
  const [datasets, setDatasets] = useState<WorkbenchDatasetV1[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<WorkbenchSettings>(DEFAULT_SETTINGS);
  const [analysisSettings, setAnalysisSettings] = useState<WorkbenchSettings>(DEFAULT_SETTINGS);
  // `recipe` is a draft.  A GITT worker sees it only after the user presses
  // the explicit confirmation action; DCR remains ready without any recipe.
  const [recipe, setRecipe] = useState<WorkbenchRecipeV1>(() => createDefaultWorkbenchRecipe());
  const [analysisRecipe, setAnalysisRecipe] = useState<WorkbenchRecipeV1>(
    () => createDefaultWorkbenchRecipe(),
  );
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [operationStatus, setOperationStatus] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [dcrMetric, setDcrMetric] = useState<DcrBatchPointKeyV1>('30s');
  const [dcrFilter, setDcrFilter] = useState<DcrFilter>('all');
  const [gittEventFilter, setGittEventFilter] = useState<GittEventFilter>('main');
  const [selectedGittPulseId, setSelectedGittPulseId] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditFocus, setAuditFocus] = useState<AuditFocus>(null);
  const [showAuditCandidates, setShowAuditCandidates] = useState(false);

  useEffect(() => {
    if (settings === analysisSettings) return undefined;
    const timer = window.setTimeout(() => setAnalysisSettings(settings), 250);
    return () => window.clearTimeout(timer);
  }, [analysisSettings, settings]);

  const { entries, pendingCount } = useBatchAnalysis(datasets, analysisSettings, analysisRecipe);
  const settingsPending = settings !== analysisSettings;
  const isBusy = busyAction !== null;
  const analysisPending = pendingCount > 0;

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.loaded.id === selectedId) ?? entries[0] ?? null,
    [entries, selectedId],
  );

  // Render the next required fact from the draft recipe, rather than exposing
  // the science-core configuration. The running batch still uses
  // `analysisRecipe`, so editing a field cannot silently recalculate a file.
  const draftRecipePlans = useMemo(
    () => entries.map((entry) => ({
      entry,
      plan: buildDatasetRecipePlan(entry.loaded.canonical, entry.classification, recipe),
    })),
    [entries, recipe],
  );
  const gittDraftRecipePlans = useMemo(
    () => draftRecipePlans.filter(({ plan }) => plan.analysisKind === 'gitt'),
    [draftRecipePlans],
  );
  const blockedGittDraftRecipePlans = useMemo(
    () => gittDraftRecipePlans.filter(({ plan }) => !plan.readyToAnalyze),
    [gittDraftRecipePlans],
  );
  const recipeHasUncommittedChanges = useMemo(
    () => canonicalizeScientificJson(recipe) !== canonicalizeScientificJson(analysisRecipe),
    [analysisRecipe, recipe],
  );
  const gittRecipePending = blockedGittDraftRecipePlans.length > 0 ||
    (gittDraftRecipePlans.length > 0 && recipeHasUncommittedChanges);
  const projectAnalysisSummary = summarizeProjectAnalysisStatusV1({
    analysisPending,
    pendingAnalysisCount: pendingCount,
    blockedGittCount: blockedGittDraftRecipePlans.length,
    recipeHasUncommittedChanges,
    gittDatasetCount: gittDraftRecipePlans.length,
  });
  const selectedGittDraftRecipePlan = useMemo(
    () => gittDraftRecipePlans.find(({ entry }) => entry.loaded.id === selectedEntry?.loaded.id)
      ?? blockedGittDraftRecipePlans[0]
      ?? gittDraftRecipePlans[0]
      ?? null,
    [blockedGittDraftRecipePlans, gittDraftRecipePlans, selectedEntry?.loaded.id],
  );

  const dcrInputs = useMemo(
    () => entries.flatMap((entry) => (
      entry.classification.analysisKind === 'dcr' && entry.analysis !== null
        ? [{ dataset: entry.loaded, analysis: entry.analysis }]
        : []
    )),
    [entries],
  );
  const dcrModel = useMemo(
    () => buildDcrBatchWorkbenchViewModelV1(dcrInputs),
    [dcrInputs],
  );

  const gittLiteratureProfiles = useMemo<GittLiteratureProfileEntry[]>(
    () => entries.flatMap((entry) => {
      const cfxLiterature1200s = entry.analysis?.cfxLiterature1200s ?? null;
      if (entry.classification.analysisKind !== 'gitt' || cfxLiterature1200s === null) return [];
      return [{
        entry,
        program: cfxLiterature1200s.programExecution,
        profile: cfxLiterature1200s.comparativeProfile,
      }];
    }),
    [entries],
  );

  const selectedGittLiteratureProfile = useMemo(
    () => gittLiteratureProfiles.find(({ entry }) => entry.loaded.id === selectedEntry?.loaded.id)
      ?? gittLiteratureProfiles[0]
      ?? null,
    [gittLiteratureProfiles, selectedEntry],
  );

  const gittOverviewPoints = useMemo<BatchTrendPoint[]>(
    () => gittLiteratureProfiles.flatMap(({ entry }) => {
      const materialLabel = entry.resolvedSettings?.recipeMaterialProfileId === 'fgs_cf1_reference'
        ? 'FGS'
        : 'CFₓ';
      const seriesColor = materialLabel === 'FGS' ? '#43b5c5' : '#d783c5';
      const seriesLabel = `${materialLabel} · ${shortFileName(entry.loaded.fileName, 24)}`;
      const retainedRows = rowsThroughFirstGittCutoff(
        entry.loaded.canonical.rows,
        entry.analysis?.cfxLiterature1200s?.programExecution,
      );
      return buildGittOverviewVoltagePointsV1(retainedRows).map((point) => ({
        id: `${entry.loaded.id}:${point.id}`,
        x: point.timeMinutes,
        y: point.voltageV,
        label: `${seriesLabel} · ${point.timeMinutes.toFixed(1)} min`,
        seriesLabel,
        seriesColor,
        state: 'neutral',
      }));
    }),
    [gittLiteratureProfiles],
  );

  const gittVoltageMetricPoints = useMemo<BatchTrendPoint[]>(
    () => gittLiteratureProfiles.flatMap(({ entry, profile }) => {
      const pulseById = new Map(profile.pulses.map((pulse) => [pulse.sourcePulseId, pulse]));
      const materialLabel = entry.resolvedSettings?.recipeMaterialProfileId === 'fgs_cf1_reference'
        ? 'FGS'
        : 'CFₓ';
      const seriesColor = materialLabel === 'FGS' ? '#43b5c5' : '#d783c5';
      const seriesLabel = `${materialLabel} · ${shortFileName(entry.loaded.fileName, 24)}`;
      return (entry.analysis?.gittResults ?? []).flatMap((result) => {
        const pulse = pulseById.get(result.pulseId);
        const voltageV = result.postRestEndPotentialV;
        const candidate = result.metricValueCm2PerS;
        if (
          pulse?.eventClassification !== 'complete_1200s_standard_rest' ||
          voltageV === null ||
          candidate === null ||
          candidate <= 0
        ) return [];
        return [{
          id: result.pulseId,
          x: voltageV,
          y: candidate,
          label: `${seriesLabel} · 脉冲 ${pulse.sourceOrder}`,
          seriesLabel,
          seriesColor,
          seriesOrder: pulse.sourceOrder,
          state: 'neutral' as const,
        }];
      });
    }),
    [gittLiteratureProfiles],
  );

  const selectedMetricSpec = DCR_BATCH_STANDARD_POINT_SPECS_V1.find(
    (spec) => spec.key === dcrMetric,
  ) ?? DCR_BATCH_STANDARD_POINT_SPECS_V1[3];

  const filteredDcrEvents = useMemo(
    () => dcrModel.events.filter((event) => {
      const point = event.points.find((candidate) => candidate.key === dcrMetric);
      return dcrFilter === 'all' || point?.state === dcrFilter;
    }),
    [dcrFilter, dcrMetric, dcrModel.events],
  );

  const dcrTrendPoints = useMemo<BatchTrendPoint[]>(() => {
    const perDatasetIndex = new Map<string, number>();
    return filteredDcrEvents.map((event) => {
      const index = (perDatasetIndex.get(event.dataset.datasetId) ?? 0) + 1;
      perDatasetIndex.set(event.dataset.datasetId, index);
      const point = event.points.find((candidate) => candidate.key === dcrMetric);
      return {
        id: `${event.eventKey}:${dcrMetric}`,
        x: index,
        y: point?.reportedResistanceOhm ?? null,
        label: `${shortFileName(event.dataset.fileName, 34)} · 脉冲 ${index}`,
        seriesLabel: shortFileName(event.dataset.fileName, 24),
        state: pointStateForTrend(point?.state ?? 'missing'),
      };
    });
  }, [dcrMetric, filteredDcrEvents]);

  const focusedDcrEvent = useMemo(
    () => auditFocus?.eventKey === undefined
      ? null
      : dcrModel.events.find((event) => event.eventKey === auditFocus.eventKey) ?? null,
    [auditFocus, dcrModel.events],
  );
  const focusedDcrPoint = useMemo(
    () => focusedDcrEvent?.points.find((point) => point.key === auditFocus?.metricKey) ?? null,
    [auditFocus?.metricKey, focusedDcrEvent],
  );

  const focusedGittResult = useMemo(() => {
    if (auditFocus?.pulseId === undefined || selectedEntry?.analysis === null) return null;
    return selectedEntry.analysis.gittResults.find((result) => result.pulseId === auditFocus.pulseId) ?? null;
  }, [auditFocus?.pulseId, selectedEntry]);

  const focusedGittLiteratureEvent = useMemo(() => {
    if (auditFocus?.pulseId === undefined || selectedEntry === null) return null;
    const profileEntry = gittLiteratureProfiles.find(
      (candidate) => candidate.entry.loaded.id === selectedEntry.loaded.id,
    );
    if (!profileEntry) return null;
    return {
      programEvent: profileEntry.program.events.find(
        (event) => event.sourcePulseId === auditFocus.pulseId,
      ) ?? null,
      profilePulse: profileEntry.profile.pulses.find(
        (pulse) => pulse.sourcePulseId === auditFocus.pulseId,
      ) ?? null,
    };
  }, [auditFocus?.pulseId, gittLiteratureProfiles, selectedEntry]);

  const selectPage = (nextPage: WorkspacePage) => {
    setPage(nextPage);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    // Audit evidence is intentionally secondary. Do not let a previously
    // opened raw-record drawer obscure the next top-level task.
    setAuditOpen(false);
    setAuditFocus(null);
    const expectedKind = nextPage === 'dcr' ? 'dcr' : nextPage === 'gitt' ? 'gitt' : null;
    if (expectedKind !== null && selectedEntry?.classification.analysisKind !== expectedKind) {
      const first = entries.find((entry) => entry.classification.analysisKind === expectedKind);
      if (first) setSelectedId(first.loaded.id);
    }
  };

  const selectEntry = (entry: BatchAnalysisEntryV1, openAudit = false) => {
    setSelectedId(entry.loaded.id);
    setAuditFocus(null);
    setAuditOpen(openAudit);
  };

  const selectGittDiagnostic = (datasetId: string, pulseId: string, scrollToDiagnostic = true) => {
    setSelectedId(datasetId);
    setSelectedGittPulseId(pulseId);
    setAuditFocus(null);
    setAuditOpen(false);
    if (scrollToDiagnostic) {
      window.requestAnimationFrame(() => {
        document.getElementById('gitt-pulse-diagnostics')?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start',
        });
      });
    }
  };

  const updateRecipeSelection = (
    sourceFileHash: string,
    update: Partial<WorkbenchRecipeV1['datasetSelectionsBySourceFileHash'][string]>,
  ) => {
    setRecipe((current) => {
      const existing = current.datasetSelectionsBySourceFileHash[sourceFileHash] ?? {
        materialConfirmation: null,
        selectedActiveMassSourceId: null,
        activeMassOverrideMg: null,
        soc: null,
      };
      return {
        ...current,
        datasetSelectionsBySourceFileHash: {
          ...current.datasetSelectionsBySourceFileHash,
          [sourceFileHash]: { ...existing, ...update },
        },
      };
    });
  };

  const setRecipeDiameterMm = (rawValue: string) => {
    const trimmed = rawValue.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    setRecipe((current) => ({
      ...current,
      electrodeDiameterMm: Number.isFinite(value) ? value : null,
    }));
  };

  const setRecipeAreaCm2 = (rawValue: string) => {
    const trimmed = rawValue.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    setRecipe((current) => ({
      ...current,
      electrodeAreaCm2: Number.isFinite(value) ? value : null,
    }));
  };

  const setRecipeGeometryInputMode = (inputMode: RecipeGeometryInputModeV1) => {
    setRecipe((current) => {
      if (inputMode === current.geometryInputMode) return current;
      if (inputMode === 'area') {
        const derivedArea = current.electrodeAreaCm2 ?? (
          current.electrodeDiameterMm === null
            ? null
            : Math.PI * (current.electrodeDiameterMm / 20) ** 2
        );
        return { ...current, geometryInputMode: inputMode, electrodeAreaCm2: derivedArea };
      }
      const derivedDiameterMm = current.electrodeDiameterMm ?? (
        current.electrodeAreaCm2 === null
          ? null
          : 20 * Math.sqrt(current.electrodeAreaCm2 / Math.PI)
      );
      return { ...current, geometryInputMode: inputMode, electrodeDiameterMm: derivedDiameterMm };
    });
  };

  const setRecipeActiveMassOverrideMg = (sourceFileHash: string, rawValue: string) => {
    const trimmed = rawValue.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    updateRecipeSelection(sourceFileHash, {
      activeMassOverrideMg: Number.isFinite(value) ? value : null,
    });
  };

  const setRecipeMaterialParameter = (
    profileId: CfxRecipeMaterialProfileIdV1,
    field: 'densityGPerCm3' | 'molarMassGPerMol',
    rawValue: string,
  ) => {
    const trimmed = rawValue.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    setRecipe((current) => ({
      ...current,
      materialParametersByProfileId: {
        ...current.materialParametersByProfileId,
        [profileId]: {
          densityGPerCm3:
            current.materialParametersByProfileId[profileId]?.densityGPerCm3 ?? null,
          molarMassGPerMol:
            current.materialParametersByProfileId[profileId]?.molarMassGPerMol ?? null,
          [field]: Number.isFinite(value) ? value : null,
        },
      },
    }));
  };

  const confirmGittRecipe = () => {
    if (blockedGittDraftRecipePlans.length > 0) {
      const first = blockedGittDraftRecipePlans[0];
      setNotice(`请先完成 ${first.entry.loaded.fileName} 的必要确认，再开始 GITT 分析。`);
      return;
    }
    if (gittDraftRecipePlans.length === 0) return;
    setAnalysisRecipe(recipe);
    setNotice(`已确认 ${gittDraftRecipePlans.length} 个 GITT 文件的最小实验配方；正在按每个文件的已确认事实进行分析。`);
  };

  const renderGittRecipeSetup = () => {
    const selected = selectedGittDraftRecipePlan;
    if (selected === null) return null;
    const { entry, plan } = selected;
    const selection = recipe.datasetSelectionsBySourceFileHash[plan.sourceFileHash] ?? null;
    const hasBlocking = plan.blocking.length > 0;
    const recipeChangedSinceAnalysis = recipeHasUncommittedChanges;
    const hasPreviousAnalysis = entry.analysis !== null;
    const analysisIsCurrent =
      hasPreviousAnalysis && entry.recipePlan.readyToAnalyze && !recipeChangedSinceAnalysis;
    const requiredQuestions = plan.questions.filter((question) => question.required);
    const blockingCodes = new Set(plan.blocking.map((blocking) => blocking.code));
    const materialProfileId = plan.resolved.material?.profileId
      ?? selection?.materialConfirmation?.profileId
      ?? null;
    const materialPreset = plan.resolved.material?.preset ?? null;
    const materialParameters = materialProfileId === null
      ? null
      : recipe.materialParametersByProfileId[materialProfileId] ?? null;
    const activeMassMg = selection?.activeMassOverrideMg
      ?? (plan.resolved.activeMassG === null ? null : plan.resolved.activeMassG * 1000);
    const densityGPerCm3 = materialParameters?.densityGPerCm3
      ?? materialPreset?.densityGPerCm3
      ?? null;
    const molarMassGPerMol = materialParameters?.molarMassGPerMol
      ?? materialPreset?.molarMassGPerMol
      ?? null;
    const automaticFacts = plan.autoResolved.filter((item) => ![
      'cf1_density_reference_2_25_g_per_cm3',
      'material_density_user_override',
      'material_molar_mass_user_override',
      'electrode_diameter_project_value',
      'electrode_area_project_value',
      'active_mass_user_override',
    ].includes(item.id));

    return (
      <section className="product-section product-recipe" aria-label="GITT 实验参数">
        <div className="product-section-heading">
          <div>
            <span className="product-eyebrow">GITT ANALYSIS INPUTS</span>
            <h3>{hasBlocking ? '确认用于计算的实验参数' : 'GITT 分析参数已就绪'}</h3>
          </div>
          <span>{entry.loaded.fileName}</span>
        </div>

        <div className="product-recipe__layout">
          <div className="product-recipe__facts">
            <strong>软件自动识别</strong>
            <ul>
              {automaticFacts.map((item) => (
                <li key={item.id}>
                  <span>{item.label}</span>
                  <b>{formatRecipeFactValue(item)}</b>
                </li>
              ))}
            </ul>
            <p>
              CFₓ/FGS 按 WH 平面端点手算法直接输出；结果用于同条件比较，不标注为本征固相扩散系数。
            </p>
          </div>

          <div className="product-recipe__questions">
            {requiredQuestions.map((question) => {
              if (question.id === 'confirm_material_profile') {
                return (
                  <fieldset className="product-recipe__question" key={question.id}>
                    <legend>{question.title}</legend>
                    <p>{question.prompt}</p>
                    <div className="product-recipe__choices">
                      {question.choices?.map((choice) => {
                        const profileId: RecipeMaterialSelectionV1['profileId'] =
                          choice.value === 'cf1' || choice.value === 'fgs_cf1_reference'
                            ? choice.value
                            : null;
                        const checked = selection?.materialConfirmation?.profileId === profileId;
                        return (
                          <label className={`product-recipe__choice ${checked ? 'is-selected' : ''}`} key={choice.value}>
                            <input
                              type="radio"
                              name={`recipe-material-${plan.sourceFileHash}`}
                              value={choice.value}
                              checked={checked}
                              onChange={() => {
                                if (profileId === null) return;
                                updateRecipeSelection(plan.sourceFileHash, {
                                  materialConfirmation: {
                                    profileId,
                                    confidence: 'confirmed',
                                    evidence: question.choices?.map((item) => item.detail) ?? [],
                                  },
                                });
                              }}
                            />
                            <span><strong>{choice.label}</strong><small>{choice.detail}</small></span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              }

              if (question.id === 'confirm_active_mass_source') {
                return (
                  <fieldset className="product-recipe__question" key={question.id}>
                    <legend>{question.title}</legend>
                    <p>{question.prompt}</p>
                    <div className="product-recipe__choices">
                      {question.choices?.map((choice) => {
                        const checked = selection?.selectedActiveMassSourceId === choice.value;
                        return (
                          <label className={`product-recipe__choice ${checked ? 'is-selected' : ''}`} key={choice.value}>
                            <input
                              type="radio"
                              name={`recipe-mass-${plan.sourceFileHash}`}
                              value={choice.value}
                              checked={checked}
                              onChange={() => updateRecipeSelection(plan.sourceFileHash, {
                                selectedActiveMassSourceId: choice.value,
                              })}
                            />
                            <span><strong>{choice.label}</strong><small>{choice.detail}</small></span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              }

              return null;
            })}

            <div className="product-recipe__physical">
              <div className="product-recipe__physical-heading">
                <div>
                  <strong>可确认或修改的物理参数</strong>
                  <p>软件提供已识别值和材料默认值；这些是实际参与计算的参数。</p>
                </div>
                <span>不确定度与仪器误差不在此处填写</span>
              </div>

              <div className="product-recipe__geometry-mode" role="group" aria-label="极片几何输入方式">
                <button
                  type="button"
                  className={recipe.geometryInputMode === 'diameter' ? 'is-active' : ''}
                  onClick={() => setRecipeGeometryInputMode('diameter')}
                  aria-pressed={recipe.geometryInputMode === 'diameter'}
                >
                  按圆片直径
                </button>
                <button
                  type="button"
                  className={recipe.geometryInputMode === 'area' ? 'is-active' : ''}
                  onClick={() => setRecipeGeometryInputMode('area')}
                  aria-pressed={recipe.geometryInputMode === 'area'}
                >
                  直接输入面积
                </button>
              </div>

              <div className="product-recipe__field-grid">
                <label className="product-recipe__field">
                  <span>{recipe.geometryInputMode === 'area' ? '极片单面几何面积' : '圆片直径'}</span>
                  <div className="product-recipe__number-input">
                    <input
                      id={recipe.geometryInputMode === 'area'
                        ? 'recipe-electrode-area-cm2'
                        : 'recipe-electrode-diameter-mm'}
                      type="number"
                      min="0.000001"
                      step="any"
                      inputMode="decimal"
                      value={recipe.geometryInputMode === 'area'
                        ? recipe.electrodeAreaCm2 ?? ''
                        : recipe.electrodeDiameterMm ?? ''}
                      placeholder={recipe.geometryInputMode === 'area' ? '例如 1.131' : '例如 12.0'}
                      aria-invalid={recipe.geometryInputMode === 'area'
                        ? blockingCodes.has('electrode_area_required') || blockingCodes.has('electrode_area_invalid')
                        : blockingCodes.has('electrode_diameter_required') || blockingCodes.has('electrode_diameter_invalid')}
                      onChange={(event) => (
                        recipe.geometryInputMode === 'area'
                          ? setRecipeAreaCm2(event.target.value)
                          : setRecipeDiameterMm(event.target.value)
                      )}
                    />
                    <span>{recipe.geometryInputMode === 'area' ? 'cm²' : 'mm'}</span>
                  </div>
                  <small>仅使用单面几何面积，不使用 BET 比表面积。</small>
                </label>

                <label className="product-recipe__field">
                  <span>活性物质质量</span>
                  <div className="product-recipe__number-input">
                    <input
                      type="number"
                      min="0.000001"
                      step="any"
                      inputMode="decimal"
                      value={activeMassMg ?? ''}
                      placeholder="从 Neware SCQ 自动读取"
                      aria-invalid={blockingCodes.has('active_mass_override_invalid')}
                      onChange={(event) => setRecipeActiveMassOverrideMg(
                        plan.sourceFileHash,
                        event.target.value,
                      )}
                    />
                    <span>mg</span>
                  </div>
                  <small>{selection?.activeMassOverrideMg === null || selection?.activeMassOverrideMg === undefined
                    ? `当前来源：${plan.resolved.activeMassSourceId ?? '文件证据待确认'}；清空保持自动值。`
                    : '当前为用户修改值；清空可恢复文件自动值。'}</small>
                </label>

                <label className="product-recipe__field">
                  <span>材料密度</span>
                  <div className="product-recipe__number-input">
                    <input
                      type="number"
                      min="0.000001"
                      step="any"
                      inputMode="decimal"
                      value={densityGPerCm3 ?? ''}
                      disabled={materialProfileId === null}
                      placeholder="先确认材料"
                      aria-invalid={blockingCodes.has('material_density_invalid')}
                      onChange={(event) => {
                        if (materialProfileId !== null) {
                          setRecipeMaterialParameter(
                            materialProfileId,
                            'densityGPerCm3',
                            event.target.value,
                          );
                        }
                      }}
                    />
                    <span>g/cm³</span>
                  </div>
                  <small>{materialParameters?.densityGPerCm3 === null || materialParameters?.densityGPerCm3 === undefined
                    ? '当前使用材料默认值；修改后将作为用户确认值进入配置哈希。'
                    : '当前为用户修改值；清空可恢复材料默认值。'}</small>
                </label>

                <label className="product-recipe__field">
                  <span>材料摩尔质量</span>
                  <div className="product-recipe__number-input">
                    <input
                      type="number"
                      min="0.000001"
                      step="any"
                      inputMode="decimal"
                      value={molarMassGPerMol ?? ''}
                      disabled={materialProfileId === null}
                      placeholder="先确认材料"
                      aria-invalid={blockingCodes.has('material_molar_mass_invalid')}
                      onChange={(event) => {
                        if (materialProfileId !== null) {
                          setRecipeMaterialParameter(
                            materialProfileId,
                            'molarMassGPerMol',
                            event.target.value,
                          );
                        }
                      }}
                    />
                    <span>g/mol</span>
                  </div>
                  <small>当摩尔体积按 Vₘ=M/ρ 派生时，M 会与等效长度公式中的 M 相消；仍保留为材料定义与审计参数。</small>
                </label>
              </div>
            </div>

            {!hasBlocking && (
              <div className="product-recipe__ready" aria-live="polite">
                <ShieldCheck aria-hidden="true" />
                <div>
                  <strong>计算参数完整</strong>
                  <p>{recipeChangedSinceAnalysis
                    ? hasPreviousAnalysis
                      ? '修改尚未应用。确认后才会重新分析。'
                      : '参数尚未提交。确认后开始首次分析。'
                    : '误差传播和仪器分辨率由底层证据管理，不要求用户主观填写。'}</p>
                </div>
              </div>
            )}

            {plan.blocking.length > 0 && (
              <div className="product-recipe__blocking" role="alert">
                {plan.blocking.map((blocking) => <p key={blocking.code}>{blocking.message}</p>)}
              </div>
            )}

            <div className="product-recipe__action">
              <button
                className="product-button product-button--primary"
                onClick={confirmGittRecipe}
                disabled={
                  blockedGittDraftRecipePlans.length > 0 ||
                  gittDraftRecipePlans.length === 0 ||
                  isBusy ||
                  analysisIsCurrent
                }
              >
                <FlaskConical aria-hidden="true" />
                {analysisIsCurrent
                  ? '已按当前配方完成分析'
                  : hasPreviousAnalysis && recipeChangedSinceAnalysis
                    ? '确认并重新分析 GITT'
                    : '确认并开始 GITT 分析'}
              </button>
              <small>
                {analysisIsCurrent
                  ? '如需重算，请先更改一项实验事实；软件会保留原结果的配置与版本。'
                  : blockedGittDraftRecipePlans.length > 1
                    ? `还有 ${blockedGittDraftRecipePlans.length - 1} 个 GITT 文件需要确认。点击数据文件可逐一处理。`
                    : 'DCR 不受此步骤影响，已自动分析。'}
              </small>
            </div>
          </div>
        </div>
      </section>
    );
  };

  const openDcrAudit = (event: DcrBatchEventV1) => {
    setSelectedId(event.dataset.datasetId);
    setAuditFocus({ eventKey: event.eventKey, metricKey: dcrMetric });
    setAuditOpen(true);
  };

  const importFiles = async (files: FileList | null) => {
    if (!files?.length || isBusy) return;
    const selectedFiles = Array.from(files);
    setBusyAction('import');
    setNotice(null);
    try {
      await nextPaint();
      const imported: WorkbenchDatasetV1[] = [];
      const messages: string[] = [];
      const existingIds = new Set(datasets.map((dataset) => dataset.id));
      const normalizer = new Worker(new URL('./workers/normalize.worker.ts', import.meta.url), {
        type: 'module',
        name: 'gitt-dcr-neware-normalizer',
      });

      try {
        for (const [index, file] of selectedFiles.entries()) {
          setOperationStatus(`正在识别 ${index + 1}/${selectedFiles.length}：${file.name}`);
          await nextPaint();
          if (!file.name.toLowerCase().endsWith('.ndax')) {
            messages.push(`${file.name}：V1 目前仅直接读取 Neware NDAX。LAND 请先使用官方 CSV/XLSX 导出。`);
            continue;
          }
          try {
            const requestId = `${index}:${file.name}:${file.size}`;
            const bytes = await file.arrayBuffer();
            const canonical = await new Promise<NonNullable<NormalizeWorkerResponse['canonical']>>(
              (resolve, reject) => {
                const handleMessage = (event: MessageEvent<NormalizeWorkerResponse>) => {
                  if (event.data.requestId !== requestId) return;
                  normalizer.removeEventListener('message', handleMessage);
                  normalizer.removeEventListener('error', handleError);
                  if (event.data.canonical === null) reject(new Error(event.data.error));
                  else resolve(event.data.canonical);
                };
                const handleError = (event: ErrorEvent) => {
                  normalizer.removeEventListener('message', handleMessage);
                  normalizer.removeEventListener('error', handleError);
                  reject(new Error(event.message || 'normalization_worker_failed'));
                };
                normalizer.addEventListener('message', handleMessage);
                normalizer.addEventListener('error', handleError);
                const request: NormalizeWorkerRequest = { requestId, fileName: file.name, bytes };
                normalizer.postMessage(request, [bytes]);
              },
            );
            if (existingIds.has(canonical.sourceFileHash)) {
              messages.push(`${file.name}：已存在相同内容的文件，已跳过重复导入。`);
              continue;
            }
            existingIds.add(canonical.sourceFileHash);
            imported.push({
              id: canonical.sourceFileHash,
              fileName: file.name,
              fileSize: file.size,
              importedAtIso: new Date().toISOString(),
              canonical,
            });
          } catch (error) {
            messages.push(`${file.name}：${error instanceof Error ? error.message : '导入失败'}`);
          }
        }
      } finally {
        normalizer.terminate();
      }

      if (imported.length > 0) {
        setDatasets((current) => [...current, ...imported]);
        setSelectedId(imported.at(-1)?.id ?? null);
        setPage('data');
      }
      setNotice(messages.length > 0 ? messages.join('\n') : `已导入 ${imported.length} 个 NDAX 文件；批量结果会在后台分析完成后自动更新。`);
      setOperationStatus(`导入完成：${imported.length} 个数据集。`);
    } catch (error) {
      setNotice(`导入失败：${error instanceof Error ? error.message : 'import_failed'}`);
    } finally {
      setBusyAction(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeDataset = (id: string) => {
    setDatasets((current) => current.filter((dataset) => dataset.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setAuditOpen(false);
      setAuditFocus(null);
    }
  };

  const saveProject = async () => {
    if (datasets.length === 0 || isBusy) return;
    setBusyAction('save-project');
    setOperationStatus(`正在保存 ${datasets.length} 个 Canonical 数据集…`);
    try {
      await nextPaint();
      downloadText(
        `pulselab-gitt-dcr-project-${new Date().toISOString().slice(0, 10)}.json`,
        serializeWorkbenchProject(settings, datasets, analysisRecipe),
      );
      setNotice(`项目已保存：${datasets.length} 个数据集。恢复时将重新校验 Canonical hash。`);
    } catch (error) {
      setNotice(`项目保存失败：${error instanceof Error ? error.message : 'project_save_failed'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const openProject = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || isBusy) return;
    setBusyAction('open-project');
    setOperationStatus(`正在校验项目：${file.name}`);
    try {
      await nextPaint();
      const project = parseWorkbenchProject(await file.text());
      setSettings(project.settings);
      setAnalysisSettings(project.settings);
      setRecipe(project.recipe);
      setAnalysisRecipe(project.recipe);
      setDatasets(project.datasets);
      setSelectedId(project.datasets[0]?.id ?? null);
      setPage('data');
      setNotice(`项目已恢复：${project.datasets.length} 个数据集将按当前科学内核重新分析。`);
    } catch (error) {
      setNotice(`项目打开失败：${error instanceof Error ? error.message : 'invalid_project'}`);
    } finally {
      setBusyAction(null);
      if (projectInputRef.current) projectInputRef.current.value = '';
    }
  };

  const exportManifest = async () => {
    if (!selectedEntry?.analysis || isBusy || selectedEntry.pending) return;
    setBusyAction('export-manifest');
    setOperationStatus(`正在生成审计 Manifest：${selectedEntry.loaded.fileName}`);
    try {
      await nextPaint();
      const release = buildReleaseExportModel({
        loaded: selectedEntry.loaded,
        analysis: selectedEntry.analysis,
        resolvedSettings: selectedEntry.resolvedSettings,
        recipePlan: selectedEntry.recipePlan,
        exportedAtIso: new Date().toISOString(),
      });
      downloadText(`${selectedEntry.loaded.fileName}.manifest.json`, jsonWithBigInt(release.manifest));
      setNotice('已导出所选文件的审计 Manifest。');
    } catch (error) {
      setNotice(`Manifest 导出失败：${error instanceof Error ? error.message : 'manifest_export_failed'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const exportSelectedCsv = async () => {
    if (!selectedEntry?.analysis || isBusy || selectedEntry.pending) return;
    setBusyAction('export-csv');
    setOperationStatus(`正在生成 CSV：${selectedEntry.loaded.fileName}`);
    try {
      await nextPaint();
      const release = buildReleaseExportModel({
        loaded: selectedEntry.loaded,
        analysis: selectedEntry.analysis,
        resolvedSettings: selectedEntry.resolvedSettings,
        recipePlan: selectedEntry.recipePlan,
        exportedAtIso: new Date().toISOString(),
      });
      const rows = release.auditRows;
      if (rows.length === 0) throw new Error('no_exportable_results');
      const csv = serializeAuditRowsToCsv(rows);
      downloadText(`${selectedEntry.loaded.fileName}.audit.csv`, `\ufeff${csv}`, 'text/csv;charset=utf-8');
      setNotice(`已导出 ${rows.length} 行原始审计结果。`);
    } catch (error) {
      setNotice(`CSV 导出失败：${error instanceof Error ? error.message : 'csv_export_failed'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const exportSelectedXlsx = async () => {
    if (!selectedEntry?.analysis || isBusy || selectedEntry.pending) return;
    setBusyAction('export-xlsx');
    setOperationStatus(`正在生成 XLSX：${selectedEntry.loaded.fileName}`);
    try {
      await nextPaint();
      const release = buildReleaseExportModel({
        loaded: selectedEntry.loaded,
        analysis: selectedEntry.analysis,
        resolvedSettings: selectedEntry.resolvedSettings,
        recipePlan: selectedEntry.recipePlan,
        exportedAtIso: new Date().toISOString(),
      });
      const rows = release.auditRows;
      if (rows.length === 0) throw new Error('no_exportable_results');
      const selectedPulseOrderById = new Map(
        (selectedEntry.analysis.cfxLiterature1200s?.comparativeProfile.pulses ?? []).map(
          (pulse) => [pulse.sourcePulseId, pulse.sourceOrder],
        ),
      );
      const plotBundle = selectedEntry.classification.analysisKind === 'gitt'
        ? buildGittPlotExportBundleV1(
          rowsThroughFirstGittCutoff(
            selectedEntry.loaded.canonical.rows,
            selectedEntry.analysis.cfxLiterature1200s?.programExecution,
          ),
          selectedEntry.analysis.gittResults,
          selectedPulseOrderById,
        )
        : null;
      const { createXlsxWorkbook } = await import('./app/xlsx');
      const blob = await createXlsxWorkbook([
        { name: 'Calculation results', columns: Object.keys(rows[0]), rows },
        { name: 'Manifest', columns: ['key', 'value'], rows: release.manifestRows },
        ...(release.cfxProfileRows.length > 0
          ? [{ name: 'CFx1200 profile', columns: Object.keys(release.cfxProfileRows[0]), rows: release.cfxProfileRows }]
          : []),
        ...(plotBundle !== null && plotBundle.fullTraceRows.length > 0
          ? [{ name: 'GITT full trace', columns: Object.keys(plotBundle.fullTraceRows[0]), rows: plotBundle.fullTraceRows }]
          : []),
        ...(plotBundle !== null && plotBundle.pulseResponseRows.length > 0
          ? [{ name: 'GITT pulse response', columns: Object.keys(plotBundle.pulseResponseRows[0]), rows: plotBundle.pulseResponseRows }]
          : []),
        ...(plotBundle !== null && plotBundle.sqrtFitRows.length > 0
          ? [{ name: 'GITT sqrt fit', columns: Object.keys(plotBundle.sqrtFitRows[0]), rows: plotBundle.sqrtFitRows }]
          : []),
        ...(plotBundle !== null && plotBundle.whVoltageRows.length > 0
          ? [{ name: 'GITT WH vs voltage', columns: Object.keys(plotBundle.whVoltageRows[0]), rows: plotBundle.whVoltageRows }]
          : []),
      ]);
      downloadBlob(`${selectedEntry.loaded.fileName}.analysis.xlsx`, blob);
      setNotice(plotBundle === null
        ? `已导出 ${rows.length} 行计算结果和 Manifest。`
        : '已导出计算结果、完整曲线、单脉冲响应、E–√t 和 WH–电压作图数据。');
    } catch (error) {
      setNotice(`XLSX 导出失败：${error instanceof Error ? error.message : 'xlsx_export_failed'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const exportProjectWorkbook = async () => {
    if (isBusy || analysisPending || settingsPending || gittRecipePending || entries.length === 0) return;
    setBusyAction('export-project');
    setOperationStatus('正在生成项目汇总 XLSX…');
    try {
      await nextPaint();
      const overviewRows = entries.map((entry) => ({
        fileName: entry.loaded.fileName,
        analysisKind: entry.classification.analysisKind,
        rowCount: entry.loaded.canonical.rows.length,
        activeMassMg: entry.analysis?.activeMassProvenance?.activeMassG === null ||
          entry.analysis?.activeMassProvenance?.activeMassG === undefined
          ? entry.loaded.canonical.metadata.activeMassMg
          : entry.analysis.activeMassProvenance.activeMassG * 1000,
        activeMassSourceId: entry.analysis?.activeMassProvenance?.sourceId ?? null,
        analysisState: entry.error
          ? 'analysis_error'
          : entry.analysis
            ? 'analyzed'
            : entry.classification.analysisKind === 'gitt' && !entry.recipePlan.readyToAnalyze
              ? 'awaiting_recipe_confirmation'
              : 'not_requested',
        scientificValid: entry.analysis?.counts.valid ?? null,
        scientificReview: entry.analysis?.counts.review ?? null,
        scientificRejected: entry.analysis?.counts.rejected ?? null,
        scientificNotComputable: entry.analysis?.counts.notComputable ?? null,
        sourceFileHash: entry.loaded.canonical.sourceFileHash,
      }));
      const dcrRows = dcrModel.events.flatMap((event, eventIndex) => event.points.map((point) => ({
        fileName: event.dataset.fileName,
        eventOrder: eventIndex + 1,
        metric: point.requestedMetric,
        targetTimeS: point.requestedOffsetS,
        productState: point.state,
        resistanceOhm: point.reportedResistanceOhm,
        calculationState: point.calculationState,
        qcStatus: point.qcStatus,
        qcCodes: point.qcCodes.join(' | '),
        actualElapsedFromTransitionS: point.actualElapsedFromTransitionS,
      })));
      const gittRows = gittLiteratureProfiles.flatMap(({ entry, program, profile }) => {
        const programEventByPulseId = new Map(program.events.map((event) => [event.sourcePulseId, event]));
        const resultByPulseId = new Map(
          (entry.analysis?.gittResults ?? []).map((result) => [result.pulseId, result]),
        );
        return profile.pulses.map((pulse) => {
          const programEvent = programEventByPulseId.get(pulse.sourcePulseId) ?? null;
          const result = resultByPulseId.get(pulse.sourcePulseId) ?? null;
          return {
            fileName: entry.loaded.fileName,
            pulseOrder: pulse.sourceOrder,
            actualPulseDurationS: programEvent?.actualPulseDurationS ?? null,
            termination: programEvent?.termination ?? null,
            postRestState: programEvent?.postRestState ?? null,
            postRestDurationS: pulse.polarization.postRestDurationS,
            sequenceClassification: pulse.eventClassification,
            comparisonUse: pulse.comparativeUse,
            whEndpointResultCm2PerS: result?.metricValueCm2PerS ?? null,
            deltaEtV: result?.deltaEtV ?? null,
            deltaEsV: result?.deltaEsV ?? null,
            fitSlopeVPerSqrtS: result?.fitDiagnostics.slopeVPerSqrtS ?? null,
            fitInterceptV: result?.fitDiagnostics.interceptV ?? null,
            fitRSquared: result?.fitDiagnostics.rSquared ?? null,
            absolutePulseEndPolarizationV: pulse.polarization.absolutePulseEndPolarizationV,
            restEndPotentialShiftV: pulse.polarization.restEndPotentialShiftV,
            pulseCapacityFraction: pulse.polarization.pulseCapacityFraction,
            genericCalculationState: pulse.sourceGenericState.calculationState,
            genericQcStatus: pulse.sourceGenericState.qcStatus,
            genericQcCodes: pulse.sourceGenericState.qcCodes.join(' | '),
            modelWarnings: pulse.modelWarnings.map((warning) => warning.code).join(' | '),
            interpretation: 'CFx 1200 s model-limited comparative index; not intrinsic diffusivity',
          };
        });
      });
      const gittSummaryRows = gittLiteratureProfiles.map(({ entry, program, profile }) => ({
        fileName: entry.loaded.fileName,
        programProfileId: program.profile.profileId,
        programRecognized: program.programRecognized,
        timeLimitReachedCount: program.summary.timeLimitReachedCount,
        stopVoltageTerminatedCount: program.summary.stopVoltageTerminatedCount,
        retainedPulseCount: program.summary.retainedPulseCount,
        excludedAfterFirstCutoffCount: program.summary.excludedAfterFirstCutoffCount,
        firstCutoffSourcePulseId: program.summary.firstCutoffSourcePulseId,
        mainComparativeSequenceCount: program.summary.mainComparativeSequenceCount,
        fileEndTruncatedRestCount: program.summary.fileEndTruncatedRestCount,
        medianDAppCandidateCm2PerS: profile.summary.medianDAppCandidateCm2PerS,
        medianAbsolutePulseEndPolarizationV: profile.summary.medianAbsolutePulseEndPolarizationV,
        genericSmallPerturbationExceededCount: profile.summary.genericSmallPerturbationExceededCount,
        comparabilityGroupingKey: profile.comparabilityGroupingKey,
        comparabilityBoundary: profile.comparabilityBoundary,
      }));
      const plotBundles = gittLiteratureProfiles.map(({ entry, program, profile }) => ({
        fileName: entry.loaded.fileName,
        bundle: buildGittPlotExportBundleV1(
          rowsThroughFirstGittCutoff(entry.loaded.canonical.rows, program),
          entry.analysis?.gittResults ?? [],
          new Map(profile.pulses.map((pulse) => [pulse.sourcePulseId, pulse.sourceOrder])),
        ),
      }));
      const gittFullTraceRows = plotBundles.flatMap(({ fileName, bundle }) =>
        bundle.fullTraceRows.map((row) => ({ fileName, ...row })),
      );
      const gittPulseResponseRows = plotBundles.flatMap(({ fileName, bundle }) =>
        bundle.pulseResponseRows.map((row) => ({ fileName, ...row })),
      );
      const gittSqrtFitRows = plotBundles.flatMap(({ fileName, bundle }) =>
        bundle.sqrtFitRows.map((row) => ({ fileName, ...row })),
      );
      const gittWhVoltageRows = plotBundles.flatMap(({ fileName, bundle }) =>
        bundle.whVoltageRows.map((row) => ({ fileName, ...row })),
      );
      const { createXlsxWorkbook } = await import('./app/xlsx');
      const blob = await createXlsxWorkbook([
        { name: 'Project overview', columns: Object.keys(overviewRows[0] ?? { fileName: '' }), rows: overviewRows },
        { name: 'DCR workbench', columns: Object.keys(dcrRows[0] ?? { fileName: '' }), rows: dcrRows },
        { name: 'GITT CFx1200 events', columns: Object.keys(gittRows[0] ?? { fileName: '' }), rows: gittRows },
        { name: 'GITT CFx1200 summary', columns: Object.keys(gittSummaryRows[0] ?? { fileName: '' }), rows: gittSummaryRows },
        ...(gittFullTraceRows.length > 0
          ? [{ name: 'GITT full trace', columns: Object.keys(gittFullTraceRows[0]), rows: gittFullTraceRows }]
          : []),
        ...(gittPulseResponseRows.length > 0
          ? [{ name: 'GITT pulse response', columns: Object.keys(gittPulseResponseRows[0]), rows: gittPulseResponseRows }]
          : []),
        ...(gittSqrtFitRows.length > 0
          ? [{ name: 'GITT sqrt fit', columns: Object.keys(gittSqrtFitRows[0]), rows: gittSqrtFitRows }]
          : []),
        ...(gittWhVoltageRows.length > 0
          ? [{ name: 'GITT WH vs voltage', columns: Object.keys(gittWhVoltageRows[0]), rows: gittWhVoltageRows }]
          : []),
      ]);
      downloadBlob(`pulselab-gitt-dcr-report-${new Date().toISOString().slice(0, 10)}.xlsx`, blob);
      setNotice('已导出项目 XLSX：包含计算结果以及四组可直接作图的 GITT 数据。');
    } catch (error) {
      setNotice(`项目报告导出失败：${error instanceof Error ? error.message : 'project_export_failed'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const renderDataPage = () => {
    if (entries.length === 0) {
      return (
        <EmptyState
          title="导入测试数据，开始分析"
          detail="导入后软件会自动识别 Neware 协议、在后台规范化并分析整批文件；不需要先填写不确定度或仪器分辨率。"
          action={(
            <button className="product-button product-button--primary" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
              <FilePlus2 aria-hidden="true" />选择 NDAX 文件
            </button>
          )}
        />
      );
    }
    const dcrCount = entries.filter((entry) => entry.classification.analysisKind === 'dcr').length;
    const gittCount = entries.filter((entry) => entry.classification.analysisKind === 'gitt').length;
    return (
      <>
        <section className="product-page-header">
          <div>
            <span className="product-eyebrow">PROJECT DATA</span>
            <h2>这批数据已经识别成什么？</h2>
            <p>默认按原始文件保留身份；只有你主动选择同一组电池时，才在同一张趋势图中比较它们。</p>
          </div>
          <button className="product-button product-button--primary" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
            <FilePlus2 aria-hidden="true" />继续导入
          </button>
        </section>

        <section className="product-data-summary" aria-label="项目数据摘要">
          <div><strong>{entries.length}</strong><span>原始文件</span></div>
          <div><strong>{dcrCount}</strong><span>DCR 文件</span></div>
          <div><strong>{gittCount}</strong><span>GITT 文件</span></div>
          <div>
            <strong>{projectAnalysisSummary.value}</strong>
            <span>{projectAnalysisSummary.label}</span>
          </div>
        </section>

        {renderGittRecipeSetup()}

        <section className="product-section">
          <div className="product-section-heading">
            <div>
              <span className="product-eyebrow">SOURCE FILES</span>
              <h3>数据文件</h3>
            </div>
            <span>{entries.length} 个文件</span>
          </div>
          <div className="product-dataset-list">
            {entries.map((entry) => {
              const status = resultStatus(entry);
              const isSelected = entry.loaded.id === selectedEntry?.loaded.id;
              const kindLabel = entry.classification.analysisKind === 'dcr'
                ? 'DCR'
                : entry.classification.analysisKind === 'gitt'
                  ? 'GITT'
                  : '未识别';
              return (
                <article className={`product-dataset-row ${isSelected ? 'is-selected' : ''}`} key={entry.loaded.id}>
                  <button className="product-dataset-row__select" onClick={() => selectEntry(entry, true)} disabled={isBusy}>
                    <FileArchive aria-hidden="true" />
                    <span className="product-dataset-row__copy">
                      <strong title={entry.loaded.fileName}>{entry.loaded.fileName}</strong>
                      <small>{kindLabel} · {formatBytes(entry.loaded.fileSize)} · {entry.loaded.canonical.rows.length.toLocaleString('zh-CN')} 条记录</small>
                    </span>
                    <span className={`product-state product-state--${status.tone}`}>{status.label}</span>
                  </button>
                  <button
                    className="product-icon-button product-icon-button--danger"
                    onClick={() => removeDataset(entry.loaded.id)}
                    aria-label={`移除 ${entry.loaded.fileName}`}
                    disabled={isBusy}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="product-support-note">
          <Info aria-hidden="true" />
          <p><strong>当前输入范围：</strong>Neware NDAX 直接读取；LAND 首版仅接受官方 CSV/XLSX 导出，暂不直接读取 CEX。</p>
        </section>
      </>
    );
  };

  const renderDcrPage = () => {
    const dcrEntries = entries.filter((entry) => entry.classification.analysisKind === 'dcr');
    if (dcrEntries.length === 0) {
      return (
        <EmptyState
          title="还没有识别到 DCR 文件"
          detail="导入包含 Rest → 单一恒流 Pulse 的 Neware DCR 程序后，这里会自动汇总首采样、5 s、10 s 和 30 s 的结果。"
          action={(
            <button className="product-button product-button--primary" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
              <FilePlus2 aria-hidden="true" />导入 NDAX
            </button>
          )}
        />
      );
    }
    if (dcrInputs.length === 0) {
      return <section className="product-loading"><LoaderCircle className="spinner" aria-hidden="true" /><div><strong>正在分析 DCR 批次</strong><p>完成后会生成可筛选的脉冲趋势，而不是逐文件表格。</p></div></section>;
    }
    const pointCounts = dcrModel.events.reduce(
      (accumulator, event) => {
        const point = event.points.find((candidate) => candidate.key === dcrMetric);
        if (point) accumulator[point.state] += 1;
        return accumulator;
      },
      { usable: 0, review: 0, missing: 0 } as Record<DcrBatchPointStateV1, number>,
    );
    return (
      <>
        <section className="product-page-header">
          <div>
            <span className="product-eyebrow">DCR WORKBENCH</span>
            <h2>在同一协议下看脉冲电阻，而不是翻文件</h2>
            <p>默认显示 30 s。只要目标采样点存在就直接计算；采样和基线诊断作为附加提示展示。</p>
          </div>
          <div className="product-metric-switcher" role="group" aria-label="选择 DCR 时间点">
            {DCR_BATCH_STANDARD_POINT_SPECS_V1.map((spec) => (
              <button
                className={dcrMetric === spec.key ? 'is-active' : ''}
                key={spec.key}
                onClick={() => setDcrMetric(spec.key)}
                aria-pressed={dcrMetric === spec.key}
              >
                {spec.displayLabel}
              </button>
            ))}
          </div>
        </section>

        <section className="product-callout product-callout--information">
          <Info aria-hidden="true" />
          <div>
            <strong>这是协议相关的直流脉冲表观电阻</strong>
            <p>电阻按对应时刻的实际 ΔV/ΔI 计算。缺少目标采样点时不插值；其他质量指标放入详情诊断。</p>
          </div>
        </section>

        <section className="product-kpi-row" aria-label="DCR 批量摘要">
          <div><strong>{dcrModel.counts.datasetCount}</strong><span>已分析文件</span></div>
          <div><strong>{dcrModel.counts.eventCount}</strong><span>识别脉冲</span></div>
          <div><strong>{pointCounts.usable}</strong><span>直接结果</span></div>
          <div><strong>{pointCounts.review}</strong><span>结果含提示</span></div>
          <div><strong>{pointCounts.missing}</strong><span>目标点缺失</span></div>
        </section>

        <section className="product-section product-section--trend">
          <div className="product-section-heading product-section-heading--toolbar">
            <div>
              <span className="product-eyebrow">PREVIEW TREND</span>
              <h3>{selectedMetricSpec.displayLabel} DCR 预览趋势</h3>
            </div>
            <div className="product-filter-group" role="group" aria-label="筛选 DCR 结果">
              {([
                ['all', '全部'],
                ['usable', '直接结果'],
                ['review', '含提示'],
                ['missing', '缺失'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  className={dcrFilter === value ? 'is-active' : ''}
                  onClick={() => setDcrFilter(value)}
                  aria-pressed={dcrFilter === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <BatchTrendPlot
            points={dcrTrendPoints}
            ariaLabel={`${selectedMetricSpec.displayLabel} DCR 批量预览趋势`}
            xLabel="同一文件内的脉冲次序"
            yLabel="电阻 / Ω"
            formatX={(value) => `脉冲 ${Math.round(value)}`}
            formatY={formatResistance}
            selectedId={auditFocus?.eventKey ? `${auditFocus.eventKey}:${auditFocus.metricKey}` : null}
            onPointClick={(point) => {
              const [eventKey] = point.id.split(`:${dcrMetric}`);
              const event = dcrModel.events.find((candidate) => candidate.eventKey === eventKey);
              if (event) openDcrAudit(event);
            }}
            emptyMessage="此筛选下没有可显示的数值点。缺失点保留在下方表格中，未被插值或替换。"
          />
          {dcrModel.insights.map((insight) => (
            <p className={`product-insight product-insight--${insight.tone}`} key={insight.code}>{insight.message}</p>
          ))}
        </section>

        <section className="product-section">
          <div className="product-section-heading">
            <div>
              <span className="product-eyebrow">PULSE EVENTS</span>
              <h3>脉冲清单</h3>
            </div>
            <span>点击任一行查看原始曲线与审计原因</span>
          </div>
          <div className="product-table-wrap" role="region" aria-label="DCR 脉冲清单" tabIndex={0}>
            <table className="product-table">
              <thead><tr><th>文件</th><th>脉冲</th><th>{selectedMetricSpec.displayLabel}</th><th>状态</th><th>实际采样</th><th>原因</th></tr></thead>
              <tbody>
                {filteredDcrEvents.map((event, index) => {
                  const point = event.points.find((candidate) => candidate.key === dcrMetric);
                  if (!point) return null;
                  return (
                    <tr key={event.eventKey} onClick={() => openDcrAudit(event)} tabIndex={0} onKeyDown={(eventKey) => {
                      if (eventKey.key === 'Enter' || eventKey.key === ' ') {
                        eventKey.preventDefault();
                        openDcrAudit(event);
                      }
                    }}>
                      <td title={event.dataset.fileName}>{shortFileName(event.dataset.fileName)}</td>
                      <td>#{index + 1}</td>
                      <td className="product-table__number">{formatResistance(point.reportedResistanceOhm)}</td>
                      <td><span className={`product-state product-state--${point.state}`}>{pointStateLabel(point.state)}</span></td>
                      <td>{formatSeconds(point.actualElapsedFromTransitionS)}</td>
                      <td title={point.qcCodes.join(' · ')}>{point.qcCodes.length > 0 ? point.qcCodes.slice(0, 2).join(' · ') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  };

  const renderGittPage = () => {
    const gittEntries = entries.filter((entry) => entry.classification.analysisKind === 'gitt');
    if (gittEntries.length === 0) {
      return (
        <EmptyState
          title="还没有识别到 GITT 文件"
          detail="导入 Neware CFₓ / FGS GITT 文件后，软件会从同一份 NDAX 程序自动识别 1200 s 上限、1.5 V 截止和 4 h 静置。"
          action={(
            <button className="product-button product-button--primary" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
              <FilePlus2 aria-hidden="true" />导入 NDAX
            </button>
          )}
        />
      );
    }
    if (!selectedGittLiteratureProfile) {
      const selectedPlan = selectedGittDraftRecipePlan?.plan ?? null;
      return (
        <>
          <section className="product-page-header">
            <div>
              <span className="product-eyebrow">CFₓ / FGS LITERATURE GITT</span>
              <h2>确认用于计算的实验参数，再开始分析</h2>
              <p>软件会预填 NDAX 证据和材料默认值；你可以修改极片几何、活性质量、密度和摩尔质量。</p>
            </div>
          </section>
          {renderGittRecipeSetup()}
          {selectedPlan !== null && selectedPlan.readyToAnalyze && (
            <section className="product-loading" aria-live="polite">
              <LoaderCircle className="spinner" aria-hidden="true" />
              <div><strong>正在按已确认配方分析 GITT</strong><p>结果会保留 CFₓ/FGS 的模型受限比较边界。</p></div>
            </section>
          )}
        </>
      );
    }
    const { entry, program, profile } = selectedGittLiteratureProfile;
    const activeMassProvenance = entry.analysis?.cfxLiterature1200s?.activeMassProvenance
      ?? entry.analysis?.activeMassProvenance
      ?? null;
    const activeMassMg = activeMassProvenance?.activeMassG === null ||
      activeMassProvenance?.activeMassG === undefined
      ? null
      : activeMassProvenance.activeMassG * 1000;
    const resolvedGittSettings = entry.resolvedSettings;
    const singleFaceAreaCm2 = entry.analysis?.gittResults.find(
      (result) => result.singleFaceAreaCm2 !== null,
    )?.singleFaceAreaCm2 ?? resolvedGittSettings?.recipeElectrodeAreaCm2 ?? null;
    const programEventByPulseId = new Map(program.events.map((event) => [event.sourcePulseId, event]));
    const resultByPulseId = new Map(
      (entry.analysis?.gittResults ?? []).map((result) => [result.pulseId, result]),
    );
    const primaryProgram = program.events[0]?.program ?? null;
    const diagnosticProfilePulse = profile.pulses.find(
      (pulse) => pulse.sourcePulseId === selectedGittPulseId,
    ) ?? profile.pulses.find(
      (pulse) => pulse.eventClassification === 'complete_1200s_standard_rest',
    ) ?? profile.pulses[0] ?? null;
    const diagnosticResult = diagnosticProfilePulse === null
      ? null
      : entry.analysis?.gittResults.find(
        (result) => result.pulseId === diagnosticProfilePulse.sourcePulseId,
      ) ?? null;
    const diagnosticPlotModel = diagnosticResult === null
      ? null
      : buildGittPulsePlotModelV1(entry.loaded.canonical.rows, diagnosticResult);
    const visibleProfilePulses = profile.pulses.filter((pulse) => {
      if (gittEventFilter === 'main') {
        return pulse.eventClassification === 'complete_1200s_standard_rest';
      }
      if (gittEventFilter === 'cutoff') return pulse.eventClassification === 'excluded_cutoff_early';
      if (gittEventFilter === 'rest') {
        const event = programEventByPulseId.get(pulse.sourcePulseId) ?? null;
        return event !== null && event.postRestState !== 'completed_standard_rest';
      }
      return true;
    });
    return (
      <>
        <section className="product-page-header">
          <div>
            <span className="product-eyebrow">CFₓ / FGS LITERATURE GITT</span>
            <h2>导入文件、确认参数，直接得到手算法结果与论文图</h2>
            <p>软件自动读取脉冲、截止和静置工步；主值按端点公式计算，√t 回归只作为辅助图。</p>
          </div>
          <label className="product-select-field">
            <span>当前文件</span>
            <select value={entry.loaded.id} onChange={(event) => {
              setSelectedId(event.target.value);
              setSelectedGittPulseId(null);
              setAuditFocus(null);
              setAuditOpen(false);
            }}>
              {gittEntries.map((candidate) => <option key={candidate.loaded.id} value={candidate.loaded.id}>{candidate.loaded.fileName}</option>)}
            </select>
          </label>
        </section>

        <section className={`product-protocol-verdict ${program.programRecognized ? 'product-protocol-verdict--ready' : 'product-protocol-verdict--failed'}`}>
          <FlaskConical aria-hidden="true" />
          <div>
            <span className="product-eyebrow">AUTO-READ PROGRAM</span>
            <h3>{program.programRecognized ? profile.headline : '未能从该文件确认 CFₓ 1200 s 程序语义'}</h3>
            <p>{program.programRecognized
              ? '达到时间上限并完成标准静置的脉冲直接进入主结果；触及 1.5 V 后提前结束的工步单独标记，不混入 1200 s 序列。'
              : '该文件仍可查看原始曲线，但在工步语义确认前不会自动生成 1200 s 结果序列。'}</p>
          </div>
        </section>

        <section className="product-kpi-row" aria-label="CFx 文献 GITT 摘要">
          <div><strong>{program.summary.mainComparativeSequenceCount}</strong><span>完整 1200 s 主序列</span></div>
          <div><strong>{program.summary.stopVoltageTerminatedCount}</strong><span>首次 1.5 V 截止脉冲</span></div>
          <div><strong>{program.summary.excludedAfterFirstCutoffCount}</strong><span>截止后已排除脉冲</span></div>
          <div><strong>{formatScientific(profile.summary.medianDAppCandidateCm2PerS)}</strong><span>中位 WH 手算法结果 / cm²·s⁻¹</span></div>
          <div><strong>{formatPotential(profile.summary.medianAbsolutePulseEndPolarizationV)}</strong><span>中位末端极化绝对值</span></div>
        </section>

        <section className="product-section product-section--two-column">
          <div>
            <div className="product-section-heading">
              <div><span className="product-eyebrow">FULL GITT PROFILE</span><h3>完整电压–时间曲线</h3></div>
              <span>已分析的 CFₓ / FGS 文件叠加</span>
            </div>
            <BatchTrendPlot
              points={gittOverviewPoints}
              ariaLabel="已分析 GITT 文件的完整电压时间曲线"
              xLabel="Time / min"
              yLabel="Voltage / V"
              formatX={(value) => `${formatNumber(value, 5)} min`}
              formatY={(value) => `${formatNumber(value, 5)} V`}
              minimumX={0}
              showMarkers={false}
              emptyMessage="没有可绘制的完整 GITT 电压时间记录。"
            />
            <p className="product-insight product-insight--information">总览图只复现原始电压轨迹；材料、质量与几何是否可比较仍以右侧参数和 Manifest 为准。</p>
          </div>
          <aside className="product-assumption-panel">
            <span className="product-eyebrow">AUDITED ANALYSIS INPUTS</span>
            <h3>程序自动读取，物理参数按确认值计算</h3>
            <dl>
              <div><dt>活性质量</dt><dd>{activeMassMg === null ? '文件中未提供' : `${formatNumber(activeMassMg, 6)} mg`}</dd></div>
              <div><dt>质量依据</dt><dd>{activeMassProvenance?.sourceId ?? '未提供'}</dd></div>
              <div><dt>极片单面面积</dt><dd>{singleFaceAreaCm2 === null ? '未提供' : `${formatNumber(singleFaceAreaCm2, 6)} cm²`}</dd></div>
              <div><dt>几何输入方式</dt><dd>{resolvedGittSettings?.recipeGeometryInputMode === 'area' ? '直接面积' : '圆片直径'}</dd></div>
              <div><dt>材料密度</dt><dd>{resolvedGittSettings?.material.densityGPerCm3 === null || resolvedGittSettings?.material.densityGPerCm3 === undefined ? '未提供' : `${formatNumber(resolvedGittSettings.material.densityGPerCm3, 6)} g/cm³`}</dd></div>
              <div><dt>材料摩尔质量</dt><dd>{resolvedGittSettings?.material.molarMassGPerMol === undefined ? '未提供' : `${formatNumber(resolvedGittSettings.material.molarMassGPerMol, 6)} g/mol`}</dd></div>
              <div><dt>脉冲上限</dt><dd>{formatSeconds(primaryProgram?.plannedPulseDurationS)}</dd></div>
              <div><dt>电压截止</dt><dd>{primaryProgram?.stopVoltageV === null || primaryProgram?.stopVoltageV === undefined ? '未读取到' : `${formatNumber(primaryProgram.stopVoltageV, 4)} V`}</dd></div>
              <div><dt>后静置</dt><dd>{formatSeconds(primaryProgram?.plannedPostRestDurationS)}</dd></div>
              <div><dt>等效比电流</dt><dd>{formatNumber(profile.summary.medianEquivalentSpecificCurrentMahPerG)} mA/g</dd></div>
            </dl>
            <p>工步时间来自导入文件；质量、几何和材料参数使用已确认值。摩尔体积由 Vₘ=M/ρ 派生时，nₘVₘ 等价于 m/ρ。</p>
          </aside>
        </section>

        <section className="product-callout product-callout--information">
          <Info aria-hidden="true" />
          <div>
            <strong>当前主算法与手算表一致</strong>
            <p>D = 4/(πτ) × (nₘVₘ/S)² × (ΔEs/ΔEₜ)²；ΔEₜ使用首个正时间负载采样点到脉冲末端。序列在首次程序确认的约 1.5 V 截止脉冲及其后静置处结束，后续循环全部排除。</p>
          </div>
        </section>

        {diagnosticProfilePulse !== null && diagnosticResult !== null && diagnosticPlotModel !== null ? (
          <GittLiteratureDiagnostics
            model={diagnosticPlotModel}
            result={diagnosticResult}
            pulseOrder={diagnosticProfilePulse.sourceOrder}
            sourceLabel={entry.loaded.fileName}
            onOpenAudit={() => {
              setSelectedId(entry.loaded.id);
              setAuditFocus({ pulseId: diagnosticProfilePulse.sourcePulseId });
              setAuditOpen(true);
            }}
          />
        ) : (
          <section className="product-callout product-callout--danger">
            <AlertTriangle aria-hidden="true" />
            <div>
              <strong>当前脉冲没有可复现的过程图</strong>
              <p>软件未能把该结果重新定位到原始 Pulse 工步，或生产分析没有留下拟合收据。该脉冲不会生成推测性的回归图。</p>
            </div>
          </section>
        )}

        <section className="product-section">
          <div className="product-section-heading">
            <div><span className="product-eyebrow">WH RESULT — VOLTAGE</span><h3>WH 手算法结果–静置末端电压</h3></div>
            <span>纵轴 log₁₀；横轴按高电压到低电压排列</span>
          </div>
          <BatchTrendPlot
            points={gittVoltageMetricPoints}
            ariaLabel="CFx 与 FGS 的 WH 手算法结果对静置末端电压图"
            xLabel="Epost / V"
            yLabel="WH result / cm²·s⁻¹"
            yScale="log10"
            reverseX
            markerColorMode="series"
            selectedId={diagnosticProfilePulse?.sourcePulseId ?? null}
            formatX={(value) => `${formatNumber(value, 5)} V`}
            formatY={(value) => value.toExponential(2)}
            onPointClick={(point) => {
              const owner = gittLiteratureProfiles.find(({ profile: candidateProfile }) =>
                candidateProfile.pulses.some((pulse) => pulse.sourcePulseId === point.id),
              );
              if (owner) selectGittDiagnostic(owner.entry.loaded.id, point.id);
            }}
            emptyMessage="当前已分析文件中没有达到完整 1200 s 主序列且可计算的 WH 手算法结果。"
          />
          <p className="product-insight product-insight--information">点击数据点可切换上方单脉冲图。CFₓ结果按同一公式完整输出，但名称保持“表观比较结果”，不宣称为本征固相扩散系数。</p>
        </section>

        <section className="product-section">
          <div className="product-section-heading product-section-heading--toolbar">
            <div><span className="product-eyebrow">EXECUTED EVENTS</span><h3>逐脉冲文件适配结果</h3></div>
            <div className="product-filter-group" role="group" aria-label="筛选 CFx GITT 工步事件">
              {([
                ['main', `主序列 ${program.summary.mainComparativeSequenceCount}`],
                ['cutoff', `截止早停 ${program.summary.stopVoltageTerminatedCount}`],
                ['rest', `静置截断 ${program.summary.noncompletedRestCount}`],
                ['all', `全部 ${profile.pulses.length}`],
              ] as const).map(([filter, label]) => (
                <button
                  key={filter}
                  className={gittEventFilter === filter ? 'is-active' : ''}
                  onClick={() => setGittEventFilter(filter)}
                  aria-pressed={gittEventFilter === filter}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="product-table-wrap" role="region" aria-label="CFx GITT 脉冲适配结果" tabIndex={0}>
            <table className="product-table">
              <thead><tr><th>脉冲</th><th>实际时长</th><th>工步结束原因</th><th>后静置</th><th>序列归属</th><th>WH 手算法结果</th><th>|ΔEₜ|</th><th>辅助拟合 R²</th></tr></thead>
              <tbody>
                {visibleProfilePulses.map((pulse) => {
                  const programEvent = programEventByPulseId.get(pulse.sourcePulseId) ?? null;
                  const result = resultByPulseId.get(pulse.sourcePulseId) ?? null;
                  return (
                  <tr
                    key={pulse.sourcePulseId}
                    className={diagnosticProfilePulse?.sourcePulseId === pulse.sourcePulseId ? 'is-selected' : ''}
                    aria-selected={diagnosticProfilePulse?.sourcePulseId === pulse.sourcePulseId}
                    onClick={() => selectGittDiagnostic(entry.loaded.id, pulse.sourcePulseId)}
                    tabIndex={0}
                    onKeyDown={(eventKey) => {
                    if (eventKey.key === 'Enter' || eventKey.key === ' ') {
                      eventKey.preventDefault();
                      selectGittDiagnostic(entry.loaded.id, pulse.sourcePulseId);
                    }
                  }}>
                    <td>#{pulse.sourceOrder}</td>
                    <td>{formatSeconds(programEvent?.actualPulseDurationS ?? null)}</td>
                    <td>{newareTerminationLabel(programEvent?.termination)}</td>
                    <td>{newareRestLabel(programEvent?.postRestState)}</td>
                    <td><span className={`product-state product-state--${cfxGittEventTone(pulse.eventClassification)}`}>{cfxGittEventLabel(pulse.eventClassification)}</span></td>
                    <td className="product-table__number">{formatScientific(pulse.transportComparison.dAppCandidateCm2PerS)}</td>
                    <td>{formatPotential(pulse.polarization.absolutePulseEndPolarizationV)}</td>
                    <td>{result?.fitDiagnostics.rSquared === null || result?.fitDiagnostics.rSquared === undefined ? '—' : result.fitDiagnostics.rSquared.toFixed(5)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  };

  const renderReportPage = () => {
    const hasAnyResult = entries.some((entry) => entry.analysis !== null);
    return (
      <>
        <section className="product-page-header">
          <div>
            <span className="product-eyebrow">REPORT & EXPORT</span>
            <h2>先导出结论，再附上审计证据</h2>
            <p>项目汇总把 DCR 工作台与 CFₓ 1200 s 文献口径 GITT 分开保存；单文件审计附件仍可从详情抽屉导出。</p>
          </div>
          <button className="product-button product-button--primary" onClick={() => void exportProjectWorkbook()} disabled={!hasAnyResult || isBusy || analysisPending || settingsPending || gittRecipePending}>
            {busyAction === 'export-project' ? <LoaderCircle className="spinner" aria-hidden="true" /> : <Download aria-hidden="true" />}
            导出项目 XLSX
          </button>
        </section>
        {analysisPending && (
          <section className="product-callout product-callout--information"><LoaderCircle className="spinner" aria-hidden="true" /><div><strong>正在等待 {pendingCount} 个文件完成分析</strong><p>为了避免把半批数据导出为完整报告，项目汇总导出暂时锁定。</p></div></section>
        )}
        {!analysisPending && gittRecipePending && (
          <section className="product-callout product-callout--caution"><AlertTriangle aria-hidden="true" /><div><strong>GITT 参数尚未确认</strong><p>请回到“项目数据”，确认极片几何和文件中存在冲突的实验事实后再导出完整项目报告。</p></div></section>
        )}
        <section className="product-report-grid">
          <article>
            <span className="product-eyebrow">DCR REPORT</span>
            <h3>{dcrModel.counts.eventCount} 个脉冲事件</h3>
            <p>包含首采样、5 s、10 s、30 s 的直接计算值、实际采样时间和诊断提示。</p>
          </article>
          <article>
            <span className="product-eyebrow">GITT REPORT</span>
            <h3>{gittLiteratureProfiles.reduce((sum, item) => sum + item.profile.summary.submittedPulseCount, 0)} 个已执行脉冲</h3>
            <p>CFₓ 部分导出 1200 s 主序列、1.5 V 截止早停、静置完成度、端点手算法结果和辅助拟合参数。</p>
          </article>
          <article>
            <span className="product-eyebrow">AUDIT ATTACHMENT</span>
            <h3>逐文件可复算</h3>
            <p>在右侧“详情 / 审计”中导出单文件 CSV、XLSX 或 Manifest，其中包含完整哈希和版本。</p>
          </article>
        </section>
        <section className="product-support-note">
          <ShieldCheck aria-hidden="true" />
          <p><strong>报告边界：</strong>DCR 仅描述给定协议和时间点下的表观脉冲电阻；CFₓ GITT 仅作模型受限的协议诊断和同条件比较，不以数值精度暗示物理模型已经被证明。</p>
        </section>
      </>
    );
  };

  return (
    <div className="product-shell">
      <a className="skip-link" href="#product-workspace">跳到主工作区</a>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {operationStatus || (analysisPending ? `正在分析 ${pendingCount} 个数据文件。` : '')}
      </div>
      <header className="product-topbar">
        <button className="product-brand" onClick={() => selectPage('data')} aria-label="前往项目数据">
          <span className="product-brand__mark" aria-hidden="true"><Activity /></span>
          <span><strong>PulseLab GITT DCR</strong><small>CFₓ 科学分析工作台</small></span>
        </button>
        <nav className="product-navigation" aria-label="主导航">
          {(['data', 'dcr', 'gitt', 'report'] as const).map((item) => {
            const icon = item === 'data' ? <Database aria-hidden="true" /> : item === 'dcr' ? <Gauge aria-hidden="true" /> : item === 'gitt' ? <Microscope aria-hidden="true" /> : <Download aria-hidden="true" />;
            return (
              <button key={item} className={page === item ? 'is-active' : ''} onClick={() => selectPage(item)} aria-current={page === item ? 'page' : undefined}>
                {icon}{PAGE_COPY[item].label}
              </button>
            );
          })}
        </nav>
        <div className="product-topbar__actions">
          <input ref={fileInputRef} className="sr-only" type="file" accept=".ndax" multiple disabled={isBusy} tabIndex={-1} onChange={(event) => void importFiles(event.target.files)} />
          <input ref={projectInputRef} className="sr-only" type="file" accept=".json,.gittdcr" disabled={isBusy} tabIndex={-1} onChange={(event) => void openProject(event.target.files)} />
          <button className="product-icon-button" onClick={() => projectInputRef.current?.click()} aria-label="打开项目" title="打开项目" disabled={isBusy}><FolderOpen aria-hidden="true" /></button>
          <button className="product-icon-button" onClick={() => void saveProject()} aria-label="保存项目" title="保存项目" disabled={datasets.length === 0 || isBusy}><Save aria-hidden="true" /></button>
          <button className="product-button product-button--primary" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
            {busyAction === 'import' ? <LoaderCircle className="spinner" aria-hidden="true" /> : <FilePlus2 aria-hidden="true" />}
            {busyAction === 'import' ? '正在导入' : '导入数据'}
          </button>
        </div>
      </header>

      {isBusy && <div className="product-operation-bar"><LoaderCircle className="spinner" aria-hidden="true" /><span>{operationStatus || '正在处理…'}</span></div>}
      {notice && <div className="product-notice" role="status"><Info aria-hidden="true" /><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="关闭通知"><X aria-hidden="true" /></button></div>}

      <main className="product-main" id="product-workspace" aria-busy={isBusy || analysisPending || settingsPending}>
        <div className="product-page-context"><span>{PAGE_COPY[page].label}</span><p>{PAGE_COPY[page].description}</p></div>
        {page === 'data' && renderDataPage()}
        {page === 'dcr' && renderDcrPage()}
        {page === 'gitt' && renderGittPage()}
        {page === 'report' && renderReportPage()}
      </main>

      {auditOpen && selectedEntry && (
        <aside className="product-audit-drawer" aria-label="详情与审计">
          <div className="product-audit-drawer__header">
            <div><span className="product-eyebrow">DETAIL & AUDIT</span><h2>{shortFileName(selectedEntry.loaded.fileName, 38)}</h2></div>
            <button className="product-icon-button" onClick={() => { setAuditOpen(false); setAuditFocus(null); }} aria-label="关闭详情"><X aria-hidden="true" /></button>
          </div>
          {selectedEntry.pending ? (
            <div className="product-loading product-loading--drawer"><LoaderCircle className="spinner" aria-hidden="true" /><p>正在生成该文件的科学结果…</p></div>
          ) : selectedEntry.error ? (
            <section className="product-callout product-callout--danger"><AlertTriangle aria-hidden="true" /><div><strong>分析没有完成</strong><p>{selectedEntry.error}</p></div></section>
          ) : selectedEntry.analysis ? (
            <>
              <section className="product-audit-summary">
                <StatusBadge kind="approval" value={selectedEntry.classification.independentQualificationState} />
                <StatusBadge kind="approval" value="provisional" />
                <p>{selectedEntry.classification.analysisKind === 'dcr' ? 'DCR 按目标采样点直接计算；诊断信息不替代原始数值。' : 'CFₓ 按端点手算法直接输出；高级诊断不拦截可计算结果。'}</p>
              </section>

              {focusedDcrPoint && (
                <section className="product-audit-focus">
                  <span className="product-eyebrow">SELECTED DCR POINT</span>
                  <h3>{focusedDcrPoint.displayLabel} · {formatResistance(focusedDcrPoint.reportedResistanceOhm)}</h3>
                  <dl>
                    <div><dt>产品状态</dt><dd>{pointStateLabel(focusedDcrPoint.state)}</dd></div>
                    <div><dt>科学 calculation</dt><dd>{focusedDcrPoint.calculationState ?? '—'}</dd></div>
                    <div><dt>诊断</dt><dd>{focusedDcrPoint.qcStatus ?? '—'}</dd></div>
                    <div><dt>实际采样</dt><dd>{formatSeconds(focusedDcrPoint.actualElapsedFromTransitionS)}</dd></div>
                  </dl>
                  {focusedDcrPoint.qcCodes.length > 0 && <code>{focusedDcrPoint.qcCodes.join(' · ')}</code>}
                </section>
              )}

              {focusedGittResult && (
                <section className="product-audit-focus">
                  <span className="product-eyebrow">SELECTED GITT PULSE</span>
                  <h3>脉冲 / Qref：{formatPercent(focusedGittResult.pulseCapacityFraction)}</h3>
                  <dl>
                    <div><dt>脉冲时长</dt><dd>{formatSeconds(focusedGittResult.pulseDurationS)}</dd></div>
                    <div><dt>文件结束原因</dt><dd>{newareTerminationLabel(focusedGittLiteratureEvent?.programEvent?.termination)}</dd></div>
                    <div><dt>后静置</dt><dd>{newareRestLabel(focusedGittLiteratureEvent?.programEvent?.postRestState)}</dd></div>
                    <div><dt>CFₓ 序列归属</dt><dd>{focusedGittLiteratureEvent?.profilePulse ? cfxGittEventLabel(focusedGittLiteratureEvent.profilePulse.eventClassification) : '—'}</dd></div>
                    <div><dt>WH 手算法结果</dt><dd>{formatScientific(focusedGittResult.metricValueCm2PerS)}</dd></div>
                    <div><dt>ΔEₜ</dt><dd>{formatPotential(focusedGittResult.deltaEtV)}</dd></div>
                    <div><dt>ΔEs</dt><dd>{formatPotential(focusedGittResult.deltaEsV)}</dd></div>
                    <div><dt>辅助拟合 R²</dt><dd>{focusedGittResult.fitDiagnostics.rSquared?.toFixed(5) ?? '—'}</dd></div>
                    <div><dt>模型适用性</dt><dd>{focusedGittResult.modelApplicability}</dd></div>
                    <div><dt>解释范围</dt><dd>{focusedGittResult.interpretationScope}</dd></div>
                    <div><dt>诊断状态</dt><dd>{focusedGittResult.qcStatus ?? '—'}</dd></div>
                  </dl>
                  {focusedGittResult.qcCodes.length > 0 && <code>{focusedGittResult.qcCodes.join(' · ')}</code>}
                </section>
              )}

              <section className="product-audit-trace">
                <div className="product-section-heading"><div><span className="product-eyebrow">RAW TRACE</span><h3>原始电压与电流</h3></div><span>{selectedEntry.loaded.canonical.rows.length.toLocaleString('zh-CN')} 条记录</span></div>
                <TimelinePlot rows={selectedEntry.loaded.canonical.rows} />
              </section>

              <details className="product-audit-details">
                <summary>查看全部计算结果与高级诊断</summary>
                {selectedEntry.classification.analysisKind === 'dcr' && <label className="product-check"><input type="checkbox" checked={showAuditCandidates} onChange={(event) => setShowAuditCandidates(event.target.checked)} />显示无法正式报告的诊断候选值</label>}
                <ResultsTable dcrResults={selectedEntry.analysis.dcrResults} gittResults={selectedEntry.analysis.gittResults} showAuditCandidates={showAuditCandidates} />
              </details>

              <details className="product-audit-details">
                <summary>来源、哈希与版本</summary>
                <dl className="product-provenance-list">
                  <div><dt>Source</dt><dd title={selectedEntry.loaded.canonical.sourceFileHash}>{shortHash(selectedEntry.loaded.canonical.sourceFileHash)}</dd></div>
                  <div><dt>Canonical</dt><dd title={selectedEntry.loaded.canonical.canonicalDatasetHash}>{shortHash(selectedEntry.loaded.canonical.canonicalDatasetHash)}</dd></div>
                  <div><dt>Config</dt><dd title={selectedEntry.analysis.configHash}>{shortHash(selectedEntry.analysis.configHash)}</dd></div>
                  <div><dt>Result</dt><dd title={selectedEntry.analysis.resultHash}>{shortHash(selectedEntry.analysis.resultHash)}</dd></div>
                  <div><dt>Algorithm</dt><dd>{selectedEntry.analysis.versions.algorithmId} {selectedEntry.analysis.versions.algorithmVersion}</dd></div>
                  <div><dt>Diagnostic policy</dt><dd>{selectedEntry.analysis.versions.qcPolicyId}</dd></div>
                </dl>
              </details>
              <div className="product-audit-actions">
                <button className="product-button product-button--secondary" onClick={() => void exportSelectedCsv()} disabled={isBusy}><Download aria-hidden="true" />CSV</button>
                <button className="product-button product-button--secondary" onClick={() => void exportSelectedXlsx()} disabled={isBusy}><Download aria-hidden="true" />XLSX</button>
                <button className="product-button product-button--secondary" onClick={() => void exportManifest()} disabled={isBusy}><Hash aria-hidden="true" />Manifest</button>
              </div>
            </>
          ) : (
            <section className="product-callout product-callout--information"><Info aria-hidden="true" /><div><strong>尚无科学结果</strong><p>当前文件尚未匹配到已支持的协议，或分析尚未请求。</p></div></section>
          )}
        </aside>
      )}
    </div>
  );
}

export default App;
