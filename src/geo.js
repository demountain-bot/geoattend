// Great-circle distance in metres between two lat/lng points.
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Nearest zone to a position, with distance and inside/outside result.
export function evaluate(pos, zones, maxAccuracy = 100) {
  if (!pos || zones.length === 0) return null;
  let best = null;
  for (const z of zones) {
    const d = haversine(pos.lat, pos.lng, z.lat, z.lng);
    if (!best || d < best.distance) best = { zone: z, distance: d };
  }
  const accurate = pos.accuracy <= maxAccuracy;
  return {
    ...best,
    accurate,
    inside: best.distance <= best.zone.radius && accurate,
  };
}

// Continuous GPS updates. Returns a function that stops watching.
export function watchPosition(onPos, onError) {
  if (!navigator.geolocation) {
    onError(new Error("This device does not support location."));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (p) =>
      onPos({
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy,
        ts: p.timestamp,
      }),
    onError,
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}
