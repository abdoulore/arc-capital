import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const DATA_DIR = path.join(process.cwd(), "data");
const POSTGRES_URL =
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL_NON_POOLING;

export type AdminActivity = {
  id: string;
  timestamp: string;
  operator?: string;
  action: string;
  summary: string;
  hash?: string;
};

export type ProtocolSettings = {
  treasuryWallet: string;
  supportedNetworks: string[];
  defaultPenaltyBps: number;
  withdrawalWindowDays: number;
  marketplaceFeeBps: number;
  adminWallets: string[];
};

export type DealMetadata = {
  id: string;
  contractAddress?: string;
  title: string;
  subtitle?: string;
  description?: string;
  category?: string;
  riskLevel?: string;
  status?: "open" | "closed" | "archived";
  targetRaise?: string;
  totalRaised?: string;
  ownershipIssued?: string;
  distributions?: string;
  investorCount?: number;
  minInvestment?: string;
  fundingDeadline?: string;
  closeDate?: string;
  archivedAt?: string;
  revenueModel?: string;
  payoutSchedule?: string;
};

export type DashboardSnapshot = {
  id: string;
  wallet: string;
  timestamp: string;
  totalPortfolioValue: string;
  totalYield: string;
};

const defaultSettings: ProtocolSettings = {
  treasuryWallet: firstConfiguredWallet(),
  supportedNetworks: ["Arc Testnet"],
  defaultPenaltyBps: 200,
  withdrawalWindowDays: 7,
  marketplaceFeeBps: 0,
  adminWallets: configuredAdminWallets(),
};

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path.join(DATA_DIR, file), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson<T>(file: string, data: T) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

export async function getActivity() {
  const pool = await getPostgresPool();
  if (pool) {
    const result = await pool.query<{
      id: string;
      timestamp: Date;
      operator: string | null;
      action: string;
      summary: string;
      hash: string | null;
    }>(
      "select id, timestamp, operator, action, summary, hash from admin_activity order by timestamp desc limit 250",
    );
    return result.rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp.toISOString(),
      operator: row.operator ?? undefined,
      action: row.action,
      summary: row.summary,
      hash: row.hash ?? undefined,
    }));
  }

  return readJson<AdminActivity[]>("admin-activity.json", []);
}

export async function addActivity(input: Omit<AdminActivity, "id" | "timestamp">) {
  const entry = { ...input, id: crypto.randomUUID(), timestamp: new Date().toISOString() };
  const pool = await getPostgresPool();
  if (pool) {
    await pool.query(
      `insert into admin_activity (id, timestamp, operator, action, summary, hash)
       values ($1, $2, $3, $4, $5, $6)`,
      [entry.id, entry.timestamp, entry.operator ?? null, entry.action, entry.summary, entry.hash ?? null],
    );
    return entry;
  }

  const activity = await getActivity();
  await writeJson("admin-activity.json", [entry, ...activity].slice(0, 250));
  return entry;
}

export async function getSettings() {
  const pool = await getPostgresPool();
  if (pool) {
    const result = await pool.query<{ data: ProtocolSettings }>("select data from protocol_settings where id = $1", ["default"]);
    return result.rows[0]?.data ? { ...defaultSettings, ...result.rows[0].data } : defaultSettings;
  }

  return readJson<ProtocolSettings>("protocol-settings.json", defaultSettings);
}

export async function setSettings(settings: ProtocolSettings) {
  const pool = await getPostgresPool();
  if (pool) {
    await pool.query(
      `insert into protocol_settings (id, data, updated_at)
       values ($1, $2, now())
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      ["default", settings],
    );
    return settings;
  }

  await writeJson("protocol-settings.json", settings);
  return settings;
}

export async function getDeals() {
  const pool = await getPostgresPool();
  if (pool) {
    const result = await pool.query<{ data: DealMetadata }>("select data from deal_metadata order by updated_at desc");
    return result.rows.map((row) => row.data);
  }

  return readJson<DealMetadata[]>("deal-metadata.json", []);
}

export async function addDealMetadata(input: DealMetadata) {
  const entry = { ...input, id: input.id || crypto.randomUUID(), status: input.status ?? "open" };
  const pool = await getPostgresPool();
  if (pool) {
    await pool.query(
      `insert into deal_metadata (id, data, updated_at)
       values ($1, $2, now())
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      [entry.id, entry],
    );
    return entry;
  }

  const deals = await getDeals();
  await writeJson("deal-metadata.json", [entry, ...deals.filter((deal) => deal.id !== entry.id)]);
  return entry;
}

export async function updateDealMetadata(id: string, input: Partial<DealMetadata>) {
  const pool = await getPostgresPool();
  if (pool) {
    const existing = await pool.query<{ data: DealMetadata }>("select data from deal_metadata where id = $1", [id]);
    if (!existing.rows[0]) return undefined;
    const next = { ...existing.rows[0].data, ...input };
    await pool.query("update deal_metadata set data = $2, updated_at = now() where id = $1", [id, next]);
    return next;
  }

  const deals = await getDeals();
  const nextDeals = deals.map((deal) => (deal.id === id ? { ...deal, ...input } : deal));
  await writeJson("deal-metadata.json", nextDeals);
  return nextDeals.find((deal) => deal.id === id);
}

export async function getDashboardSnapshots(wallet: string) {
  const normalizedWallet = wallet.toLowerCase();
  const pool = await getPostgresPool();
  if (pool) {
    const result = await pool.query<{
      id: string;
      wallet: string;
      timestamp: Date;
      total_portfolio_value: string;
      total_yield: string;
    }>(
      `select id, wallet, timestamp, total_portfolio_value, total_yield
       from dashboard_snapshots
       where wallet = $1
       order by timestamp desc
       limit 30`,
      [normalizedWallet],
    );
    return result.rows
      .map((row) => ({
        id: row.id,
        wallet: row.wallet,
        timestamp: row.timestamp.toISOString(),
        totalPortfolioValue: row.total_portfolio_value,
        totalYield: row.total_yield,
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  const snapshots = await readJson<DashboardSnapshot[]>("dashboard-history.json", []);
  return snapshots
    .filter((snapshot) => snapshot.wallet.toLowerCase() === normalizedWallet)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-30);
}

export async function getLatestDashboardSnapshots(limit = 250) {
  const pool = await getPostgresPool();
  if (pool) {
    const result = await pool.query<{
      id: string;
      wallet: string;
      timestamp: Date;
      total_portfolio_value: string;
      total_yield: string;
    }>(
      `select distinct on (wallet)
         id, wallet, timestamp, total_portfolio_value, total_yield
       from dashboard_snapshots
       order by wallet, timestamp desc
       limit $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      wallet: row.wallet,
      timestamp: row.timestamp.toISOString(),
      totalPortfolioValue: row.total_portfolio_value,
      totalYield: row.total_yield,
    }));
  }

  const snapshots = await readJson<DashboardSnapshot[]>("dashboard-history.json", []);
  const byWallet = new Map<string, DashboardSnapshot>();
  for (const snapshot of snapshots) {
    const key = snapshot.wallet.toLowerCase();
    const existing = byWallet.get(key);
    if (!existing || new Date(snapshot.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
      byWallet.set(key, snapshot);
    }
  }
  return [...byWallet.values()]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

export async function addDashboardSnapshot(input: Omit<DashboardSnapshot, "id" | "timestamp" | "wallet"> & { wallet: string }) {
  const timestamp = new Date().toISOString();
  const normalizedWallet = input.wallet.toLowerCase();
  const pool = await getPostgresPool();
  if (pool) {
    const recent = await pool.query<{ id: string }>(
      `select id from dashboard_snapshots
       where wallet = $1 and timestamp >= now() - interval '60 seconds'
       order by timestamp desc
       limit 1`,
      [normalizedWallet],
    );
    const entry: DashboardSnapshot = {
      id: recent.rows[0]?.id ?? crypto.randomUUID(),
      wallet: normalizedWallet,
      timestamp,
      totalPortfolioValue: input.totalPortfolioValue,
      totalYield: input.totalYield,
    };
    await pool.query(
      `insert into dashboard_snapshots (id, wallet, timestamp, total_portfolio_value, total_yield)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do update set
         timestamp = excluded.timestamp,
         total_portfolio_value = excluded.total_portfolio_value,
         total_yield = excluded.total_yield`,
      [entry.id, entry.wallet, entry.timestamp, entry.totalPortfolioValue, entry.totalYield],
    );
    return entry;
  }

  const snapshots = await readJson<DashboardSnapshot[]>("dashboard-history.json", []);
  const existingIndex = snapshots.findIndex((snapshot) => {
    if (snapshot.wallet.toLowerCase() !== normalizedWallet) return false;
    const ageMs = Math.abs(new Date(timestamp).getTime() - new Date(snapshot.timestamp).getTime());
    return ageMs < 60_000;
  });
  const entry: DashboardSnapshot = {
    id: crypto.randomUUID(),
    wallet: normalizedWallet,
    timestamp,
    totalPortfolioValue: input.totalPortfolioValue,
    totalYield: input.totalYield,
  };

  const nextSnapshots = existingIndex >= 0
    ? snapshots.map((snapshot, index) => (index === existingIndex ? { ...entry, id: snapshot.id } : snapshot))
    : [entry, ...snapshots];

  await writeJson("dashboard-history.json", nextSnapshots.slice(0, 500));
  return entry;
}

async function getPostgresPool() {
  if (!POSTGRES_URL) return null;

  const globalWithPg = globalThis as typeof globalThis & {
    __arcPgPool?: Pool;
    __arcPgReady?: Promise<void>;
  };

  if (!globalWithPg.__arcPgPool) {
    globalWithPg.__arcPgPool = new Pool({
      connectionString: POSTGRES_URL,
      ssl: needsSsl(POSTGRES_URL) ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
  }

  if (!globalWithPg.__arcPgReady) {
    globalWithPg.__arcPgReady = ensurePostgresSchema(globalWithPg.__arcPgPool);
  }

  await globalWithPg.__arcPgReady;
  return globalWithPg.__arcPgPool;
}

async function ensurePostgresSchema(pool: Pool) {
  await pool.query(`
    create table if not exists admin_activity (
      id text primary key,
      timestamp timestamptz not null,
      operator text,
      action text not null,
      summary text not null,
      hash text
    );

    create table if not exists protocol_settings (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    );

    create table if not exists deal_metadata (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    );

    create table if not exists dashboard_snapshots (
      id text primary key,
      wallet text not null,
      timestamp timestamptz not null,
      total_portfolio_value text not null,
      total_yield text not null
    );

    create index if not exists dashboard_snapshots_wallet_timestamp_idx
      on dashboard_snapshots (wallet, timestamp desc);
  `);
}

function needsSsl(connectionString: string) {
  try {
    const host = new URL(connectionString).hostname;
    const loopbackHosts = new Set(["local" + "host", ["127", "0", "0", "1"].join(".")]);
    return !loopbackHosts.has(host);
  } catch {
    return true;
  }
}

function configuredAdminWallets() {
  return (process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? "")
    .split(",")
    .map((wallet) => wallet.trim().toLowerCase())
    .filter(Boolean);
}

function firstConfiguredWallet() {
  return configuredAdminWallets()[0] ?? "";
}
