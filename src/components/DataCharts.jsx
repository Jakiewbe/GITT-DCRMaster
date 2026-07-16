import { useMemo, useState } from 'react';
import { Line, Scatter } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Play, TrendingUp, Cpu } from 'lucide-react';
import { fitGittTransient } from '../utils/gittSolver';

ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const DataCharts = ({ activeMode, solvedFilesList, activeFileId, options }) => {
  const [xAxisType, setXAxisType] = useState('voltage'); // 'voltage' or 'soc'
  const [selectedPulseIndex, setSelectedPulseIndex] = useState(0);
  const [dcrSelectedOffset, setDcrSelectedOffset] = useState('end');

  // Identify currently active file
  const activeSolvedFile = useMemo(() => {
    return solvedFilesList?.find(f => f.id === activeFileId) || null;
  }, [solvedFilesList, activeFileId]);

  // Scan all visible curves to determine dynamic voltage bounds with 0.1V padding
  const voltageBounds = useMemo(() => {
    let minV = Number.POSITIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    let hasData = false;

    solvedFilesList?.forEach((file) => {
      if (file.visible === false) return;
      file.rawData?.forEach((row) => {
        if (typeof row.voltage === 'number') {
          if (row.voltage < minV) minV = row.voltage;
          if (row.voltage > maxV) maxV = row.voltage;
          hasData = true;
        }
      });
    });

    if (!hasData) {
      return { min: 1.5, max: 3.0 }; // standard fallback
    }

    return {
      min: Math.max(0, parseFloat((minV - 0.1).toFixed(2))),
      max: parseFloat((maxV + 0.1).toFixed(2))
    };
  }, [solvedFilesList]);

  // Detect whether the current dataset is a discharge test
  const isDischargeTest = useMemo(() => {
    if (!activeSolvedFile) return true;

    // Check GITT pulse steps first
    const gittResults = activeSolvedFile.solvedGitt?.results;
    if (gittResults && gittResults.length > 0) {
      return gittResults[0].current < 0;
    }

    // Check DCR results
    const dcrResults = activeSolvedFile.solvedDcr?.results;
    if (dcrResults && dcrResults.length > 0) {
      return dcrResults[0].avgCurrent < 0;
    }

    // Fallback to scanning raw data
    const nonZeroRow = activeSolvedFile.rawData?.find(r => Math.abs(r.current) > 1e-4);
    if (nonZeroRow) {
      return nonZeroRow.current < 0;
    }

    return true;
  }, [activeSolvedFile]);

  const rawData = activeSolvedFile?.rawData || null;
  const solvedGitt = activeSolvedFile?.solvedGitt || null;

  // Timeline chart data (overview of voltage and current)
  const timelineChartData = useMemo(() => {
    if (!rawData || rawData.length === 0) return { labels: [], datasets: [] };

    const targetPoints = 1500;
    const step = Math.max(1, Math.floor(rawData.length / targetPoints));
    const sampled = [];

    for (let i = 0; i < rawData.length; i += step) {
      sampled.push(rawData[i]);
    }

    if (sampled[sampled.length - 1]?.index !== rawData[rawData.length - 1].index) {
      sampled.push(rawData[rawData.length - 1]);
    }

    const timesInHours = sampled.map((datum) => datum.time / 3600);
    const voltages = sampled.map((datum) => datum.voltage);
    const currents = sampled.map((datum) => datum.current);

    return {
      labels: timesInHours,
      datasets: [
        {
          label: '电压 (Voltage)',
          data: voltages,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.1)',
          yAxisID: 'y-voltage',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.1
        },
        {
          label: '电流 (Current)',
          data: currents,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          yAxisID: 'y-current',
          borderWidth: 1,
          pointRadius: 0,
          tension: 0,
          borderDash: [2, 2]
        }
      ]
    };
  }, [rawData]);

  const timelineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    scales: {
      x: {
        title: {
          display: true,
          text: '时间 (Hours)',
          color: '#94a3b8'
        },
        grid: { color: 'rgba(56, 189, 248, 0.05)' },
        ticks: { 
          color: '#94a3b8',
          maxTicksLimit: 12
        }
      },
      'y-voltage': {
        type: 'linear',
        position: 'left',
        title: {
          display: true,
          text: '电压 (V)',
          color: '#38bdf8'
        },
        grid: { color: 'rgba(56, 189, 248, 0.05)' },
        ticks: { color: '#94a3b8' }
      },
      'y-current': {
        type: 'linear',
        position: 'right',
        title: {
          display: true,
          text: `电流 (${options.currentUnit})`,
          color: '#10b981'
        },
        grid: { drawOnChartArea: false },
        ticks: { color: '#94a3b8' }
      }
    },
    plugins: {
      legend: {
        labels: { color: '#f8fafc', font: { family: 'Inter' } }
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#f8fafc',
        bodyColor: '#f8fafc',
        borderColor: 'rgba(56, 189, 248, 0.2)',
        borderWidth: 1
      }
    }
  };

  // GITT diffusion coefficient comparison chart
  const gittChartData = useMemo(() => {
    if (!solvedFilesList || solvedFilesList.length === 0) return { datasets: [] };

    const xVoltsType = options.gittXAxisVoltage || 'median';
    const getXVal = (r) => {
      if (xAxisType !== 'voltage') return r.soc;
      if (xVoltsType === 'e1') return r.e1;
      if (xVoltsType === 'e2') return r.e2;
      if (xVoltsType === 'e0') return r.e0;
      return r.medianVoltage;
    };

    const datasets = solvedFilesList
      .filter((file) => file.visible !== false)
      .map((file) => {
        const fileGitt = file.solvedGitt;
        if (!fileGitt || !fileGitt.results) return null;

        const activeResults = fileGitt.results.filter((result) => !result.isExcluded && result.dLi !== null && result.dLi > 0);
        
        const sorted = [...activeResults].sort((a, b) => {
          return getXVal(a) - getXVal(b);
        });

        const dataPoints = sorted.map((result) => ({
          x: getXVal(result),
          y: Math.log10(result.dLi),
          meta: result
        }));

        return {
          label: `${file.fileName}`,
          data: dataPoints,
          borderColor: file.color,
          backgroundColor: file.color,
          showLine: true,
          fill: false,
          tension: 0.15,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#070a13',
          pointBorderColor: file.color,
          pointBorderWidth: 1.5
        };
      })
      .filter(Boolean);

    return { datasets };
  }, [solvedFilesList, xAxisType, options]);

  const gittOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'linear',
        title: {
          display: true,
          text: xAxisType === 'voltage' 
            ? (options.gittXAxisVoltage === 'e1' ? '脉冲末电压 E₁ (V)' : 
               options.gittXAxisVoltage === 'e2' ? '弛豫末 OCV E₂ (V)' : 
               options.gittXAxisVoltage === 'e0' ? '脉冲前 OCV E₀ (V)' : 
               '中值电压 (V)')
            : '放电状态 (SOC, %)',
          color: '#94a3b8'
        },
        grid: { color: 'rgba(56, 189, 248, 0.05)' },
        ticks: { color: '#94a3b8' },
        min: xAxisType === 'voltage' ? voltageBounds.min : undefined,
        max: xAxisType === 'voltage' ? voltageBounds.max : undefined,
        reverse: xAxisType === 'voltage' ? isDischargeTest : false
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: '扩散系数 D_Li⁺ (log₁₀ cm²/s)',
          color: '#10b981'
        },
        grid: { color: 'rgba(56, 189, 248, 0.05)' },
        ticks: {
          color: '#94a3b8',
          callback: function(value) {
            // value represents the log10 exponent. Format as 10^value
            if (Math.abs(value - Math.round(value)) < 0.01) {
              return `10^${Math.round(value)}`;
            }
            return '';
          }
        },
        reverse: !!options.gittYAxisInverted
      }
    },
    plugins: {
      legend: {
        labels: { color: '#f8fafc' }
      },
      tooltip: {
        backgroundColor: '#0f172a',
        borderColor: 'rgba(56, 189, 248, 0.2)',
        borderWidth: 1,
        callbacks: {
          label: function(context) {
            const pt = context.raw;
            const originalDLi = Math.pow(10, pt.y);
            const xLabel = options.gittXAxisVoltage === 'e1' ? `脉冲末 E₁: ${pt.meta.e1.toFixed(3)} V` : 
                           options.gittXAxisVoltage === 'e2' ? `弛豫末 E₂: ${pt.meta.e2.toFixed(3)} V` : 
                           options.gittXAxisVoltage === 'e0' ? `脉冲前 E₀: ${pt.meta.e0.toFixed(3)} V` : 
                           `中值电压: ${pt.meta.medianVoltage.toFixed(3)} V`;
            return [
              `文件: ${context.dataset.label}`,
              `D_Li⁺: ${originalDLi.toExponential(4)} cm²/s`,
              xLabel,
              `SOC: ${pt.meta.soc.toFixed(1)}%`,
              `工步: Step ${pt.meta.pulseStepId}`
            ];
          }
        }
      }
    }
  };

  // DCR point-line plot: one DCR value per pulse pair, matching R = (E1 - E2) / (I1 - I2).
  const dcrChartData = useMemo(() => {
    const visibleFiles = solvedFilesList?.filter((file) => file.visible !== false) || [];
    if (visibleFiles.length === 0) return { datasets: [] };

    const datasets = visibleFiles
      .map((file) => {
        const fileDcr = file.solvedDcr;
        if (!fileDcr || !fileDcr.results) return null;

        const results = fileDcr.results;
        const sortedResults = [...results].sort((a, b) => a.startTime - b.startTime);

        const dataPoints = sortedResults
          .map((result) => {
            const dcrVal = dcrSelectedOffset === 'end' 
              ? result.dcrValue 
              : (result.dcrValues?.[dcrSelectedOffset] ?? null);

            if (dcrVal === undefined || dcrVal === null) return null;

            return {
              x: result.startTime / 60,
              y: dcrVal,
              meta: result
            };
          })
          .filter(Boolean);

        if (dataPoints.length === 0) {
          return null;
        }

        return {
          label: visibleFiles.length === 1 ? 'DCR' : `${file.fileName} DCR`,
          data: dataPoints,
          borderColor: file.color,
          backgroundColor: file.color,
          showLine: true,
          fill: false,
          tension: 0.15,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#070a13',
          pointBorderColor: file.color,
          pointBorderWidth: 1.5
        };
      })
      .filter(Boolean);

    return { datasets };
  }, [solvedFilesList, dcrSelectedOffset]);

  const dcrOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        title: {
          display: true,
          text: 'Time (min)',
          color: '#94a3b8'
        },
        grid: { color: 'rgba(56, 189, 248, 0.05)' },
        ticks: { color: '#94a3b8' },
        reverse: false
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: dcrSelectedOffset === 'end' ? '电阻 DCR (Ω)' : `电阻 DCR @ ${dcrSelectedOffset}s (Ω)`,
          color: '#38bdf8'
        },
        grid: { color: 'rgba(56, 189, 248, 0.05)' },
        ticks: { color: '#94a3b8' }
      }
    },
    plugins: {
      legend: {
        labels: { color: '#f8fafc' }
      },
      tooltip: {
        backgroundColor: '#0f172a',
        borderColor: 'rgba(56, 189, 248, 0.2)',
        borderWidth: 1,
        callbacks: {
          label: function(context) {
            const pt = context.raw;
            const labelText = dcrSelectedOffset === 'end' ? '末端 DCR' : `${dcrSelectedOffset}s DCR`;
            return [
              `文件: ${context.dataset.label}`,
              `${labelText}: ${pt.y.toFixed(3)} Ω`,
              `时间: ${pt.x.toFixed(2)} min`,
              `工步类型: ${pt.meta.displayStepType || pt.meta.stepType}`,
              `E1: ${pt.meta.V_pre.toFixed(3)} V`,
              `I1: ${pt.meta.I_pre.toExponential ? pt.meta.I_pre.toExponential(3) : pt.meta.I_pre} A`,
              `I2: ${pt.meta.avgCurrent.toExponential ? pt.meta.avgCurrent.toExponential(3) : pt.meta.avgCurrent} A`,
              `脉冲前 SOC: ${pt.meta.soc.toFixed(1)}%`,
              `工步: Step ${pt.meta.stepId}`
            ];
          }
        }
      }
    }
  };

  // Pulse fitting visualizer helper (Fick's diffusion theory validation)
  const fickFitData = useMemo(() => {
    if (activeMode !== 'gitt' || !solvedGitt?.results?.length) {
      return null;
    }

    let pair = solvedGitt.results[selectedPulseIndex];
    if (!pair) {
      pair = solvedGitt.results[0]; // fallback to first pulse if out of bounds
    }

    if (!pair || !pair.pulseStep?.rows?.length) {
      return null;
    }

    const pulseStep = pair.pulseStep;
    const fit = fitGittTransient(pulseStep, {
      fitStartDelay: options.gittFitDelay !== undefined ? options.gittFitDelay : 1
    });
    if (!fit) {
      return null;
    }

    const baseVoltage = pulseStep.rows[0]?.voltage ?? 0;

    return {
      points: fit.points.map((point) => ({ x: point.sqrt_t, y: point.voltage, t: point.t_elapsed })),
      fitPoints: fit.fitPoints.map((point) => ({ x: point.sqrt_t, y: point.voltage, t: point.t_elapsed })),
      fitLine: [
        {
          x: fit.fitPoints[0].sqrt_t,
          y: fit.slope * fit.fitPoints[0].sqrt_t + fit.intercept + baseVoltage
        },
        {
          x: fit.fitPoints[fit.fitPoints.length - 1].sqrt_t,
          y: fit.slope * fit.fitPoints[fit.fitPoints.length - 1].sqrt_t + fit.intercept + baseVoltage
        }
      ],
      slope: fit.slope,
      intercept: fit.intercept,
      r2: fit.r2,
      fitWindowStart: fit.fitWindowStart,
      fitWindowEnd: fit.fitWindowEnd,
      stepId: pulseStep.stepId
    };
  }, [activeMode, selectedPulseIndex, solvedGitt, options.gittFitDelay]);

  const getFickChartData = () => {
    if (!fickFitData) return { datasets: [] };

    return {
      datasets: [
        {
          label: `实测电压值 (Experimental)`,
          data: fickFitData.points,
          borderColor: 'rgba(56, 189, 248, 0.4)',
          backgroundColor: '#38bdf8',
          pointRadius: 2,
          showLine: false
        },
        {
          label: `Fickian 线性拟合线 (Fit, R² = ${fickFitData.r2.toFixed(5)})`,
          data: fickFitData.fitLine,
          borderColor: '#10b981',
          borderWidth: 2,
          pointRadius: 0,
          showLine: true,
          fill: false,
          borderDash: [5, 5]
        }
      ]
    };
  };

  const fickChartData = getFickChartData();

  const fickOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'linear',
        title: {
          display: true,
          text: '脉冲时长平方根 t^0.5 (s^0.5)',
          color: '#94a3b8'
        },
        grid: { color: 'rgba(56, 189, 248, 0.05)' },
        ticks: { color: '#94a3b8' }
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: '电压 (V)',
          color: '#38bdf8'
        },
        grid: { color: 'rgba(56, 189, 248, 0.05)' },
        ticks: { color: '#94a3b8' }
      }
    },
    plugins: {
      legend: {
        labels: { color: '#f8fafc' }
      },
      tooltip: {
        backgroundColor: '#0f172a',
        borderColor: 'rgba(56, 189, 248, 0.2)',
        borderWidth: 1,
        callbacks: {
          label: function(context) {
            const pt = context.raw;
            if (context.datasetIndex === 0) {
              return [
                `电压: ${pt.y.toFixed(5)} V`,
                `t^0.5: ${pt.x.toFixed(2)} s^0.5`,
                `时长: ${pt.t.toFixed(1)} s`
              ];
            }
            return `拟合值: ${pt.y.toFixed(5)} V`;
          }
        }
      }
    }
  };

  return (
    <div className="main-panel-charts" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Chart 1: Raw voltage and current timeline */}
      <div className="card chart-card" style={{ minHeight: '380px' }}>
        <div className="card-title">
          <Cpu size={18} className="logo-icon" />
          全工步测试曲线概览 (Voltage & Current Timeline)
        </div>
        <div className="chart-wrapper">
          <Line data={timelineChartData} options={timelineOptions} />
        </div>
      </div>

      <div className="charts-grid">
        {/* Chart 2: Calculated GITT D_Li+ or DCR Plot */}
        <div className="card chart-card">
          <div className="table-header" style={{ marginBottom: '0.75rem' }}>
            <div className="card-title" style={{ margin: 0, border: 'none', padding: 0 }}>
              <TrendingUp size={18} className="logo-icon" />
              {activeMode === 'gitt' ? '锂离子扩散系数 D_Li⁺ 曲线图' : 'DCR 脉冲阻抗特征谱图'}
            </div>
            
            {activeMode === 'gitt' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div className="mode-switcher" style={{ scale: '0.85', margin: 0 }}>
                  <button 
                    className={`mode-btn ${xAxisType === 'voltage' ? 'active' : ''}`}
                    onClick={() => setXAxisType('voltage')}
                  >
                    X = 电压
                  </button>
                  <button 
                    className={`mode-btn ${xAxisType === 'soc' ? 'active' : ''}`}
                    onClick={() => setXAxisType('soc')}
                  >
                    X = SOC (%)
                  </button>
                </div>
              </div>
            )}

            {activeMode === 'dcr' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <select 
                  value={dcrSelectedOffset} 
                  onChange={(e) => setDcrSelectedOffset(e.target.value)}
                  style={{ 
                    background: 'rgba(30, 41, 59, 0.6)', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: '6px', 
                    color: 'var(--text-primary)',
                    fontSize: '0.75rem',
                    padding: '0.25rem 0.5rem',
                    fontFamily: 'Inter',
                    cursor: 'pointer'
                  }}
                >
                  <option value="end">脉冲末端阻抗</option>
                  {(options.dcrTimeOffsets || [0.1, 1.0, 3.0, 5.0, 10.0]).map((offset) => (
                    <option key={offset} value={offset}>{offset}s 瞬时阻抗</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          <div className="chart-wrapper">
            {activeMode === 'gitt' ? (
              <Scatter data={gittChartData} options={gittOptions} />
            ) : (
              <Scatter data={dcrChartData} options={dcrOptions} />
            )}
          </div>
        </div>

        {/* Chart 3: GITT Single pulse linear fit validator or DCR info banner */}
        {activeMode === 'gitt' && solvedGitt && solvedGitt.results.length > 0 ? (
          <div className="card chart-card">
            <div className="table-header" style={{ marginBottom: '0.75rem' }}>
              <div className="card-title" style={{ margin: 0, border: 'none', padding: 0 }}>
                <Play size={18} className="logo-icon" />
                单脉冲 Fick 扩散拟合校验 (E vs t^0.5)
              </div>
              
              <select 
                value={selectedPulseIndex >= (solvedGitt?.results?.length || 0) ? 0 : selectedPulseIndex} 
                onChange={(e) => setSelectedPulseIndex(parseInt(e.target.value))}
                style={{ 
                  background: 'rgba(30, 41, 59, 0.6)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '6px', 
                  color: 'var(--text-primary)',
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  fontFamily: 'Inter',
                  cursor: 'pointer'
                }}
              >
                {solvedGitt.results.map((r, idx) => (
                  <option key={idx} value={idx}>
                    脉冲 Step {r.pulseStepId} (SOC {r.soc.toFixed(0)}%)
                  </option>
                ))}
              </select>
            </div>

            <div className="chart-wrapper">
              <Scatter data={fickChartData} options={fickOptions} />
            </div>

            {fickFitData && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(56, 189, 248, 0.03)', padding: '0.5rem', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.05)' }}>
                <div>
                  <strong>拟合斜率 (dE/d√t):</strong> <span style={{ color: 'var(--color-primary-light)', fontFamily: 'Fira Code' }}>{fickFitData.slope.toExponential(4)} V/s^0.5</span>
                </div>
                <div>
                  <strong>拟合线性度 (R²):</strong> <span style={{ color: fickFitData.r2 >= 0.99 ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 600, fontFamily: 'Fira Code' }}>{fickFitData.r2.toFixed(5)}</span>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <strong>短时拟合区:</strong> <span style={{ color: 'var(--text-secondary)', fontFamily: 'Fira Code' }}>{fickFitData.fitWindowStart?.toFixed(2)} - {fickFitData.fitWindowEnd?.toFixed(2)} s</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="card chart-card" style={{ justifyContent: 'center' }}>
            <div className="info-banner" style={{ fontSize: '0.85rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary-light)', fontWeight: 600 }}>
                <Cpu size={16} /> DCR 动态阻抗说明
              </div>
              <p>
                1. 直流内阻 (DCR) 反映了电池的极化阻抗与欧姆阻抗之和。随着放电深度 (DOD/SOC) 的变化，活性物质 CF1 的电导率及反应界面会发生剧烈变化。
              </p>
              <p>
                2. 多时间节点 (如 0.1s, 1s, 10s DCR) 的对比能有效分离电池的<strong>瞬时欧姆阻抗</strong> (由 0.1s/1s 贡献) 与<strong>电化学极化/扩散阻抗</strong> (由 10s 阻抗贡献)。
              </p>
              <p>
                3. CF1 材料在放电平台期阻抗较平稳，而在放电末期 (接近 1.5V 截止区) 会由于氟化碳的消耗以及产物的积累导致 DCR 发生极速飙升，此属正常电化学规律。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataCharts;
