import { useState } from 'react';
import { Download, Eye, EyeOff } from 'lucide-react';
import { convertCurrentFromAmp } from '../utils/analysisData';
import { exportGittBatchWorkbook } from '../utils/exportUtils';

const GittCalculator = ({ solvedData, solvedFilesList = [], activeFileId = null, currentUnit = 'mA', options }) => {
  const [showExcluded, setShowExcluded] = useState(true);

  if (!solvedData) return null;

  const { results, cutoffApplied, retainedCount, totalCount } = solvedData;

  const formatScientific = (num) => {
    if (num === null || num === undefined) return '-';
    return num.toExponential(4);
  };

  const formatVoltage = (num) => {
    if (num === null || num === undefined) return '-';
    return num.toFixed(4) + ' V';
  };

  const handleDownload = () => {
    exportGittBatchWorkbook({
      solvedFilesList,
      activeFileId,
      currentUnit
    });
  };

  const filteredResults = showExcluded ? results : results.filter(r => !r.isExcluded);

  return (
    <div className="card table-card animate-fade-in">
      <div className="table-header">
        <div>
          <h3>GITT 锂离子扩散系数 (D<sub>Li<sup>+</sup></sub>) 计算报表</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            已加载 {totalCount} 步脉冲对，{' '}
            {cutoffApplied ? (
              <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                ⚠️ 智能识别截止：保留前 {retainedCount} 组在有效反应区间的脉冲步骤，并剔除后续 {totalCount - retainedCount} 组失效阶段。
              </span>
            ) : (
              <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                ✓ 全部处于有效反应区间以上。
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            className="btn-secondary" 
            onClick={() => setShowExcluded(!showExcluded)}
          >
            {showExcluded ? <EyeOff size={14} /> : <Eye size={14} />}
            {showExcluded ? '隐藏截止点后数据' : '显示完整原始记录'}
          </button>
          <button className="btn-secondary" onClick={handleDownload} disabled={results.length === 0}>
            <Download size={14} />
            批量导出 XLSX 作图表
          </button>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>脉冲工步</th>
              <th>弛豫工步</th>
              <th>估算 SOC</th>
              <th>中值电压</th>
              <th>脉冲前 OCV (E<sub>0</sub>)</th>
              <th>脉冲末电压 (E<sub>1</sub>)</th>
              <th>弛豫末 OCV (E<sub>2</sub>)</th>
              <th>ΔE<sub>s</sub></th>
              <th>ΔE<sub>t</sub></th>
              {options?.gittMethod === 'regression' && (
                <>
                  <th style={{ color: 'var(--color-primary-light)' }}>拟合斜率 (dE/d√t)</th>
                  <th style={{ color: 'var(--color-primary-light)' }}>拟合线性度 (R²)</th>
                </>
              )}
              <th>扩散系数 D<sub>Li<sup>+</sup></sub> (cm²/s)</th>
              <th>分析状态</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.map((r) => {
              let r2Color = 'inherit';
              if (options?.gittMethod === 'regression' && r.r2 !== undefined && !r.isExcluded) {
                if (r.r2 >= 0.90) r2Color = 'var(--color-success)';
                else if (r.r2 >= 0.80) r2Color = 'var(--color-warning)';
                else r2Color = 'var(--color-danger)';
              }

              return (
                <tr key={r.index} className={r.isExcluded ? 'text-muted' : 'highlighted'} style={{ opacity: r.isExcluded ? 0.45 : 1 }}>
                  <td>Step {r.pulseStepId}</td>
                  <td>{r.relaxationStepId ? `Step ${r.relaxationStepId}` : '-'}</td>
                  <td>{r.soc !== null && r.soc !== undefined ? `${r.soc.toFixed(1)}%` : '-'}</td>
                  <td>{formatVoltage(r.medianVoltage)}</td>
                  <td>{formatVoltage(r.e0)}</td>
                  <td>{formatVoltage(r.e1)}</td>
                  <td>{formatVoltage(r.e2)}</td>
                  <td>{r.dEs !== null && r.dEs !== undefined ? `${r.dEs.toFixed(4)} V` : '-'}</td>
                  <td>{r.dEt !== null && r.dEt !== undefined ? `${r.dEt.toFixed(4)} V` : '-'}</td>
                  {options?.gittMethod === 'regression' && (
                    <>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                        {r.slope !== undefined ? r.slope.toExponential(4) + ' V/s^0.5' : '-'}
                      </td>
                      <td style={{ fontWeight: 600, color: r2Color, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                        {r.r2 !== undefined ? r.r2.toFixed(5) : '-'}
                      </td>
                    </>
                  )}
                  <td style={{ fontWeight: 600, color: r.isExcluded ? 'inherit' : 'var(--color-primary-light)' }}>
                    {formatScientific(r.dLi)}
                  </td>
                  <td>
                    {r.isExcluded ? (
                      <span className="badge badge-warning">已截止</span>
                    ) : r.explanation ? (
                      <span className="badge badge-info">需复核</span>
                    ) : (
                      <span className="badge badge-success">有效反应</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GittCalculator;
