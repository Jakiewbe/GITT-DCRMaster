import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, FileSpreadsheet, Sparkles, Upload, X, Trash2, Eye, EyeOff } from 'lucide-react';
import { autoMapHeaders, inferCurrentUnit, parseBatteryFile, standardizeData } from '../utils/fileParser';
import { generateDcrSample, generateGittSample } from '../utils/sampleDataGenerator';

const EMPTY_MAPPING = {
  time: '',
  voltage: '',
  current: '',
  step: '',
  stepType: '',
  capacity: ''
};

const FIELD_LABELS = {
  time: '时间列',
  voltage: '电压列',
  current: '电流列',
  step: '工步号',
  stepType: '工步类型',
  capacity: '容量列'
};

const REQUIRED_FIELDS = ['time', 'voltage', 'current'];

const formatFileSize = (size) => {
  if (!size) return '';
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};

const formatCellPreview = (value) => {
  if (value === undefined || value === null || value === '') {
    return '空值';
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(4);
  }

  return String(value);
};

const getHeaderSample = (rows, header, limit = 3) => {
  if (!header) return '未选择';

  const samples = rows
    .map((row) => row?.[header])
    .filter((value) => value !== undefined && value !== null && value !== '')
    .slice(0, limit)
    .map(formatCellPreview);

  return samples.length > 0 ? samples.join(' | ') : '未找到可预览值';
};

const FileUploader = ({ 
  onDataLoaded, 
  activeMode,
  filesList = [],
  activeFileId,
  onSelectActive,
  onToggleVisible,
  onDeleteFile
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [fileInfo, setFileInfo] = useState({ name: '', size: '', source: '' });
  const [status, setStatus] = useState({ type: '', message: '' });
  const [showModal, setShowModal] = useState(false);
  const [rawHeaders, setRawHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [parseMeta, setParseMeta] = useState(null);
  const [columnMapping, setColumnMapping] = useState(EMPTY_MAPPING);
  const [mappingError, setMappingError] = useState('');

  const fileInputRef = useRef(null);

  const headerCards = useMemo(
    () =>
      rawHeaders.map((header) => ({
        header,
        sample: getHeaderSample(rawRows, header)
      })),
    [rawHeaders, rawRows]
  );

  const updateMapping = (field, value) => {
    setMappingError('');
    setColumnMapping((prev) => ({ ...prev, [field]: value }));
  };

  const openMappingModal = () => {
    setMappingError('');
    setShowModal(true);
  };

  const pushLoadedData = (standardizedRows, mapping, name, sourceMeta, headers) => {
    const suggestedCurrentUnit = inferCurrentUnit(mapping.current);

    // Extract active mass from filename if possible
    // Filename examples: FGS-GITT-200ma-0.512mg-4_127.0.0.1-BTS85-23-8-5-867.csv
    // Pattern: ([0-9.]+)\s*mg
    let suggestedMass = undefined;
    const massMatch = name.match(/([0-9.]+)\s*mg/i);
    if (massMatch) {
      const mgValue = parseFloat(massMatch[1]);
      if (!isNaN(mgValue)) {
        suggestedMass = mgValue / 1000; // convert mg to g
      }
    }

    // Identify if the dataset represents charging or discharging
    const nonZeroRow = standardizedRows.find(r => Math.abs(r.current) > 1e-4);
    const isDischarge = nonZeroRow ? nonZeroRow.current < 0 : true;
    const suggestedCutoff = isDischarge ? 1.5 : 4.2;

    onDataLoaded({
      fileName: name,
      rawData: standardizedRows,
      mapping,
      allHeaders: headers,
      importMeta: sourceMeta,
      suggestedOptions: {
        ...(suggestedCurrentUnit ? { currentUnit: suggestedCurrentUnit } : {}),
        ...(suggestedMass !== undefined ? { mass: suggestedMass } : {}),
        cutoffVoltage: suggestedCutoff
      }
    });
  };

  const applyParsedFile = (name, mapping, rows, sourceMeta, headers, mode = 'auto') => {
    const standardized = standardizeData(rows, mapping);
    if (standardized.length === 0) {
      throw new Error('解析后的有效数据行为 0，请确认所选列中包含数值型时间、电压和电流。');
    }

    const detectedCurrentUnit = inferCurrentUnit(mapping.current);
    const detectedFields = REQUIRED_FIELDS.map((key) => `${FIELD_LABELS[key]} -> ${mapping[key]}`).join('，');
    const metaHints = [
      sourceMeta?.encoding ? `编码 ${sourceMeta.encoding}` : null,
      sourceMeta?.delimiter ? `分隔符 ${sourceMeta.delimiter}` : null,
      detectedCurrentUnit ? `电流单位 ${detectedCurrentUnit}` : null
    ].filter(Boolean);

    setStatus({
      type: 'success',
      message:
        `${mode === 'manual' ? '手动映射已应用' : '文件读取成功'}，已载入 ${standardized.length} 行数据。` +
        ` ${detectedFields}` +
        (metaHints.length > 0 ? `。检测信息：${metaHints.join(' / ')}` : '')
    });

    pushLoadedData(standardized, mapping, name, sourceMeta, headers);
    setShowModal(false);
  };

  const processFile = async (file) => {
    setFileInfo({
      name: file.name,
      size: formatFileSize(file.size),
      source: 'upload'
    });
    setStatus({ type: 'loading', message: '正在解析文件并识别数据列...' });
    setShowModal(false);
    setMappingError('');

    try {
      const parsed = await parseBatteryFile(file);
      const mapping = autoMapHeaders(parsed.headers);

      setRawHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setParseMeta(parsed.meta);
      setColumnMapping(mapping);

      if (mapping.time && mapping.voltage && mapping.current) {
        applyParsedFile(file.name, mapping, parsed.rows, parsed.meta, parsed.headers, 'auto');
        return;
      }

      const missingFields = REQUIRED_FIELDS.filter((field) => !mapping[field]).map((field) => FIELD_LABELS[field]);
      setStatus({
        type: 'warning',
        message: `自动识别未完成，缺少：${missingFields.join('、')}。请在下方手动映射。`
      });
      setShowModal(true);
    } catch (error) {
      console.error(error);
      setStatus({
        type: 'error',
        message: `数据解析失败：${error.message}`
      });
    }
  };

  const handleDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(event.type === 'dragenter' || event.type === 'dragover');
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      Array.from(event.dataTransfer.files).forEach(file => {
        processFile(file);
      });
    }
  };

  const handleChange = (event) => {
    event.preventDefault();
    if (event.target.files && event.target.files.length > 0) {
      Array.from(event.target.files).forEach(file => {
        processFile(file);
      });
    }
  };

  const handleModalSubmit = () => {
    const missingFields = REQUIRED_FIELDS.filter((field) => !columnMapping[field]);
    if (missingFields.length > 0) {
      setMappingError(`请至少完成 ${missingFields.map((field) => FIELD_LABELS[field]).join('、')} 的映射。`);
      return;
    }

    try {
      applyParsedFile(fileInfo.name, columnMapping, rawRows, parseMeta, rawHeaders, 'manual');
    } catch (error) {
      setMappingError(error.message);
    }
  };

  const loadSample = (mode) => {
    setStatus({ type: 'loading', message: '正在生成演示数据...' });

    window.setTimeout(() => {
      try {
        const rows = mode === 'gitt' ? generateGittSample() : generateDcrSample();
        const mapping = {
          time: 'time',
          voltage: 'voltage',
          current: 'current',
          step: 'step',
          stepType: 'stepType',
          capacity: 'capacity'
        };
        const standardized = standardizeData(rows, mapping);
        const sampleName = mode === 'gitt' ? 'GITT_CFx_Sample.csv' : 'DCR_CFx_Sample.csv';
        const sampleMeta = {
          encoding: 'generated',
          delimiter: 'comma',
          suspiciousDecoding: false
        };

        setRawHeaders(Object.keys(rows[0]));
        setRawRows(rows);
        setParseMeta(sampleMeta);
        setColumnMapping(mapping);
        setFileInfo({ name: sampleName, size: '0.48 MB', source: 'sample' });
        setStatus({
          type: 'success',
          message: `演示数据已生成，共 ${standardized.length} 行。你可以直接开始查看 ${mode.toUpperCase()} 结果。`
        });

        onDataLoaded({
          fileName: sampleName,
          rawData: standardized,
          mapping,
          allHeaders: Object.keys(rows[0]),
          importMeta: sampleMeta,
          suggestedOptions: { currentUnit: 'mA' }
        });
      } catch (error) {
        setStatus({ type: 'error', message: `演示数据生成失败：${error.message}` });
      }
    }, 400);
  };

  return (
    <div className="card">
      <div className="card-title">
        <Upload size={18} className="logo-icon" />
        数据上传与解析
      </div>

      <div
        className={`uploader-area ${dragActive ? 'dragging' : ''}`}
        style={filesList.length > 0 ? { padding: '1rem', minHeight: '70px', flex: 'none', borderStyle: 'dashed', borderWidth: '1px' } : {}}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".csv,.xlsx,.xls,.txt"
          style={{ display: 'none' }}
          multiple
          onChange={handleChange}
        />
        {filesList.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', width: '100%' }}>
            <FileSpreadsheet size={24} className="uploader-icon" style={{ margin: 0, scale: '0.85' }} />
            <div style={{ textAlign: 'left' }}>
              <strong style={{ fontSize: '0.8rem', color: 'var(--color-primary-light)' }}>点击或拖拽追加测试文件...</strong>
              <p style={{ fontSize: '0.67rem', color: 'var(--text-muted)', margin: 0 }}>支持批量上传 CSV / Excel / TXT 进行多文件对比</p>
            </div>
          </div>
        ) : (
          <>
            <FileSpreadsheet size={40} className="uploader-icon" />
            <div className="uploader-text">
              <h3>拖拽文件到这里，或点击选择文件</h3>
              <p>当前模式：{activeMode === 'gitt' ? 'GITT 扩散分析' : 'DCR 脉冲内阻分析'}。支持 CSV / Excel / TXT，自动识别 UTF-8、GBK / GB18030 及常见分隔符。</p>
            </div>
          </>
        )}
      </div>

      {/* Multi-file management panel */}
      {filesList.length > 0 && (
        <div className="files-manager-section" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            已导入序列 ({filesList.length}) · 点击星标查看详情
          </div>
          <div className="files-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
            {filesList.map((file) => {
              const isActive = file.id === activeFileId;
              
              return (
                <div 
                  key={file.id} 
                  className={`file-badge animate-fade-in ${isActive ? 'active-file' : ''}`}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    background: isActive ? 'rgba(56, 189, 248, 0.08)' : 'rgba(30, 41, 59, 0.3)',
                    border: isActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => onSelectActive(file.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                    {/* Color dot indicator */}
                    <span 
                      style={{ 
                        width: '10px', 
                        height: '10px', 
                        borderRadius: '50%', 
                        background: file.color, 
                        flexShrink: 0,
                        boxShadow: `0 0 8px ${file.color}`
                      }} 
                    />
                    
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: isActive ? 600 : 500, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={file.fileName}>
                        {file.fileName}
                      </span>
                      <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>
                        质量: {(file.params.mass * 1000).toFixed(3)} mg | 行数: {file.rawData?.length ?? 0}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} onClick={(e) => e.stopPropagation()}>
                    {/* Select Active (Star or check icon) */}
                    <button 
                      className={`compact-icon-btn ${isActive ? 'text-primary' : 'text-muted'}`}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: isActive ? '#f59e0b' : 'var(--text-muted)', 
                        padding: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      onClick={() => onSelectActive(file.id)}
                      title="设为当前查看详情的激活文件"
                    >
                      <Sparkles size={14} style={{ fill: isActive ? '#f59e0b' : 'none' }} />
                    </button>

                    {/* Toggle Visibility */}
                    <button 
                      className="compact-icon-btn"
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: file.visible ? 'var(--color-primary-light)' : 'var(--text-muted)', 
                        padding: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      onClick={() => onToggleVisible(file.id)}
                      title={file.visible ? "在图表中隐藏此曲线" : "在图表中显示此曲线"}
                    >
                      {file.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>

                    {/* Delete File */}
                    <button 
                      className="compact-icon-btn"
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: 'var(--text-muted)', 
                        padding: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      onClick={() => onDeleteFile(file.id)}
                      title="删除此文件"
                    >
                      <Trash2 size={14} className="hover-danger" style={{ transition: 'color 0.15s ease' }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {filesList.length === 0 && (
        <div className="sample-actions">
          <div className="sample-divider">
            <span />
            <p>或者先看一份可运行的演示数据</p>
            <span />
          </div>

          <div className="sample-grid">
            <button
              className="btn-secondary"
              onClick={(event) => {
                event.stopPropagation();
                loadSample('gitt');
              }}
            >
              <Sparkles size={14} />
              GITT 演示数据
            </button>
            <button
              className="btn-secondary"
              onClick={(event) => {
                event.stopPropagation();
                loadSample('dcr');
              }}
            >
              <Sparkles size={14} />
              DCR 演示数据
            </button>
          </div>
        </div>
      )}

      {parseMeta && filesList.length === 0 && (
        <div className="import-meta-row">
          {parseMeta.encoding && <span className="meta-pill">编码：{parseMeta.encoding}</span>}
          {parseMeta.delimiter && <span className="meta-pill">分隔符：{parseMeta.delimiter}</span>}
          {columnMapping.current && inferCurrentUnit(columnMapping.current) && (
            <span className="meta-pill">电流单位：{inferCurrentUnit(columnMapping.current)}</span>
          )}
        </div>
      )}

      {status.type === 'loading' && (
        <div className="status-msg info">
          <div className="spinner" />
          <span>{status.message}</span>
        </div>
      )}

      {status.type === 'success' && (
        <div className="status-msg success">
          <CheckCircle size={16} className="info-banner-icon" />
          <span>{status.message}</span>
        </div>
      )}

      {status.type === 'error' && (
        <div className="status-msg error">
          <AlertTriangle size={16} style={{ color: 'var(--color-danger)' }} />
          <span>{status.message}</span>
        </div>
      )}

      {status.type === 'warning' && (
        <div className="status-msg warning">
          <AlertTriangle size={16} />
          <span>{status.message}</span>
          <button className="btn-secondary compact-btn" onClick={openMappingModal}>
            手动映射
          </button>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content wide-modal">
            <div className="modal-header">
              <div>
                <h3>手动映射数据列</h3>
                <p className="modal-subtitle">
                  当前文件：{fileInfo.name || '未命名文件'}
                  {parseMeta?.suspiciousDecoding ? '。文件编码可疑，请优先核对中文列名。' : '。请确认时间、电压、电流三列映射正确。'}
                </p>
              </div>
              <button className="remove-file-btn" onClick={() => setShowModal(false)} aria-label="关闭映射窗口">
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="mapping-grid">
                {Object.entries(FIELD_LABELS).map(([field, label]) => (
                  <div className="mapping-row" key={field}>
                    <label>{label}{REQUIRED_FIELDS.includes(field) ? ' *' : ''}</label>
                    <div className="form-group" style={{ margin: 0 }}>
                      <select value={columnMapping[field]} onChange={(event) => updateMapping(field, event.target.value)}>
                        <option value="">
                          {field === 'step'
                            ? '-- 自动按电流切分 --'
                            : field === 'stepType'
                              ? '-- 自动按电流方向推断 --'
                              : field === 'capacity'
                                ? '-- 未提供容量列也可计算 --'
                                : `-- 请选择${label} --`}
                        </option>
                        {rawHeaders.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="mapping-hint">
                      样本值：{getHeaderSample(rawRows, columnMapping[field])}
                    </p>
                  </div>
                ))}
              </div>

              {mappingError && (
                <div className="status-msg error" style={{ marginTop: '1rem' }}>
                  <AlertTriangle size={16} style={{ color: 'var(--color-danger)' }} />
                  <span>{mappingError}</span>
                </div>
              )}

              <div className="preview-panel">
                <div className="preview-panel-header">
                  <h4>列预览</h4>
                  <p>展示前 {Math.min(headerCards.length, 8)} 个字段的样本值，便于快速定位正确列。</p>
                </div>

                <div className="header-preview-grid">
                  {headerCards.slice(0, 8).map(({ header, sample }) => (
                    <div className="header-preview-card" key={header}>
                      <strong>{header}</strong>
                      <span>{sample}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn-primary" style={{ width: 'auto' }} onClick={handleModalSubmit}>
                确认并载入数据
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
