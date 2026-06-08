import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import logoUrl from "./FloodWatchLogo.png";
import {
  Sun, Moon, CloudRain, CloudLightning, Cloud,
  Wifi, BatteryFull, Waves, Sprout, AlertTriangle, ShieldAlert,
  Maximize2, Minimize2, Lock
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceArea
} from "recharts";

const API_BASE = "http://127.0.0.1:8000";
const CHART_WINDOW = 60;

/* ── Design tokens (mirror of CSS custom properties for inline use) ─────────*/
const T = {
  bgPage: "var(--bg-page)",
  bgCard: "var(--bg-card)",
  bgSurface: "var(--bg-surface)",
  bgInset: "var(--bg-inset)",
  borderDefault: "var(--border-default)",
  borderSubtle: "var(--border-subtle)",
  textHeading: "var(--text-heading)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textMuted: "var(--text-muted)",
  statusOk: "var(--status-ok)",
  statusWarn: "var(--status-warn)",
  statusCrit: "var(--status-crit)",
  statusInfo: "var(--status-info)",
  fontSans: "var(--font-sans)",
  fontMono: "var(--font-mono)",
  radiusSm: "var(--radius-sm)",
  radiusMd: "var(--radius-md)",
  radiusFull: "var(--radius-full)",
  shadowSm: "var(--shadow-sm)",
  ease: "var(--ease-default)",
};

const TREND_MAP = {
  rising: { icon: "↑", label: "Rising" },
  decreasing: { icon: "↓", label: "Decreasing" },
  stable: { icon: "—", label: "Steady" },
};

const GLOBAL_STATUS = {
  CRITICAL: { label: "SYSTEM ALERT", sub: "CRITICAL", color: T.statusCrit, dot: T.statusCrit, pulse: true },
  WARNING: { label: "SYSTEM WARNING", sub: "WARNING", color: T.statusWarn, dot: T.statusWarn, pulse: true },
  LOW: { label: "MONITORING ACTIVE", sub: "SYSTEM NOMINAL", color: T.statusOk, dot: T.statusOk, pulse: false },
};

/* ══════════════════════════════════════════════════════════════════════════════
   TopNavRight (Clock & Weather)
   ══════════════════════════════════════════════════════════════════════════ */
function TopNavRight() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const timeString = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateString = time.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "32px", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", borderRight: `1px solid ${T.borderSubtle}`, paddingRight: "24px", height: "100%" }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "18px", fontWeight: 600, lineHeight: "20px", color: T.textHeading, fontFamily: T.fontMono }}>32°C</div>
          <div style={{ fontSize: "11px", fontWeight: 500, lineHeight: "16px", color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "2px" }}>Partly Cloudy</div>
        </div>
      </div>
      <div style={{ textAlign: "left", width: "120px" }}>
        <div style={{ fontSize: "16px", fontWeight: 600, lineHeight: "20px", color: T.textHeading, fontFamily: T.fontMono }}>{timeString}</div>
        <div style={{ fontSize: "11px", fontWeight: 500, lineHeight: "16px", color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "2px" }}>{dateString}</div>
      </div>
    </div>
  );
}

/* ── ForecastRow ─────────────────────────────────────────────────────────── */
function ForecastRow({ day, icon, min, max, absMax, barColor }) {
  const left = (min / absMax) * 100;
  const width = ((max - min) / absMax) * 100 || 2;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <span style={{ width: "28px", fontSize: "12px", fontWeight: 500, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: T.fontMono }}>{day}</span>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "22px" }}>{icon}</span>
      <div style={{ flex: 1, height: "6px", background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: T.radiusFull, position: "relative", overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0, left: `${left}%` }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 1.0, ease: "easeOut", delay: 0.2 }}
          style={{ position: "absolute", top: 0, bottom: 0, left: `${left}%`, background: barColor, borderRadius: T.radiusFull }}
        />
      </div>
      <span style={{ width: "64px", textAlign: "right", fontSize: "12px", fontWeight: 500, color: T.textPrimary, fontFamily: T.fontMono }}>{min}–{max}mm</span>
    </div>
  );
}

/* ── SensorPill ──────────────────────────────────────────────────────────── */
function SensorPill({ index, value, unit, statusColor, tooltip }) {
  const isErr = statusColor === T.statusCrit;
  const display = value != null ? Number(value).toFixed(1) : null;
  return (
    <div
      title={tooltip}
      style={{ flex: 1, background: T.bgInset, border: `1px solid ${T.borderDefault}`, borderRadius: T.radiusMd, padding: "10px 4px", textAlign: "center", cursor: "help", boxShadow: T.shadowSm }}
    >
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "5px", marginBottom: "8px" }}>
        <div className="section-label" style={{ letterSpacing: "0.05em", fontSize: "11px" }}>S{index}</div>
        <div style={{ width: "6px", height: "6px", background: statusColor, borderRadius: T.radiusFull }} />
      </div>
      {isErr || display == null ? (
        <div style={{ fontSize: "13px", color: T.statusCrit, fontWeight: 600, fontFamily: T.fontMono }}>ERR</div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center" }}>
          <span style={{ fontSize: "14px", color: T.textHeading, fontWeight: 600, fontFamily: T.fontMono }}>{display}</span>
          <span style={{ fontSize: "11px", color: T.textMuted, fontWeight: 500, marginLeft: "3px", fontFamily: T.fontMono }}>{unit}</span>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   HorizontalBarWidget
   ══════════════════════════════════════════════════════════════════════════ */
function HorizontalBarWidget({ title, value, unit, max, icon, trend, thresholds, sensors }) {
  const [expanded, setExpanded] = useState(false);
  const isRain = title === "Rain Level";
  const isRiver = title === "River Level";
  const isSoil = title === "Soil Moisture";
  const bands = thresholds || [];
  let activeZone = 0;
  for (let i = 0; i < bands.length; i += 1) {
    if (value >= bands[i].limit) activeZone = i + 1;
  }

  const zoneColorMap = [T.statusOk, T.statusInfo, T.statusWarn, T.statusCrit];
  const usesFourZones = isRain || isRiver || isSoil;
  const zoneColor = usesFourZones ? zoneColorMap[activeZone] || T.statusCrit : { normal: T.statusOk, warning: T.statusWarn, critical: T.statusCrit }[activeZone === 0 ? "normal" : activeZone === 1 ? "warning" : "critical"];
  const trendInfo = TREND_MAP[trend] || TREND_MAP.stable;
  const percentage = Math.min((value / max) * 100, 100) || 0;
  const segmentWidths = [
    thresholds[0].limit,
    ...thresholds.slice(1).map((threshold, index) => threshold.limit - thresholds[index].limit),
    max - thresholds[thresholds.length - 1].limit,
  ];

  const zoneLabelMap = isRain
    ? ["LIGHT RAIN", "MODERATE RAIN", "HEAVY RAIN", "VERY HEAVY RAIN"]
    : ["NORMAL", "WARNING", "CRITICAL"];

  return (
    <motion.div
      onClick={() => setExpanded(!expanded)}
      style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", cursor: "pointer", height: "260px", width: "100%", padding: "24px" }}
    >
      <div>
        {/* Header row */}
        <motion.div layout style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: expanded ? "12px" : "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              className="widget-icon"
              style={{ width: "44px", height: "44px", fontSize: "20px", background: T.bgSurface, border: `1px solid ${zoneColor}`, borderRadius: T.radiusMd, color: zoneColor }}
            >
              <span style={{ color: zoneColor }}>{icon}</span>
            </div>
            <div>
              <h2 style={{ margin: 0, marginBottom: "3px" }}>{title}</h2>
              <span style={{ color: zoneColor, fontSize: "12px", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {zoneLabelMap[activeZone]} · {trendInfo.label}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
            {/* Live indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 500, color: T.statusOk, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                style={{ width: "6px", height: "6px", background: T.statusOk, borderRadius: T.radiusFull, display: "inline-block" }}
              />
              LIVE
            </div>
          </div>
        </motion.div>

        {/* Value */}
        <motion.div layout style={{ marginBottom: expanded ? "8px" : "20px", display: "flex", alignItems: "baseline" }}>
          <motion.span layout style={{ fontSize: expanded ? "24px" : "32px", fontWeight: 600, color: zoneColor, fontFamily: T.fontMono, minWidth: "3ch", lineHeight: 1 }}>
            {Number(value).toFixed(1)}
          </motion.span>
          <span style={{ color: T.textMuted, fontSize: "14px", fontWeight: 500, marginLeft: "6px", fontFamily: T.fontMono }}>{unit}</span>
          <span style={{ color: zoneColor, fontSize: "18px", fontWeight: 400, marginLeft: "10px", fontFamily: T.fontMono }}>{trendInfo.icon}</span>
        </motion.div>
      </div>

      {/* Bar */}
      <motion.div layout style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ position: "relative", width: "100%" }}>
          {/* Segmented threshold track */}
          <div style={{ display: "flex", height: "6px", borderRadius: T.radiusFull, overflow: "hidden", border: `1px solid ${T.borderDefault}`, background: T.bgInset }}>
            {segmentWidths.map((width, index) => {
              const rainColors = [T.statusOk, T.statusInfo, T.statusWarn, T.statusCrit];
              const segmentColor = usesFourZones
                ? rainColors[index]
                : index === 0
                  ? T.bgSurface
                  : index === 1
                    ? `rgba(245,158,11,0.35)`
                    : `rgba(239,68,68,0.25)`;
              return <div key={index} style={{ width: `${(width / max) * 100}%`, background: segmentColor }} />;
            })}
          </div>
          {/* Pip */}
          <motion.div
            initial={{ left: 0 }}
            animate={{ left: `${percentage}%` }}
            transition={{ type: "spring", bounce: 0.2, duration: 1 }}
            style={{ position: "absolute", top: "-7px", height: "20px", width: "4px", background: zoneColor, transform: "translateX(-50%)", zIndex: 10, borderRadius: T.radiusSm, boxShadow: `0 0 6px color-mix(in srgb, ${zoneColor} 33%, transparent)` }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 500, color: T.textMuted, marginTop: "10px", fontFamily: T.fontMono }}>
          <span>0{unit}</span>
          <span>{max}{unit}</span>
        </div>

        {false && isRain && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", marginTop: "10px" }}>
            {[
              { label: "Light Rain", range: "0.5–10mm", color: T.statusOk },
              { label: "Moderate Rain", range: "11–30mm", color: T.statusInfo },
              { label: "Heavy Rain", range: "31–60mm", color: T.statusWarn },
              { label: "Very Heavy Rain", range: ">60mm", color: T.statusCrit },
            ].map((item, index) => (
              <div
                key={item.label}
                style={{
                  border: `1px solid ${index === activeZone ? item.color : T.borderDefault}`,
                  background: index === activeZone ? `color-mix(in srgb, ${item.color} 14%, transparent)` : T.bgSurface,
                  borderRadius: T.radiusMd,
                  padding: "7px 6px",
                  textAlign: "center",
                  boxShadow: T.shadowSm,
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: 600, color: item.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.label}</div>
                <div style={{ fontSize: "10px", color: T.textMuted, marginTop: "2px", fontFamily: T.fontMono }}>{item.range}</div>
              </div>
            ))}
          </div>
        )}

        {/* Expanded sensor pills */}
        <AnimatePresence>
          {expanded && sensors && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: "auto", opacity: 1, marginTop: "12px" }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              style={{ overflow: "hidden", borderTop: `1px solid ${T.borderDefault}`, paddingTop: "12px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                {sensors.map((s, i) => {
                  const valid = sensors.filter(x => x != null);
                  const avg = valid.reduce((a, b) => a + b, 0) / (valid.length || 1);
                  const isErr = s == null;
                  const isAnomalous = !isErr && Math.abs(s - avg) > max * 0.15;
                  let statusColor = T.statusOk;
                  if (isErr) statusColor = T.statusCrit;
                  else if (isAnomalous) statusColor = T.statusWarn;
                  const tooltips = ["North Bank", "South Bank", "Upstream", "Downstream"];
                  return <SensorPill key={i} index={i + 1} value={s} unit={unit} statusColor={statusColor} tooltip={tooltips[i % tooltips.length]} />;
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   RiskCard
   ══════════════════════════════════════════════════════════════════════════ */
function RiskCard({ floodPrediction, confidence }) {
  const isFlood = floodPrediction === 1;
  const verdictColor = isFlood ? T.statusCrit : T.statusOk;
  const verdictLabel = isFlood ? "Flood" : "No Flood";
  const riskBadgeLabel = isFlood ? "High risk" : "Low risk";
  const ringValue = Math.max(0, Math.min(1, Number(confidence) || 0));
  const ringPercent = Math.round(ringValue * 100);

  const ringSize = 78;
  const stroke = 6;
  const radius = (ringSize - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ringValue);

  return (
    <motion.div
      className="card"
      style={{ width: "100%", height: "230px", background: T.bgCard, display: "flex", flexDirection: "column", gap: "16px", padding: "16px" }}
      whileHover={{ scale: 1.015 }}
      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
    >
      <div style={{ height: "100%", border: `1px solid ${T.borderDefault}`, borderRadius: T.radiusMd, padding: "14px", background: "linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(132px, 0.85fr)", columnGap: "12px", alignItems: "center" }}>
          <div>
            <div className="section-label" style={{ marginBottom: "12px" }}>AI Model Prediction</div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: verdictColor, boxShadow: `0 0 0 3px color-mix(in srgb, ${verdictColor} 20%, transparent)` }} />
              <span style={{ fontSize: "clamp(22px, 5.2vw, 36px)", lineHeight: 0.98, fontWeight: 700, color: verdictColor, fontFamily: T.fontSans }}>{verdictLabel}</span>
            </div>

            <span style={{ display: "inline-flex", alignItems: "center", padding: "6px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.02em", color: verdictColor, background: `color-mix(in srgb, ${verdictColor} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${verdictColor} 30%, transparent)` }}>
              {riskBadgeLabel}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "14px" }}>
            <div style={{ width: "1px", height: "104px", background: T.borderSubtle }} />

            <div style={{ textAlign: "center" }}>
              <div className="section-label" style={{ marginBottom: "6px" }}>Confidence</div>
              <div style={{ position: "relative", width: `${ringSize}px`, height: `${ringSize}px` }}>
                <svg width={ringSize} height={ringSize} style={{ transform: "rotate(-90deg)" }}>
                  <circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={radius}
                    fill="none"
                    stroke="color-mix(in srgb, var(--text-heading) 18%, transparent)"
                    strokeWidth={stroke}
                  />
                  <motion.circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={radius}
                    fill="none"
                    stroke={verdictColor}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: dashOffset }}
                    transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
                  />
                </svg>

                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                  <span style={{ fontSize: "clamp(20px, 4.2vw, 26px)", fontWeight: 700, color: verdictColor, fontFamily: T.fontMono }}>{ringPercent}%</span>
                  <span style={{ marginTop: "5px", fontSize: "11px", color: T.textMuted, textTransform: "lowercase", letterSpacing: "0.02em" }}>score</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   ControlsCard
   ══════════════════════════════════════════════════════════════════════════ */
function RuleBasedRiskCard({ ruleBased }) {
  const fri = Math.max(0, Math.min(1, Number(ruleBased?.fri) || 0));
  const riskText = String(ruleBased?.risk_text || "NORMAL").toUpperCase();
  const typeCode = ruleBased?.flood_type ?? 0;
  const typeLabel = ruleBased?.flood_type_label || ({ 1: "Fluvial", 2: "Pluvial", 3: "Compound" }[typeCode] || "None");
  const riskColor =
    riskText === "DANGER" ? T.statusCrit :
    riskText === "WARNING" ? T.statusWarn :
    riskText === "ALERT" ? T.statusInfo :
    T.statusOk;

  return (
    <motion.div
      className="card"
      style={{ width: "100%", background: T.bgCard, padding: "16px" }}
      whileHover={{ scale: 1.015 }}
      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
    >
      <div style={{ border: `1px solid ${T.borderDefault}`, borderRadius: T.radiusMd, padding: "14px", background: "linear-gradient(135deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "14px" }}>
          <div>
            <div className="section-label" style={{ marginBottom: "8px" }}>Rule-Based Detection</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontSize: "30px", lineHeight: 1, fontWeight: 700, color: riskColor, fontFamily: T.fontMono }}>{fri.toFixed(2)}</span>
              <span style={{ fontSize: "11px", color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>FRI</span>
            </div>
          </div>
          <span style={{ padding: "6px 10px", borderRadius: T.radiusSm, fontSize: "11px", fontWeight: 700, color: riskColor, border: `1px solid color-mix(in srgb, ${riskColor} 36%, transparent)`, background: `color-mix(in srgb, ${riskColor} 14%, transparent)` }}>
            {riskText}
          </span>
        </div>

        <div style={{ height: "8px", borderRadius: T.radiusFull, background: T.bgInset, border: `1px solid ${T.borderSubtle}`, overflow: "hidden", marginBottom: "14px" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${fri * 100}%` }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            style={{ height: "100%", background: riskColor }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
          <div style={{ padding: "10px", borderRadius: T.radiusSm, background: T.bgSurface, border: `1px solid ${T.borderDefault}` }}>
            <div className="section-label" style={{ marginBottom: "5px" }}>Flood Type</div>
            <div style={{ color: T.textPrimary, fontWeight: 600 }}>{typeLabel}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AIConflictAlert({ live }) {
  const fri = Number(live?.rule_based?.fri);
  const aiFlood = live?.flood_prediction === 1;
  if (!aiFlood || !Number.isFinite(fri) || fri >= 0.6) return null;

  const isRuleNormal = fri < 0.3;
  const color = isRuleNormal ? T.statusCrit : T.statusWarn;
  const title = isRuleNormal ? "AI Flood Alert" : "AI Escalation Watch";
  const detail = isRuleNormal
    ? "AI predicts flood while rule-based FRI is still normal."
    : "AI predicts flood before rule-based warning level.";

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: "12px 14px", border: `1px solid color-mix(in srgb, ${color} 38%, transparent)`, background: `color-mix(in srgb, ${color} 12%, ${T.bgCard})`, boxShadow: T.shadowSm }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <AlertTriangle size={18} color={color} />
        <div>
          <div style={{ fontSize: "12px", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
          <div style={{ marginTop: "3px", fontSize: "12px", color: T.textSecondary }}>{detail}</div>
        </div>
      </div>
    </motion.div>
  );
}

function ControlsCard({ override, setOverride, sluiceAperture, setSluiceAperture, pumpPower, setPumpPower, addActionLog, pushControls, logs, selectedArea, areaControls, controlReadback }) {
  const displayedSluice = override ? sluiceAperture : Math.round(Number(controlReadback?.gate_percent ?? sluiceAperture));
  const displayedPump = override ? pumpPower : Math.round(Number(controlReadback?.pump_percent ?? pumpPower));

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Mitigation Controls</h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {!override && (
            <span title="Automatic mode is locked to Simulink commands" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: T.radiusSm, color: T.statusInfo, background: `color-mix(in srgb, ${T.statusInfo} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${T.statusInfo} 30%, transparent)` }}>
              <Lock size={13} />
            </span>
          )}
          <span style={{ fontSize: "12px", fontWeight: 500, color: override ? T.statusCrit : T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", transition: "color 0.15s ease" }}>
            {override ? "OVERRIDE" : "AUTO"}
          </span>
          {/* Toggle */}
          <div
            onClick={() => {
              const newOverride = !override;
              setOverride(newOverride);
              addActionLog(newOverride ? "SYSTEM OVERRIDE: MANUAL CONTROL" : "SYSTEM RETURNED TO AUTO");
              pushControls(sluiceAperture, pumpPower, newOverride ? 1 : 0);
            }}
            style={{
              width: "40px", height: "22px",
              borderRadius: T.radiusFull,
              background: override ? T.statusCrit : T.bgSurface,
              border: `1px solid ${T.borderSubtle}`,
              position: "relative", cursor: "pointer",
              transition: `background 0.15s ${T.ease}`,
              boxShadow: T.shadowSm,
            }}
          >
            <motion.div
              layout
              style={{ width: "16px", height: "16px", borderRadius: T.radiusFull, background: T.textHeading, position: "absolute", top: "2px" }}
              animate={{ left: override ? "20px" : "2px" }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </div>
        </div>
      </div>

      <SliderControl
        title="Water Pump Power" value={displayedPump} unit="%" color={T.statusOk}
        disabled={!override}
        setValue={setPumpPower}
        onCommit={(val) => { addActionLog(`MANUAL: Water Pump -> ${val}%`); pushControls(sluiceAperture, val, 1); }}
      />
      <SliderControl
        title="Sluice Gate Aperture" value={displayedSluice} unit="%" color={T.statusWarn}
        disabled={!override}
        setValue={setSluiceAperture}
        onCommit={(val) => { addActionLog(`MANUAL: Sluice Gate -> ${val}%`); pushControls(val, pumpPower, 1); }}
      />

      {/* Action Logs inside ControlsCard */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", borderTop: `1px solid ${T.borderDefault}`, paddingTop: "12px" }}>
        <div className="section-label" style={{ marginBottom: "8px" }}>Action Logs</div>
        <div style={{ height: "220px", display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", paddingRight: "4px" }}>
          {logs && [...logs].reverse().slice(0, 50).map((log, i) => (
            <div key={i} style={{ fontSize: "11px", fontFamily: T.fontMono, color: T.textSecondary, flexShrink: 0 }}>
              <span style={{ color: T.textMuted }}>{log.time.substring(0, 5)}</span>
              <span style={{ color: i === 0 ? T.statusInfo : T.textPrimary, marginLeft: "8px" }}>{log.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── SliderControl ───────────────────────────────────────────────────────── */
const SNAP_STEPS = [0, 30, 70, 100];

// Map percentage values to mitigation codes: 0-> 0, 30->1, 70->2, 100->3
const percentToCode = (percent) => {
  if (percent === 0) return 0;
  if (percent === 30) return 1;
  if (percent === 70) return 2;
  if (percent === 100) return 3;
  // Default to closest code if not exact match
  if (percent < 30) return 0;
  if (percent < 70) return 1;
  if (percent < 100) return 2;
  return 3;
};

function SliderControl({ title, value, setValue, onCommit, disabled, unit, color }) {
  return (
    <div style={{ background: T.bgSurface, border: `1px solid ${T.borderDefault}`, borderRadius: T.radiusMd, padding: "10px 16px", opacity: 1, transition: `opacity 0.15s ${T.ease}`, boxShadow: T.shadowSm }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span style={{ fontSize: "12px", fontWeight: 500, color: T.textSecondary, textTransform: "uppercase", letterSpacing: "0.08em" }}>{title}</span>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontWeight: 600, color, fontSize: "24px", fontFamily: T.fontMono, lineHeight: 1 }}>{value}{unit}</span>
        </div>
      </div>
      {/* Step labels */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 2px", marginBottom: "8px" }}>
        {SNAP_STEPS.map(s => (
          <span key={s} style={{ fontSize: "11px", color: value === s ? color : T.textMuted, fontWeight: 500, transition: `color 0.15s ${T.ease}`, fontFamily: T.fontMono }}>{s}%</span>
        ))}
      </div>
      {/* Visible track wrapper */}
      <div style={{ position: "relative", width: "100%", height: "12px", display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", width: "100%", height: "8px", background: T.bgInset, borderRadius: T.radiusFull, border: `1px solid ${T.borderSubtle}` }} />
        <input
          type="range" min="0" max="100" step="1" value={value}
          onChange={(e) => {
            const newVal = Number(e.target.value);
            // Snap to nearest SNAP_STEP
            const nearest = SNAP_STEPS.reduce((prev, curr) => Math.abs(curr - newVal) < Math.abs(prev - newVal) ? curr : prev);
            setValue(nearest);
          }}
          onMouseUp={(e) => {
            const newVal = Number(e.target.value);
            const nearest = SNAP_STEPS.reduce((prev, curr) => Math.abs(curr - newVal) < Math.abs(prev - newVal) ? curr : prev);
            onCommit && onCommit(nearest);
          }}
          onTouchEnd={(e) => {
            const newVal = Number(e.target.value);
            const nearest = SNAP_STEPS.reduce((prev, curr) => Math.abs(curr - newVal) < Math.abs(prev - newVal) ? curr : prev);
            onCommit && onCommit(nearest);
          }}
          disabled={disabled}
          style={{ width: "100%", cursor: disabled ? "default" : "pointer", accentColor: color, position: "absolute", margin: 0, opacity: disabled ? 0.65 : 1 }}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MiniTrendChart & HistoricalDataCard
   ══════════════════════════════════════════════════════════════════════════ */
function MiniTrendChart({ data, dataKey, color, name, unit, referenceLine, isPercent, domain }) {
  const chartData = isPercent
    ? data.map(d => ({ ...d, _mappedVal: d[dataKey] == null ? null : d[dataKey] * 100 }))
    : data;
  const actualDataKey = isPercent ? "_mappedVal" : dataKey;

  return (
    <ResponsiveContainer width="100%" height="80%">
      <LineChart data={chartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
        {referenceLine && (
          <ReferenceArea
            y1={referenceLine.y1} y2={referenceLine.y2}
            fill={referenceLine.fill} stroke={referenceLine.stroke}
            strokeWidth={1} strokeDasharray="4 3"
            label={{ value: referenceLine.label, position: "insideTopRight", fill: referenceLine.stroke, fontSize: 11, fontFamily: "monospace" }}
          />
        )}
        <XAxis
          type="number"
          dataKey="slot"
          domain={[0, CHART_WINDOW - 1]}
          ticks={[0, 15, 30, 45, 59]}
          tickFormatter={(v) => chartData[v]?.t || ""}
          stroke={T.borderSubtle}
          tick={{ fill: T.textMuted, fontFamily: "monospace", fontSize: 11 }}
          allowDecimals={false}
        />
        <YAxis stroke={T.borderSubtle} tick={{ fill: T.textMuted, fontFamily: "monospace", fontSize: 11 }} domain={domain || [0, "auto"]} />
        <CartesianGrid strokeDasharray="3 3" stroke={T.borderDefault} vertical={false} />
        <Tooltip
          contentStyle={{ backgroundColor: T.bgInset, border: `1px solid ${T.borderDefault}`, borderRadius: T.radiusMd, color: T.textPrimary, fontFamily: "monospace", fontSize: "12px", boxShadow: T.shadowSm }}
          itemStyle={{ color: color }}
        />
        <Line type="monotone" dataKey={actualDataKey} stroke={color} strokeWidth={2} dot={false} name={`${name} (${unit})`} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function HistoricalDataCard({ data, domainMap }) {
  const [activeTab, setActiveTab] = useState("river");
  const [isExpanded, setIsExpanded] = useState(true);

  const config = {
    river: { key: "river_level", color: T.statusOk, name: "River Level", unit: "m", icon: <Waves size={20} /> },
    rain: { key: "rain_level", color: T.statusInfo, name: "Rain Level", unit: "mm", icon: <CloudRain size={20} /> },
    soil: { key: "soil_moisture", color: "#a855f7", name: "Soil Moisture", unit: "%", icon: <Sprout size={20} /> }
  };

  if (isExpanded) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
        {Object.entries(config).map(([tabKey, c], index) => (
          <div key={tabKey} className="card" style={{ display: "flex", flexDirection: "column", minHeight: "350px", width: "100%", padding: "24px 24px 0 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: c.color }}>
                {c.icon}
                <h2 style={{ margin: 0, color: T.textHeading }}>Historical Data: {c.name}</h2>
              </div>
              {index === 0 && (
                <div style={{ cursor: "pointer", color: T.textMuted, display: "flex", alignItems: "center" }} onClick={() => setIsExpanded(false)} title="Collapse View">
                  <Minimize2 size={20} />
                </div>
              )}
            </div>
            <div style={{ flex: 1, minHeight: "260px" }}>
              <MiniTrendChart
                data={data}
                dataKey={c.key}
                color={c.color}
                name={c.name}
                unit={c.unit}
                domain={domainMap[tabKey]}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", padding: "24px 24px 0 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: config[activeTab].color }}>
          {config[activeTab].icon}
          <h2 style={{ margin: 0, color: T.textHeading }}>Historical Data</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div className="nav-links" style={{ gap: "16px" }}>
            <span className={`nav-link ${activeTab === "river" ? "active" : ""}`} onClick={() => setActiveTab("river")}>River</span>
            <span className={`nav-link ${activeTab === "rain" ? "active" : ""}`} onClick={() => setActiveTab("rain")}>Rain</span>
            <span className={`nav-link ${activeTab === "soil" ? "active" : ""}`} onClick={() => setActiveTab("soil")}>Soil</span>
          </div>
          <div style={{ cursor: "pointer", color: T.textMuted, display: "flex", alignItems: "center" }} onClick={() => setIsExpanded(true)} title="Expand View">
            <Maximize2 size={20} />
          </div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: "260px" }}>
        <MiniTrendChart
          data={data}
          dataKey={config[activeTab].key}
          color={config[activeTab].color}
          name={config[activeTab].name}
          unit={config[activeTab].unit}
          domain={domainMap[activeTab]}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   App (main)
   ══════════════════════════════════════════════════════════════════════════ */
const severityRank = { NORMAL: 0, LOW: 0, ALERT: 1, WARNING: 2, DANGER: 3, CRITICAL: 3 };

function overallSeverity(areas) {
  const statuses = Object.values(areas || {}).map(area => String(area?.rule_based?.risk_text || area?.risk_level || "LOW").toUpperCase());
  return statuses.reduce((worst, status) => (severityRank[status] ?? 0) > (severityRank[worst] ?? 0) ? status : worst, "LOW");
}

function OverallDashboard({ areas, areaControls, setSelectedArea }) {
  const entries = [1, 2].map(id => ({ id, live: areas?.[id], controls: areaControls[id] }));
  const systemStatus = overallSeverity(areas);
  const statusColor =
    systemStatus === "DANGER" || systemStatus === "CRITICAL" ? T.statusCrit :
    systemStatus === "WARNING" ? T.statusWarn :
    systemStatus === "ALERT" ? T.statusInfo :
    T.statusOk;
  const activeAlerts = entries.filter(({ live }) => live?.flood_prediction === 1 || Number(live?.rule_based?.fri) >= 0.3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      style={{ display: "flex", flexDirection: "column", gap: "24px" }}
    >
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px" }}>
        <div>
          <div className="section-label" style={{ marginBottom: "8px" }}>Overall System Status</div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: statusColor, boxShadow: `0 0 0 4px color-mix(in srgb, ${statusColor} 18%, transparent)` }} />
            <span style={{ fontSize: "34px", lineHeight: 1, fontWeight: 700, color: statusColor }}>{systemStatus}</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(100px, 1fr))", gap: "12px", minWidth: "420px" }}>
          <div style={{ padding: "12px", borderRadius: T.radiusMd, background: T.bgSurface, border: `1px solid ${T.borderDefault}` }}>
            <div className="section-label">Areas</div>
            <div style={{ marginTop: "6px", fontSize: "24px", fontWeight: 700, color: T.textPrimary }}>2</div>
          </div>
          <div style={{ padding: "12px", borderRadius: T.radiusMd, background: T.bgSurface, border: `1px solid ${T.borderDefault}` }}>
            <div className="section-label">Active Alerts</div>
            <div style={{ marginTop: "6px", fontSize: "24px", fontWeight: 700, color: activeAlerts.length ? T.statusWarn : T.statusOk }}>{activeAlerts.length}</div>
          </div>
          <div style={{ padding: "12px", borderRadius: T.radiusMd, background: T.bgSurface, border: `1px solid ${T.borderDefault}` }}>
            <div className="section-label">Manual Override</div>
            <div style={{ marginTop: "6px", fontSize: "24px", fontWeight: 700, color: entries.some(e => e.controls?.override) ? T.statusCrit : T.statusOk }}>
              {entries.some(e => e.controls?.override) ? "ON" : "OFF"}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "18px" }}>
        {entries.map(({ id, live, controls }) => {
          const fri = Number(live?.rule_based?.fri || 0);
          const areaStatus = String(live?.rule_based?.risk_text || "NORMAL").toUpperCase();
          const areaColor =
            areaStatus === "DANGER" ? T.statusCrit :
            areaStatus === "WARNING" ? T.statusWarn :
            areaStatus === "ALERT" ? T.statusInfo :
            T.statusOk;
          const isHigh = (severityRank[areaStatus] ?? 0) >= 2;
          const aiFlood = live?.flood_prediction === 1;
          const pumpPct = Math.round(Number(live?.controls?.pump_percent || 0));
          const gatePct = Math.round(Number(live?.controls?.gate_percent || 0));
          return (
            <div key={id} className="card" onClick={() => setSelectedArea(id)} style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: "12px", borderColor: `color-mix(in srgb, ${areaColor} 42%, ${T.borderDefault})`, padding: "20px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "8px", borderBottom: `1px solid ${T.borderSubtle}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: areaColor, boxShadow: `0 0 0 3px color-mix(in srgb, ${areaColor} 16%, transparent)` }} />
                  <h2 style={{ margin: 0, fontSize: "17px", letterSpacing: "0.08em", fontFamily: T.fontMono }}>Area {id}</h2>
                </div>
                <span style={{ padding: "6px 12px", borderRadius: T.radiusSm, color: areaColor, background: `color-mix(in srgb, ${areaColor} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${areaColor} 36%, transparent)`, fontSize: "11px", fontWeight: 800, letterSpacing: "0.08em", fontFamily: T.fontMono }}>{areaStatus}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                <MetricTile label="FRI Score" value={fri.toFixed(2)} sub={isHigh ? "Max risk" : areaStatus.toLowerCase()} color={areaColor} />
                <MetricTile label="AI Verdict" value={aiFlood ? "Flood" : "Clear"} sub={`Conf. ${Math.round((Number(live?.confidence) || 0) * 100)}%`} color={aiFlood ? T.statusCrit : T.statusOk} />
                <MetricTile label="Flood Prob" value={`${Math.round((Number(live?.flood_probability) || 0) * 100)}%`} sub={aiFlood ? "Critical" : "Low"} color={aiFlood ? T.statusCrit : T.statusOk} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                <MetricTile label="River" value={`${Number(live?.river_level?.fused_value || 0).toFixed(1)} m`} color={isHigh ? T.statusCrit : T.textPrimary} />
                <MetricTile label="Rain" value={`${Number(live?.rain_level?.fused_value || 0).toFixed(1)} mm`} color={isHigh ? T.statusCrit : T.textPrimary} />
                <MetricTile label="Soil" value={`${Number(live?.soil_moisture?.fused_value || 0).toFixed(1)}%`} color={isHigh ? T.statusCrit : T.textPrimary} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
                <ControlBar label="Pump" value={pumpPct} color={T.statusOk} />
                <ControlBar label="Gate" value={gatePct} color={T.statusWarn} />
              </div>
              {controls?.override && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: T.statusCrit, fontSize: "12px", fontWeight: 700 }}>
                  <AlertTriangle size={16} /> Manual override active
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function MetricTile({ label, value, sub, color = T.textPrimary }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: T.radiusMd, background: T.bgSurface, border: `1px solid ${T.borderDefault}`, minWidth: 0, minHeight: "78px" }}>
      <div className="section-label" style={{ marginBottom: "8px", fontFamily: T.fontMono }}>{label}</div>
      <div style={{ color, fontSize: "21px", lineHeight: 1, fontWeight: 800, fontFamily: T.fontMono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      {sub && <div style={{ marginTop: "7px", color: T.textMuted, fontSize: "11px", fontFamily: T.fontMono }}>{sub}</div>}
    </div>
  );
}

function ControlBar({ label, value, color }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div style={{ padding: "12px 14px", borderRadius: T.radiusMd, background: T.bgSurface, border: `1px solid ${T.borderDefault}`, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div className="section-label" style={{ fontFamily: T.fontMono }}>{label}</div>
        <div style={{ color: pct > 0 ? color : T.statusCrit, fontSize: "16px", fontWeight: 800, fontFamily: T.fontMono }}>{Math.round(pct)}%</div>
      </div>
      <div style={{ height: "7px", borderRadius: T.radiusFull, background: T.bgInset, border: `1px solid ${T.borderSubtle}`, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [live, setLive] = useState(null);
  const [overallLive, setOverallLive] = useState({});
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [selectedArea, setSelectedArea] = useState("overall"); // Force initial to overall logic

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-theme", theme);
    if (theme === "light") {
      document.documentElement.classList.add("light-theme");
      document.body.classList.add("light-theme");
    } else {
      document.documentElement.classList.remove("light-theme");
      document.body.classList.remove("light-theme");
    }
  }, [theme]);

  const baseLogs = [{ time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), msg: "System Nominal." }];
  const [areaControls, setAreaControls] = useState({
    1: { override: false, sluice: 0, pump: 0, logs: [...baseLogs] },
    2: { override: false, sluice: 0, pump: 0, logs: [...baseLogs] },
  });

  // Fix initial selectedArea mapping (if user clicks overall, we map it, if 1/2 we map)
  const currentControls = areaControls[selectedArea] || areaControls[1];

  const updateCurrentControls = (updates) =>
    setAreaControls(prev => ({ ...prev, [selectedArea]: { ...prev[selectedArea], ...updates } }));

  const pushControls = async (areaId, sluice, pump, override = 0) => {
    try {
      const sluiceCode = percentToCode(sluice);
      const pumpCode = percentToCode(pump);
      await axios.post(`${API_BASE}/api/controls?area=${areaId}`, { sluice: sluiceCode, pump: pumpCode, override });
    } catch (e) { console.error("[Controls] Failed:", e); }
  };

  const addActionLog = (msg) => {
    setAreaControls(prev => {
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const newLogs = [...prev[selectedArea].logs, { time, msg }].slice(-29);
      return { ...prev, [selectedArea]: { ...prev[selectedArea], logs: newLogs } };
    });
  };

  /* Auto-control logic */
  useEffect(() => {
    if (!live || selectedArea === "overall" || currentControls.override) return;
    const HIGH_RIVER = 5, LOW_RAIN = 5, HIGH_RAIN = 20, LOW_RIVER = 4;
    const newSluice = (live.river_level.fused_value > HIGH_RIVER && live.rain_level.fused_value < LOW_RAIN) ? 100 : 0;
    const newPump = (live.rain_level.fused_value > HIGH_RAIN && live.river_level.fused_value < LOW_RIVER) ? 100 : 0;

    if (newSluice !== currentControls.sluice || newPump !== currentControls.pump) {
      setAreaControls(prev => {
        if (prev[selectedArea].override) return prev;
        let newLogs = [...prev[selectedArea].logs];
        const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        let changed = false;
        if (newSluice !== prev[selectedArea].sluice) { newLogs.push({ time, msg: `AUTO: Gate → ${newSluice}%` }); changed = true; }
        if (newPump !== prev[selectedArea].pump) { newLogs.push({ time, msg: `AUTO: Pump → ${newPump}%` }); changed = true; }
        if (changed) {
          pushControls(selectedArea, newSluice, newPump);
          return { ...prev, [selectedArea]: { ...prev[selectedArea], sluice: newSluice, pump: newPump, logs: newLogs.slice(-5) } };
        }
        return prev;
      });
    }
  }, [live, currentControls.override, currentControls.sluice, currentControls.pump, selectedArea]);

  useEffect(() => {
    if (selectedArea === "overall" || currentControls.override) return;
    const HIGH_RIVER = 5, LOW_RAIN = 5, HIGH_RAIN = 20, LOW_RIVER = 4;
    const rl = live?.river_level?.fused_value ?? 0;
    const rn = live?.rain_level?.fused_value ?? 0;
    pushControls(selectedArea, (rl > HIGH_RIVER && rn < LOW_RAIN) ? 100 : 0, (rn > HIGH_RAIN && rl < LOW_RIVER) ? 100 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArea, currentControls.override]);

  /* Fetch loop */
  useEffect(() => {
    let abortController = new AbortController();
    const fetchAll = async () => {
      abortController.abort();
      abortController = new AbortController();
      const signal = abortController.signal;
      try {
        if (selectedArea === "overall") {
          const [area1Res, area2Res] = await Promise.allSettled([
            axios.get(`${API_BASE}/api/live?area=1`, { signal }),
            axios.get(`${API_BASE}/api/live?area=2`, { signal }),
          ]);

          const nextLive = {};
          if (area1Res.status === "fulfilled") nextLive[1] = area1Res.value.data;
          if (area2Res.status === "fulfilled") nextLive[2] = area2Res.value.data;

          if (Object.keys(nextLive).length > 0) {
            setOverallLive(prev => ({ ...prev, ...nextLive }));
            setError("");
          } else {
            setError("Connecting to backend API...");
          }

          setLive(null);
          setHistory([]);
          return;
        }

        const [liveRes, histRes] = await Promise.all([
          axios.get(`${API_BASE}/api/live?area=${selectedArea}`, { signal }),
          axios.get(`${API_BASE}/api/history?area=${selectedArea}`, { signal }),
        ]);
        setLive(liveRes.data); setHistory(histRes.data); setError("");
      } catch (e) {
        if (axios.isCancel(e) || e.name === "CanceledError") return;
        setError("Cannot connect to backend API.");
      }
    };
    setLive(null); setHistory([]);
    fetchAll();
    const id = setInterval(fetchAll, 1000);
    return () => { clearInterval(id); abortController.abort(); };
  }, [selectedArea]);

  const recentHistory = history.slice(-CHART_WINDOW);
  const paddedHistory = [
    ...Array(Math.max(0, CHART_WINDOW - recentHistory.length)).fill(null),
    ...recentHistory,
  ];
  const chartData = paddedHistory.map((item, index) => ({
    slot: index,
    t: item?.timestamp?.split(" ")[1] || "",
    river_level: item?.river_level ?? null,
    rain_level: item?.rain_level ?? null,
    soil_moisture: item?.soil_moisture ?? null,
  }));
  const statusInfo = live ? GLOBAL_STATUS[live.risk_level] || GLOBAL_STATUS.LOW : null;

  return (
    <div className={`app ${theme === "light" ? "light-theme" : ""}`}>
      {/* Navigation */}
      <header className="top-nav" style={{ flexWrap: "wrap", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: T.statusInfo, fontWeight: 700, letterSpacing: "0.15em", fontSize: "14px" }}>
            <img src={logoUrl} alt="FloodWatch Logo" style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover", border: `2px solid ${T.statusInfo}` }} />
            FLOOD WATCH
          </div>
          <div className="nav-links">
            <span className={`nav-link ${selectedArea === "overall" ? "active" : ""}`} onClick={() => setSelectedArea("overall")}>Overall</span>
            <span className={`nav-link ${selectedArea === 1 ? "active" : ""}`} onClick={() => setSelectedArea(1)}>Area 1</span>
            <span className={`nav-link ${selectedArea === 2 ? "active" : ""}`} onClick={() => setSelectedArea(2)}>Area 2</span>
          </div>
        </div>

        {/* Status alerts removed per user request */}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "32px" }}>
          <div
            style={{
              cursor: "pointer",
              color: T.textMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: T.bgSurface,
              padding: "8px",
              borderRadius: T.radiusMd,
              boxShadow: T.shadowSm
            }}
            onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
            title="Toggle Theme"
          >
            {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
          </div>
          <TopNavRight />
        </div>
      </header>

      {/* Error */}
      {error && <div className="error">{error}</div>}

      {selectedArea === "overall" && (
        Object.keys(overallLive).length > 0 ? (
          <OverallDashboard
            areas={overallLive}
            areaControls={areaControls}
            setSelectedArea={setSelectedArea}
          />
        ) : (
          <div className="card" style={{ padding: "28px", color: T.textMuted }}>
            Waiting for backend live data...
          </div>
        )
      )}

      {/* Dashboard */}
      {live && selectedArea !== "overall" && (
        <AnimatePresence>
          <motion.div
            className="dashboard-grid"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* Left Column (Sidebar) */}
            <div className="col-span-3" style={{ display: "flex", flexDirection: "column", gap: "32px", borderRight: `1px solid ${T.borderDefault}`, paddingRight: "32px" }}>

              {/* Detection Summary */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <RuleBasedRiskCard ruleBased={live.rule_based} />
                <AIConflictAlert live={live} />
                <RiskCard riskLevel={live.risk_level} floodType={live.flood_type} floodProb={(live.flood_probability * 100).toFixed(0)} floodPrediction={live.flood_prediction} confidence={live.confidence} />
              </div>

              {/* Mitigation Controls */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <ControlsCard
                  override={currentControls.override}
                  setOverride={(val) => updateCurrentControls({ override: val })}
                  sluiceAperture={currentControls.sluice}
                  setSluiceAperture={(val) => updateCurrentControls({ sluice: val })}
                  pumpPower={currentControls.pump}
                  setPumpPower={(val) => updateCurrentControls({ pump: val })}
                  addActionLog={addActionLog}
                  pushControls={(s, p, o) => pushControls(selectedArea, s, p, o)}
                  logs={currentControls.logs}
                  selectedArea={selectedArea}
                  areaControls={areaControls}
                  controlReadback={live.controls}
                />
              </div>

            </div>

            {/* Right Column (Main Content) */}
            <div className="col-span-9" style={{ display: "flex", flexDirection: "column", gap: "24px", minHeight: "calc(100vh - 160px)" }}>

              {/* Top Row: Mini Cards */}
              <div style={{ display: "flex", gap: "24px", flexShrink: 0 }}>
                <div className="card" style={{ flex: 1, padding: 0 }}>
                  <HorizontalBarWidget
                    title="River Level" value={live.river_level.fused_value} unit="m" max={4}
                    icon={<Waves size={22} />} trend={live.trends?.river_level || "stable"}
                    thresholds={[{ limit: 2.50 }, { limit: 2.62 }, { limit: 2.90 }]} sensors={live.river_level.sensors}
                  />
                </div>
                <div className="card" style={{ flex: 1, padding: 0 }}>
                  <HorizontalBarWidget
                    title="Rain Level" value={live.rain_level.fused_value} unit="mm" max={100}
                    icon={<CloudRain size={22} />} trend={live.trends?.rain_level || "stable"}
                    thresholds={[{ limit: 10 }, { limit: 30 }, { limit: 60 }]} sensors={live.rain_level.sensors}
                  />
                </div>
                <div className="card" style={{ flex: 1, padding: 0 }}>
                  <HorizontalBarWidget
                    title="Soil Moisture" value={live.soil_moisture.fused_value} unit="%" max={100}
                    icon={<Sprout size={22} />} trend={live.trends?.soil_moisture || "stable"}
                    thresholds={[{ limit: 40 }, { limit: 60 }, { limit: 80 }]} sensors={live.soil_moisture.sensors}
                  />
                </div>
              </div>

              {/* Bottom Row: Historical Data */}
              <div style={{ display: "flex", gap: "24px", flex: 1, minHeight: "350px" }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  <HistoricalDataCard
                    data={chartData}
                    domainMap={{ river: [0, 10], rain: [0, 60], soil: [0, 100] }}
                  />
                </div>
              </div>

            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
