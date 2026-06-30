#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env");
const PAGE_SIZE = 1000;

function parseDotEnv(filePath) {
  const contents = readFileSync(filePath, "utf8");
  const values = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function requiredEnv(name, fallback) {
  const value = process.env[name] ?? fallback?.[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function normalizeStayBucket(bucket) {
  if (bucket === "weekend_europe" || bucket === "sun_breaks") return "weekend";
  if (bucket === "long_haul") return "long_stay";
  return "weekend";
}

function legacyBucketFromRoute(route) {
  return normalizeStayBucket(route.bucket) === "weekend" ? "weekend_europe" : "long_haul";
}

function unique(values) {
  return Array.from(new Set(values.filter((value) => value !== null && value !== undefined)));
}

function routeIdentity(route) {
  return `${route.origin_airport}:${route.destination_airport}:${route.max_stops}`;
}

function parseTimestamp(value) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareRoutesForCanonical(left, right) {
  const leftStayBucket = normalizeStayBucket(left.bucket);
  const rightStayBucket = normalizeStayBucket(right.bucket);
  if (leftStayBucket !== rightStayBucket) {
    return leftStayBucket === "weekend" ? -1 : 1;
  }

  const leftMin = left.min_trip_nights ?? left.trip_nights;
  const rightMin = right.min_trip_nights ?? right.trip_nights;
  if (leftMin !== rightMin) {
    return leftMin - rightMin;
  }

  return parseTimestamp(left.created_at) - parseTimestamp(right.created_at);
}

function buildMergedRoutePayload(routes, canonical) {
  const minTripValues = routes
    .map((route) => route.min_trip_nights ?? route.trip_nights)
    .filter((value) => Number.isFinite(value));
  const maxTripValues = routes
    .map((route) => route.max_trip_nights ?? route.trip_nights)
    .filter((value) => Number.isFinite(value));

  return {
    origin_airport: canonical.origin_airport,
    destination_airport: canonical.destination_airport,
    destination_city: canonical.destination_city,
    bucket: routes.some((route) => normalizeStayBucket(route.bucket) === "weekend")
      ? "weekend_europe"
      : legacyBucketFromRoute(canonical),
    teaser: canonical.teaser,
    trip_nights: Math.min(...minTripValues),
    min_trip_nights: Math.min(...minTripValues),
    max_trip_nights: Math.max(...maxTripValues),
    lookahead_start_days: Math.min(...routes.map((route) => route.lookahead_start_days)),
    lookahead_end_days: Math.max(...routes.map((route) => route.lookahead_end_days)),
    max_stops: canonical.max_stops,
    is_active: routes.some((route) => route.is_active),
  };
}

async function fetchRows(baseUrl, headers, table, select, params = {}) {
  const rows = [];
  let offset = 0;

  while (true) {
    const url = new URL(`/rest/v1/${table}`, baseUrl);
    url.searchParams.set("select", select);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${table}: ${response.status} ${await response.text()}`);
    }

    const page = await response.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += page.length;
  }

  return rows;
}

async function patchWhere(baseUrl, headers, table, filters, payload) {
  const url = new URL(`/rest/v1/${table}`, baseUrl);
  for (const [key, value] of Object.entries(filters)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      ...headers,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to patch ${table}: ${response.status} ${await response.text()}`);
  }
}

async function deleteWhere(baseUrl, headers, table, filters) {
  const url = new URL(`/rest/v1/${table}`, baseUrl);
  for (const [key, value] of Object.entries(filters)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      ...headers,
      Prefer: "return=minimal",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete from ${table}: ${response.status} ${await response.text()}`);
  }
}

function chooseWinner(rows, compareFn) {
  return rows.slice().sort(compareFn)[0];
}

async function reassignSimpleChildren(baseUrl, headers, table, duplicateIds, canonicalId) {
  for (const routeId of duplicateIds) {
    await patchWhere(baseUrl, headers, table, { route_id: `eq.${routeId}` }, { route_id: canonicalId });
  }
}

async function mergePatternOverrides(baseUrl, headers, routeIds, canonicalId) {
  const rows = await fetchRows(
    baseUrl,
    headers,
    "route_pattern_overrides",
    "id,route_id,pattern_key,last_checked_at,updated_at",
    { route_id: `in.(${routeIds.join(",")})` },
  );

  const groups = rows.reduce((map, row) => {
    const key = row.pattern_key;
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
    return map;
  }, new Map());

  for (const [, groupRows] of groups) {
    const canonicalRow = groupRows.find((row) => row.route_id === canonicalId) ?? null;
    const richestRow = chooseWinner(
      groupRows,
      (left, right) =>
        parseTimestamp(right.last_checked_at) - parseTimestamp(left.last_checked_at) ||
        parseTimestamp(right.updated_at) - parseTimestamp(left.updated_at),
    );
    const winner = canonicalRow ?? richestRow;

    for (const row of groupRows) {
      if (row.id === winner.id) {
        if (!canonicalRow && row.route_id !== canonicalId) {
          await patchWhere(
            baseUrl,
            headers,
            "route_pattern_overrides",
            { id: `eq.${row.id}` },
            { route_id: canonicalId },
          );
        }
        continue;
      }

      await deleteWhere(baseUrl, headers, "route_pattern_overrides", { id: `eq.${row.id}` });
    }
  }
}

async function mergeServiceMonths(baseUrl, headers, routeIds, canonicalId) {
  const rows = await fetchRows(
    baseUrl,
    headers,
    "route_service_months",
    "id,route_id,month_start,routing,departure_dates,departure_weekdays,observed_patterns,sample_size,last_checked_at,updated_at",
    { route_id: `in.(${routeIds.join(",")})` },
  );

  const groups = rows.reduce((map, row) => {
    const key = `${row.month_start}:${row.routing}`;
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
    return map;
  }, new Map());

  for (const [, groupRows] of groups) {
    const canonicalRow = groupRows.find((row) => row.route_id === canonicalId) ?? null;
    const freshestRow = chooseWinner(
      groupRows,
      (left, right) =>
        parseTimestamp(right.last_checked_at) - parseTimestamp(left.last_checked_at) ||
        Number(right.sample_size ?? 0) - Number(left.sample_size ?? 0),
    );
    const winner = canonicalRow ?? freshestRow;

    const mergedDepartureDates = unique(groupRows.flatMap((row) => row.departure_dates ?? [])).sort();
    const mergedDepartureWeekdays = unique(groupRows.flatMap((row) => row.departure_weekdays ?? [])).sort();
    const richestPatterns = chooseWinner(
      groupRows,
      (left, right) =>
        JSON.stringify(right.observed_patterns ?? []).length -
          JSON.stringify(left.observed_patterns ?? []).length ||
        parseTimestamp(right.last_checked_at) - parseTimestamp(left.last_checked_at),
    );

    await patchWhere(
      baseUrl,
      headers,
      "route_service_months",
      { id: `eq.${winner.id}` },
      {
        ...(canonicalRow ? {} : { route_id: canonicalId }),
        departure_dates: mergedDepartureDates,
        departure_weekdays: mergedDepartureWeekdays,
        observed_patterns: richestPatterns.observed_patterns ?? [],
        sample_size: Math.max(...groupRows.map((row) => Number(row.sample_size ?? 0))),
      },
    );

    for (const row of groupRows) {
      if (row.id === winner.id) continue;
      await deleteWhere(baseUrl, headers, "route_service_months", { id: `eq.${row.id}` });
    }
  }
}

async function mergeRouteSearchRules(baseUrl, headers, routeIds, canonicalId) {
  const rows = await fetchRows(
    baseUrl,
    headers,
    "route_search_rules",
    "id,route_id,month_start,pattern_key,max_stops,source,sort_order,updated_at",
    { route_id: `in.(${routeIds.join(",")})` },
  );

  const groups = rows.reduce((map, row) => {
    const key = `${row.month_start}:${row.pattern_key}:${row.max_stops}`;
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
    return map;
  }, new Map());

  for (const [, groupRows] of groups) {
    const canonicalRow = groupRows.find((row) => row.route_id === canonicalId) ?? null;
    const preferredRow = chooseWinner(
      groupRows,
      (left, right) =>
        Number(left.source === "manual") - Number(right.source === "manual") ||
        Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0) ||
        parseTimestamp(right.updated_at) - parseTimestamp(left.updated_at),
    );
    const winner = canonicalRow ?? preferredRow;

    if (!canonicalRow && winner.route_id !== canonicalId) {
      await patchWhere(baseUrl, headers, "route_search_rules", { id: `eq.${winner.id}` }, { route_id: canonicalId });
    }

    for (const row of groupRows) {
      if (row.id === winner.id) continue;
      await deleteWhere(baseUrl, headers, "route_search_rules", { id: `eq.${row.id}` });
    }
  }
}

async function main() {
  const dotEnvValues = parseDotEnv(ENV_PATH);
  const supabaseUrl = requiredEnv("SUPABASE_URL", dotEnvValues);
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY", dotEnvValues);
  const execute = process.argv.includes("--execute");

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  const routes = await fetchRows(
    supabaseUrl,
    headers,
    "scanned_routes",
    "id,origin_airport,destination_airport,destination_city,bucket,teaser,trip_nights,min_trip_nights,max_trip_nights,lookahead_start_days,lookahead_end_days,max_stops,is_active,created_at",
    { order: "origin_airport.asc,destination_airport.asc,max_stops.asc,created_at.asc" },
  );

  const duplicateGroups = Array.from(
    routes.reduce((map, route) => {
      const key = routeIdentity(route);
      const bucket = map.get(key) ?? [];
      bucket.push(route);
      map.set(key, bucket);
      return map;
    }, new Map()),
  )
    .map(([identity, groupRoutes]) => ({ identity, routes: groupRoutes }))
    .filter((group) => group.routes.length > 1);

  const summary = {
    mode: execute ? "execute" : "dry-run",
    duplicateGroups: duplicateGroups.length,
    duplicateRoutes: duplicateGroups.reduce((sum, group) => sum + group.routes.length - 1, 0),
    sample: duplicateGroups.slice(0, 20).map((group) => ({
      identity: group.identity,
      routeIds: group.routes.map((route) => route.id),
      buckets: group.routes.map((route) => route.bucket),
      maxStops: group.routes[0]?.max_stops ?? null,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!execute || duplicateGroups.length === 0) {
    return;
  }

  for (const group of duplicateGroups) {
    const canonical = chooseWinner(group.routes, compareRoutesForCanonical);
    const duplicateRoutes = group.routes.filter((route) => route.id !== canonical.id);
    const duplicateIds = duplicateRoutes.map((route) => route.id);
    const allIds = group.routes.map((route) => route.id);

    await patchWhere(
      supabaseUrl,
      headers,
      "scanned_routes",
      { id: `eq.${canonical.id}` },
      buildMergedRoutePayload(group.routes, canonical),
    );

    await reassignSimpleChildren(supabaseUrl, headers, "price_snapshots", duplicateIds, canonical.id);
    await reassignSimpleChildren(supabaseUrl, headers, "deal_candidates", duplicateIds, canonical.id);
    await reassignSimpleChildren(
      supabaseUrl,
      headers,
      "route_service_change_events",
      duplicateIds,
      canonical.id,
    );

    await mergePatternOverrides(supabaseUrl, headers, allIds, canonical.id);
    await mergeServiceMonths(supabaseUrl, headers, allIds, canonical.id);
    await mergeRouteSearchRules(supabaseUrl, headers, allIds, canonical.id);

    for (const duplicateId of duplicateIds) {
      await deleteWhere(supabaseUrl, headers, "scanned_routes", { id: `eq.${duplicateId}` });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: "execute",
        groupsProcessed: duplicateGroups.length,
        routesDeleted: duplicateGroups.reduce((sum, group) => sum + group.routes.length - 1, 0),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
