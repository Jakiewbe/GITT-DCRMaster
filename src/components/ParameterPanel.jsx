import { Sliders, Beaker } from 'lucide-react';

const ParameterPanel = ({ activeMode, params, onParamsChange, options, onOptionsChange }) => {
  const materialSelect =
    Math.abs((params.molarMass || 0) - 31.01) < 0.01 &&
    Math.abs((params.density || 0) - 2.70) < 0.01 &&
    Math.abs((params.molarVolume || 0) - 11.48) < 0.05
      ? 'CF1'
      : 'custom';

  const handleMaterialChange = (e) => {
    const val = e.target.value;
    if (val === 'CF1') {
      onParamsChange({
        ...params,
        molarMass: 31.01,
        density: 2.70,
        molarVolume: 11.48
      });
    }
  };

  const handleCustomParamChange = (field, textVal) => {
    const floatVal = parseFloat(textVal) || 0;
    if (field === 'molarMass') {
      const d = params.density || 1;
      const v = floatVal / d;
      onParamsChange({ ...params, molarMass: floatVal, molarVolume: v });
    } else if (field === 'density') {
      const m = params.molarMass || 1;
      const v = floatVal > 0 ? m / floatVal : 0;
      onParamsChange({ ...params, density: floatVal, molarVolume: v });
    } else if (field === 'molarVolume') {
      onParamsChange({ ...params, molarVolume: floatVal });
    }
  };

  return (
    <div className="sidebar-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="card">
        <div className="card-title">
          <Beaker size={18} className="logo-icon" />
          活性材料参数预设
        </div>

        <div className="form-group">
          <label>预设材料库</label>
          <select value={materialSelect} onChange={handleMaterialChange}>
            <option value="CF1">氟化碳 (CF1 / Carbon Fluoride)</option>
            <option value="custom">自定义活性材料 (Custom)</option>
          </select>
        </div>

        {materialSelect === 'custom' ? (
          <>
            <div className="form-group">
              <label>摩尔质量 (Molar Mass)</label>
              <div className="input-with-unit">
                <input 
                  type="text" 
                  value={params.molarMass ?? ''}
                  onChange={(e) => handleCustomParamChange('molarMass', e.target.value)}
                />
                <span className="input-unit">g/mol</span>
              </div>
            </div>
            
            <div className="form-group">
              <label>晶体密度 (Density)</label>
              <div className="input-with-unit">
                <input 
                  type="text" 
                  value={params.density ?? ''}
                  onChange={(e) => handleCustomParamChange('density', e.target.value)}
                />
                <span className="input-unit">g/cm³</span>
              </div>
            </div>

            <div className="form-group">
              <label>摩尔体积 (Molar Volume)</label>
              <div className="input-with-unit">
                <input 
                  type="text" 
                  value={params.molarVolume ?? ''}
                  onChange={(e) => handleCustomParamChange('molarVolume', e.target.value)}
                />
                <span className="input-unit">cm³/mol</span>
              </div>
            </div>
          </>
        ) : (
          <div className="info-banner" style={{ marginBottom: '1rem' }}>
            <div>
              <strong>CF1 材料参数已自动加载：</strong><br />
              • 摩尔质量: 31.01 g/mol<br />
              • 晶体密度: 2.70 g/cm³<br />
              • 摩尔体积: 11.48 cm³/mol<br />
              • 理论比容量: 865 mAh/g
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <Sliders size={18} className="logo-icon" />
          电极与测试参数配置
        </div>

        <div className="form-group">
          <label>活性物质质量 (m_B)</label>
          <div className="input-with-unit">
            <input 
              type="number" 
              step="0.001"
              value={params.mass !== undefined ? parseFloat((params.mass * 1000).toFixed(6)) : ''} 
              onChange={(e) => onParamsChange({ ...params, mass: (parseFloat(e.target.value) || 0) / 1000 })}
            />
            <span className="input-unit">mg</span>
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            请输入毫克 (mg) 单位。系统会自动转换为克 (g) 参与底层 GITT 扩散公式计算。
          </p>
        </div>

        <div className="form-group">
          <label>电极活性表面积 (S)</label>
          <div className="input-with-unit">
            <input 
              type="number" 
              step="0.01"
              value={params.area} 
              onChange={(e) => onParamsChange({ ...params, area: parseFloat(e.target.value) || 0 })}
            />
            <span className="input-unit">cm²</span>
          </div>
        </div>

        <div className="form-group">
          <label>电流物理单位</label>
          <select 
            value={options.currentUnit} 
            onChange={(e) => onOptionsChange({ ...options, currentUnit: e.target.value })}
          >
            <option value="uA">微安 (uA) - 超微型电学测试</option>
            <option value="mA">毫安 (mA) - 默认微型纽扣电池</option>
            <option value="A">安培 (A) - 大容量单体电池</option>
          </select>
        </div>

        <div className="form-group">
          <label>测试时间单位修正</label>
          <select 
            value={options.timeUnitMode || 'auto'} 
            onChange={(e) => onOptionsChange({ ...options, timeUnitMode: e.target.value })}
          >
            <option value="auto">自动探测 (Auto)</option>
            <option value="seconds">秒 (seconds)</option>
            <option value="minutes">分钟 (minutes)</option>
            <option value="hours">小时 (hours)</option>
          </select>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            若自动探测有偏差，可强制指定导入文件中的累计时间单位。
          </p>
        </div>

        {activeMode === 'gitt' ? (
          <>
            <div className="card-title" style={{ marginTop: '1.25rem', fontSize: '0.95rem' }}>
              GITT 专用设置
            </div>

            <div className="form-group">
              <label>扩散模型选择</label>
              <select 
                value={options.gittModel || 'planar'} 
                onChange={(e) => onOptionsChange({ ...options, gittModel: e.target.value })}
              >
                <option value="planar">平面扩散模型 (Planar - 默认)</option>
                <option value="spherical">球形颗粒扩散模型 (Spherical)</option>
              </select>
            </div>

            <div className="form-group">
              <label>特征扩散长度 (L) 计算模式</label>
              <select 
                value={options.characteristicLengthMode || 'dense'} 
                onChange={(e) => onOptionsChange({ ...options, characteristicLengthMode: e.target.value })}
              >
                <option value="dense">致密平板模型 (L = m·V_m / (M·S) - 默认)</option>
                <option value="physical">极片物理厚度模型 (L = L_physical)</option>
                <option value="particle">球形颗粒外径模型 (L = r_p / 3)</option>
              </select>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                选择用于 GITT 公式计算的特征扩散距离 L 的来源。
              </p>
            </div>

            {options.characteristicLengthMode === 'physical' && (
              <div className="form-group animate-fade-in">
                <label>极片物理厚度 (L_physical)</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="1"
                    min="0"
                    value={params.physicalThickness !== undefined ? params.physicalThickness : 50.0} 
                    onChange={(e) => onParamsChange({ ...params, physicalThickness: parseFloat(e.target.value) || 0 })}
                  />
                  <span className="input-unit">μm</span>
                </div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  请输入极片活性物质的实际物理涂布厚度。
                </p>
              </div>
            )}

            <div className="form-group">
              <label>GITT 计算方法选择</label>
              <select 
                value={options.gittMethod || 'simplified'} 
                onChange={(e) => onOptionsChange({ ...options, gittMethod: e.target.value })}
              >
                <option value="simplified">简化终点法 (Simplified)</option>
                <option value="regression">线性拟合回归法 (Linear Regression)</option>
              </select>
            </div>

            <div className="form-group">
              <label>GITT 公式倍率常数</label>
              <select 
                value={options.gittMultiplier || '4/pi'} 
                onChange={(e) => onOptionsChange({ ...options, gittMultiplier: e.target.value })}
              >
                <option value="4/pi">4/π (双侧平板扩散 - 默认)</option>
                <option value="1/pi">1/π (单侧扩散 / 半厚度 L/2 - 适配手算)</option>
                <option value="4">4 (无圆周率因子双侧)</option>
                <option value="1">1 (无圆周率因子单侧)</option>
              </select>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                选择 Weppner-Huggins GITT 主方程前方的倍率常数。
              </p>
            </div>

            {options.gittMethod === 'regression' && (
              <div className="form-group animate-fade-in">
                <label>Fickian 拟合起始延迟</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="0.1"
                    min="0"
                    value={options.gittFitDelay !== undefined ? options.gittFitDelay : 1} 
                    onChange={(e) => onOptionsChange({ ...options, gittFitDelay: parseFloat(e.target.value) || 0 })}
                  />
                  <span className="input-unit">s</span>
                </div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  仅跳过脉冲最开始的非线性区，随后在短时前段进行 E-√t 拟合，而不是使用后段数据。
                </p>
              </div>
            )}

            {options.gittModel === 'spherical' && (
              <div className="form-group animate-fade-in">
                <label>活性物质颗粒半径 (rₚ)</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="0.1"
                    value={params.particleRadius !== undefined ? params.particleRadius : 1.5} 
                    onChange={(e) => onParamsChange({ ...params, particleRadius: parseFloat(e.target.value) || 0 })}
                  />
                  <span className="input-unit">μm</span>
                </div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  球形颗粒近似下采用特征扩散长度 L = rₚ / 3，仅适用于颗粒主导扩散而非致密平板电极。
                </p>
              </div>
            )}

            <div className="form-group">
              <label>智能截止中值电压</label>
              <div className="input-with-unit">
                <input 
                  type="number" 
                  step="0.1"
                  value={options.cutoffVoltage} 
                  onChange={(e) => onOptionsChange({ ...options, cutoffVoltage: parseFloat(e.target.value) || 0 })}
                />
                <span className="input-unit">V</span>
              </div>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                到达截止电压后的脉冲会在结果表中标为截止后区域，但不再按脉冲时长做启发式误删。
              </p>
            </div>

            <div className="form-group">
              <label>GITT 横坐标电压点</label>
              <select 
                value={options.gittXAxisVoltage || 'median'} 
                onChange={(e) => onOptionsChange({ ...options, gittXAxisVoltage: e.target.value })}
              >
                <option value="median">中值电压 (Median Voltage - 适配手算)</option>
                <option value="e1">脉冲末电压 E₁ (End-of-pulse)</option>
                <option value="e2">弛豫末开路电压 E₂ (Relaxed OCV)</option>
                <option value="e0">脉冲前开路电压 E₀ (Pre-pulse OCV)</option>
              </select>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                选择 GITT 扩散系数与电压关系图中的 X 轴数据来源。
              </p>
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.75rem 0' }}>
              <input 
                type="checkbox" 
                id="gittYAxisInverted"
                checked={!!options.gittYAxisInverted} 
                onChange={(e) => onOptionsChange({ ...options, gittYAxisInverted: e.target.checked })}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
              <label htmlFor="gittYAxisInverted" style={{ margin: 0, textTransform: 'none', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                倒置 Y 轴对数刻度 (适配手算趋势)
              </label>
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.75rem 0' }}>
              <input 
                type="checkbox" 
                id="useIrCorrection"
                checked={options.useIrCorrection} 
                onChange={(e) => onOptionsChange({ ...options, useIrCorrection: e.target.checked })}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
              <label htmlFor="useIrCorrection" style={{ margin: 0, textTransform: 'none', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                开启 iR 欧姆降修正
              </label>
            </div>

            {options.useIrCorrection && (
              <div className="form-group animate-fade-in">
                <label>iR 延迟计入时间</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="0.1"
                    value={options.irCorrectionTime} 
                    onChange={(e) => onOptionsChange({ ...options, irCorrectionTime: parseFloat(e.target.value) || 0 })}
                  />
                  <span className="input-unit">s</span>
                </div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  从脉冲起点延迟此时间以估计 E_0+ 并扣除欧姆内阻影响。
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="card-title" style={{ marginTop: '1.25rem', fontSize: '0.95rem' }}>
              DCR 脉冲阻抗设置
            </div>
            <div className="info-banner" style={{ marginBottom: '1rem' }}>
              <div>
                <strong>DCR 采用单值公式：</strong><br />
                • 按 `R = (E1 - E2) / (I1 - I2)` 计算。<br />
                • `I1 / E1` 取小电流平台末端。<br />
                • `I2 / E2` 取对应大电流平台末端。<br />
                • 每组大小电流配对只输出 1 个 DCR 值。
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ParameterPanel;
