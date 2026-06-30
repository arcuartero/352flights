#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env");

const REQUIRED_METADATA_KEYS = [
  "outbound_departure_at",
  "outbound_arrival_at",
  "return_departure_at",
  "return_arrival_at",
  "destination_stay_hours",
];

const PAGE_SIZE = 500;
const DELETE_BATCH_SIZE = 100;

function parseDotEnv(filePath) {
  const contents = readFileSync(filePath, "utf8");
  const values = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

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

function isLegacySnapshot(row) {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : {};

  if (!row.departure_date || !row.return_date) {
    return true;
  }

  return REQUIRED_METADATA_KEYS.some((key) => {
    const value = metadata[key];
    return value === null || value === undefined || value === "";
  });
}

async function fetchSnapshots(baseUrl, headers, offset) {
  const url = new URL("/rest/v1/price_snapshots", baseUrl);
  url.searchParams.set("select", "id,departure_date,return_date,metadata");
  url.searchParams.set("order", "id.asc");
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));

  const response = await fetch(url, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch snapshots: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function deleteSnapshotBatch(baseUrl, headers, ids) {
  const url = new URL("/rest/v1/price_snapshots", baseUrl);
  url.searchParams.set("id", `in.(${ids.join(",")})`);

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      ...headers,
      Prefer: "return=representation",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete snapshots: ${response.status} ${await response.text()}`);
  }

  const deletedRows = await response.json();
  return deletedRows.length;
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

  let offset = 0;
  const legacyIds = [];
  let totalScanned = 0;

  while (true) {
    const rows = await fetchSnapshots(supabaseUrl, headers, offset);
    if (rows.length === 0) {
      break;
    }

    totalScanned += rows.length;

    for (const row of rows) {
      if (isLegacySnapshot(row)) {
        legacyIds.push(Number(row.id));
      }
    }

    offset += rows.length;
    if (rows.length < PAGE_SIZE) {
      break;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: execute ? "execute" : "dry-run",
        totalScanned,
        legacySnapshotsFound: legacyIds.length,
        sampleIds: legacyIds.slice(0, 20),
      },
      null,
      2,
    ),
  );

  if (!execute || legacyIds.length === 0) {
    return;
  }

  let deleted = 0;

  for (let index = 0; index < legacyIds.length; index += DELETE_BATCH_SIZE) {
    const batch = legacyIds.slice(index, index + DELETE_BATCH_SIZE);
    deleted += await deleteSnapshotBatch(supabaseUrl, headers, batch);
  }

  console.log(
    JSON.stringify(
      {
        mode: "execute",
        totalDeleted: deleted,
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
