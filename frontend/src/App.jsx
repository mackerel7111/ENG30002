import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from "recharts";

const API_BASE = "http://127.0.0.1:8000";

const TREND_CONFIG = {
  rising: { symbol: "▲", label: "Rising", color: "#ef4444" },
  decreasing: { symbol: "▼", label: "Decreasing", color: "#4ade80" },
  stable: { symbol: "●", label: "Stable", color: "#94a3b8" },
};

const RISK_CONFIG = {
  LOW: { color: "#4ade80", bg: "rgba(74, 222, 128, 0.1)" },
  WARNING: { color: "#fbbf24", bg: "rgba(251, 191, 36, 0.1)" },
  CRITICAL: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)" },
};

const FLOOD_TYPE_CONFIG = {
  Fluvial: {
    icon: "🌊",
    color: "#bfdbfe",
    bg: "rgba(29, 78, 216, 0.3)",
    hint: "Open sluice gates to relieve river pressure.",
  },
  Pluvial: {
    icon: "🌧️",
    color: "#bae6fd",
    bg: "rgba(3, 105, 161, 0.3)",
    hint: "Activate drainage pumps to clear surface water.",
  },
  Compound: {
    icon: "⚠️",
    color: "#fed7aa",
    bg: "rgba(124, 45, 18, 0.3)",
    hint: "Activate ALL mitigation systems immediately.",
  },
};

function FloodTypeBadge({ type }) {
  if (!type) return null;
  const cfg = FLOOD_TYPE_CONFIG[type];
  if (!cfg) return null;
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      style={{
        marginTop: "8px",
        background: cfg.bg,
        borderRadius: "10px",
        padding: "8px 10px",
        color: cfg.color,
        border: `1px solid ${cfg.color}44`
      }}>
      <div style={{ fontWeight: 800, fontSize: "0.9rem", marginBottom: "3px" }}>
        {cfg.icon} {type} Flood
      </div>
      <div style={{ fontSize: "0.75rem", opacity: 0.9, lineHeight: 1.4 }}>
        {cfg.hint}
      </div>
    </motion.div>
  );
}

function SensorCard({ title, value, unit, trend }) {
  const t = TREND_CONFIG[trend] || TREND_CONFIG.stable;
  return (
    <motion.div 
      className="card"
      whileHover={{ y: -5, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <p className="card-title">{title}</p>
      <h2>
        {value} <span>{unit}</span>
      </h2>
      <p style={{
        color: t.color,
        fontSize: "0.82rem",
        fontWeight: 700,
        marginTop: "6px",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        letterSpacing: "0.3px",
      }}>
        <span style={{ fontSize: "0.75rem" }}>{t.symbol}</span> {t.label}
      </p>
    </motion.div>
  );
}

export default function App() {
  const [live, setLive] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [sluiceAuto, setSluiceAuto] = useState(true);
  const [sluiceActive, setSluiceActive] = useState(false);
  const [pumpAuto, setPumpAuto] = useState(true);
  const [pumpActive, setPumpActive] = useState(false);

  useEffect(() => {
    if (!live) return;
    const HIGH_RIVER = 5;
    const LOW_RAIN = 5;
    const HIGH_RAIN = 20;
    const LOW_RIVER = 4;

    if (sluiceAuto) {
      setSluiceActive(live.river_level > HIGH_RIVER && live.rain_level < LOW_RAIN);
    }
    if (pumpAuto) {
      setPumpActive(live.rain_level > HIGH_RAIN && live.river_level < LOW_RIVER);
    }
  }, [live, sluiceAuto, pumpAuto]);


  const riskClass = useMemo(() => {
    if (!live?.risk_level) return "risk-neutral";
    return live.risk_level === "CRITICAL"
      ? "risk-high"
      : live.risk_level === "WARNING"
        ? "risk-medium"
        : "risk-low";
  }, [live]);

  const fetchAll = async () => {
    try {
      const [liveRes, histRes] = await Promise.all([
        axios.get(`${API_BASE}/api/live`),
        axios.get(`${API_BASE}/api/history`)
      ]);

      setLive(liveRes.data);
      setHistory(histRes.data);
      setError("");
    } catch {
      setError("Cannot connect to backend API. Is FastAPI running on port 8000?");
    }
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 3000);
    return () => clearInterval(id);
  }, []);

  const chartData = history.map((item) => ({
    ...item,
    t: item.timestamp?.split(" ")[1] || item.timestamp // Get HH:MM:SS part
  }));

  return (
    <div className="app">
      <header>
        <h1>Smart Flood Monitoring Dashboard</h1>
        <p>Live sensors + Flood risk prediction</p>
      </header>

      {error && <div className="error">{error}</div>}

      {live && (
        <>
          <section className="cards">
            <SensorCard
              title="River Level"
              value={live.river_level}
              unit="m"
              trend={live.trends?.river_level}
            />
            <SensorCard
              title="Rain Level"
              value={live.rain_level}
              unit="mm"
              trend={live.trends?.rain_level}
            />
            <SensorCard
              title="Soil Moisture"
              value={live.soil_moisture}
              unit="%"
              trend={live.trends?.soil_moisture}
            />
            <motion.div 
              className={`card risk ${riskClass}`}
              whileHover={{ y: -5, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <p className="card-title" style={{ color: "rgba(255,255,255,0.85)" }}>Flood Risk</p>
              <h2 style={{ fontSize: "1.6rem", margin: "8px 0 4px" }}>
                {live.risk_level}
              </h2>
              <div style={{
                display: "inline-block",
                background: "rgba(255,255,255,0.2)",
                borderRadius: "20px",
                padding: "2px 10px",
                fontSize: "0.82rem",
                fontWeight: 600,
                marginBottom: "4px",
              }}>
                {(live.flood_probability * 100).toFixed(1)}%
              </div>
              <FloodTypeBadge type={live.flood_type} />
            </motion.div>
          </section>

          <section className="chart-wrap controls-section">
            <h3>Infrastructure Controls</h3>
            <div className="cards">
              <motion.div 
                className="card control-card"
                whileHover={{ y: -5, scale: 1.01 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <div className="control-header">
                  <p className="card-title">Sluice Gate</p>
                  <span className={`status-badge ${sluiceActive ? 'active' : 'inactive'}`}>
                    {sluiceActive ? 'OPEN' : 'CLOSED'}
                  </span>
                </div>
                <div className="control-actions">
                  <button
                    className={`mode-btn ${sluiceAuto ? 'active' : ''}`}
                    onClick={() => setSluiceAuto(true)}
                  >
                    Auto
                  </button>
                  <button
                    className={`mode-btn ${!sluiceAuto ? 'active' : ''}`}
                    onClick={() => setSluiceAuto(false)}
                  >
                    Manual
                  </button>
                </div>
                {!sluiceAuto && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="manual-actions"
                  >
                    <button
                      className={`action-btn ${sluiceActive ? 'active' : ''}`}
                      onClick={() => setSluiceActive(true)}
                    >
                      Open Gate
                    </button>
                    <button
                      className={`action-btn ${!sluiceActive ? 'active' : ''}`}
                      onClick={() => setSluiceActive(false)}
                    >
                      Close Gate
                    </button>
                  </motion.div>
                )}
              </motion.div>

              <motion.div 
                className="card control-card"
                whileHover={{ y: -5, scale: 1.01 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <div className="control-header">
                  <p className="card-title">Water Pump</p>
                  <span className={`status-badge ${pumpActive ? 'active' : 'inactive'}`}>
                    {pumpActive ? 'ON' : 'OFF'}
                  </span>
                </div>
                <div className="control-actions">
                  <button
                    className={`mode-btn ${pumpAuto ? 'active' : ''}`}
                    onClick={() => setPumpAuto(true)}
                  >
                    Auto
                  </button>
                  <button
                    className={`mode-btn ${!pumpAuto ? 'active' : ''}`}
                    onClick={() => setPumpAuto(false)}
                  >
                    Manual
                  </button>
                </div>
                {!pumpAuto && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="manual-actions"
                  >
                    <button
                      className={`action-btn ${pumpActive ? 'active' : ''}`}
                      onClick={() => setPumpActive(true)}
                    >
                      Turn On
                    </button>
                    <button
                      className={`action-btn ${!pumpActive ? 'active' : ''}`}
                      onClick={() => setPumpActive(false)}
                    >
                      Turn Off
                    </button>
                  </motion.div>
                )}
              </motion.div>
            </div>
          </section>

          <section className="chart-wrap">
            <h3>Recent Live Trends</h3>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="t" minTickGap={25} />
                  <YAxis />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "rgba(15, 23, 42, 0.9)", 
                      borderRadius: "12px",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                      color: "#f8fafc"
                    }}
                    labelStyle={{ 
                      color: "#cbd5e1", 
                      fontWeight: 600, 
                      marginBottom: "6px" 
                    }}
                    itemStyle={{
                      fontWeight: 500
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="river_level"
                    name="River (m)"
                    stroke="#0ea5e9"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="rain_level"
                    name="Rain (mm)"
                    stroke="#f97316"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="soil_moisture"
                    name="Soil Moisture (%)"
                    stroke="#22c55e"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </div>
  );
}