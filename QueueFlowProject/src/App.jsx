import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db } from "./firebase";
import { auth } from "./firebase";
import CustomerAuth from "./CustomerAuth";
import ProviderAuth from "./ProviderAuth";

/* ════════════════════════════════════════════════════════════════
   HISTORICAL DATA  — 14 days × 13 hourly slots × 4 services
   Format: { dayOfWeek(0=Sun..6=Sat) → hourSlot(8..20) → avgPeopleInQueue }
   Realistic patterns: Mon–Fri busy mornings & lunch, weekends lighter.
   Bank: heavier Mon/Fri; Post: heavier Mon; both lighter 14:00–15:00
════════════════════════════════════════════════════════════════ */
const HISTORICAL = {
  bank: {
    account: {
      0: { 8: 1, 9: 2, 10: 3, 11: 3, 12: 2, 13: 2, 14: 2, 15: 3, 16: 2, 17: 1, 18: 1, 19: 0, 20: 0 },
      1: { 8: 4, 9: 8, 10: 10, 11: 12, 12: 9, 13: 7, 14: 5, 15: 8, 16: 10, 17: 9, 18: 6, 19: 3, 20: 1 },
      2: { 8: 3, 9: 7, 10: 9, 11: 10, 12: 8, 13: 6, 14: 4, 15: 7, 16: 8, 17: 7, 18: 5, 19: 2, 20: 1 },
      3: { 8: 3, 9: 6, 10: 8, 11: 9, 12: 8, 13: 6, 14: 4, 15: 6, 16: 7, 17: 6, 18: 4, 19: 2, 20: 1 },
      4: { 8: 4, 9: 7, 10: 9, 11: 11, 12: 8, 13: 7, 14: 5, 15: 8, 16: 9, 17: 8, 18: 6, 19: 3, 20: 1 },
      5: { 8: 5, 9: 10, 10: 13, 11: 14, 12: 10, 13: 8, 14: 6, 15: 10, 17: 12, 16: 11, 18: 7, 19: 4, 20: 2 },
      6: { 8: 2, 9: 4, 10: 6, 11: 7, 12: 5, 13: 4, 14: 3, 15: 5, 16: 4, 17: 3, 18: 2, 19: 1, 20: 0 },
    },
    loan: {
      0: { 8: 0, 9: 1, 10: 2, 11: 2, 12: 1, 13: 1, 14: 1, 15: 2, 16: 1, 17: 1, 18: 0, 19: 0, 20: 0 },
      1: { 8: 2, 9: 4, 10: 6, 11: 7, 12: 5, 13: 4, 14: 3, 15: 5, 16: 6, 17: 5, 18: 3, 19: 2, 20: 1 },
      2: { 8: 2, 9: 3, 10: 5, 11: 6, 12: 4, 13: 3, 14: 2, 15: 4, 16: 5, 17: 4, 18: 3, 19: 1, 20: 0 },
      3: { 8: 1, 9: 3, 10: 4, 11: 5, 12: 4, 13: 3, 14: 2, 15: 4, 16: 4, 17: 4, 18: 2, 19: 1, 20: 0 },
      4: { 8: 2, 9: 4, 10: 5, 11: 6, 12: 4, 13: 4, 14: 3, 15: 5, 16: 5, 17: 4, 18: 3, 19: 1, 20: 0 },
      5: { 8: 3, 9: 5, 10: 7, 11: 8, 12: 6, 13: 5, 14: 3, 15: 6, 16: 7, 17: 6, 18: 4, 19: 2, 20: 1 },
      6: { 8: 1, 9: 2, 10: 3, 11: 4, 12: 3, 13: 2, 14: 2, 15: 3, 16: 2, 17: 2, 18: 1, 19: 0, 20: 0 },
    },
  },
  post: {
    parcel: {
      0: { 8: 1, 9: 2, 10: 3, 11: 3, 12: 2, 13: 2, 14: 1, 15: 2, 16: 2, 17: 1, 18: 0, 19: 0, 20: 0 },
      1: { 8: 5, 9: 9, 10: 12, 11: 13, 12: 10, 13: 8, 14: 6, 15: 9, 16: 11, 17: 9, 18: 6, 19: 3, 20: 1 },
      2: { 8: 4, 9: 7, 10: 10, 11: 11, 12: 8, 13: 7, 14: 5, 15: 8, 16: 9, 17: 7, 18: 5, 19: 2, 20: 1 },
      3: { 8: 3, 9: 6, 10: 8, 11: 9, 12: 7, 13: 6, 14: 4, 15: 7, 16: 8, 17: 6, 18: 4, 19: 2, 20: 0 },
      4: { 8: 4, 9: 7, 10: 9, 11: 10, 12: 8, 13: 6, 14: 5, 15: 8, 16: 9, 17: 7, 18: 5, 19: 2, 20: 1 },
      5: { 8: 6, 9: 11, 10: 14, 11: 15, 12: 11, 13: 9, 14: 7, 15: 11, 16: 12, 17: 10, 18: 7, 19: 4, 20: 2 },
      6: { 8: 3, 9: 5, 10: 7, 11: 8, 12: 6, 13: 5, 14: 4, 15: 6, 16: 5, 17: 4, 18: 2, 19: 1, 20: 0 },
    },
    passport: {
      0: { 8: 0, 9: 1, 10: 1, 11: 2, 12: 1, 13: 1, 14: 1, 15: 1, 16: 1, 17: 0, 18: 0, 19: 0, 20: 0 },
      1: { 8: 2, 9: 4, 10: 5, 11: 6, 12: 5, 13: 4, 14: 3, 15: 4, 16: 5, 17: 4, 18: 2, 19: 1, 20: 0 },
      2: { 8: 1, 9: 3, 10: 4, 11: 5, 12: 4, 13: 3, 14: 2, 15: 4, 16: 4, 17: 3, 18: 2, 19: 1, 20: 0 },
      3: { 8: 1, 9: 3, 10: 4, 11: 5, 12: 3, 13: 3, 14: 2, 15: 3, 16: 4, 17: 3, 18: 2, 19: 1, 20: 0 },
      4: { 8: 2, 9: 3, 10: 5, 11: 6, 12: 4, 13: 3, 14: 2, 15: 4, 16: 5, 17: 4, 18: 2, 19: 1, 20: 0 },
      5: { 8: 2, 9: 5, 10: 6, 11: 7, 12: 5, 13: 4, 14: 3, 15: 5, 16: 6, 17: 5, 18: 3, 19: 2, 20: 1 },
      6: { 8: 1, 9: 2, 10: 3, 11: 3, 12: 2, 13: 2, 14: 1, 15: 2, 16: 2, 17: 1, 18: 1, 19: 0, 20: 0 },
    },
  },
};

/* ════════════════════════════════════════════════════════════════
   AI PREDICTION ENGINE
   Algorithm: Weighted interpolation across adjacent hour slots
   + day-of-week factor + ±15% noise band = confidence interval
════════════════════════════════════════════════════════════════ */
function getPrediction(orgId, svcId, now = new Date()) {
  const dayData = HISTORICAL[orgId]?.[svcId];
  if (!dayData) return null;

  const dow = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();

  const floorHour = Math.max(8, Math.min(20, hour));
  const ceilHour = Math.min(20, floorHour + 1);
  const t = minute / 60;

  const dayRow = dayData[dow] || {};
  const prevDayRow = dayData[(dow + 6) % 7] || {};

  const blend = (h) => {
    const today = dayRow[h] ?? 0;
    const yest = prevDayRow[h] ?? 0;
    return today * 0.75 + yest * 0.25;
  };

  const rawCount = blend(floorHour) * (1 - t) + blend(ceilHour) * t;
  const count = Math.round(Math.max(0, rawCount));

  const isWeekday = dow >= 1 && dow <= 5;
  const isPeakHour = hour >= 9 && hour <= 12;
  const confidence = isWeekday ? (isPeakHour ? 92 : 82) : 68;

  const low = Math.max(0, Math.round(count * 0.85));
  const high = Math.round(count * 1.15);

  const prevCount = blend(Math.max(8, floorHour - 1));
  const trend = rawCount > prevCount + 0.5 ? "rising" : rawCount < prevCount - 0.5 ? "falling" : "stable";

  return { count, low, high, confidence, trend, isWeekend: !isWeekday, hour, dow };
}

/* ════════════════════════════════════════════════════════════════
   DATA — 2 orgs · 2 locations each · 2 services each
════════════════════════════════════════════════════════════════ */
const ORGS = [
  {
    id: "bank",
    name: "National Bank",
    short: "Bank",
    icon: "🏦",
    accent: "#2563eb",
    accentLight: "#dbeafe",
    locations: [
      { id: "bank-downtown", name: "Downtown Branch", address: "12 Finance St, City Centre" },
      { id: "bank-north", name: "North City Branch", address: "88 Park Ave, North District" },
    ],
    services: [
      { id: "account", name: "Account Services", icon: "💳", avgTime: 8 },
      { id: "loan", name: "Loan Processing", icon: "📋", avgTime: 20 },
    ],
  },
  {
    id: "post",
    name: "Post Office",
    short: "Post",
    icon: "📮",
    accent: "#dc2626",
    accentLight: "#fee2e2",
    locations: [
      { id: "post-central", name: "Central Post Office", address: "1 Mail Rd, Central District" },
      { id: "post-east", name: "East Branch", address: "45 East Blvd, Eastside" },
    ],
    services: [
      { id: "parcel", name: "Parcel Delivery", icon: "📦", avgTime: 5 },
      { id: "passport", name: "Passport Application", icon: "🛂", avgTime: 25 },
    ],
  },
];

/* ════════════════════════════════════════════════════════════════
   STORAGE
════════════════════════════════════════════════════════════════ */
const STORAGE_KEY = "queueflow_ai_v1";
const SESSION_KEY = "queueflow_session_v1";
const CLOUD_DOC_REF = doc(db, "queueflow", "state");

function qKey(orgId, locId, svcId) { return `${orgId}::${locId}::${svcId}`; }

function buildDefaults() {
  const q = {};
  ORGS.forEach(org =>
    org.locations.forEach(loc =>
      org.services.forEach(svc => {
        q[qKey(org.id, loc.id, svc.id)] = { count: null, serviceTime: svc.avgTime, lastUpdated: null, open: true };
      })
    )
  );
  return q;
}

function loadQueues() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...buildDefaults(), ...JSON.parse(raw) };
  } catch {
    // Ignore malformed local cache and fall back to defaults.
  }
  return buildDefaults();
}

function saveQueues(q) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
  } catch {
    // Ignore storage write failures (e.g. private browsing restrictions).
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.name || !parsed.role || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Session persistence is best-effort.
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // No-op if storage is unavailable.
  }
}

/* ════════════════════════════════════════════════════════════════
   UTILS
════════════════════════════════════════════════════════════════ */
function fmtWait(m) {
  if (m == null || m === 0) return "No Wait";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), mn = m % 60;
  return mn > 0 ? `${h}h ${mn}m` : `${h}h`;
}

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function statusOf(w) {
  if (w == null || w === 0) return "none";
  if (w <= 15) return "low";
  if (w <= 40) return "moderate";
  return "high";
}

const SM = {
  none: { label: "No Queue", color: "#94a3b8" },
  low: { label: "Short", color: "#10b981" },
  moderate: { label: "Moderate", color: "#f59e0b" },
  high: { label: "Busy", color: "#ef4444" },
};

const TREND_ICON = { rising: "↑", falling: "↓", stable: "→" };
const TREND_COLOR = { rising: "#ef4444", falling: "#10b981", stable: "#94a3b8" };
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ════════════════════════════════════════════════════════════════
   ATOMS
════════════════════════════════════════════════════════════════ */
function PulseDot({ color, size = 9 }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", width: size, height: size, flexShrink: 0 }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, opacity: 0.5, animation: "qpulse 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
      <span style={{ position: "relative", width: size, height: size, borderRadius: "50%", background: color, display: "block" }} />
    </span>
  );
}

function MiniBar({ count, color, max = 15 }) {
  return (
    <div style={{ height: 3, borderRadius: 4, background: "rgba(0,0,0,0.07)", overflow: "hidden", flex: 1 }}>
      <div style={{
        height: "100%", borderRadius: 4, background: color,
        width: `${Math.min(100, (count / max) * 100)}%`,
        transition: "width 0.5s ease", boxShadow: `0 0 5px ${color}88`
      }} />
    </div>
  );
}

function ConfidenceBar({ pct, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ height: 5, borderRadius: 3, background: "rgba(0,0,0,0.06)", overflow: "hidden", flex: 1 }}>
        <div style={{ height: "100%", borderRadius: 3, background: `linear-gradient(90deg,${color},${color}cc)`, width: `${pct}%`, transition: "width 0.8s ease" }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: "DM Mono, monospace", minWidth: 30 }}>{pct}%</span>
    </div>
  );
}

function BrainIcon({ size = 16, pulse = false }) {
  return (
    <span style={{ fontSize: size, display: "inline-block", animation: pulse ? "brainPulse 2s ease infinite" : "none" }}>🧠</span>
  );
}

function usePredictions() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function useEffectiveData(org, location, queues, now) {
  return useMemo(() => {
    return org.services.map(svc => {
      const d = queues[qKey(org.id, location.id, svc.id)] || {};
      const pred = getPrediction(org.id, svc.id, now);
      const isManual = d.count !== null && d.count !== undefined;
      const effectiveCount = isManual ? d.count : (pred?.count ?? 0);
      const wait = effectiveCount * (d.serviceTime || svc.avgTime);
      return { svc, d, pred, isManual, effectiveCount, wait };
    });
  }, [org, location, queues, now]);
}

/* ════════════════════════════════════════════════════════════════
   SIDEBAR
════════════════════════════════════════════════════════════════ */
function Sidebar({ selectedOrg, selectedLoc, queues, onOrgChange, onLocChange, now }) {
  return (
    <aside style={{ width: 276, flexShrink: 0, background: "#fff", borderRight: "1.5px solid #e2e8f0", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @keyframes qpulse { 0%, 100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.3); opacity: 0; } }
        @keyframes brainPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.08); } }
      `}</style>
      <div style={{ padding: "16px 14px 12px", borderBottom: "1.5px solid #f1f5f9", flexShrink: 0 }}>
        <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.18em", fontFamily: "DM Mono, monospace", marginBottom: 10 }}>
          Organizations
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {ORGS.map(org => {
            const active = selectedOrg.id === org.id;
            return (
              <button
                key={org.id}
                onClick={() => onOrgChange(org)}
                style={{
                  all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  borderRadius: 13, background: active ? org.accentLight : "transparent",
                  border: `1.5px solid ${active ? org.accent + "45" : "rgba(0,0,0,0.07)"}`,
                  transition: "all 0.18s",
                }}
              >
                <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: active ? org.accent : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>
                  {org.icon}
                </span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: active ? org.accent : "#1e293b", margin: 0 }}>
                    {org.name}
                  </p>
                  <p style={{ fontSize: 10, color: "#94a3b8", margin: "2px 0 0", fontFamily: "DM Mono, monospace" }}>
                    {org.locations.length} branches · AI-powered
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
        <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.18em", fontFamily: "DM Mono, monospace", marginBottom: 10 }}>
          Locations
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {selectedOrg.locations.map(loc => {
            const active = selectedLoc.id === loc.id;
            let totalPeople = 0, maxWait = 0;
            selectedOrg.services.forEach(svc => {
              const d = queues[qKey(selectedOrg.id, loc.id, svc.id)] || {};
              const pred = getPrediction(selectedOrg.id, svc.id, now);
              const count = (d.count !== null && d.count !== undefined) ? d.count : (pred?.count ?? 0);
              totalPeople += count;
              const w = count * (d.serviceTime || svc.avgTime);
              if (w > maxWait) maxWait = w;
            });
            const sm = SM[statusOf(maxWait)];
            return (
              <button
                key={loc.id}
                onClick={() => onLocChange(loc)}
                style={{
                  all: "unset", cursor: "pointer", display: "block", padding: "13px 14px", borderRadius: 14,
                  background: active ? selectedOrg.accentLight : "rgba(0,0,0,0.02)",
                  border: `1.5px solid ${active ? selectedOrg.accent + "50" : "rgba(0,0,0,0.07)"}`,
                  transition: "all 0.18s", position: "relative",
                }}
              >
                {active && <span style={{ position: "absolute", left: 0, top: "18%", bottom: "18%", width: 3, borderRadius: "0 3px 3px 0", background: selectedOrg.accent }} />}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 800, color: active ? selectedOrg.accent : "#1e293b", margin: 0 }}>
                      {loc.name}
                    </p>
                    <p style={{ fontSize: 10, color: "#94a3b8", margin: "3px 0 0", fontFamily: "DM Mono, monospace" }}>
                      {loc.address}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8, flexShrink: 0 }}>
                    <PulseDot color={sm.color} size={7} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: sm.color, fontFamily: "DM Mono, monospace" }}>
                      {sm.label}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}>
                  <MiniBar count={totalPeople} color={sm.color} />
                  <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "DM Mono, monospace", flexShrink: 0 }}>
                    {totalPeople} queued
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "12px 14px", borderTop: "1.5px solid #f1f5f9", flexShrink: 0 }}>
        <div style={{ background: "linear-gradient(135deg,#7c3aed08,#6d28d908)", border: "1px solid #7c3aed20", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <BrainIcon size={14} pulse={true} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", fontFamily: "DM Mono, monospace" }}>
              AI Prediction Active
            </span>
          </div>
          <p style={{ fontSize: 10, color: "#64748b", lineHeight: 1.5, margin: 0 }}>
            Trained on 14 days of historical data. Auto-predicts when no manual count is set.
          </p>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 9, color: "#94a3b8", fontFamily: "DM Mono, monospace" }}>
              {DAY_NAMES[now.getDay()]} {now.getHours()}:00 slot
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ════════════════════════════════════════════════════════════════
   CITIZEN VIEW
════════════════════════════════════════════════════════════════ */
function CitizenServiceCard({ svc, effectiveData, accent }) {
  const { d, pred, isManual, effectiveCount, wait } = effectiveData;
  const sm = SM[statusOf(wait)];

  return (
    <div className="service-card" style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: 18, background: "#fff", border: "1.5px solid rgba(0,0,0,0.06)", boxShadow: "0 2px 12px rgba(0,0,0,0.04)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 22px" }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: `${accent}12`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>
          {svc.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: 0 }}>
              {svc.name}
            </p>
            {!isManual && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: "linear-gradient(135deg, #7c3aed15, #6d28d915)", border: "1px solid #7c3aed30", fontSize: 10, fontWeight: 700, color: "#7c3aed", fontFamily: "DM Mono, monospace", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                <BrainIcon size={11} /> AI
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <MiniBar count={effectiveCount} color={sm.color} />
            <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "DM Mono, monospace", flexShrink: 0 }}>
              {effectiveCount} ahead
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end", marginBottom: 5 }}>
            <PulseDot color={sm.color} size={7} />
            <span style={{ fontSize: 10, fontWeight: 700, color: sm.color, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "DM Mono, monospace" }}>
              {sm.label}
            </span>
          </div>
          <p style={{ fontSize: 28, fontWeight: 900, color: "#1e293b", margin: 0, fontFamily: "Fraunces, serif", letterSpacing: "-0.03em", lineHeight: 1 }}>
            {fmtWait(wait)}
          </p>
          {!d.open && <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, fontFamily: "DM Mono, monospace" }}>CLOSED</span>}
        </div>
      </div>

      {!isManual && pred && (
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "10px 22px", background: "linear-gradient(90deg,#7c3aed06,transparent)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <BrainIcon size={12} />
            <span style={{ fontSize: 10, color: "#7c3aed", fontFamily: "DM Mono, monospace", fontWeight: 600 }}>
              Predicted range: {pred.low}–{pred.high} people
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <ConfidenceBar pct={pred.confidence} color="#7c3aed" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 12, color: TREND_COLOR[pred.trend], fontWeight: 700 }}>
              {TREND_ICON[pred.trend]}
            </span>
            <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "DM Mono, monospace" }}>
              {pred.trend}
            </span>
          </div>
        </div>
      )}
      {isManual && (
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "8px 22px", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#64748b", fontFamily: "DM Mono, monospace" }}>
            ✏️ Manual entry · updated {fmtTime(d.lastUpdated)}
          </span>
        </div>
      )}
    </div>
  );
}

function CitizenView({ org, location, queues, now }) {
  const effectiveList = useEffectiveData(org, location, queues, now);
  const totalPeople = effectiveList.reduce((a, e) => a + e.effectiveCount, 0);
  const minWait = Math.min(...effectiveList.map(e => e.wait));
  const maxWait = Math.max(...effectiveList.map(e => e.wait));
  const aiCount = effectiveList.filter(e => !e.isManual).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
      <div className="hero-section" style={{ borderRadius: 24, padding: "26px 30px", color: "#fff", position: "relative", overflow: "hidden", background: `linear-gradient(135deg, ${org.accent} 0%, ${org.accent}bb 100%)`, boxShadow: `0 8px 32px ${org.accent}40` }}>
        <div style={{ position: "absolute", right: -24, top: -24, width: 130, height: 130, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
        <div style={{ position: "absolute", right: 40, bottom: -36, width: 90, height: 90, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />

        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, position: "relative" }}>
          <span style={{ fontSize: 44, lineHeight: 1 }}>{org.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <p style={{ fontSize: 11, opacity: 0.75, margin: 0, letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "DM Mono, monospace" }}>
                Live Queue · {org.name}
              </p>
              {aiCount > 0 && (
                <span style={{ background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "2px 8px", fontSize: 10, fontFamily: "DM Mono, monospace", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                  <BrainIcon size={11} /> AI Active
                </span>
              )}
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 900, margin: 0, fontFamily: "Fraunces, serif", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              {location.name}
            </h2>
            <p style={{ fontSize: 12, opacity: 0.6, margin: "5px 0 0", fontFamily: "DM Mono, monospace" }}>
              📍 {location.address}
            </p>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <p style={{ fontSize: 44, fontWeight: 900, margin: 0, fontFamily: "Fraunces, serif", letterSpacing: "-0.04em", lineHeight: 1 }}>
              {totalPeople}
            </p>
            <p style={{ fontSize: 10, opacity: 0.6, margin: "4px 0 0", fontFamily: "DM Mono, monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              total queued
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.18)", position: "relative" }}>
          {[["Shortest Wait", fmtWait(minWait)], ["Longest Wait", fmtWait(maxWait)], ["AI Predictions", `${aiCount} / ${org.services.length}`]].map(([label, val]) => (
            <div key={label}>
              <p style={{ fontSize: 10, opacity: 0.6, margin: 0, fontFamily: "DM Mono, monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {label}
              </p>
              <p style={{ fontSize: 17, fontWeight: 800, margin: "3px 0 0", fontFamily: "Fraunces, serif", letterSpacing: "-0.02em" }}>
                {val}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "DM Mono, monospace", flex: 1 }}>
            Live Service Status
          </p>
          {aiCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: "linear-gradient(135deg, #7c3aed15, #6d28d915)", border: "1px solid #7c3aed30", fontSize: 10, fontWeight: 700, color: "#7c3aed", fontFamily: "DM Mono, monospace", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              <BrainIcon size={11} /> {aiCount} AI-predicted
            </span>
          )}
        </div>
        <div className="citizen-grid">
          {effectiveList.map(e => (
            <CitizenServiceCard key={e.svc.id} svc={e.svc} effectiveData={e} accent={org.accent} />
          ))}
        </div>
      </div>

      <div style={{ borderRadius: 16, padding: "16px 20px", background: "linear-gradient(135deg,#7c3aed08,#6d28d905)", border: "1px solid #7c3aed18" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <BrainIcon size={22} pulse={true} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed", margin: "0 0 4px" }}>
              How AI Prediction Works
            </p>
            <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, margin: 0 }}>
              Wait times marked with <strong>🧠 AI</strong> are estimated from 14 days of historical patterns.
              The model weighs <strong>time of day</strong>, <strong>day of week</strong>, and recent trends.
              Confidence % reflects data reliability for this time slot.
              Staff can override any prediction with a manual count.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
        <PulseDot color="#10b981" size={7} />
        <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "DM Mono, monospace" }}>
          Live · predictions refresh every 30 seconds
        </span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   STAFF VIEW
════════════════════════════════════════════════════════════════ */
function StaffView({ org, location, queues, onUpdate, now }) {
  const effectiveList = useEffectiveData(org, location, queues, now);
  const lastUpdated = org.services.reduce((latest, svc) => {
    const ts = queues[qKey(org.id, location.id, svc.id)]?.lastUpdated || 0;
    return ts > latest ? ts : latest;
  }, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
      <div style={{ padding: "20px 24px", borderRadius: 22, background: `${org.accent}0d`, border: `1.5px solid ${org.accent}25`, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 38 }}>{org.icon}</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 10, color: org.accent, textTransform: "uppercase", letterSpacing: "0.2em", margin: 0, fontFamily: "DM Mono, monospace", fontWeight: 700 }}>
            Staff Control Panel
          </p>
          <h2 style={{ fontSize: 23, fontWeight: 900, color: "#1e293b", margin: "3px 0 0", fontFamily: "Fraunces, serif", letterSpacing: "-0.03em" }}>
            {location.name}
          </h2>
          <p style={{ fontSize: 11, color: "#94a3b8", margin: "3px 0 0", fontFamily: "DM Mono, monospace" }}>
            {org.name} · {location.address}
          </p>
        </div>
        {lastUpdated > 0 && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <p style={{ fontSize: 10, color: "#94a3b8", margin: 0, fontFamily: "DM Mono, monospace" }}>Last update</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: org.accent, margin: "2px 0 0", fontFamily: "DM Mono, monospace" }}>
              {fmtTime(lastUpdated)}
            </p>
          </div>
        )}
      </div>

      <div>
        <p style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "DM Mono, monospace", marginBottom: 12 }}>
          Manage Services
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {effectiveList.map(({ svc, d, pred, isManual, effectiveCount, wait }) => {
            const sm = SM[statusOf(wait)];
            const upd = (partial) => onUpdate(org.id, location.id, svc.id, { ...partial, lastUpdated: Date.now() });

            return (
              <div key={svc.id} className="staff-card" style={{ borderRadius: 18, background: "#fff", border: "1.5px solid rgba(0,0,0,0.07)", boxShadow: "0 2px 10px rgba(0,0,0,0.04)", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px 14px" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 13, background: `${org.accent}12`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                    {svc.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: 0 }}>
                        {svc.name}
                      </p>
                      {!isManual && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: "linear-gradient(135deg, #7c3aed15, #6d28d915)", border: "1px solid #7c3aed30", fontSize: 10, fontWeight: 700, color: "#7c3aed", fontFamily: "DM Mono, monospace", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                          <BrainIcon size={11} /> AI
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: "#94a3b8", margin: "3px 0 0", fontFamily: "DM Mono, monospace" }}>
                      {d.serviceTime || svc.avgTime} min/person · est. {fmtWait(wait)}
                    </p>
                  </div>
                  <button
                    onClick={() => upd({ open: !d.open, count: d.count })}
                    style={{
                      all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${d.open ? sm.color + "40" : "#e2e8f0"}`,
                      background: d.open ? `${sm.color}10` : "#f8fafc", transition: "all 0.2s",
                    }}
                  >
                    <PulseDot color={d.open ? sm.color : "#94a3b8"} size={7} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: d.open ? sm.color : "#94a3b8", fontFamily: "DM Mono, monospace", letterSpacing: "0.04em" }}>
                      {d.open ? sm.label.toUpperCase() : "CLOSED"}
                    </span>
                  </button>
                </div>

                {!isManual && pred && (
                  <div style={{ margin: "0 22px 14px", padding: "10px 14px", borderRadius: 12, background: "linear-gradient(90deg,#7c3aed08,transparent)", border: "1px solid #7c3aed18" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <BrainIcon size={13} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed" }}>
                        AI Predicts: {pred.count} people ({pred.low}–{pred.high} range)
                      </span>
                      <span style={{ fontSize: 11, color: TREND_COLOR[pred.trend], fontWeight: 700, marginLeft: "auto" }}>
                        {TREND_ICON[pred.trend]} {pred.trend}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "DM Mono, monospace" }}>Confidence</span>
                      <ConfidenceBar pct={pred.confidence} color="#7c3aed" />
                    </div>
                    <p style={{ fontSize: 10, color: "#94a3b8", margin: "6px 0 0", fontFamily: "DM Mono, monospace" }}>
                      Set a manual count below to override this prediction
                    </p>
                  </div>
                )}

                <div style={{ padding: "0 22px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={() => upd({ count: Math.max(0, effectiveCount - 1) })}
                      style={{
                        width: 38, height: 38, borderRadius: 11, border: "1.5px solid #fecaca", background: "#fef2f2",
                        color: "#ef4444", fontSize: 18, fontWeight: 700, cursor: effectiveCount <= 0 ? "not-allowed" : "pointer",
                        opacity: effectiveCount <= 0 ? 0.35 : 1, display: "flex", alignItems: "center",
                        justifyContent: "center", transition: "all 0.15s", userSelect: "none", flexShrink: 0,
                      }}
                    >
                      −
                    </button>
                    <div style={{ textAlign: "center", minWidth: 54 }}>
                      <p style={{ fontSize: 34, fontWeight: 900, color: "#1e293b", margin: 0, fontFamily: "Fraunces, serif", letterSpacing: "-0.04em", lineHeight: 1 }}>
                        {effectiveCount}
                      </p>
                      <p style={{ fontSize: 9, color: isManual ? "#64748b" : "#7c3aed", margin: "2px 0 0", fontFamily: "DM Mono, monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {isManual ? "manual" : "ai est."}
                      </p>
                    </div>
                    <button
                      onClick={() => upd({ count: effectiveCount + 1 })}
                      style={{
                        width: 38, height: 38, borderRadius: 11, border: `1.5px solid ${org.accent}40`, background: `${org.accent}10`,
                        color: org.accent, fontSize: 18, fontWeight: 700, cursor: "pointer", display: "flex",
                        alignItems: "center", justifyContent: "center", transition: "all 0.15s", userSelect: "none", flexShrink: 0,
                      }}
                    >
                      +
                    </button>
                  </div>

                  <div style={{ width: 1, height: 38, background: "#e2e8f0", flexShrink: 0 }} />

                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "DM Mono, monospace" }}>
                      min/person
                    </span>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={d.serviceTime || svc.avgTime}
                      onChange={e => upd({ serviceTime: Math.max(1, parseInt(e.target.value) || 1), count: d.count })}
                      style={{
                        width: 56, padding: "6px 8px", borderRadius: 10, border: `1.5px solid ${org.accent}30`,
                        background: `${org.accent}08`, color: org.accent, fontSize: 16, fontWeight: 800,
                        textAlign: "center", fontFamily: "Fraunces, serif", outline: "none",
                      }}
                    />
                  </div>

                  <div style={{ flex: 1 }} />

                  {isManual && (
                    <button
                      onClick={() => upd({ count: null })}
                      style={{
                        all: "unset", cursor: "pointer", padding: "6px 12px", borderRadius: 9,
                        border: "1.5px solid #7c3aed30", background: "#7c3aed08", color: "#7c3aed",
                        fontSize: 11, fontWeight: 700, fontFamily: "DM Mono, monospace", display: "flex",
                        alignItems: "center", gap: 5, transition: "all 0.2s",
                      }}
                    >
                      <BrainIcon size={12} /> Use AI
                    </button>
                  )}

                  <button
                    onClick={() => upd({ count: 0 })}
                    title="Set to 0"
                    style={{
                      all: "unset", cursor: "pointer", width: 34, height: 34, borderRadius: 10,
                      border: "1.5px solid #e2e8f0", background: "#f8fafc", display: "flex",
                      alignItems: "center", justifyContent: "center", fontSize: 15, color: "#94a3b8",
                      transition: "all 0.15s", flexShrink: 0,
                    }}
                  >
                    ↺
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => org.services.forEach(svc => onUpdate(org.id, location.id, svc.id, { count: null, lastUpdated: Date.now() }))}
        style={{
          all: "unset", cursor: "pointer", padding: "13px", borderRadius: 14, textAlign: "center",
          border: "1.5px solid #7c3aed25", background: "#fff", fontSize: 12, fontWeight: 700,
          color: "#7c3aed", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "DM Mono, monospace",
          transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
        }}
      >
        <BrainIcon size={14} /> Reset All to AI Mode
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ROOT APP
═══════════════════════════════════════════════════════════ */
export default function App() {
  const [queues, setQueues] = useState(loadQueues);
  const [selectedOrg, setSelectedOrg] = useState(ORGS[0]);
  const [selectedLoc, setSelectedLoc] = useState(ORGS[0].locations[0]);
  const [session, setSession] = useState(loadSession);
  const [mode, setMode] = useState(() => (loadSession()?.role === "provider" ? "staff" : "citizen"));
  const [authTab, setAuthTab] = useState("customer");
  // refresh timestamp for AI predictions (30s interval)
  const now = usePredictions();
  const cloudSyncReadyRef = useRef(false);
  const lastCloudHashRef = useRef("");

  useEffect(() => {
    saveQueues(queues);
  }, [queues]);

  useEffect(() => {
    const unsub = onSnapshot(
      CLOUD_DOC_REF,
      (snap) => {
        if (!snap.exists()) {
          cloudSyncReadyRef.current = true;
          return;
        }

        const cloudQueues = snap.data()?.queues;
        if (!cloudQueues) {
          cloudSyncReadyRef.current = true;
          return;
        }

        const merged = { ...buildDefaults(), ...cloudQueues };
        const incomingHash = JSON.stringify(merged);
        lastCloudHashRef.current = incomingHash;

        setQueues((prev) => {
          const prevHash = JSON.stringify(prev);
          return prevHash === incomingHash ? prev : merged;
        });

        cloudSyncReadyRef.current = true;
      },
      () => {
        cloudSyncReadyRef.current = true;
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!cloudSyncReadyRef.current) return;

    const hash = JSON.stringify(queues);
    if (hash === lastCloudHashRef.current) return;

    lastCloudHashRef.current = hash;
    setDoc(
      CLOUD_DOC_REF,
      { queues, updatedAt: serverTimestamp() },
      { merge: true }
    ).catch(() => { });
  }, [queues]);

  const handleOrgChange = (org) => {
    setSelectedOrg(org);
    setSelectedLoc(org.locations[0]);
  };

  const updateQueue = useCallback((orgId, locId, svcId, partial) => {
    setQueues(prev => {
      const key = qKey(orgId, locId, svcId);
      const updated = { ...prev, [key]: { ...prev[key], ...partial } };
      saveQueues(updated);
      return updated;
    });
  }, []);

  const grandTotal = Object.values(queues).reduce((a, q) => a + (q.count || 0), 0);
  const canAccessStaff = session?.role === "provider";

  const handleAuthSuccess = (authPayload) => {
    setSession(authPayload);
    saveSession(authPayload);
    setMode(authPayload.role === "provider" ? "staff" : "citizen");
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch {
      // Local logout still proceeds even if remote sign-out fails.
    }
    clearSession();
    setSession(null);
  };

  if (!session) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#f8fafc,#eef2ff)", padding: "28px 20px", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gap: 18 }}>
          <div style={{ borderRadius: 20, padding: "22px 24px", background: "#fff", border: "1.5px solid #e2e8f0", boxShadow: "0 8px 30px rgba(30,41,59,0.08)" }}>
            <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "DM Mono, monospace" }}>
              QueueFlow Access
            </p>
            <h1 style={{ margin: "8px 0 4px", fontSize: 34, lineHeight: 1.1, color: "#1e293b", fontFamily: "Fraunces, serif", letterSpacing: "-0.03em" }}>
              Sign In To Continue
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: "#64748b", maxWidth: 560 }}>
              Choose your login type below. You can sign in if you already have an account or sign up to create a new one.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: 6, width: "fit-content" }}>
            {[{ id: "customer", label: "Customer", activeColor: "#2563eb" }, { id: "provider", label: "Service Provider", activeColor: "#dc2626" }].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setAuthTab(tab.id)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  padding: "8px 14px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "DM Mono, monospace",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: authTab === tab.id ? "#fff" : "#64748b",
                  background: authTab === tab.id ? tab.activeColor : "transparent",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {authTab === "customer" ? (
            <CustomerAuth onAuthSuccess={handleAuthSuccess} />
          ) : (
            <ProviderAuth onAuthSuccess={handleAuthSuccess} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f8fafc", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* app-level styles and responsive tweaks */}
      <style>{`
        * { box-sizing: border-box; }
        html, body, #root { height: 100%; margin: 0; }
        body { -webkit-font-smoothing: antialiased; }
        input, button { font-family: inherit; }
        button { cursor: pointer; }
        .main-wrapper { display: flex; flex: 1; overflow: hidden; }
        @media (max-width: 768px) {
          header { padding: 12px 16px; height: auto !important; flex-direction: column !important; align-items: stretch !important; }
          header > div { width: 100%; justify-content: space-between; }
          header h1 { font-size: 16px; }
          header p { font-size: 8px; }
          .main-wrapper { flex-direction: column; overflow: auto; }
          aside { display: flex !important; width: 100% !important; height: auto !important; flex-direction: row; overflow-x: auto; overflow-y: hidden; border-right: none; border-bottom: 1.5px solid #e2e8f0; padding: 8px; gap: 8px; }
          aside > div { padding: 0 !important; }
          aside button { min-width: 120px; flex-shrink: 0; padding: 10px 8px !important; }
          main { width: 100%; padding: 16px 20px !important; }
          .service-card, .staff-card { padding: 14px 18px !important; }
        }
        .service-card { transition: transform 0.2s; }
        .service-card:hover { transform: translateY(-2px); }
      `}</style>
      <header style={{ height: 62, flexShrink: 0, background: "#fff", borderBottom: "1.5px solid #e2e8f0", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg,#1e293b,#475569)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>🔢</div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 900, fontFamily: "Fraunces, serif", letterSpacing: "-0.03em", color: "#1e293b", lineHeight: 1 }}>QueueFlow</h1>
            <p style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.18em", fontFamily: "DM Mono, monospace", textTransform: "uppercase", marginTop: 1 }}>AI-Powered Queue Dashboard</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 10, padding: "5px 10px" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#c2410c", fontFamily: "DM Mono, monospace" }}>
              Hello, {session.name}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,#7c3aed10,#6d28d908)", border: "1px solid #7c3aed25", borderRadius: 10, padding: "5px 11px" }}>
            <BrainIcon size={13} pulse={true} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", fontFamily: "DM Mono, monospace" }}>AI On</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "5px 12px" }}>
            <PulseDot color="#10b981" size={7} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", fontFamily: "DM Mono, monospace" }}>{grandTotal} queued</span>
          </div>
          <div style={{ display: "flex", background: "#f1f5f9", border: "1.5px solid #e2e8f0", borderRadius: 11, padding: 3, gap: 3 }}>
            {[["citizen", "👁 Public"], ...(canAccessStaff ? [["staff", "⚙️ Staff"]] : [])].map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} style={{ all: "unset", cursor: "pointer", padding: "7px 15px", borderRadius: 9, fontSize: 12, fontWeight: 700, fontFamily: "DM Mono, monospace", background: mode === m ? "#1e293b" : "transparent", color: mode === m ? "#fff" : "#64748b", boxShadow: mode === m ? "0 2px 8px rgba(0,0,0,0.15)" : "none" }}>{label}</button>
            ))}
          </div>
          <button
            onClick={logout}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: "7px 12px",
              borderRadius: 9,
              border: "1.5px solid #fecaca",
              background: "#fef2f2",
              color: "#b91c1c",
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "DM Mono, monospace",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <div className="main-wrapper">
        <Sidebar selectedOrg={selectedOrg} selectedLoc={selectedLoc} queues={queues} onOrgChange={handleOrgChange} onLocChange={setSelectedLoc} now={now} />
        <main style={{ flex: 1, overflowY: "auto", padding: "28px 36px", background: "#f1f5f9" }}>
          <div key={`${selectedOrg.id}-${selectedLoc.id}-${mode}`}>
            {mode === "staff" && canAccessStaff ? (
              <StaffView org={selectedOrg} location={selectedLoc} queues={queues} onUpdate={updateQueue} now={now} />
            ) : (
              <CitizenView org={selectedOrg} location={selectedLoc} queues={queues} now={now} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
