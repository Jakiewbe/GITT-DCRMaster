import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart2, Shield } from 'lucide-react';
import FileUploader from './components/FileUploader';
import ParameterPanel from './components/ParameterPanel';
import GittCalculator from './components/GittCalculator';
import DcrCalculator from './components/DcrCalculator';
import DataCharts from './components/DataCharts';
import { groupDataIntoSteps, solveGitt } from './utils/gittSolver';
import { solveDcr } from './utils/dcrSolver';
import { formatCurrentValue, normalizeAnalysisData, summarizeAnalysisData } from './utils/analysisData';
import { standardizeDataWithMeta } from './utils/fileParser';

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) {
    return '-';
  }

  if (seconds < 60) {
    return `${seconds.toFixed(0)} s`;
  }

  if (seconds < 3600) {
    return `${(seconds / 60).toFixed(1)} min`;
  }

  return `${(seconds / 3600).toFixed(2)} h`;
};

const COLOR_PALETTE = [
  '#10b981', // Emerald
  '#38bdf8', // Sky Blue
  '#f59e0b', // Amber / Orange
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#3b82f6', // Indigo
  '#ef4444'  // Red
];

function App() {
  const [activeMode, setActiveMode] = useState('gitt'); // 'gitt' or 'dcr'
  
  // Multi-file states
  const [filesList, setFilesList] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  
  // Default Physical parameters state (used as base for new files)
  const [defaultParams, setDefaultParams] = useState({
    mass: 0.0012,           // g (default 1.2 mg)
    area: 1.13,            // cm2 (default 12mm disc)
    molarMass: 31.01,      // g/mol (default CF1)
    density: 2.70,         // g/cm3 (default CF1)
    molarVolume: 11.48,    // cm3/mol (default CF1)
    particleRadius: 1.5,   // um (default active particle radius)
    physicalThickness: 50.0 // um (default physical thickness)
  });

  // Solver options
  const [options, setOptions] = useState({
    cutoffVoltage: 1.5,
    useIrCorrection: false,
    irCorrectionTime: 1.0,
    currentUnit: 'mA',
    dcrTimeOffsets: [0.1, 1.0, 3.0, 5.0, 10.0],
    gittModel: 'planar',
    gittMethod: 'regression',
    gittFitDelay: 1,
    gittXAxisVoltage: 'median',
    gittYAxisInverted: true,
    timeUnitMode: 'auto',
    characteristicLengthMode: 'dense',
    gittMultiplier: '4/pi'
  });

  const activeFile = useMemo(() => {
    return filesList.find(f => f.id === activeFileId) || null;
  }, [filesList, activeFileId]);

  const activeParams = useMemo(() => {
    return activeFile ? activeFile.params : defaultParams;
  }, [activeFile, defaultParams]);

  const handleParamsChange = (newParams) => {
    if (activeFileId) {
      setFilesList(prev => prev.map(f => f.id === activeFileId ? { ...f, params: newParams } : f));
    } else {
      setDefaultParams(newParams);
    }
  };

  const solvedFilesList = useMemo(() => {
    return filesList.map((file) => {
      const rawRows = file.rawData.map(r => r.raw);
      const { rows: standardizedRaw, timeMeta } = standardizeDataWithMeta(rawRows, file.mapping, options.timeUnitMode);
      const normalized = normalizeAnalysisData(standardizedRaw, file.nativeCurrentUnit || 'mA');
      const groupedSteps = groupDataIntoSteps(normalized);

      let solvedGitt = null;
      let solvedDcr = null;
      let analysisError = '';

      try {
        solvedGitt = solveGitt(groupedSteps, file.params, options);
        solvedDcr = solveDcr(groupedSteps, options);
      } catch (error) {
        console.error(`计算失败 (${file.fileName}):`, error);
        analysisError = error.message || '分析失败，请检查导入数据和参数设置。';
      }

      return {
        ...file,
        normalizedData: normalized,
        groupedSteps,
        timeMeta,
        solvedGitt,
        solvedDcr,
        analysisError
      };
    });
  }, [filesList, options]);

  const activeSolvedFile = useMemo(() => {
    return solvedFilesList.find(f => f.id === activeFileId) || null;
  }, [solvedFilesList, activeFileId]);

  const activeSummary = useMemo(() => {
    if (!activeSolvedFile) return null;
    return summarizeAnalysisData(activeSolvedFile.normalizedData, activeSolvedFile.groupedSteps);
  }, [activeSolvedFile]);

  const handleDataLoaded = (data) => {
    if (!data) {
      setFilesList([]);
      setActiveFileId(null);
      return;
    }

    const { fileName, rawData, mapping, allHeaders, importMeta, suggestedOptions } = data;
    const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const initialMass = suggestedOptions?.mass !== undefined ? suggestedOptions.mass : defaultParams.mass;
    const initialParams = {
      ...defaultParams,
      mass: initialMass
    };

    const newColor = COLOR_PALETTE[filesList.length % COLOR_PALETTE.length];

    const newFile = {
      id: fileId,
      fileName,
      rawData,
      mapping,
      allHeaders,
      importMeta,
      params: initialParams,
      color: newColor,
      visible: true,
      nativeCurrentUnit: suggestedOptions?.currentUnit || 'mA'
    };

    setFilesList((prev) => [...prev, newFile]);
    setActiveFileId(fileId);

    setOptions((prev) => {
      const nextOpts = { ...prev };
      if (suggestedOptions?.currentUnit) {
        nextOpts.currentUnit = suggestedOptions.currentUnit;
      }
      if (suggestedOptions?.cutoffVoltage !== undefined) {
        nextOpts.cutoffVoltage = suggestedOptions.cutoffVoltage;
      }
      return nextOpts;
    });
  };

  const handleSelectActiveFile = (id) => {
    setActiveFileId(id);
  };

  const handleToggleFileVisible = (id) => {
    setFilesList(prev => prev.map(f => f.id === id ? { ...f, visible: !f.visible } : f));
  };

  const handleDeleteFile = (id) => {
    setFilesList(prev => {
      const filtered = prev.filter(f => f.id !== id);
      if (activeFileId === id) {
        setActiveFileId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  };

  return (
    <>
      <header>
        <div className="header-container">
          <div className="logo-section">
            <Activity className="logo-icon" size={26} />
            <div className="logo-text">
              <h1>CFₓ GITT & DCR 电池数据分析平台</h1>
              <p>氟化碳材料电化学扩散系数与直流脉冲内阻分析平台</p>
            </div>
          </div>
          
          <div className="mode-switcher">
            <button 
              className={`mode-btn ${activeMode === 'gitt' ? 'active' : ''}`}
              onClick={() => setActiveMode('gitt')}
            >
              GITT D_Li⁺ 扩散系数分析
            </button>
            <button 
              className={`mode-btn ${activeMode === 'dcr' ? 'active' : ''}`}
              onClick={() => setActiveMode('dcr')}
            >
              DCR 脉冲阻抗分析
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="dashboard-grid">
          {/* Left panel: configurations and uploads */}
          <div className="sidebar">
            <FileUploader 
              onDataLoaded={handleDataLoaded} 
              activeMode={activeMode}
              filesList={filesList}
              activeFileId={activeFileId}
              onSelectActive={handleSelectActiveFile}
              onToggleVisible={handleToggleFileVisible}
              onDeleteFile={handleDeleteFile}
            />
            
            <ParameterPanel 
              activeMode={activeMode}
              params={activeParams}
              onParamsChange={handleParamsChange}
              options={options}
              onOptionsChange={setOptions}
            />
          </div>

          {/* Right panel: visualizations and reports */}
          <div className="main-panel">
            {filesList.length > 0 ? (
              <>
                {activeSummary && (
                  <div className="card analysis-summary">
                    <div className="card-title">当前激活文件摘要 ({activeSolvedFile?.fileName})</div>
                    <div className="summary-grid">
                      <div className="summary-item">
                        <span>数据行</span>
                        <strong>{activeSummary.rowCount.toLocaleString()}</strong>
                      </div>
                      <div className="summary-item">
                        <span>识别工步</span>
                        <strong>{activeSummary.stepCount}</strong>
                      </div>
                      <div className="summary-item">
                        <span>测试时长</span>
                        <strong>{formatDuration(activeSummary.durationSeconds)}</strong>
                      </div>
                      <div className="summary-item">
                        <span>电压范围</span>
                        <strong>
                          {activeSummary.voltageMin?.toFixed(3)} - {activeSummary.voltageMax?.toFixed(3)} V
                        </strong>
                      </div>
                      <div className="summary-item">
                        <span>峰值电流</span>
                        <strong>{formatCurrentValue(activeSummary.peakCurrentAmp, options.currentUnit, options.currentUnit === 'mA' ? 1 : 4)}</strong>
                      </div>
                      <div className="summary-item">
                        <span>导入信息</span>
                        <strong>
                          {[activeSolvedFile?.importMeta?.encoding, activeSolvedFile?.importMeta?.delimiter].filter(Boolean).join(' / ') || '标准输入'}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {activeSolvedFile?.analysisError && (
                  <div className="status-msg error app-alert">
                    <AlertTriangle size={16} style={{ color: 'var(--color-danger)' }} />
                    <span>{activeSolvedFile.analysisError}</span>
                  </div>
                )}

                <DataCharts 
                  activeMode={activeMode}
                  solvedFilesList={solvedFilesList}
                  activeFileId={activeFileId}
                  options={options}
                />
                
                {activeMode === 'gitt' ? (
                  <GittCalculator
                    solvedData={activeSolvedFile?.solvedGitt}
                    solvedFilesList={solvedFilesList}
                    activeFileId={activeFileId}
                    currentUnit={options.currentUnit}
                    options={options}
                  />
                ) : (
                  <DcrCalculator solvedData={activeSolvedFile?.solvedDcr} currentUnit={options.currentUnit} />
                )}
              </>
            ) : (
              <div className="dashboard-empty animate-fade-in">
                <BarChart2 size={64} className="dashboard-empty-icon" />
                <h3>开始您的电化学动力学解析</h3>
                <p style={{ maxWidth: '550px', fontSize: '0.875rem' }}>
                  请在左侧上传 GITT 或 DCR 测试导出的 CSV、Excel 或 TXT 文件，
                  系统将全自动识别测试工步并根据您的材料参数计算锂离子扩散系数及内阻特征曲线。
                </p>
                <div className="info-banner" style={{ marginTop: '1.5rem', textAlign: 'left', display: 'inline-flex' }}>
                  <div>
                    <strong>💡 数据格式小建议：</strong><br />
                    • CSV 或 Excel 中只需包含：累计时间、电压和电流通道即可。<br />
                    • 系统会自动识别工步，即使文件没有工步号，我们也将根据电流跳变智能切分！
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
          <Shield size={14} style={{ color: 'var(--color-primary-light)' }} />
          <span>Advanced Electrochemistry Kinetics Analysis Suite (CFₓ Specialized Edition v1.0)</span>
        </div>
        <p style={{ marginTop: '0.25rem', opacity: 0.6 }}>
          基于 Weppner-Huggins 模型与经典欧姆内阻算法构建 • 完美适配 primary 氟化碳电池分析
        </p>
      </footer>
    </>
  );
}

export default App;
