import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Circle, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import { watchPosition, evaluate } from "./geo.js";
import * as api from "./api.js";

const LATE_AFTER = "08:30"; // check-ins after this local time count as late
const GREEN = "#0E7C66";
const BLUE = "#2563EB";

/* ---------- Map ---------- */
function Recenter({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, map.getZoom()); }, [center?.[0], center?.[1]]);
  return null;
}
function Picker({ onPick }) {
  useMapEvents({ click: (e) => onPick?.(e.latlng.lat, e.latlng.lng) });
  return null;
}
function ZoneMap({ zones, pos, center, onPick, height = 300 }) {
  const c = center || (pos ? [pos.lat, pos.lng] : zones[0] ? [zones[0].lat, zones[0].lng] : [6.5, 4.78]);
  return (
    <div className="map" style={{ height }}>
      <MapContainer center={c} zoom={17} zoomControl={false} attributionControl={false} style={{ height: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Recenter center={c} />
        {onPick && <Picker onPick={onPick} />}
        {zones.map((z) => (
          <Circle key={z.id} center={[z.lat, z.lng]} radius={z.radius}
            pathOptions={{ color: GREEN, weight: 2.5, dashArray: "8 6", fillColor: GREEN, fillOpacity: 0.18 }} />
        ))}
        {pos && (
          <>
            <Circle center={[pos.lat, pos.lng]} radius={pos.accuracy}
              pathOptions={{ color: BLUE, weight: 0, fillColor: BLUE, fillOpacity: 0.15 }} />
            <CircleMarker center={[pos.lat, pos.lng]} radius={8}
              pathOptions={{ color: "#fff", weight: 3, fillColor: BLUE, fillOpacity: 1 }} />
          </>
        )}
      </MapContainer>
    </div>
  );
}

/* ---------- Home ---------- */
function Home({ employee, zones, pos, geoError, records, reload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState(null);

  const res = useMemo(() => evaluate(pos, zones), [pos, zones]);
  const today = new Date().toDateString();
  const todays = records.filter((r) => new Date(r.recorded_at).toDateString() === today);
  const nextType = todays.length && todays[0].type === "in" ? "out" : "in";

  async function act() {
    setBusy(true); setError("");
    try {
      const row = await api.record(employee, nextType, pos, zones);
      setLast(row);
      await reload();
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  if (last) return <Success row={last} onDone={() => setLast(null)} />;

  const label = !pos ? "Finding your location…"
    : res?.inside ? (nextType === "in" ? "Check in" : "Check out")
    : !res ? "No zones set up"
    : !res.accurate ? "Waiting for better GPS signal" : "Move closer to check in";

  return (
    <div className="stack">
      <div className="greet"><span>Good day,</span><h1>{employee}</h1></div>
      <div className="mapwrap">
        <ZoneMap zones={zones} pos={pos} />
        {res && (
          <span className={"zonechip " + (res.inside ? "ok" : "bad")}>
            <i />{res.inside ? `Inside geofence · ${res.zone.name}` : `Outside geofence · ${Math.round(res.distance)} m away`}
          </span>
        )}
      </div>
      {geoError && <p className="alert">{geoError}</p>}
      {res && (
        <div className="card rows">
          <div><span>Zone</span><b>{res.zone.name}</b></div>
          <div><span>Distance from center</span><b className={res.inside ? "" : "danger"}>{Math.round(res.distance)} m</b></div>
          <div><span>Allowed radius</span><b>{res.zone.radius} m</b></div>
          <div><span>GPS accuracy</span><b className="green">±{Math.round(pos.accuracy)} m</b></div>
        </div>
      )}
      {error && <p className="alert">{error}</p>}
      <div className="grow" />
      <button className="btn" disabled={!res?.inside || busy} onClick={act}>{busy ? "Saving…" : label}</button>
    </div>
  );
}

function Success({ row, onDone }) {
  const d = new Date(row.recorded_at);
  return (
    <div className="stack center">
      <div className="tick"><span>✓</span></div>
      <h1>{row.type === "in" ? "Checked in" : "Checked out"}</h1>
      <p className="muted">{d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short", year: "numeric" })} · {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
      <p className="label">Geotag captured</p>
      <div className="card rows full">
        <div><span>Zone</span><b>{row.zone_name}</b></div>
        <div><span>Latitude</span><b>{row.lat.toFixed(4)}°</b></div>
        <div><span>Longitude</span><b>{row.lng.toFixed(4)}°</b></div>
        <div><span>GPS accuracy</span><b className="green">±{Math.round(row.accuracy)} m</b></div>
        <div><span>Distance from center</span><b>{row.distance_m} m</b></div>
      </div>
      <p className="note full">Location verified inside geofence at time of {row.type === "in" ? "check-in" : "check-out"}.</p>
      <div className="grow" />
      <button className="btn full" onClick={onDone}>Done</button>
    </div>
  );
}

/* ---------- History ---------- */
function History({ records }) {
  const days = useMemo(() => {
    const m = new Map();
    [...records].reverse().forEach((r) => {
      const k = new Date(r.recorded_at).toDateString();
      const e = m.get(k) || { date: new Date(r.recorded_at), in: null, out: null, zone: r.zone_name };
      if (r.type === "in" && !e.in) e.in = new Date(r.recorded_at);
      if (r.type === "out") e.out = new Date(r.recorded_at);
      m.set(k, e);
    });
    return [...m.values()].reverse();
  }, [records]);
  const isLate = (d) => d && `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` > LATE_AFTER;
  const t = (d) => (d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");
  const late = days.filter((d) => isLate(d.in)).length;

  return (
    <div className="stack">
      <div className="greet"><span>{new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span><h1>Attendance history</h1></div>
      <div className="stats">
        <div className="card"><b className="green">{days.length - late}</b><span>On time</span></div>
        <div className="card"><b className="warn">{late}</b><span>Late</span></div>
        <div className="card"><b>{days.length}</b><span>Days</span></div>
      </div>
      {days.length === 0 && <p className="muted">No check-ins yet. Your first one will show up here.</p>}
      {days.map((d, i) => (
        <div className="card logrow" key={i}>
          <div>
            <b>{d.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</b>
            <span>{t(d.in)} → {t(d.out)}</span>
            <small>● {d.zone}</small>
          </div>
          <em className={isLate(d.in) ? "pill warnpill" : "pill okpill"}>{isLate(d.in) ? "Late" : "On time"}</em>
        </div>
      ))}
    </div>
  );
}

/* ---------- Zones (admin) ---------- */
function Zones({ zones, reload, pos }) {
  const [z, setZ] = useState(zones[0] || { id: "new", name: "", lat: pos?.lat ?? 6.5, lng: pos?.lng ?? 4.78, radius: 150 });
  const [msg, setMsg] = useState("");
  const [pin, setPin] = useState("");
  const set = (patch) => setZ((o) => ({ ...o, ...patch }));

  async function save() {
    try { await api.saveZone(z, pin); await reload(); setMsg("Geofence saved."); }
    catch (e) { setMsg(e.message); }
  }
  return (
    <div className="stack">
      <div className="greet"><span>Admin</span><h1>Set up geofence</h1></div>
      <div className="mapwrap">
        <ZoneMap zones={[z]} pos={pos} center={[z.lat, z.lng]} height={230} onPick={(lat, lng) => set({ lat, lng })} />
        <span className="hint">Tap map to move center</span>
      </div>
      <div className="card form">
        <label>Zone name<input value={z.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label>Center (lat, lng)
          <input readOnly value={`${z.lat.toFixed(5)}° N, ${z.lng.toFixed(5)}° E`} />
        </label>
        {pos && <button className="link" onClick={() => set({ lat: pos.lat, lng: pos.lng })}>Use my current location</button>}
        {api.mode() === "sheets" && (
          <label>Admin PIN<input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Set in the Settings tab of your Sheet" /></label>
        )}
        <label>
          <span className="between">Radius <b className="green">{z.radius} m</b></span>
          <input type="range" min="20" max="1000" step="10" value={z.radius} onChange={(e) => set({ radius: +e.target.value })} />
        </label>
      </div>
      {zones.length > 1 && (
        <select onChange={(e) => setZ(zones.find((x) => x.id === e.target.value))} value={z.id}>
          {zones.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      )}
      {msg && <p className="note">{msg}</p>}
      <div className="grow" />
      <button className="btn" disabled={!z.name} onClick={save}>Save geofence</button>
    </div>
  );
}

/* ---------- Shell ---------- */
export default function App() {
  const [employee, setEmployee] = useState(localStorage.getItem("ga_employee") || "");
  const [draft, setDraft] = useState("");
  const [sheetDraft, setSheetDraft] = useState("");
  const [tab, setTab] = useState("home");
  const [zones, setZones] = useState([]);
  const [records, setRecords] = useState([]);
  const [pos, setPos] = useState(null);
  const [geoError, setGeoError] = useState("");

  const reload = async () => {
    setZones(await api.listZones());
    if (employee) setRecords(await api.listAttendance(employee));
  };
  useEffect(() => { reload().catch((e) => setGeoError(e.message)); }, [employee]);
  useEffect(() => watchPosition(
    (p) => { setPos(p); setGeoError(""); },
    (e) => setGeoError(e.code === 1 ? "Location is blocked. Allow location access in your browser settings to check in." : "Could not get your location. Move to an open area and try again.")
  ), []);

  if (!employee) {
    return (
      <div className="phone"><div className="stack pad">
        <div className="greet"><span>Welcome to</span><h1>GeoAttend</h1></div>
        <div className="card form">
          <label>Your name<input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Adetunji" /></label>
          {!api.getUrl() && (
            <label>Google Sheet web app link (from your admin)
              <input value={sheetDraft} onChange={(e) => setSheetDraft(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
            </label>
          )}
        </div>
        <div className="grow" />
        <button className="btn" disabled={!draft.trim()} onClick={() => { if (sheetDraft.trim()) api.setUrl(sheetDraft); localStorage.setItem("ga_employee", draft.trim()); setEmployee(draft.trim()); }}>Continue</button>
      </div></div>
    );
  }

  const tabs = [["home", "Home"], ["history", "History"], ["zones", "Zones"]];
  return (
    <div className="phone">
      <main className="pad">
        {tab === "home" && <Home {...{ employee, zones, pos, geoError, records, reload }} />}
        {tab === "history" && <History records={records} />}
        {tab === "zones" && <Zones key={zones.length} {...{ zones, reload, pos }} />}
      </main>
      <nav>
        {tabs.map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><i />{l}</button>
        ))}
      </nav>
    </div>
  );
}
