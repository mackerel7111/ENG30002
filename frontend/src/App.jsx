import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";

const API_BASE = "http://127.0.0.1:8000";

const TREND_MAP = {
  rising: { icon: "📈", label: "Rising" },
  decreasing: { icon: "📉", label: "Decreasing" },
  stable: { icon: "➖", label: "Steady" }
};

function ClockWidget() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateString = time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="card hero-widget" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '24px' }}>
       {/* Top Section: Current Status */}
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span style={{ fontSize: '2.5rem' }}>🌤️</span>
                <div>
                   <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>32°C</div>
                   <div style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600, marginTop: '2px' }}>Partly Cloudy</div>
                </div>
             </div>
             <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}>
                Monitoring Active - <span style={{color: '#34d399'}}>System Nominal</span>
             </div>
          </div>
          <div style={{ textAlign: 'right' }}>
             <div style={{ fontSize: '2.4rem', fontWeight: 800, color: '#fff', letterSpacing: '-1px', lineHeight: 1, margin: 0 }}>{timeString}</div>
             <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600, marginTop: '4px', margin: 0 }}>{dateString}</div>
          </div>
       </div>

       {/* Middle Section: Precipitation Forecast */}
       <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, marginBottom: '14px', letterSpacing: '0.5px' }}>Precipitation Forecast</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
             <ForecastRow day="Sat" icon="🌧️" min={10} max={25} absMax={60} color1="#38bdf8" color2="#818cf8" />
             <ForecastRow day="Sun" icon="⛈️" min={40} max={60} absMax={60} color1="#f43f5e" color2="#e11d48" />
             <ForecastRow day="Mon" icon="☁️" min={0} max={5} absMax={60} color1="#94a3b8" color2="#cbd5e1" />
          </div>
       </div>

       {/* Bottom Section: Compact Health */}
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.25)', padding: '12px 18px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
             <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#34d399', borderRadius: '50%', boxShadow: '0 0 8px #34d399' }} />
             Sensors: Online
          </div>
          <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.1)' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
             <span style={{ fontSize: '1rem' }}>📶</span> Ping: 24ms
          </div>
          <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.1)' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
             <span style={{ fontSize: '1rem', color: '#a78bfa' }}>🔋</span> Power: 100%
          </div>
       </div>
    </div>
  );
}

function ForecastRow({ day, icon, min, max, absMax, color1, color2 }) {
  const left = (min / absMax) * 100;
  const width = ((max - min) / absMax) * 100 || 2;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
       <span style={{ width: '28px', fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600 }}>{day}</span>
       <span style={{ fontSize: '1.2rem', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>{icon}</span>
       <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', position: 'relative' }}>
          <motion.div 
            initial={{ width: 0, left: `${left}%` }}
            animate={{ width: `${width}%` }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
            style={{ 
              position: 'absolute', top: 0, bottom: 0, borderRadius: '4px',
              background: `linear-gradient(90deg, ${color1}, ${color2})`,
              boxShadow: `0 0 10px ${color1}88`
            }} 
          />
       </div>
       <span style={{ width: '64px', textAlign: 'right', fontSize: '0.85rem', color: '#fff', fontWeight: 600 }}>{min}-{max}mm</span>
    </div>
  );
}

function SensorPill({ index, value, unit, statusColor, tooltip }) {
  const isErr = statusColor === '#ef4444';
  return (
    <div title={tooltip} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px 4px', textAlign: 'center', cursor: 'help', position: 'relative' }}>
       <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700 }}>S{index}</div>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor, boxShadow: `0 0 8px ${statusColor}88` }} />
       </div>
       {isErr ? (
         <div style={{ fontSize: '1rem', color: '#ef4444', fontWeight: 800 }}>ERR</div>
       ) : (
         <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
            <span style={{ fontSize: '1.25rem', color: '#fff', fontWeight: 800 }}>{value}</span>
            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, marginLeft: '2px' }}>{unit}</span>
         </div>
       )}
    </div>
  );
}

function HorizontalBarWidget({ title, value, unit, max, icon, trend, thresholds, sensors }) {
  const [expanded, setExpanded] = useState(false);
  let activeZone = 'normal';
  if (value >= thresholds[1].limit) activeZone = 'critical';
  else if (value >= thresholds[0].limit) activeZone = 'warning';

  const colors = {
     normal: { bg: 'rgba(56, 189, 248, 0.15)', pip: '#38bdf8', text: '#38bdf8' },
     warning: { bg: 'rgba(250, 204, 21, 0.15)', pip: '#facc15', text: '#facc15' },
     critical: { bg: 'rgba(248, 113, 113, 0.15)', pip: '#f87171', text: '#f87171' }
  };
  const activeColor = colors[activeZone];

  const trendLabels = { rising: "Rising", decreasing: "Decreasing", stable: "Steady" };
  const trendArrows = { rising: "↑", decreasing: "↓", stable: "" };
  const zoneLabels = { normal: "Normal", warning: "Warning", critical: "CRITICAL" };

  const statusText = `${zoneLabels[activeZone]} - ${trendLabels[trend] || 'Steady'}`;
  const trendIndicator = trendArrows[trend] || "";
  const percentage = Math.min((value / max) * 100, 100) || 0;
  const w1 = (thresholds[0].limit / max) * 100;
  const w2 = ((thresholds[1].limit - thresholds[0].limit) / max) * 100;
  const w3 = 100 - w1 - w2;

  return (
    <motion.div 
       className="card" 
       onClick={() => setExpanded(!expanded)}
       whileHover={{ scale: 1.02, borderColor: 'rgba(255,255,255,0.2)' }} 
       style={{ 
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between', 
          cursor: 'pointer', height: '320px', transition: 'border-color 0.3s', width: '100%'
       }}>
      <div>
         <motion.div layout style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: expanded ? '12px' : '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
               <div className="widget-icon" style={{ background: activeColor.bg, color: activeColor.text, width: '46px', height: '46px', fontSize: '1.4rem', borderRadius: '14px' }}>
                  {icon}
               </div>
               <div>
                  <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc', fontWeight: 600 }}>{title}</h4>
                  <span style={{ color: activeColor.text, fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                     {statusText}
                  </span>
               </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#10b981', fontWeight: 800, letterSpacing: '0.5px' }}>
                  <motion.span 
                    animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 2 }}
                    style={{ width: '6px', height: '6px', background: '#10b981', borderRadius: '50%' }} 
                  />
                  LIVE
               </div>
               <motion.div animate={{ rotate: expanded ? 180 : 0 }} style={{ color: '#64748b' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
               </motion.div>
            </div>
         </motion.div>

         <motion.div layout style={{ marginBottom: expanded ? '8px' : '24px', display: 'flex', alignItems: 'baseline' }}>
            <motion.span layout style={{ fontSize: expanded ? '2rem' : '2.8rem', fontWeight: 800, color: '#fff', letterSpacing: '-1px' }}>{value}</motion.span>
            <span style={{ color: '#94a3b8', fontSize: '1.2rem', fontWeight: 600, marginLeft: '3px' }}>{unit}</span>
            <span style={{ color: activeColor.text, fontSize: '1.4rem', fontWeight: 800, marginLeft: '12px' }}>{trendIndicator}</span>
         </motion.div>
      </div>

      <motion.div layout style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
         <div style={{ position: 'relative', width: '100%' }}>
            <div style={{ display: 'flex', height: '12px', borderRadius: '6px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
               <div style={{ width: `${w1}%` }} />
               <div style={{ width: `${w2}%`, background: 'rgba(250, 204, 21, 0.6)' }} />
               <div style={{ width: `${w3}%`, background: 'rgba(248, 113, 113, 0.5)' }} />
            </div>
            
            <div style={{ position: 'absolute', left: `${w1}%`, top: '-4px', bottom: '-4px', width: '2px', background: 'rgba(255,255,255,0.4)' }} title={`Warning Threshold: ${thresholds[0].limit}${unit}`} />
            <div style={{ position: 'absolute', left: `${w1 + w2}%`, top: '-4px', bottom: '-4px', width: '2px', background: 'rgba(255,255,255,0.4)' }} title={`Critical Threshold: ${thresholds[1].limit}${unit}`} />

            <motion.div 
               initial={{ left: 0 }}
               animate={{ left: `${percentage}%` }}
               transition={{ type: 'spring', bounce: 0.2, duration: 1 }}
               style={{ 
                  position: 'absolute', top: '-6px', height: '24px', width: '6px', borderRadius: '3px',
                  background: activeColor.pip, boxShadow: `0 0 16px ${activeColor.pip}`, transform: 'translateX(-50%)', zIndex: 10,
                  display: 'flex', justifyContent: 'center'
               }} 
            >
               <div style={{ width: '2px', height: '100%', background: '#ffffff', borderRadius: '1px', opacity: 0.9 }}></div>
            </motion.div>
         </div>
         <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginTop: '10px' }}>
            <span>0{unit}</span>
            <span>{max}{unit}</span>
         </div>

         <AnimatePresence>
           {expanded && sensors && (
             <motion.div 
               initial={{ height: 0, opacity: 0, marginTop: 0 }} 
               animate={{ height: 'auto', opacity: 1, marginTop: '12px' }} 
               exit={{ height: 0, opacity: 0, marginTop: 0 }}
               style={{ overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}
             >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                   {sensors.map((s, i) => {
                      const validSensors = sensors.filter(x => x !== null && x !== undefined);
                      const avg = validSensors.reduce((a, b) => a + b, 0) / (validSensors.length || 1);
                      const isErr = s === null || s === undefined;
                      const isAnomalous = !isErr && Math.abs(s - avg) > (max * 0.15);
                      
                      let statusColor = '#34d399';
                      if (isErr) statusColor = '#ef4444';
                      else if (isAnomalous) statusColor = '#eab308';
                      
                      const tooltips = ["North Bank", "South Bank", "Upstream", "Downstream"];
                      return <SensorPill key={i} index={i+1} value={s} unit={unit} statusColor={statusColor} tooltip={tooltips[i % tooltips.length]} />
                   })}
                </div>
             </motion.div>
           )}
         </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function CircularGauge({ value, max, unit, color, title, icon, trendIcon, trendLabel, sensors }) {
  const [expanded, setExpanded] = useState(false);
  const percentage = Math.min((value / max) * 100, 100) || 0;
  const radius = 55;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <motion.div 
       className="card" 
       onClick={() => setExpanded(!expanded)}
       whileHover={{ scale: 1.02 }} style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '1.05rem' }}>{title}</span>
        <span style={{ fontSize: '1.2rem', opacity: 0.9 }}>{icon}</span>
      </div>
      {trendLabel && (
         <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '4px' }}>
            <span>{trendIcon}</span> {trendLabel}
         </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, padding: '10px 0' }}>
        <div style={{ position: 'relative', width: 140, height: 140 }}>
          <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="70" cy="70" r={radius} stroke="rgba(0,0,0,0.3)" strokeWidth="12" fill="none" />
            <motion.circle 
              cx="70" cy="70" r={radius} 
              stroke={color} strokeWidth="12" fill="none" strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: color, fontSize: '0.85rem', fontWeight: 600, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '1px' }}>{title.split(' ')[0]}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
              <span style={{ fontSize: '2.2rem', fontWeight: 700, color: '#fff' }}>{value}</span>
              <span style={{ fontSize: '1rem', color: '#94a3b8' }}>{unit}</span>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && sensors && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: 'auto', opacity: 1 }} 
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '16px', paddingTop: '16px' }}
          >
             <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                {sensors.map((s, i) => (
                  <SensorPill key={i} index={i+1} value={s} unit={unit} max={max} type="circle" color={color} />
                ))}
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function RiskCard({ riskLevel, floodType }) {
  const getColors = () => {
     if (riskLevel === 'CRITICAL') return ['#ef4444', '#b91c1c'];
     if (riskLevel === 'WARNING') return ['#f59e0b', '#b45309'];
     return ['#22c55e', '#15803d'];
  };
  const [c1, c2] = getColors();

  return (
    <motion.div className="card" style={{ background: `linear-gradient(135deg, rgba(30,41,59,0.4), ${c2}22)`, width: '100%' }} whileHover={{ scale: 1.02 }}>
       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '1.05rem', fontWeight: 600 }}>Risk Assessment</h4>
          <span>🛡️</span>
       </div>
       <div style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, borderRadius: '20px', padding: '16px', textAlign: 'center', boxShadow: `0 8px 24px ${c1}44` }}>
          <h2 style={{ margin: 0, fontSize: '1.8rem', color: '#fff', fontWeight: 800 }}>{riskLevel}</h2>
       </div>
       {floodType && (
         <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: '16px', marginTop: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '1.5rem' }}>🌊</span>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc' }}>{floodType} Flood Active</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>Mitigation systems engaged.</div>
            </div>
         </div>
       )}
    </motion.div>
  );
}

function ControlsCard({ override, setOverride, sluiceAperture, setSluiceAperture, pumpPower, setPumpPower, logs, addActionLog }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', flex: 1, minHeight: '380px' }}>
       {/* Header with Override Toggle */}
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
         <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '1.05rem', fontWeight: 600 }}>Mitigation Controls</h4>
         <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: override ? '#ef4444' : '#94a3b8', fontWeight: 800, letterSpacing: '0.5px' }}>
               {override ? 'OVERRIDE' : 'AUTO'}
            </span>
            <div 
              onClick={() => { setOverride(!override); addActionLog(!override ? 'SYSTEM OVERRIDE: MANUAL CONTROL' : 'SYSTEM RETURNED TO AUTO'); }}
              style={{
                width: '40px', height: '22px', borderRadius: '12px',
                background: override ? '#ef4444' : 'rgba(255,255,255,0.1)',
                position: 'relative', cursor: 'pointer', transition: 'background 0.3s'
              }}
            >
               <motion.div 
                 layout
                 style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px' }}
                 animate={{ left: override ? '21px' : '3px' }}
                 transition={{ type: "spring", stiffness: 500, damping: 30 }}
               />
            </div>
         </div>
       </div>
       
       <SliderControl title="Sluice Gate Aperture" value={sluiceAperture} setValue={setSluiceAperture} addActionLog={addActionLog} disabled={!override} unit="%" color="#f97316" />
       <SliderControl title="Water Pump Power" value={pumpPower} setValue={setPumpPower} addActionLog={addActionLog} disabled={!override} unit="%" color="#3b82f6" />
       
       {/* Terminal window for logs */}
       <div style={{ flex: 1, background: 'rgba(15, 23, 42, 0.6)', borderRadius: '16px', padding: '16px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', marginTop: '8px' }}>
          <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 800, marginBottom: '8px', letterSpacing: '0.5px' }}>ACTION LOGS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
             {logs.map((log, i) => (
                <div key={i} style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                   <span style={{ color: '#38bdf8' }}>{log.time}</span> <span style={{ color: '#475569' }}>-</span> {log.msg}
                </div>
             ))}
          </div>
       </div>
    </div>
  );
}

function SliderControl({ title, value, setValue, addActionLog, disabled, unit, color }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '20px', padding: '16px', opacity: disabled ? 0.5 : 1, transition: 'opacity 0.3s', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
         <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.9rem' }}>{title}</span>
         <span style={{ fontWeight: 800, color: '#fff', fontSize: '1.1rem' }}>{value}{unit}</span>
      </div>
      <input 
         type="range" min="0" max="100" value={value} 
         onChange={(e) => setValue(Number(e.target.value))}
         onMouseUp={(e) => addActionLog(`MANUAL: ${title} set to ${e.target.value}%`)}
         onTouchEnd={(e) => addActionLog(`MANUAL: ${title} set to ${e.target.value}%`)}
         disabled={disabled}
         style={{ width: '100%', cursor: disabled ? 'not-allowed' : 'pointer', accentColor: color }} 
      />
    </div>
  );
}

export default function App() {
  const [live, setLive] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [selectedArea, setSelectedArea] = useState(1);
  
  const baseLogs = [{ time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'}), msg: "System Nominal." }];
  const [areaControls, setAreaControls] = useState({
    1: { override: false, sluice: 0, pump: 0, logs: [...baseLogs] },
    2: { override: false, sluice: 0, pump: 0, logs: [...baseLogs] }
  });

  const currentControls = areaControls[selectedArea] || areaControls[1];

  const updateCurrentControls = (updates) => {
     setAreaControls(prev => ({
        ...prev,
        [selectedArea]: { ...prev[selectedArea], ...updates }
     }));
  };

  const addActionLog = (msg) => {
     setAreaControls(prev => {
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'});
        const newLogs = [...prev[selectedArea].logs, { time, msg }].slice(-5);
        return {
           ...prev,
           [selectedArea]: { ...prev[selectedArea], logs: newLogs }
        };
     });
  };

  useEffect(() => {
    if (!live || selectedArea === 'overall' || currentControls.override) return;

    const HIGH_RIVER = 5;
    const LOW_RAIN = 5;
    const HIGH_RAIN = 20;
    const LOW_RIVER = 4;

    const newSluice = (live.river_level.fused_value > HIGH_RIVER && live.rain_level.fused_value < LOW_RAIN) ? 100 : 0;
    const newPump = (live.rain_level.fused_value > HIGH_RAIN && live.river_level.fused_value < LOW_RIVER) ? 100 : 0;
    
    if (newSluice !== currentControls.sluice || newPump !== currentControls.pump) {
       setAreaControls(prev => {
          if (prev[selectedArea].override) return prev;
          
          let newLogs = [...prev[selectedArea].logs];
          const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'});
          let changed = false;

          if (newSluice !== prev[selectedArea].sluice) {
             newLogs.push({ time, msg: `AUTO: Sluice Gate set to ${newSluice}%` });
             changed = true;
          }
          if (newPump !== prev[selectedArea].pump) {
             newLogs.push({ time, msg: `AUTO: Water Pump set to ${newPump}%` });
             changed = true;
          }

          if (changed) {
             return {
                ...prev,
                [selectedArea]: { ...prev[selectedArea], sluice: newSluice, pump: newPump, logs: newLogs.slice(-5) }
             };
          }
          return prev;
       });
    }
  }, [live, currentControls.override, currentControls.sluice, currentControls.pump, selectedArea]);

  useEffect(() => {
    if (selectedArea === 'overall') {
      setLive(null);
      setError("Overall system overview will be implemented later.");
      return;
    }

    let abortController = new AbortController();

    const fetchAll = async () => {
      abortController.abort();
      abortController = new AbortController();
      const signal = abortController.signal;

      try {
        const [liveRes, histRes] = await Promise.all([
          axios.get(`${API_BASE}/api/live?area=${selectedArea}`, { signal }),
          axios.get(`${API_BASE}/api/history?area=${selectedArea}`, { signal })
        ]);
        setLive(liveRes.data);
        setHistory(histRes.data);
        setError("");
      } catch (e) {
        if (axios.isCancel(e) || e.name === 'CanceledError') return;
        console.error("[fetchAll error]", e);
        setError("Cannot connect to backend API. Is FastAPI running on port 8000?");
      }
    };

    setLive(null);
    setHistory([]);
    fetchAll();
    const id = setInterval(fetchAll, 1000);
    return () => {
      clearInterval(id);
      abortController.abort();
    };
  }, [selectedArea]);


  const chartData = history.map((item) => ({
    ...item,
    t: item.timestamp?.split(" ")[1] || item.timestamp
  }));

  const getTrendData = (trendStr) => TREND_MAP[trendStr] || TREND_MAP.stable;

  return (
    <div className="app">
      <header className="top-nav">
        <div className="nav-links">
          <span className={`nav-link ${selectedArea === 'overall' ? 'active' : ''}`} onClick={() => setSelectedArea('overall')}>Overall</span>
          <span className={`nav-link ${selectedArea === 1 ? 'active' : ''}`} onClick={() => setSelectedArea(1)}>Area 1</span>
          <span className={`nav-link ${selectedArea === 2 ? 'active' : ''}`} onClick={() => setSelectedArea(2)}>Area 2</span>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      {live && (
        <AnimatePresence>
          <motion.div 
            className="dashboard-grid"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="col-span-4" style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
              <ClockWidget />
              <ControlsCard 
                 override={currentControls.override} 
                 setOverride={(val) => updateCurrentControls({ override: val })} 
                 sluiceAperture={currentControls.sluice} 
                 setSluiceAperture={(val) => updateCurrentControls({ sluice: val })} 
                 pumpPower={currentControls.pump} 
                 setPumpPower={(val) => updateCurrentControls({ pump: val })} 
                 logs={currentControls.logs} 
                 addActionLog={addActionLog}
              />
            </div>

            <div className="col-span-8" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', alignItems: 'start' }}>
                <HorizontalBarWidget 
                  title="River Level" value={live.river_level.fused_value} unit="m" max={10} 
                  icon="🌊" trend={live.trends?.river_level || 'stable'}
                  thresholds={[{ limit: 4 }, { limit: 5 }]} sensors={live.river_level.sensors}
                />
                <HorizontalBarWidget 
                  title="Rain Level" value={live.rain_level.fused_value} unit="mm" max={50} 
                  icon="🌧️" trend={live.trends?.rain_level || 'stable'}
                  thresholds={[{ limit: 10 }, { limit: 20 }]} sensors={live.rain_level.sensors}
                />
                <HorizontalBarWidget 
                  title="Soil Moisture" value={live.soil_moisture.fused_value} unit="%" max={100} 
                  icon="🌱" trend={live.trends?.soil_moisture || 'stable'}
                  thresholds={[{ limit: 60 }, { limit: 80 }]} sensors={live.soil_moisture.sensors}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px', alignItems: 'start' }}>
                <CircularGauge title="Flood Prob" value={(live.flood_probability * 100).toFixed(0)} max={100} unit="%" color="#f59e0b" icon="⚠️" />
                <RiskCard riskLevel={live.risk_level} floodType={live.flood_type} />
              </div>
              
              <div className="card">
                 <h4 style={{ margin: '0 0 16px 0', color: '#f8fafc', fontSize: '1.1rem', fontWeight: 600 }}>Historical Trends</h4>
                 <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <XAxis dataKey="t" stroke="rgba(255,255,255,0.2)" tick={{fill: '#94a3b8'}} minTickGap={30} />
                        <YAxis stroke="rgba(255,255,255,0.2)" tick={{fill: '#94a3b8'}} />
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: "rgba(15, 23, 42, 0.85)", 
                            backdropFilter: "blur(12px)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "16px",
                            color: "#f8fafc"
                          }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="river_level" stroke="#ec4899" strokeWidth={3} dot={false} name="River (m)" />
                        <Line type="monotone" dataKey="rain_level" stroke="#38bdf8" strokeWidth={3} dot={false} name="Rain (mm)" />
                        <Line type="monotone" dataKey="soil_moisture" stroke="#a855f7" strokeWidth={3} dot={false} name="Soil Moisture (%)" />
                      </LineChart>
                    </ResponsiveContainer>
                 </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}