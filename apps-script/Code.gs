/**
 * GeoAttend backend. Paste into Extensions > Apps Script of your Google Sheet,
 * run setup() once, then Deploy > New deployment > Web app.
 */
const HEADERS = {
  Zones: ["id", "name", "lat", "lng", "radius"],
  Attendance: ["id", "employee", "type", "recorded_at", "lat", "lng", "accuracy", "zone_id", "zone_name", "distance_m", "device"],
  Settings: ["key", "value"],
};

// Run once: creates the tabs, a starter zone and default settings.
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach((name) => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]).setFontWeight("bold");
      sh.setFrozenRows(1);
    }
  });
  ss.getSheetByName("Attendance").getRange("D:D").setNumberFormat("@"); // keep timestamps as text
  const zones = ss.getSheetByName("Zones");
  if (zones.getLastRow() < 2) zones.appendRow([Utilities.getUuid(), "Main Office", 6.5012, 4.7845, 150]);
  const set = ss.getSheetByName("Settings");
  if (set.getLastRow() < 2) {
    set.getRange(2, 1, 3, 2).setValues([["adminPin", "1234"], ["maxAccuracy", 100], ["lateAfter", "08:30"]]);
  }
}

function doGet(e) {
  return handle_(() => {
    const a = e.parameter.action;
    if (a === "zones") return zones_();
    if (a === "history") {
      return rows_("Attendance")
        .filter((r) => String(r.employee) === e.parameter.employee)
        .sort((x, y) => String(y.recorded_at).localeCompare(String(x.recorded_at)))
        .slice(0, 200);
    }
    throw new Error("Unknown action");
  });
}

function doPost(e) {
  return handle_(() => {
    const b = JSON.parse(e.postData.contents);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (b.action === "record") return record_(b);
      if (b.action === "saveZone") return saveZone_(b);
      throw new Error("Unknown action");
    } finally {
      lock.releaseLock();
    }
  });
}

// The geofence is checked here, so the browser can't skip it.
function record_(b) {
  const max = Number(settings_().maxAccuracy) || 100;
  if (!b.employee) throw new Error("Name is required.");
  if (b.type !== "in" && b.type !== "out") throw new Error("Invalid type.");
  const lat = Number(b.lat), lng = Number(b.lng), acc = Number(b.accuracy);
  if (!isFinite(lat) || !isFinite(lng)) throw new Error("Invalid location.");
  if (!(acc <= max)) throw new Error("GPS accuracy is too low (±" + Math.round(acc) + " m). Move to an open area and retry.");

  let best = null;
  zones_().forEach((z) => {
    const d = dist_(lat, lng, z.lat, z.lng);
    if (!best || d < best.d) best = { z: z, d: d };
  });
  if (!best || best.d > best.z.radius) throw new Error("You are outside the allowed zone.");

  const row = {
    id: Utilities.getUuid(), employee: String(b.employee).slice(0, 80), type: b.type,
    recorded_at: new Date().toISOString(), lat: lat, lng: lng, accuracy: acc,
    zone_id: best.z.id, zone_name: best.z.name, distance_m: Math.round(best.d),
    device: String(b.device || "").slice(0, 80),
  };
  sheet_("Attendance").appendRow(HEADERS.Attendance.map((k) => row[k]));
  return row;
}

function saveZone_(b) {
  if (String(b.pin) !== String(settings_().adminPin)) throw new Error("Wrong admin PIN.");
  const z = b.zone || {};
  const radius = Number(z.radius), lat = Number(z.lat), lng = Number(z.lng);
  if (!z.name || !isFinite(lat) || !isFinite(lng) || !(radius >= 20 && radius <= 2000)) throw new Error("Invalid zone.");
  const sh = sheet_("Zones");
  const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().map((r) => String(r[0]));
  const idx = sh.getLastRow() > 1 ? ids.indexOf(String(z.id)) : -1;
  const vals = [String(z.name).slice(0, 80), lat, lng, radius];
  if (idx >= 0) sh.getRange(idx + 2, 2, 1, 4).setValues([vals]);
  else sh.appendRow([Utilities.getUuid()].concat(vals));
  return true;
}

/* helpers */
function sheet_(n) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }
function rows_(n) {
  const v = sheet_(n).getDataRange().getValues(), h = v[0];
  return v.slice(1).filter((r) => r.some((c) => c !== "")).map((r) => {
    const o = {}; h.forEach((k, i) => (o[k] = r[i])); return o;
  });
}
function settings_() { const o = {}; rows_("Settings").forEach((r) => (o[r.key] = r.value)); return o; }
function zones_() {
  const sh = sheet_("Zones"), v = sh.getDataRange().getValues(), out = [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i];
    if (r[1] === "") continue;
    if (!r[0]) { r[0] = Utilities.getUuid(); sh.getRange(i + 1, 1).setValue(r[0]); } // admin added a row by hand
    out.push({ id: String(r[0]), name: String(r[1]), lat: Number(r[2]), lng: Number(r[3]), radius: Number(r[4]) });
  }
  return out;
}
function dist_(a, b, c, d) {
  const R = 6371000, t = (x) => (x * Math.PI) / 180;
  const h = Math.pow(Math.sin(t(c - a) / 2), 2) + Math.cos(t(a)) * Math.cos(t(c)) * Math.pow(Math.sin(t(d - b) / 2), 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
function handle_(fn) {
  let out;
  try { out = { ok: true, data: fn() }; } catch (err) { out = { ok: false, error: err.message }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
