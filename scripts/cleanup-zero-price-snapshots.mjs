#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env");

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

async function fetchZeroPriceSnapshots(baseUrl, headers, offset) {
  const url = new URL("/rest/v1/price_snapshots", baseUrl);
  url.searchParams.set(
    "select",
    "id,route_id,price,departure_date,return_date,scanned_at",
  );
  url.searchParams.set("price", "lte.0");
  url.searchParams.set("order", "id.asc");
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch zero-price snapshots: ${response.status} ${await response.text()}`,
    );
  }

  return response.json();
}

async function fetchDealsForSnapshots(baseUrl, headers, snapshotIds) {
  if (snapshotIds.length === 0) {
    return [];
  }

  const url = new URL("/rest/v1/deal_candidates", baseUrl);
  url.searchParams.set("select", "id,snapshot_id,route_id,deal_price,status");
  url.searchParams.set("snapshot_id", `in.(${snapshotIds.join(",")})`);
  url.searchParams.set("order", "id.asc");

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch linked deals: ${response.status} ${await response.text()}`,
    );
  }

  return response.json();
}

async function deleteDealBatch(baseUrl, headers, snapshotIds) {
  if (snapshotIds.length === 0) {
    return 0;
  }

  const url = new URL("/rest/v1/deal_candidates", baseUrl);
  url.searchParams.set("snapshot_id", `in.(${snapshotIds.join(",")})`);

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      ...headers,
      Prefer: "return=representation",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete linked deals: ${response.status} ${await response.text()}`);
  }

  const deletedRows = await response.json();
  return deletedRows.length;
}

async function deleteSnapshotBatch(baseUrl, headers, ids) {
  if (ids.length === 0) {
    return 0;
  }

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
  const snapshots = [];

  while (true) {
    const rows = await fetchZeroPriceSnapshots(supabaseUrl, headers, offset);
    if (rows.length === 0) {
      break;
    }

    snapshots.push(...rows);
    offset += rows.length;

    if (rows.length < PAGE_SIZE) {
      break;
    }
  }

  const snapshotIds = snapshots.map((row) => Number(row.id));
  const linkedDeals = await fetchDealsForSnapshots(supabaseUrl, headers, snapshotIds);

  console.log(
    JSON.stringify(
      {
        mode: execute ? "execute" : "dry-run",
        zeroPriceSnapshotsFound: snapshotIds.length,
        linkedDealsFound: linkedDeals.length,
        sampleSnapshots: snapshots.slice(0, 10),
        sampleDeals: linkedDeals.slice(0, 10),
      },
      null,
      2,
    ),
  );

  if (!execute || snapshotIds.length === 0) {
    return;
  }

  let deletedDeals = 0;
  let deletedSnapshots = 0;

  for (let index = 0; index < snapshotIds.length; index += DELETE_BATCH_SIZE) {
    const batch = snapshotIds.slice(index, index + DELETE_BATCH_SIZE);
    deletedDeals += await deleteDealBatch(supabaseUrl, headers, batch);
    deletedSnapshots += await deleteSnapshotBatch(supabaseUrl, headers, batch);
  }

  console.log(
    JSON.stringify(
      {
        mode: "execute",
        deletedDeals,
        deletedSnapshots,
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
