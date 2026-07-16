import { Download } from 'lucide-react';
import { convertCurrentFromAmp } from '../utils/analysisData';

const formatResistance = (resistanceOhm) => {
  if (resistanceOhm === null || resistanceOhm === undefined || Number.isNaN(resistanceOhm)) {
    return '-';
  }

  if (resistanceOhm >= 1) {
    return `${resistanceOhm.toFixed(2)} Ω`;
  }

  return `${(resistanceOhm * 1000).toFixed(1)} mΩ`;
};

const DcrCalculator = ({ solvedData, currentUnit = 'mA' }) => {
  if (!solvedData) return null;

  const { results } = solvedData;

  // Extract all unique offsets from results
  const offsets = results.length > 0 && results[0].dcrValues
    ? Object.keys(results[0].dcrValues).filter(k => k !== 'end').sort((a, b) => parseFloat(a) - parseFloat(b))
    : [0.1, 1.0, 3.0, 5.0, 10.0];

  const handleDownload = () => {
    const headers = [
      'Pulse Step ID',
      'Reference Step ID',
      'Step Type',
      'Detailed Step Type',
      'Pulse Duration (s)',
      'Pre-pulse Voltage E1 (V)',
      'End-of-pulse Voltage E2 (V)',
      `Pre-pulse Current I1 (${currentUnit})`,
      `Pulse Current I2 (${currentUnit})`,
      'Pre-pulse SOC (%)',
      ...offsets.map(offset => `DCR @ ${offset}s (Ohms)`),
      'End-of-pulse DCR (Ohms)'
    ];

    const rows = results.map((result) => {
      const rowData = [
        result.stepId,
        result.referenceStepId ?? '-',
        result.displayStepType || result.stepType,
        result.detailedStepType || result.stepType,
        result.pulseDuration.toFixed(1),
        result.E1?.toFixed(5) ?? '-',
        result.E2?.toFixed(5) ?? '-',
        convertCurrentFromAmp(result.I1, currentUnit)?.toFixed(4) ?? '-',
        convertCurrentFromAmp(result.I2, currentUnit)?.toFixed(4) ?? '-',
        result.soc?.toFixed(2) ?? '-',
        ...offsets.map(offset => result.dcrValues?.[offset] !== null && result.dcrValues?.[offset] !== undefined ? result.dcrValues[offset].toFixed(6) : '-'),
        result.dcrValue?.toFixed(6) ?? '-'
      ];

      return rowData;
    });

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `DCR_Pulse_Results_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="card table-card animate-fade-in">
      <div className="table-header">
        <div>
          <h3>DCR 直流内阻多时间尺度阻抗谱报表</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            系统自动识别出 {results.length} 组脉冲，并按 `R = ΔV / ΔI` 提取从短时间（0.1s）欧姆降至长时间极化过渡的多点直流电阻特征。
          </p>
        </div>
        <button className="btn-secondary" onClick={handleDownload} disabled={results.length === 0}>
          <Download size={14} />
          导出 DCR CSV 报表
        </button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>脉冲工步</th>
              <th>参考工步</th>
              <th>工步类型</th>
              <th>脉冲时长</th>
              <th>脉冲前 SOC</th>
              <th>前电压 E1</th>
              <th>末电压 E2</th>
              <th>前电流 I1</th>
              <th>末电流 I2</th>
              {offsets.map(offset => (
                <th key={offset} style={{ color: 'var(--color-primary-light)' }}>
                  DCR ({parseFloat(offset)}s)
                </th>
              ))}
              <th style={{ color: 'var(--color-success)' }}>末端 DCR</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, index) => (
              <tr key={index} className="highlighted">
                <td>Step {result.stepId}</td>
                <td>{result.referenceStepId ? `Step ${result.referenceStepId}` : '-'}</td>
                <td>
                  <span className={`badge ${result.avgCurrent < 0 ? 'badge-warning' : 'badge-info'}`}>
                    {result.displayStepType || (result.avgCurrent < 0 ? '放电' : '充电')}
                  </span>
                </td>
                <td>{result.pulseDuration.toFixed(1)} s</td>
                <td>{result.soc !== null && result.soc !== undefined ? `${result.soc.toFixed(1)}%` : '-'}</td>
                <td>{result.E1?.toFixed(4) ?? '-'} V</td>
                <td>{result.E2?.toFixed(4) ?? '-'} V</td>
                <td>{convertCurrentFromAmp(result.I1, currentUnit)?.toFixed(2)} {currentUnit}</td>
                <td style={{ fontWeight: 500 }}>
                  {convertCurrentFromAmp(result.I2, currentUnit)?.toFixed(2)} {currentUnit}
                </td>
                {offsets.map(offset => (
                  <td key={offset}>
                    {formatResistance(result.dcrValues?.[offset])}
                  </td>
                ))}
                <td style={{ fontWeight: 600, color: 'var(--color-success)' }}>
                  {formatResistance(result.dcrValue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DcrCalculator;
