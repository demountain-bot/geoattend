import { evaluate } from "./geo.js";

// The Google Apps Script web-app URL: set by the admin in .env / Vercel,
// or pasted by the user on the welcome screen.
const ENV_URL = import.meta.env.VITE_SHEETS_URL || "";
export const getUrl = () => localStorage.getItem("ga_sheet_url") || ENV_URL;
export const setUrl = (u) => localStorage.setItem("ga_sheet_url", u.trim());
export const mode = () => (getUrl() ? "sheets" : "local");

async function call(action, params = {}, body) {
  let res;
  try {
    res = body
      ? await fetch(getUrl(), {
          method: "POST",
          // text/plain avoids a CORS preflight, which Apps Script can't answer
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action, ...body }),
        })
      : await fetch(getUrl() + "?" + new URLSearchParams({ action, ...params }));
  } catch {
    throw new Error("Can't reach the Google Sheet. Check your connection and the web app link.");
  }
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

/* ---------- local fallback (no Sheet connected) ---------- */
const DEFAULT_ZONES = [{ id: "z1", name: "Main Office", lat: 6.5012, lng: 4.7845, radius: 150 }];
const read = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export async function listZones() {
  if (mode() === "sheets") return call("zones");
  return read("ga_zones", DEFAULT_ZONES);
}

export async function saveZone(zone, pin) {
  if (mode() === "sheets") return call("saveZone", {}, { zone, pin });
  const zones = read("ga_zones", DEFAULT_ZONES);
  const i = zones.findIndex((z) => z.id === zone.id);
  if (i >= 0) zones[i] = zone; else zones.push({ ...zone, id: "z" + Date.now() });
  write("ga_zones", zones);
}

export async function listAttendance(employee) {
  if (mode() === "sheets") return call("history", { employee });
  return read("ga_attendance", []).filter((r) => r.employee === employee)
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
}

// type: "in" | "out". The Sheet backend re-validates the geofence on the server.
export async function record(employee, type, pos, zones) {
  const device = navigator.userAgent.slice(0, 80);
  if (mode() === "sheets") {
    return call("record", {}, { employee, type, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, device });
  }
  const res = evaluate(pos, zones);
  if (!res?.inside) throw new Error("You are outside the allowed zone.");
  const row = {
    id: crypto.randomUUID(), employee, type, recorded_at: new Date().toISOString(),
    lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy,
    zone_id: res.zone.id, zone_name: res.zone.name, distance_m: Math.round(res.distance), device,
  };
  write("ga_attendance", [...read("ga_attendance", []), row]);
  return row;
}
