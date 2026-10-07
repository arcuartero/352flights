import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { freshPublicFares, publicFaresAreCurrent } from "../lib/public-fare-validity";

const db = new PGlite();
const route = "00000000-0000-4000-8000-000000000001";
const migration = readFileSync(new URL("../supabase/migrations/20260911120000_public_fare_renewal.sql", import.meta.url), "utf8");
const bootstrap = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE TABLE public.scanned_routes(id uuid PRIMARY KEY, origin_airport text DEFAULT 'LUX',
    destination_airport text DEFAULT 'MAD', destination_city text DEFAULT 'Madrid',
    bucket text DEFAULT 'weekend_europe', is_active boolean DEFAULT true);
  ${readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8").match(/create table if not exists public.price_snapshots \([\s\S]*?\n\);/i)![0]}
  GRANT SELECT ON public.price_snapshots, public.scanned_routes TO service_role;
`;
const future = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
const inbound = new Date(Date.now() + 63 * 86400000).toISOString().slice(0, 10);
function metadata(overrides: Record<string, unknown> = {}) {
  return { public_fare_eligible: true, pattern_key: "fri-mon-3", airline_codes: ["LG"],
    primary_airline_code: "LG", skyscanner_url: "https://www.skyscanner.net/transport/flights/lux/mad/?adultsv2=1&cabinclass=economy",
    outbound_departure_at: `${future}T10:00`, outbound_arrival_at: `${future}T12:00`,
    return_departure_at: `${inbound}T10:00`, return_arrival_at: `${inbound}T12:00`,
    outbound_stop_count: 0, return_stop_count: 0, destination_stay_hours: 70, ...overrides };
}
async function insert(price: number, hours = 145, meta = metadata(), currency = "EUR") {
  return (await db.query<{ id: number }>(`INSERT INTO price_snapshots
    (route_id,scanned_at,departure_date,return_date,trip_nights,max_stops,price,currency,metadata)
    VALUES ($1,now() - $2 * interval '1 hour',$3,$4,3,'NON_STOP',$5,$6,$7) RETURNING id`,
  [route, hours, future, inbound, price, currency, JSON.stringify(meta)])).rows[0].id;
}
async function seed(history = 8) {
  for (let n = 0; n < history; n++) await insert(100, 160 + n / 100, metadata({
    public_fare_eligible: false, outbound_departure_at: `${future}T${String(n).padStart(2, "0")}:00`,
  }));
  return insert(80);
}
async function claim() {
  return (await db.query<{ job: any }>("SELECT claim_public_fare_renewal() AS job")).rows[0].job;
}
async function finish(job: any, price: number | null, meta?: any) {
  return (await db.query<{ result: any }>("SELECT finish_public_fare_renewal($1,$2,$3,$4,$5) AS result",
    [job.itinerary_key, job.lease_token, job.snapshot.id, price === null ? null : JSON.stringify({
      price, scanned_at: new Date().toISOString(), metadata: meta ?? job.snapshot.metadata,
    }), "provider_timeout"])).rows[0].result;
}
async function visible() { return (await db.query<{ id: number; price: string; scanned_at: Date }>("SELECT * FROM public_current_fare_snapshots")).rows; }

before(async () => { await db.exec(bootstrap); await db.exec(migration); });
beforeEach(async () => { await db.exec(`TRUNCATE public_fare_lifecycle,price_snapshots,scanned_routes RESTART IDENTITY CASCADE;
  INSERT INTO scanned_routes(id) VALUES ('${route}');`); });
after(async () => { await db.close(); });

for (const price of [80, 75, 88]) {
  test(`renewal accepts ${price} EUR, preserves history and replaces cached old price`, async () => {
    const old = await seed(); const job = await claim(); assert.equal(job.snapshot.id, old);
    const result = await finish(job, price); assert.equal(result.state, "renewed");
    const rows = await visible(); assert.equal(rows.length, 1); assert.equal(Number(rows[0].price), price);
    assert.notEqual(rows[0].id, old);
    assert.equal(publicFaresAreCurrent([{ id: `fare-${old}` }], rows.map(row => String(row.id))), false);
    const lifecycle = (await db.query<any>("SELECT * FROM public_fare_lifecycle WHERE status='active'")).rows[0];
    assert.equal(new Date(lifecycle.expires_at).getTime() - new Date(lifecycle.observed_at).getTime(), 7 * 86400000);
    assert.equal((await db.query("SELECT id FROM price_snapshots WHERE id=$1", [old])).rows.length, 1);
  });
}
test("88.01 exceeds the exact 12% threshold and cannot resurrect the old cheap observation", async () => {
  await seed(); const result = await finish(await claim(), 88.01);
  assert.equal(result.reason, "insufficient_discount"); assert.equal((await visible()).length, 0);
  await insert(95, 0); // Ordinary scanner still uses the initial selection flag.
  assert.equal((await visible()).length, 0);
  await insert(70, 0);
  assert.equal((await visible()).length, 1);
});
test("insufficient history retires an otherwise unchanged price", async () => {
  await seed(0); const result = await finish(await claim(), 80);
  assert.equal(result.reason, "insufficient_renewal_history"); assert.equal((await visible()).length, 0);
});
test("timeouts keep the original expiration, retry hourly and do not disappear early", async () => {
  await seed(); const job = await claim(); const result = await finish(job, null);
  assert.equal(result.state, "pending"); assert.equal((await visible()).length, 1);
  assert.equal(await claim(), null);
  const l = (await db.query<any>("SELECT * FROM public_fare_lifecycle WHERE status='active'")).rows[0];
  assert.equal(l.current_snapshot_id, job.snapshot.id);
  assert.ok(new Date(l.next_attempt_at).getTime() > Date.now() + 3500000);
  await db.exec("UPDATE public_fare_lifecycle SET expires_at=now() WHERE status='active'");
  assert.equal((await visible()).length, 0); assert.equal(await claim(), null);
});
test("two claim attempts cannot take the same lease; scanner update supersedes a pending result", async () => {
  await seed(); const jobs = await Promise.all([claim(), claim()]);
  assert.equal(jobs.filter(Boolean).length, 1);
  await insert(75, 0); const result = await finish(jobs.find(Boolean), 80);
  assert.equal(result.state, "superseded"); assert.equal(Number((await visible())[0].price), 75);
});
test("expired lease and changed identity never create renewal observations", async () => {
  await seed(); const job = await claim();
  await assert.rejects(() => finish(job, 70, metadata({ airline_codes: ["FR"] })), /Invalid renewal observation/);
  await db.exec("UPDATE public_fare_lifecycle SET lease_until=now()-interval '1 second'");
  assert.equal((await finish(job, 70)).state, "superseded");
});
test("old upload cannot overwrite a newer rejection and technical duplicates are not eight references", async () => {
  for (let n = 0; n < 8; n++) await insert(100, 160, metadata({public_fare_eligible: false,
    local_snapshot_id: "same", local_scanned_at: "2026-09-01T10:00:00Z", local_route_id: "LUX:MAD:NON_STOP"}));
  await insert(80); assert.equal((await finish(await claim(), 80)).reason, "insufficient_renewal_history");
  await insert(60, 150); assert.equal((await visible()).length, 0);
});
test("initial selection remains permissive and renewal is not scheduled before day six", async () => {
  await insert(105, 120); assert.equal((await visible()).length, 1); assert.equal(await claim(), null);
});
test("history of another currency cannot justify a renewal", async () => {
  for (let n=0;n<8;n++) await insert(100,160+n/100,metadata({public_fare_eligible:false}),"USD");
  await insert(80); assert.equal((await finish(await claim(),80)).reason,"insufficient_renewal_history");
});
test("renewal uses other months of the same pattern when its month has fewer than eight observations", async () => {
  await seed();
  await db.exec(`UPDATE price_snapshots SET departure_date=departure_date+interval '1 month'
    WHERE metadata->>'public_fare_eligible'='false'`);
  const result=await finish(await claim(),88);
  assert.equal(result.state,"renewed");
});
test("eight monthly observations take precedence over a more expensive all-month history", async () => {
  for (let n=0;n<10;n++) {
    const id=await insert(200,160+n/100,metadata({public_fare_eligible:false,
      outbound_departure_at:`${future}T20:${String(n).padStart(2,"0")}`}));
    await db.query("UPDATE price_snapshots SET departure_date=departure_date+interval '1 month' WHERE id=$1",[id]);
  }
  await seed();
  assert.equal((await finish(await claim(),90)).reason,"insufficient_discount");
});
test("cache acknowledgment cannot clear a newer change", async () => {
  await seed(); const l = (await db.query<any>("SELECT * FROM public_fare_lifecycle WHERE status='active'")).rows[0];
  await finish(await claim(), 75);
  await db.query("SELECT ack_public_fare_cache($1,$2)", [l.itinerary_key,l.updated_at]);
  assert.equal((await db.query<any>("SELECT cache_dirty FROM public_fare_lifecycle WHERE status='active'")).rows[0].cache_dirty,true);
});
test("cached and fallback fares expire exactly at seven days", () => {
  const now = new Date("2026-09-11T10:00:00Z");
  const deals = [{ verifiedAt: "2026-09-04T10:00:00Z", departureDate: future },
    { verifiedAt: "2026-09-04T10:00:01Z", departureDate: future }];
  assert.deepEqual(freshPublicFares(deals, now), [deals[1]]);
});

test("provider fixture → actual scanner → atomic renewal → public view", async () => {
  const old = await seed(); const job = await claim();
  const fixture = spawnSync("uv", ["run", "--project", "scanner", "python",
    "scanner/tests/test_public_fare_renewal.py", "--fixture"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), input: JSON.stringify(job), encoding: "utf8",
  });
  assert.equal(fixture.status, 0, fixture.stderr);
  const { observation, reason } = JSON.parse(fixture.stdout);
  assert.equal(reason, "checked");
  const result = (await db.query<any>("SELECT finish_public_fare_renewal($1,$2,$3,$4,$5) AS result",
    [job.itinerary_key, job.lease_token, old, observation, reason])).rows[0].result;
  assert.equal(result.state, "renewed");
  const rows = await visible(); assert.equal(rows.length, 1); assert.equal(Number(rows[0].price), 88);
  assert.equal(publicFaresAreCurrent([{id:`fare-${old}`}],rows.map(row=>String(row.id))),false);
});

test("service role can read active data but anonymous users cannot read renewal state or call its RPC", async () => {
  await seed();
  await db.exec("SET ROLE service_role");
  assert.equal((await visible()).length, 1);
  const job = await claim(); assert.ok(job);
  await db.exec("RESET ROLE; SET ROLE anon");
  await assert.rejects(() => db.query("SELECT * FROM public_fare_lifecycle"), /permission denied/);
  await assert.rejects(() => claim(), /permission denied/);
  await db.exec("RESET ROLE");
});

test("migration initializes the latest observation without reviving already expired prices", async () => {
  const initial = new PGlite();
  try {
    await initial.exec(bootstrap);
    await initial.exec(`INSERT INTO scanned_routes(id) VALUES ('${route}')`);
    for (const [hours,price] of [[150,80],[145,90],[169,60]]) {
      await initial.query(`INSERT INTO price_snapshots(route_id,scanned_at,departure_date,return_date,
        trip_nights,max_stops,price,metadata) VALUES ($1,now()-$2*interval '1 hour',$3,$4,3,'NON_STOP',$5,$6)`,
        [route,hours,future,inbound,price,metadata(hours===169 ? {airline_codes:["FR"]} : {})]);
    }
    await initial.exec(migration);
    const rows = (await initial.query<any>("SELECT * FROM public_current_fare_snapshots")).rows;
    assert.equal(rows.length,1); assert.equal(Number(rows[0].price),90);
    const l = (await initial.query<any>("SELECT * FROM public_fare_lifecycle")).rows[0];
    assert.equal(new Date(l.expires_at).getTime()-new Date(l.observed_at).getTime(),7*86400000);
    assert.ok(new Date(l.observed_at).getTime()<Date.now()-144*3600000);
  } finally { await initial.close(); }
});
