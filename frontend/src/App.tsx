import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import './index.css';

interface ProjectionResult {
  networkName: string;
  currentFollowers: number;
  projectedFollowers: number;
  growth: number;
  interactionRate: number;
  currentER: number;
  projectedER: number;
  months: number;
  history: { month: string; followers: number; er: number }[];
  aiSummary?: string;
  aiRecommendations?: { condition: string; recommendation: string; impact: string; status: string }[];
}

interface NetworkState {
  network: string;
  enabled: boolean;
  profile: string;
  currentFollowers: string;
  engagementRate: number;
  erIsEstimated: boolean;
  pictureUrl: string;
  isEstimated: boolean;
  fetchError: string;
  imgError: boolean;
}

const NETWORK_COLORS: Record<string, string> = {
  Instagram: '#E1306C',
  TikTok: '#00F2FE',
  X: '#1DA1F2',
  Facebook: '#4267B2'
};

function App() {
  const [brandName, setBrandName] = useState('');
  const [targetDate, setTargetDate] = useState('12');
  const [isActive, setIsActive] = useState(true);
  const [hasAds, setHasAds] = useState(false);
  
  const [networks, setNetworks] = useState<NetworkState[]>([
    { network: 'Instagram', enabled: true, profile: '', currentFollowers: '', engagementRate: 0, erIsEstimated: false, pictureUrl: '', isEstimated: false, fetchError: '', imgError: false },
    { network: 'TikTok', enabled: false, profile: '', currentFollowers: '', engagementRate: 0, erIsEstimated: false, pictureUrl: '', isEstimated: false, fetchError: '', imgError: false },
    { network: 'X', enabled: false, profile: '', currentFollowers: '', engagementRate: 0, erIsEstimated: false, pictureUrl: '', isEstimated: false, fetchError: '', imgError: false },
    { network: 'Facebook', enabled: false, profile: '', currentFollowers: '', engagementRate: 0, erIsEstimated: false, pictureUrl: '', isEstimated: false, fetchError: '', imgError: false }
  ]);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ProjectionResult[]>([]);
  const [globalError, setGlobalError] = useState('');

  const handleNetworkChange = (index: number, field: keyof NetworkState, value: any) => {
    const newNetworks = [...networks];
    (newNetworks[index] as any)[field] = value;
    setNetworks(newNetworks);
  };

  const handleProfileBlur = async (index: number) => {
    const net = networks[index];
    if (!net.profile) return;
    
    handleNetworkChange(index, 'fetchError', '');
    handleNetworkChange(index, 'currentFollowers', '');
    handleNetworkChange(index, 'pictureUrl', '');
    handleNetworkChange(index, 'engagementRate', 0);

    try {
      const cleanProfile = net.profile.replace('@', '');
      const res = await fetch(`https://caculadora-de-proyecciones.onrender.com/api/followers?network=${net.network}&profile=${cleanProfile}`);
      const data = await res.json();
      
      if (data.followers !== null) {
        handleNetworkChange(index, 'currentFollowers', data.followers.toString());
      } else {
        handleNetworkChange(index, 'currentFollowers', '5000');
      }
      
      handleNetworkChange(index, 'imgError', false);
      if (data.pictureUrl) {
        handleNetworkChange(index, 'pictureUrl', data.pictureUrl);
      }
      handleNetworkChange(index, 'isEstimated', !!data.isEstimated);
      handleNetworkChange(index, 'engagementRate', data.engagementRate || 0);
      handleNetworkChange(index, 'erIsEstimated', !!data.erIsEstimated);
    } catch (e) {
      console.error('Fetch error:', e);
      handleNetworkChange(index, 'fetchError', '⚠️ Error de conexión automática.');
    }
  };

  const triggerProjection = async (
    currentBrandName: string,
    currentTargetDate: string,
    currentIsActive: boolean,
    currentHasAds: boolean,
    currentNets: NetworkState[]
  ) => {
    const activeNets = currentNets.filter(n => n.enabled && n.profile);
    if (!currentBrandName || !currentTargetDate || activeNets.length === 0) {
      setResults([]);
      return;
    }

    setGlobalError('');
    setLoading(true);

    try {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + parseInt(currentTargetDate));

      const fetchPromises = activeNets.map(async (net) => {
        let followers = net.currentFollowers;
        let isEstimated = net.isEstimated;
        let pictureUrl = net.pictureUrl;
        let er = net.engagementRate;

        // Si no se ha disparado el blur o sigue cargando, lo buscamos en el momento
        if (!followers) {
          try {
            const cleanProfile = net.profile.replace('@', '');
            const res = await fetch(`https://caculadora-de-proyecciones.onrender.com/api/followers?network=${net.network}&profile=${cleanProfile}`);
            const data = await res.json();
            followers = data.followers !== null ? data.followers.toString() : '5000';
            isEstimated = !!data.isEstimated;
            pictureUrl = data.pictureUrl || '';
            er = data.engagementRate || 0;
            
            // Actualizar estado local
            const idx = currentNets.findIndex(n => n.network === net.network);
            if (idx !== -1) {
              handleNetworkChange(idx, 'currentFollowers', followers);
              handleNetworkChange(idx, 'isEstimated', isEstimated);
              handleNetworkChange(idx, 'engagementRate', er);
              handleNetworkChange(idx, 'erIsEstimated', !!data.erIsEstimated);
              if (pictureUrl) handleNetworkChange(idx, 'pictureUrl', pictureUrl);
            }
          } catch (err) {
            console.error('Fetch inline error:', err);
            followers = '5000';
            isEstimated = true;
          }
        }

        const response = await fetch('https://caculadora-de-proyecciones.onrender.com/api/project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandName: currentBrandName,
            socialNetwork: net.network,
            profile: net.profile,
            currentFollowers: parseInt(followers),
            engagementRate: er,
            targetDate: futureDate.toISOString(),
            isActive: currentIsActive,
            hasAds: currentHasAds
          })
        });
        if (!response.ok) throw new Error('Error en backend');
        const data = await response.json();
        return { ...data, networkName: net.network } as ProjectionResult;
      });

      const allResults = await Promise.all(fetchPromises);
      setResults(allResults);

    } catch (err) {
      setGlobalError('Hubo un problema de conexión con el servidor.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const calculateProjection = (e: React.FormEvent) => {
    e.preventDefault();
    triggerProjection(brandName, targetDate, isActive, hasAds, networks);
  };

  // Efecto eliminado a petición del usuario para requerir clic en "Calcular" manualmente.

  const generateChartData = () => {
    if (results.length === 0) return [];
    
    const chartData = [];
    const numMonths = results[0].months;
    for (let i = 0; i <= numMonths; i++) {
        const dataPoint: any = { month: results[0].history[i]?.month || `M${i}` };
        results.forEach(r => {
            if (r.history[i]) {
                dataPoint[r.networkName] = r.history[i].followers;
            }
        });
        chartData.push(dataPoint);
    }
    return chartData;
  };

  const generateChartDataER = () => {
    if (results.length === 0) return [];
    
    const chartData = [];
    const numMonths = results[0].months;
    for (let i = 0; i <= numMonths; i++) {
        const dataPoint: any = { month: results[0].history[i]?.month || `M${i}` };
        results.forEach(r => {
            if (r.history[i]) {
                dataPoint[r.networkName] = r.history[i].er;
            }
        });
        chartData.push(dataPoint);
    }
    return chartData;
  };

  const chartData = generateChartData();
  const chartDataER = generateChartDataER();

  return (
    <div className="container" style={{ maxWidth: '1200px' }}>
      <header style={{ marginBottom: '1rem', textAlign: 'center' }}>
        <h1>
          Calculadora de <span className="text-gradient">Proyecciones</span>
        </h1>
        <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
          * Agrega múltiples redes sociales y proyéctalas simultáneamente en el gráfico evolutivo.
        </p>
      </header>

      <div className="grid-2">
        {/* Form Panel */}
        <div className="glass-panel" style={{ height: 'fit-content' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>Datos Generales</h2>
          <form onSubmit={calculateProjection}>
            
            <div className="grid-2" style={{ gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Nombre de la Marca</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ej. Mi Super Marca" 
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Tiempo (Meses)</label>
                  <select className="form-select" value={targetDate} onChange={(e) => setTargetDate(e.target.value)}>
                    <option value="3">3 meses</option>
                    <option value="6">6 meses</option>
                    <option value="12">1 año</option>
                    <option value="24">2 años</option>
                    <option value="36">3 años</option>
                  </select>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '2rem', marginTop: '0.5rem', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <label className="toggle-switch">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
                <span className="form-label">Constante Actividad</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <label className="toggle-switch">
                  <input type="checkbox" checked={hasAds} onChange={(e) => setHasAds(e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
                <span className="form-label">Pauta Publicitaria</span>
              </div>
            </div>

            <h2 style={{ marginBottom: '1rem', marginTop: '1rem', fontSize: '1.1rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem' }}>Redes a Proyectar</h2>
            
            {networks.map((net, idx) => (
              <div key={net.network} style={{ marginBottom: '1.5rem', padding: '1rem', background: net.enabled ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)', borderRadius: '12px', opacity: net.enabled ? 1 : 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={net.enabled} onChange={(e) => handleNetworkChange(idx, 'enabled', e.target.checked)} />
                    <span className="toggle-slider"></span>
                  </label>
                  <span className="form-label" style={{ color: net.enabled ? NETWORK_COLORS[net.network] : 'var(--text-secondary)' }}>
                    Activar <strong>{net.network}</strong>
                  </span>
                </div>

                {net.enabled && (
                    <>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Perfil / Username</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder={`Ej. usuario_de_${net.network.toLowerCase()}`} 
                        value={net.profile}
                        onChange={(e) => handleNetworkChange(idx, 'profile', e.target.value)}
                        onBlur={() => handleProfileBlur(idx)}
                      />
                    </div>
                    {/* Error de Scraping */}
                    {net.fetchError && (
                      <div style={{ marginTop: '1rem', padding: '0.8rem', background: 'rgba(255,8,68,0.1)', border: '1px solid var(--danger-color)', borderRadius: '8px', fontSize: '0.85rem' }}>
                        {net.fetchError}
                      </div>
                    )}
                    {/* Tarjeta Visual (Miniatura) */}
                    {net.profile && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.8rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', marginTop: '1rem' }}>
                        {net.pictureUrl && !net.imgError ? (
                          <img src={net.pictureUrl} alt="Avatar" onError={() => handleNetworkChange(idx, 'imgError', true)} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>@{net.profile}</div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span>
                              {net.currentFollowers ? `${parseInt(net.currentFollowers).toLocaleString()} seguidores` : 'Obteniendo datos...'}
                            </span>
                            {net.isEstimated && net.currentFollowers && (
                              <span style={{ fontSize: '0.72rem', color: '#ffb300', background: 'rgba(255,179,0,0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid rgba(255,179,0,0.2)' }} title="Generado de forma aproximada debido a restricciones de acceso público de la red social">
                                Estimado 🛈
                              </span>
                            )}
                          </div>
                          {net.engagementRate > 0 && (
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ color: '#4ade80' }}>📊 ER: {net.engagementRate}%</span>
                              {net.erIsEstimated && (
                                <span style={{ fontSize: '0.72rem', color: '#ffb300', background: 'rgba(255,179,0,0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid rgba(255,179,0,0.2)' }} title="Basado en benchmarks de la industria (Hootsuite, Sprout Social, RivalIQ) ajustados al tamaño de la cuenta">
                                  Benchmark 🛈
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    </>
                )}
              </div>
            ))}

            {globalError && <div style={{ color: 'var(--danger-color)', marginBottom: '1rem' }}>{globalError}</div>}

            <button type="submit" className="btn-primary" disabled={loading || !networks.some(n => n.enabled && n.currentFollowers)} style={{ width: '100%', marginTop: '1rem' }}>
              {loading ? 'Procesando Redes...' : '✓ Calcular Proyección'}
            </button>
          </form>
        </div>

        {/* Result & Graph Panel */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          {!loading && results.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', margin: 'auto' }}>
              <p>Completa el nombre de marca e ingresa perfiles para reflejar la proyección al lado de forma instantánea.</p>
            </div>
          )}

          {loading && (
             <div style={{ textAlign: 'center', margin: 'auto' }}>
                <div className="stat-value" style={{ animation: 'float 2s infinite ease-in-out' }}>📊</div>
                <p className="text-gradient">Analizando métricas y generando diagnóstico IA...</p>
             </div>
          )}

          {results.length > 0 && !loading && (
            <div>
              <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                Evolución para <span className="text-gradient">{brandName}</span>
              </h2>

              {/* CUADROS SUMMARY INDIVIDUALES (MOVIDOS ARRIBA) */}
              <div className="grid-2" style={{ gap: '1rem', marginBottom: '2rem' }}>
                {results.map((res) => (
                   <div key={res.networkName} className="stat-card" style={{ borderLeft: `4px solid ${NETWORK_COLORS[res.networkName]}`, textAlign: 'left' }}>
                     <div style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.8rem', color: NETWORK_COLORS[res.networkName] }}>
                       {res.networkName} (@{networks.find(n => n.network === res.networkName)?.profile})
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                       <span style={{color:'var(--text-secondary)', fontSize:'0.85rem'}}>Crecimiento:</span>
                       <span style={{color:'var(--accent-color)', fontWeight:'bold'}}>+{res.growth.toLocaleString()}</span>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                       <span style={{color:'var(--text-secondary)', fontSize:'0.85rem'}}>Meta:</span>
                       <span style={{fontWeight:'bold'}}>{res.projectedFollowers.toLocaleString()}</span>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop:'0.5rem' }}>
                       <span style={{color:'var(--text-secondary)', fontSize:'0.85rem'}}>ER Actual:</span>
                       <span style={{color:'#4ade80', fontWeight:'bold'}}>{res.currentER}%</span>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                       <span style={{color:'var(--text-secondary)', fontSize:'0.85rem'}}>ER Proyectado:</span>
                       <span style={{color: res.projectedER < res.currentER ? '#f87171' : '#4ade80'}}>{res.projectedER}%</span>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                       <span style={{color:'var(--text-secondary)', fontSize:'0.85rem'}}>ER Modificado:</span>
                       <span>{res.interactionRate}%</span>
                     </div>
                   </div>
                ))}
              </div>

              {/* GRAFICO COMPARATIVO SEGUIDORES */}
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Evolución de Seguidores</h3>
              <div style={{ width: '100%', height: '350px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1rem 1rem 1rem 0', marginBottom: '2rem' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="month" stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                    <YAxis stroke="var(--text-secondary)" tick={{fontSize: 12}} width={70} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--panel-bg)', borderColor: 'var(--panel-border)', borderRadius: '8px' }}
                      itemStyle={{ color: 'var(--text-primary)' }}
                    />
                    <Legend />
                    {results.map((res) => (
                       <Line 
                         key={res.networkName}
                         type="monotone" 
                         dataKey={res.networkName} 
                         stroke={NETWORK_COLORS[res.networkName] || '#fff'} 
                         strokeWidth={3}
                         dot={{ r: 4 }}
                         activeDot={{ r: 6 }} 
                       />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* GRAFICO COMPARATIVO ER */}
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Evolución del Engagement Rate (ER)</h3>
              <div style={{ width: '100%', height: '350px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1rem 1rem 1rem 0', marginBottom: '2rem' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartDataER}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="month" stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                    <YAxis stroke="var(--text-secondary)" tick={{fontSize: 12}} width={70} domain={['auto', 'auto']} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--panel-bg)', borderColor: 'var(--panel-border)', borderRadius: '8px' }}
                      itemStyle={{ color: 'var(--text-primary)' }}
                      formatter={(value: any) => [value + '%', 'Engagement Rate']}
                    />
                    <Legend />
                    {results.map((res) => (
                       <Line 
                         key={res.networkName}
                         type="monotone" 
                         dataKey={res.networkName} 
                         stroke={NETWORK_COLORS[res.networkName] || '#fff'} 
                         strokeWidth={3}
                         dot={{ r: 4 }}
                         activeDot={{ r: 6 }} 
                       />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* DIAGNÓSTICO Y RECOMENDACIONES DE LA IA */}
              <div style={{ 
                background: 'linear-gradient(135deg, rgba(20, 25, 45, 0.95) 0%, rgba(10, 15, 30, 0.95) 100%)',
                border: '1px solid rgba(0, 242, 254, 0.3)',
                boxShadow: '0 8px 32px 0 rgba(0, 242, 254, 0.05)',
                borderRadius: '16px',
                padding: '1.5rem',
                marginBottom: '2rem',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{
                  position: 'absolute',
                  top: '-50px',
                  right: '-50px',
                  width: '150px',
                  height: '150px',
                  background: 'rgba(0, 242, 254, 0.15)',
                  filter: 'blur(40px)',
                  borderRadius: '50%',
                  pointerEvents: 'none'
                }}></div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🤖</span>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 600, background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Diagnóstico y Condiciones de Éxito de la IA
                  </h3>
                </div>

                <p style={{ fontSize: '0.92rem', color: '#e5e7eb', lineHeight: '1.5', marginBottom: '1.5rem', borderLeft: '3px solid var(--accent-color)', paddingLeft: '0.8rem' }}>
                  La IA ha evaluado la audiencia y engagement de <strong>{brandName}</strong>. Esta proyección de crecimiento simultáneo es viable <strong>siempre y cuando se cumplan estrictamente las condiciones recomendadas</strong> a continuación:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {results.map((res) => (
                    <div key={res.networkName} style={{ background: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem', color: NETWORK_COLORS[res.networkName], fontWeight: 600, fontSize: '0.95rem' }}>
                        <span>{res.networkName === 'Instagram' ? '📸' : res.networkName === 'TikTok' ? '🎵' : res.networkName === 'X' ? '🐦' : '👥'}</span>
                        <span>{res.networkName} (@{networks.find(n => n.network === res.networkName)?.profile})</span>
                      </div>
                      
                      {res.aiSummary && (
                        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '0.8rem', fontStyle: 'italic', lineHeight: '1.4' }}>
                          "{res.aiSummary}"
                        </p>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {res.aiRecommendations?.map((rec, idx) => (
                          <div key={idx} style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '0.2rem',
                            padding: '0.6rem 0.8rem', 
                            background: rec.status === 'warning' ? 'rgba(255, 8, 68, 0.06)' : rec.status === 'success' ? 'rgba(0, 242, 254, 0.04)' : 'rgba(255, 255, 255, 0.03)', 
                            borderLeft: `3px solid ${rec.status === 'warning' ? 'var(--danger-color)' : rec.status === 'success' ? 'var(--accent-color)' : 'var(--text-secondary)'}`,
                            borderRadius: '4px' 
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: rec.status === 'warning' ? '#f87171' : '#f3f4f6' }}>
                                {rec.status === 'warning' ? '⚠️' : '🎯'} {rec.condition}
                              </span>
                              <span style={{ fontSize: '0.78rem', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.4rem', borderRadius: '4px', color: '#10b981', fontWeight: 500 }}>
                                {rec.impact}
                              </span>
                            </div>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                              {rec.recommendation}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)', borderRadius: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <p style={{ marginBottom: '0.5rem' }}><strong>Resumen Metodológico:</strong> Curva de crecimiento compuesto utilizando modelado individual cruzado con la actividad del perfil y un histórico de crecimiento en base a la línea temporal seleccionada para cada red simultánea.</p>
                <p><strong>Aviso Legal y Fuente de la Fórmula:</strong> Esta calculadora de proyección extrae su modelado del <em>Teorema de Interés Compuesto Tradicional</em> trasladado al ámbito digital. Las tasas paramétricas de apreciación e interacción son estimadas combinando <em>Benchmarks de la Industria del Social Media (Tasas de crecimiento orgánico global)</em>, multiplicadores de pauta e histórico público algorítmico, y no representan una garantía financiera comercial absoluta por parte de las plataformas Meta, X o TikTok.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
