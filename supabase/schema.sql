-- Run in the Supabase SQL editor.

create table if not exists zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision not null,
  lng double precision not null,
  radius integer not null check (radius between 20 and 2000)
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  employee text not null,
  type text not null check (type in ('in','out')),
  recorded_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  zone_id uuid references zones(id),
  zone_name text,
  distance_m integer,
  device text
);
create index if not exists attendance_employee_idx on attendance (employee, recorded_at desc);

-- Distance in metres between two points (haversine).
create or replace function geo_distance(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Server-side geofence check: the client can't skip it.
create or replace function record_attendance(
  p_employee text, p_type text, p_lat float8, p_lng float8, p_accuracy float8
) returns attendance language plpgsql security definer as $$
declare z zones; d float8; r attendance;
begin
  if p_accuracy is null or p_accuracy > 100 then
    raise exception 'GPS accuracy is too low (%.0f m). Move to an open area and retry.', coalesce(p_accuracy, 0);
  end if;
  select zs.*, geo_distance(p_lat, p_lng, zs.lat, zs.lng) into z, d
    from zones zs order by geo_distance(p_lat, p_lng, zs.lat, zs.lng) limit 1;
  if z.id is null or d > z.radius then
    raise exception 'You are outside the allowed zone.';
  end if;
  insert into attendance (employee, type, lat, lng, accuracy, zone_id, zone_name, distance_m)
  values (p_employee, p_type, p_lat, p_lng, p_accuracy, z.id, z.name, round(d))
  returning * into r;
  return r;
end $$;

-- Starter zone (edit the coordinates).
insert into zones (name, lat, lng, radius) values ('Main Office', 6.5012, 4.7845, 150);

-- Row level security: replace these open policies with Supabase Auth rules before production.
alter table zones enable row level security;
alter table attendance enable row level security;
create policy "read zones" on zones for select using (true);
create policy "manage zones (demo)" on zones for all using (true) with check (true);
create policy "read attendance (demo)" on attendance for select using (true);
-- Inserts happen only through record_attendance() (security definer).
