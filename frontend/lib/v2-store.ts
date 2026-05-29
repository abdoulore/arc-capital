import { Pool, type QueryResultRow } from "pg";
import { ARC_TESTNET_CHAIN_ID } from "./arc";

const POSTGRES_URL =
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL_NON_POOLING;

export type V2DataStatus = "live" | "pending";

export type V2WalletQuery = {
  wallet?: string | null;
};

export type V2ActivityRow = {
  id: string;
  action: string;
  valueUsdc?: string;
  shares?: string;
  txHash?: string;
  timestamp?: string;
  source: "indexed" | "pending";
};

export type V2IndexedEventInput = {
  chainId?: number;
  contractAddress: string;
  eventName: string;
  txHash: string;
  logIndex: number;
  blockNumber: string | number | bigint;
  blockTimestamp?: string;
  actorWallet?: string;
  payload?: Record<string, unknown>;
};

export async function getV2BackendStatus() {
  const pool = await getV2Pool();
  return {
    database: pool ? "connected" : "pending",
    source: pool ? "PostgreSQL indexed data" : "Pending Integration",
  };
}

export async function getV2IndexerDebug() {
  const pool = await getV2Pool();
  if (!pool) {
    return {
      status: "pending" as V2DataStatus,
      message: "PostgreSQL is not connected.",
      recentEvents: [],
      monthlyActivity: [],
      counts: null,
    };
  }

  const [counts, recentEvents, monthlyActivity] = await Promise.all([
    one<{
      contract_events: string;
      monthly_activity: string;
      monthly_positions: string;
    }>(
      pool,
      `select
         (select count(*) from v2_contract_events)::text as contract_events,
         (select count(*) from v2_monthly_vault_activity)::text as monthly_activity,
         (select count(*) from v2_monthly_vault_positions)::text as monthly_positions`,
    ),
    many<{
      event_name: string;
      contract_address: string;
      tx_hash: string;
      log_index: number;
      block_number: string;
      actor_wallet: string | null;
      indexed_at: Date;
    }>(
      pool,
      `select event_name, contract_address, tx_hash, log_index, block_number::text, actor_wallet, indexed_at
       from v2_contract_events
       order by indexed_at desc
       limit 20`,
    ),
    many<{
      activity_type: string;
      wallet: string;
      amount_usdc: string;
      shares: string;
      tx_hash: string;
      occurred_at: Date;
    }>(
      pool,
      `select activity_type, wallet, amount_usdc, shares, tx_hash, occurred_at
       from v2_monthly_vault_activity
       order by occurred_at desc
       limit 20`,
    ),
  ]);

  return {
    status: "live" as V2DataStatus,
    counts: {
      contractEvents: Number(counts?.contract_events ?? 0),
      monthlyActivity: Number(counts?.monthly_activity ?? 0),
      monthlyPositions: Number(counts?.monthly_positions ?? 0),
    },
    recentEvents: recentEvents.map((event) => ({
      eventName: event.event_name,
      contractAddress: event.contract_address,
      txHash: event.tx_hash,
      logIndex: event.log_index,
      blockNumber: event.block_number,
      actorWallet: event.actor_wallet,
      indexedAt: event.indexed_at.toISOString(),
    })),
    monthlyActivity: monthlyActivity.map((activity) => ({
      type: activity.activity_type,
      wallet: activity.wallet,
      amountUsdc: activity.amount_usdc,
      shares: activity.shares,
      txHash: activity.tx_hash,
      occurredAt: activity.occurred_at.toISOString(),
    })),
  };
}

export async function repairV2MonthlyShareDecimals() {
  const pool = await getV2Pool();
  if (!pool) return { status: "pending" as V2DataStatus, updatedActivity: 0, updatedPositions: 0 };

  const [activity, positions] = await Promise.all([
    pool.query(
      `update v2_monthly_vault_activity
       set shares = shares / 1000000
       where amount_usdc > 0 and shares / amount_usdc > 1000`,
    ),
    pool.query(
      `update v2_monthly_vault_positions
       set shares = shares / 1000000
       where current_value_usdc > 0 and shares / current_value_usdc > 1000`,
    ),
  ]);

  return {
    status: "live" as V2DataStatus,
    updatedActivity: activity.rowCount ?? 0,
    updatedPositions: positions.rowCount ?? 0,
  };
}

export async function reprojectV2StoredEvents(limit = 500) {
  const pool = await getV2Pool();
  if (!pool) return { status: "pending" as V2DataStatus, projected: 0 };
  const rows = await many<{
    chain_id: number;
    contract_address: string;
    event_name: string;
    tx_hash: string;
    log_index: number;
    block_number: string;
    block_timestamp: Date | null;
    actor_wallet: string | null;
    payload: Record<string, unknown>;
  }>(
    pool,
    `select chain_id, contract_address, event_name, tx_hash, log_index, block_number::text,
            block_timestamp, actor_wallet, payload
     from v2_contract_events
     order by indexed_at asc
     limit $1`,
    [limit],
  );

  for (const row of rows) {
    await projectV2Event(pool, {
      chainId: row.chain_id,
      contractAddress: row.contract_address,
      eventName: row.event_name,
      txHash: row.tx_hash,
      logIndex: row.log_index,
      blockNumber: row.block_number,
      blockTimestamp: row.block_timestamp?.toISOString(),
      actorWallet: row.actor_wallet ?? undefined,
      payload: row.payload,
    });
  }

  return { status: "live" as V2DataStatus, projected: rows.length };
}

export async function getV2IndexerCursor(name: string, fallbackBlock: bigint) {
  const pool = await getV2Pool();
  if (!pool) return fallbackBlock;
  const cursor = await one<{ last_block: string }>(
    pool,
    `select last_block::text
     from v2_indexer_cursors
     where name = $1`,
    [name],
  );
  return cursor ? BigInt(cursor.last_block) : fallbackBlock;
}

export async function updateV2IndexerCursor(name: string, lastBlock: bigint) {
  const pool = await getV2Pool();
  if (!pool) return { status: "pending" as V2DataStatus };
  await pool.query(
    `insert into v2_indexer_cursors (name, last_block, updated_at)
     values ($1, $2, now())
     on conflict (name) do update set
       last_block = greatest(v2_indexer_cursors.last_block, excluded.last_block),
       updated_at = now()`,
    [name, lastBlock.toString()],
  );
  return { status: "live" as V2DataStatus };
}

export async function getV2PollDealVaultAddresses() {
  const pool = await getV2Pool();
  if (!pool) return [];
  const rows = await many<{ deal_vault_address: string }>(
    pool,
    `select distinct lower(deal_vault_address) as deal_vault_address
     from v2_deals
     where deal_vault_address is not null`,
  );
  return rows.map((row) => row.deal_vault_address);
}

export async function ingestV2Events(events: V2IndexedEventInput[]) {
  const pool = await getV2Pool();
  if (!pool) {
    return {
      status: "pending" as V2DataStatus,
      accepted: 0,
      inserted: 0,
      skipped: events.length,
      message: "Pending Integration",
    };
  }

  let inserted = 0;
  for (const event of events) {
    const result = await pool.query<{ id: string }>(
      `insert into v2_contract_events (
         id, chain_id, contract_address, event_name, tx_hash, log_index,
         block_number, block_timestamp, actor_wallet, payload
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (chain_id, tx_hash, log_index) do nothing
       returning id`,
      [
        crypto.randomUUID(),
        event.chainId ?? ARC_TESTNET_CHAIN_ID,
        event.contractAddress.toLowerCase(),
        event.eventName,
        event.txHash,
        event.logIndex,
        event.blockNumber.toString(),
        event.blockTimestamp ? new Date(event.blockTimestamp).toISOString() : null,
        event.actorWallet?.toLowerCase() ?? null,
        event.payload ?? {},
      ],
    );

    if (result.rowCount) inserted += 1;
    await projectV2Event(pool, event);
  }

  return {
    status: "live" as V2DataStatus,
    accepted: events.length,
    inserted,
    skipped: events.length - inserted,
  };
}

export async function getV2Dashboard(wallet?: string | null) {
  const pool = await getV2Pool();
  if (!pool || !wallet) return emptyDashboard(pool ? "live" : "pending");
  const normalized = normalizeWallet(wallet);
  const [snapshot, activity] = await Promise.all([
    one<{
      total_value_usdc: string;
      wallet_cash_usdc: string;
      monthly_vault_usdc: string;
      fixed_income_usdc: string;
      deal_holdings_usdc: string;
      claimable_yield_usdc: string;
      snapshot_at: Date;
    }>(
      pool,
      `select total_value_usdc, wallet_cash_usdc, monthly_vault_usdc, fixed_income_usdc,
              deal_holdings_usdc, claimable_yield_usdc, snapshot_at
       from v2_portfolio_snapshots
       where wallet = $1
       order by snapshot_at desc
       limit 1`,
      [normalized],
    ),
    getV2Activity({ wallet: normalized, limit: 5 }),
  ]);

  if (!snapshot) return emptyDashboard("live");

  return {
    status: "live" as V2DataStatus,
    totalPortfolioValue: snapshot.total_value_usdc,
    availableIncome: snapshot.claimable_yield_usdc,
    walletCash: snapshot.wallet_cash_usdc,
    allocation: [
      { label: "Wallet USDC", valueUsdc: snapshot.wallet_cash_usdc },
      { label: "Monthly Vault", valueUsdc: snapshot.monthly_vault_usdc },
      { label: "Fixed Income", valueUsdc: snapshot.fixed_income_usdc },
      { label: "Deal Holdings", valueUsdc: snapshot.deal_holdings_usdc },
    ].filter((item) => Number(item.valueUsdc) > 0),
    lastUpdated: snapshot.snapshot_at.toISOString(),
    activity,
  };
}

export async function getV2Portfolio(wallet?: string | null) {
  const pool = await getV2Pool();
  if (!pool || !wallet) return emptyPortfolio(pool ? "live" : "pending");
  const normalized = normalizeWallet(wallet);
  const [monthly, fixedPositions, dealHoldings, activity] = await Promise.all([
    one<{ shares: string; current_value_usdc: string; claimable_yield_usdc: string; updated_at: Date }>(
      pool,
      `select shares, current_value_usdc, claimable_yield_usdc, updated_at
       from v2_monthly_vault_positions
       where wallet = $1`,
      [normalized],
    ),
    many<{
      id: string;
      onchain_position_id: string | null;
      principal_usdc: string;
      apy_bps: number;
      duration_seconds: number;
      maturity_at: Date;
      claimable_yield_usdc: string;
      redeemed_at: Date | null;
    }>(
      pool,
      `select id, onchain_position_id, principal_usdc, apy_bps, duration_seconds, maturity_at, claimable_yield_usdc, redeemed_at
       from v2_fixed_income_positions
       where wallet = $1
       order by maturity_at asc`,
      [normalized],
    ),
    many<{
      deal_id: string;
      deal_vault_address: string | null;
      title: string;
      shares: string;
      value_usdc: string;
      claimable_yield_usdc: string;
    }>(
      pool,
      `select d.id as deal_id, d.deal_vault_address, d.title, sum(i.shares)::text as shares,
              sum(i.amount_usdc)::text as value_usdc, '0'::text as claimable_yield_usdc
       from v2_deal_investments i
       join v2_deals d on d.id = i.deal_id
       where i.investor_wallet = $1
       group by d.id, d.deal_vault_address, d.title
       order by d.title asc`,
      [normalized],
    ),
    getV2Activity({ wallet: normalized, limit: 25 }),
  ]);

  return {
    status: "live" as V2DataStatus,
    monthlyVault: monthly
      ? {
          shares: monthly.shares,
          currentValueUsdc: monthly.current_value_usdc,
          claimableYieldUsdc: monthly.claimable_yield_usdc,
          updatedAt: monthly.updated_at.toISOString(),
        }
      : null,
    fixedIncomePositions: fixedPositions.map((position) => ({
      id: position.id,
      onchainPositionId: position.onchain_position_id,
      principalUsdc: position.principal_usdc,
      apyBps: position.apy_bps,
      durationSeconds: position.duration_seconds,
      maturityAt: position.maturity_at.toISOString(),
      claimableYieldUsdc: position.claimable_yield_usdc,
      status: position.redeemed_at ? "redeemed" : "active",
    })),
    dealHoldings: dealHoldings.map((holding) => ({
      dealId: holding.deal_id,
      dealVaultAddress: holding.deal_vault_address,
      title: holding.title,
      shares: holding.shares,
      currentValueUsdc: holding.value_usdc,
      claimableYieldUsdc: holding.claimable_yield_usdc,
    })),
    activity,
  };
}

export async function getV2MonthlyVault() {
  const pool = await getV2Pool();
  if (!pool) return { status: "pending" as V2DataStatus, summary: null, activity: [] };
  const [summary, activity] = await Promise.all([
    one<{
      investor_capital_usdc: string;
      routed_yield_usdc: string;
      nav_usdc: string;
      liquidity_usdc: string;
      withdrawal_window_status: string;
      updated_at: Date;
    }>(
      pool,
      `select
         coalesce(sum(current_value_usdc), 0)::text as investor_capital_usdc,
         '0'::text as routed_yield_usdc,
         coalesce(sum(current_value_usdc), 0)::text as nav_usdc,
         coalesce(sum(current_value_usdc), 0)::text as liquidity_usdc,
         'pending'::text as withdrawal_window_status,
         now() as updated_at
       from v2_monthly_vault_positions`,
    ),
    getV2Activity({ limit: 10, source: "monthly" }),
  ]);
  return { status: "live" as V2DataStatus, summary, activity };
}

export async function getV2FixedIncome(wallet?: string | null) {
  const pool = await getV2Pool();
  if (!pool) return { status: "pending" as V2DataStatus, positions: [], obligations: null };
  const params = wallet ? [normalizeWallet(wallet)] : [];
  const where = wallet ? "where wallet = $1" : "";
  const [positions, obligations] = await Promise.all([
    many<{
      id: string;
      wallet: string;
      principal_usdc: string;
      apy_bps: number;
      maturity_at: Date;
      claimable_yield_usdc: string;
      redeemed_at: Date | null;
    }>(
      pool,
      `select id, wallet, principal_usdc, apy_bps, maturity_at, claimable_yield_usdc, redeemed_at
       from v2_fixed_income_positions
       ${where}
       order by maturity_at asc
       limit 100`,
      params,
    ),
    one<{ principal_usdc: string; claimable_yield_usdc: string; active_positions: string }>(
      pool,
      `select coalesce(sum(principal_usdc), 0)::text as principal_usdc,
              coalesce(sum(claimable_yield_usdc), 0)::text as claimable_yield_usdc,
              count(*)::text as active_positions
       from v2_fixed_income_positions
       where redeemed_at is null`,
    ),
  ]);
  return { status: "live" as V2DataStatus, positions, obligations };
}

export async function getV2AdminLongTerm() {
  const pool = await getV2Pool();
  if (!pool) {
    return {
      status: "pending" as V2DataStatus,
      activePositions: 0,
      lockedCapital: "0",
      claimableYield: "0",
      upcomingUnlockCount: 0,
      pools: [],
      upcomingUnlocks: [],
    };
  }

  const [summary, pools, upcomingUnlocks] = await Promise.all([
    one<{ active_positions: string; locked_capital: string; claimable_yield: string; upcoming_unlock_count: string }>(
      pool,
      `select
         count(*) filter (where redeemed_at is null)::text as active_positions,
         coalesce(sum(principal_usdc) filter (where redeemed_at is null), 0)::text as locked_capital,
         coalesce(sum(claimable_yield_usdc) filter (where redeemed_at is null), 0)::text as claimable_yield,
         count(*) filter (where redeemed_at is null and maturity_at <= now() + interval '90 days')::text as upcoming_unlock_count
       from v2_fixed_income_positions`,
    ),
    many<{ duration_seconds: number; principal: string; claimable_yield: string; positions: string }>(
      pool,
      `select duration_seconds,
              coalesce(sum(principal_usdc) filter (where redeemed_at is null), 0)::text as principal,
              coalesce(sum(claimable_yield_usdc) filter (where redeemed_at is null), 0)::text as claimable_yield,
              count(*) filter (where redeemed_at is null)::text as positions
       from v2_fixed_income_positions
       group by duration_seconds
       order by duration_seconds asc`,
    ),
    many<{ onchain_position_id: string | null; wallet: string; principal_usdc: string; maturity_at: Date; apy_bps: number }>(
      pool,
      `select onchain_position_id, wallet, principal_usdc, maturity_at, apy_bps
       from v2_fixed_income_positions
       where redeemed_at is null
       order by maturity_at asc
       limit 25`,
    ),
  ]);

  return {
    status: "live" as V2DataStatus,
    activePositions: Number(summary?.active_positions ?? 0),
    lockedCapital: summary?.locked_capital ?? "0",
    claimableYield: summary?.claimable_yield ?? "0",
    upcomingUnlockCount: Number(summary?.upcoming_unlock_count ?? 0),
    pools: pools.map((pool) => ({
      label: durationLabel(pool.duration_seconds),
      duration: String(pool.duration_seconds),
      principal: pool.principal,
      claimableYield: pool.claimable_yield,
      positions: Number(pool.positions),
    })),
    upcomingUnlocks: upcomingUnlocks.map((unlock) => ({
      id: unlock.onchain_position_id ?? "",
      owner: unlock.wallet,
      principal: unlock.principal_usdc,
      maturity: unlock.maturity_at.toISOString(),
      apyBps: String(unlock.apy_bps),
    })),
  };
}

export async function getV2Deals() {
  const pool = await getV2Pool();
  if (!pool) return { status: "pending" as V2DataStatus, openDeals: [], closedDeals: [] };
  const rows = await many<{
    id: string;
    deal_vault_address: string | null;
    title: string;
    subtitle: string | null;
    risk_level: string | null;
    status: string;
    target_raise_usdc: string | null;
    total_raised_usdc: string;
    investor_count: number;
    funding_deadline: Date | null;
    closed_at: Date | null;
  }>(
    pool,
    `select id, deal_vault_address, title, subtitle, risk_level, status,
            target_raise_usdc, total_raised_usdc, investor_count, funding_deadline, closed_at
     from v2_deals
     order by created_at desc`,
  );
  const deals = rows.map((deal) => ({
    id: deal.id,
    contractAddress: deal.deal_vault_address,
    title: deal.title,
    subtitle: deal.subtitle,
    riskLevel: deal.risk_level,
    status: deriveDealStatus(deal.status, deal.funding_deadline),
    targetRaiseUsdc: deal.target_raise_usdc,
    totalRaisedUsdc: deal.total_raised_usdc,
    investorCount: deal.investor_count,
    fundingDeadline: deal.funding_deadline?.toISOString(),
    closedAt: deal.closed_at?.toISOString(),
  }));
  return {
    status: "live" as V2DataStatus,
    openDeals: deals.filter((deal) => deal.status === "open"),
    closedDeals: deals.filter((deal) => deal.status !== "open"),
  };
}

export async function upsertV2DealMetadata(input: {
  id?: string;
  dealVaultAddress?: string | null;
  title: string;
  subtitle?: string;
  description?: string;
  category?: string;
  riskLevel?: string;
  targetRaiseUsdc?: string;
  minInvestmentUsdc?: string;
  fundingDeadline?: string;
  revenueDistributionModel?: string;
  expectedPayoutSchedule?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}) {
  const pool = await getV2Pool();
  if (!pool) return { status: "pending" as V2DataStatus, deal: null };
  const id = input.id && isUuid(input.id) ? input.id : crypto.randomUUID();
  const dealVaultAddress = input.dealVaultAddress?.toLowerCase() ?? null;
  const result = await pool.query(
    `insert into v2_deals (
       id, deal_vault_address, title, subtitle, description, category, risk_level,
       status, target_raise_usdc, min_investment_usdc, funding_deadline,
       revenue_distribution_model, expected_payout_schedule, metadata
     )
     values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, 'open'), $9, $10, $11, $12, $13, $14)
     on conflict (deal_vault_address) do update set
       title = excluded.title,
       subtitle = excluded.subtitle,
       description = excluded.description,
       category = excluded.category,
       risk_level = excluded.risk_level,
       status = excluded.status,
       target_raise_usdc = excluded.target_raise_usdc,
       min_investment_usdc = excluded.min_investment_usdc,
       funding_deadline = excluded.funding_deadline,
       revenue_distribution_model = excluded.revenue_distribution_model,
       expected_payout_schedule = excluded.expected_payout_schedule,
       metadata = v2_deals.metadata || excluded.metadata,
       updated_at = now()
     returning id`,
    [
      id,
      dealVaultAddress,
      input.title,
      input.subtitle ?? null,
      input.description ?? null,
      input.category ?? null,
      input.riskLevel ?? null,
      input.status ?? "open",
      input.targetRaiseUsdc ?? null,
      input.minInvestmentUsdc ?? null,
      input.fundingDeadline ? new Date(input.fundingDeadline).toISOString() : null,
      input.revenueDistributionModel ?? null,
      input.expectedPayoutSchedule ?? null,
      input.metadata ?? {},
    ],
  );
  return { status: "live" as V2DataStatus, deal: result.rows[0] };
}

export async function updateV2DealStatus(input: { id?: string; dealVaultAddress?: string | null; status: string; closedAt?: string | null }) {
  const pool = await getV2Pool();
  if (!pool) return { status: "pending" as V2DataStatus, updated: false };
  const values: unknown[] = [input.status, input.closedAt ? new Date(input.closedAt).toISOString() : null];
  const where = input.id ? "id = $3" : "lower(deal_vault_address) = lower($3)";
  values.push(input.id ?? input.dealVaultAddress ?? "");
  const result = await pool.query(
    `update v2_deals
     set status = $1,
         closed_at = coalesce($2, closed_at),
         updated_at = now()
     where ${where}`,
    values,
  );
  return { status: "live" as V2DataStatus, updated: (result.rowCount ?? 0) > 0 };
}

export async function logV2AdminActivity(input: { operatorWallet?: string | null; action: string; summary: string; txHash?: string | null }) {
  const pool = await getV2Pool();
  if (!pool) return { status: "pending" as V2DataStatus, logged: false };
  await pool.query(
    `insert into v2_admin_activity (id, operator_wallet, action, summary, tx_hash)
     values ($1, $2, $3, $4, $5)`,
    [crypto.randomUUID(), input.operatorWallet?.toLowerCase() ?? null, input.action, input.summary, input.txHash ?? null],
  );
  return { status: "live" as V2DataStatus, logged: true };
}

export async function getV2Marketplace(wallet?: string | null) {
  const pool = await getV2Pool();
  if (!pool) return { status: "pending" as V2DataStatus, listings: [], userOrders: [], trades: [] };
  const normalized = wallet ? normalizeWallet(wallet) : undefined;
  const [listings, userOrders, trades] = await Promise.all([
    manyMarketplaceListings(pool, "where l.status = 'active' and l.shares_remaining > 0", []),
    normalized ? manyMarketplaceListings(pool, "where l.seller_wallet = $1 and l.status = 'active'", [normalized]) : Promise.resolve([]),
    many<{
      id: string;
      buyer_wallet: string;
      seller_wallet: string;
      shares: string;
      total_price_usdc: string;
      tx_hash: string;
      traded_at: Date;
    }>(
      pool,
      `select id, buyer_wallet, seller_wallet, shares, total_price_usdc, tx_hash, traded_at
       from v2_marketplace_trades
       order by traded_at desc
       limit 50`,
    ),
  ]);
  return { status: "live" as V2DataStatus, listings, userOrders, trades };
}

export async function getV2AdminOverview() {
  const pool = await getV2Pool();
  if (!pool) return { status: "pending" as V2DataStatus, metrics: null, activity: [] };
  const [metrics, activity] = await Promise.all([
    one<{
      total_value_usdc: string;
      investor_count: string;
      active_deals: string;
      open_listings: string;
      marketplace_volume_usdc: string;
    }>(
      pool,
      `select
        coalesce((select sum(total_value_usdc) from (
          select distinct on (wallet) wallet, total_value_usdc
          from v2_portfolio_snapshots
          order by wallet, snapshot_at desc
        ) latest), 0)::text as total_value_usdc,
        (select count(*)::text from v2_users) as investor_count,
        (select count(*)::text from v2_deals where status = 'open' and (funding_deadline is null or funding_deadline > now())) as active_deals,
        (select count(*)::text from v2_marketplace_listings where status = 'active' and shares_remaining > 0) as open_listings,
        coalesce((select sum(total_price_usdc) from v2_marketplace_trades), 0)::text as marketplace_volume_usdc`,
    ),
    getV2AdminActivity(10),
  ]);
  return { status: "live" as V2DataStatus, metrics, activity };
}

export async function getV2Treasury() {
  const pool = await getV2Pool();
  if (!pool) return { status: "pending" as V2DataStatus, summary: null, movements: [] };
  const [summary, movements] = await Promise.all([
    one<{
      total_routed_yield_usdc: string;
      total_deal_revenue_usdc: string;
      movement_count: string;
    }>(
      pool,
      `select coalesce(sum(case when movement_type = 'monthly_yield' then amount_usdc else 0 end), 0)::text as total_routed_yield_usdc,
              coalesce(sum(case when movement_type = 'deal_revenue' then amount_usdc else 0 end), 0)::text as total_deal_revenue_usdc,
              count(*)::text as movement_count
       from v2_treasury_movements`,
    ),
    many<{
      id: string;
      movement_type: string;
      operator_wallet: string | null;
      destination: string | null;
      amount_usdc: string;
      tx_hash: string | null;
      occurred_at: Date;
    }>(
      pool,
      `select id, movement_type, operator_wallet, destination, amount_usdc, tx_hash, occurred_at
       from v2_treasury_movements
       order by occurred_at desc
       limit 50`,
    ),
  ]);
  return { status: "live" as V2DataStatus, summary, movements };
}

export async function getV2AdminUsers() {
  const pool = await getV2Pool();
  if (!pool) {
    return {
      status: "pending" as V2DataStatus,
      activeInvestors: 0,
      topInvestorDeposits: "0",
      recentUsers: 0,
      highRiskActivity: "0",
      wallets: [],
      marketplaceActivity: [],
    };
  }

  const [wallets, marketplaceActivity] = await Promise.all([
    many<{
      wallet: string;
      portfolio_value: string;
      total_deposits: string;
      active_investments: string;
      yield_claimed: string;
      marketplace_volume: string;
      status: string;
      first_seen_at: Date;
      last_seen_at: Date;
    }>(
      pool,
      `with latest_snapshots as (
         select distinct on (wallet) wallet, total_value_usdc
         from v2_portfolio_snapshots
         order by wallet, snapshot_at desc
       ),
       monthly_deposits as (
         select wallet, coalesce(sum(amount_usdc), 0) as amount
         from v2_monthly_vault_activity
         where activity_type ilike '%deposit%'
         group by wallet
       ),
       deal_deposits as (
         select investor_wallet as wallet, coalesce(sum(amount_usdc), 0) as amount, count(*) as investments
         from v2_deal_investments
         group by investor_wallet
       ),
       fixed_positions as (
         select wallet, coalesce(sum(principal_usdc), 0) as amount, count(*) filter (where redeemed_at is null) as active_positions
         from v2_fixed_income_positions
         group by wallet
       ),
       yielded as (
         select actor_wallet as wallet, coalesce(sum((payload->>'amountUsdc')::numeric), 0) as amount
         from v2_contract_events
         where actor_wallet is not null and event_name in ('FixedIncomeYieldClaimed', 'DealYieldClaimed')
         group by actor_wallet
       ),
       trade_volume as (
         select buyer_wallet as wallet, coalesce(sum(total_price_usdc), 0) as amount
         from v2_marketplace_trades
         group by buyer_wallet
       )
       select
         u.wallet,
         coalesce(s.total_value_usdc, 0)::text as portfolio_value,
         (coalesce(md.amount, 0) + coalesce(dd.amount, 0) + coalesce(fp.amount, 0))::text as total_deposits,
         (coalesce(dd.investments, 0) + coalesce(fp.active_positions, 0))::text as active_investments,
         coalesce(y.amount, 0)::text as yield_claimed,
         coalesce(tv.amount, 0)::text as marketplace_volume,
         case
           when coalesce(dd.investments, 0) + coalesce(fp.active_positions, 0) > 0 then 'Invested'
           when coalesce(s.total_value_usdc, 0) > 0 then 'Holding value'
           else 'Active'
         end as status,
         u.first_seen_at,
         u.last_seen_at
       from v2_users u
       left join latest_snapshots s on s.wallet = u.wallet
       left join monthly_deposits md on md.wallet = u.wallet
       left join deal_deposits dd on dd.wallet = u.wallet
       left join fixed_positions fp on fp.wallet = u.wallet
       left join yielded y on y.wallet = u.wallet
       left join trade_volume tv on tv.wallet = u.wallet
       order by (coalesce(s.total_value_usdc, 0) + coalesce(md.amount, 0) + coalesce(dd.amount, 0) + coalesce(fp.amount, 0)) desc
       limit 100`,
    ),
    many<{
      id: string;
      buyer_wallet: string;
      shares: string;
      total_price_usdc: string;
      tx_hash: string;
      traded_at: Date;
    }>(
      pool,
      `select id, buyer_wallet, shares, total_price_usdc, tx_hash, traded_at
       from v2_marketplace_trades
       order by traded_at desc
       limit 10`,
    ),
  ]);

  const topInvestorDeposits = wallets[0]?.total_deposits ?? "0";
  const recentUsers = wallets.filter((wallet) => Date.now() - wallet.last_seen_at.getTime() <= 7 * 24 * 60 * 60 * 1000).length;

  return {
    status: "live" as V2DataStatus,
    activeInvestors: wallets.filter((wallet) => Number(wallet.total_deposits) > 0 || Number(wallet.portfolio_value) > 0 || Number(wallet.active_investments) > 0).length,
    topInvestorDeposits,
    recentUsers,
    highRiskActivity: "0",
    wallets: wallets.map((wallet) => ({
      wallet: wallet.wallet,
      portfolioValue: wallet.portfolio_value,
      totalDeposits: wallet.total_deposits,
      activeInvestments: Number(wallet.active_investments),
      yieldClaimed: wallet.yield_claimed,
      marketplaceVolume: wallet.marketplace_volume,
      status: wallet.status,
    })),
    marketplaceActivity: marketplaceActivity.map((item) => ({
      id: item.id,
      buyer: item.buyer_wallet,
      amount: item.shares,
      totalPrice: item.total_price_usdc,
      listingId: "",
      timestamp: item.traded_at.toISOString(),
      hash: item.tx_hash,
    })),
  };
}

export async function getV2AdminActivity(limit = 50) {
  const pool = await getV2Pool();
  if (!pool) return [];
  const rows = await many<{
    id: string;
    operator_wallet: string | null;
    action: string;
    summary: string;
    tx_hash: string | null;
    created_at: Date;
  }>(
    pool,
    `select id, operator_wallet, action, summary, tx_hash, created_at
     from v2_admin_activity
     order by created_at desc
     limit $1`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id,
    operatorWallet: row.operator_wallet,
    action: row.action,
    summary: row.summary,
    txHash: row.tx_hash,
    timestamp: row.created_at.toISOString(),
  }));
}

export async function getV2Activity(options: { wallet?: string; limit?: number; source?: "monthly" } = {}) {
  const pool = await getV2Pool();
  if (!pool) return [];
  const limit = options.limit ?? 25;
  const monthlyWhere = options.wallet ? "where wallet = $1" : "";
  const params = options.wallet ? [normalizeWallet(options.wallet), limit] : [limit];
  const limitParam = options.wallet ? "$2" : "$1";
  const rows = await many<{
    id: string;
    activity_type: string;
    amount_usdc: string;
    shares: string;
    tx_hash: string;
    occurred_at: Date;
  }>(
    pool,
    `select id, activity_type, amount_usdc, shares, tx_hash, occurred_at
     from v2_monthly_vault_activity
     ${monthlyWhere}
     order by occurred_at desc
     limit ${limitParam}`,
    params,
  );
  if (options.source === "monthly") {
    return rows.map((row) => ({
      id: row.id,
      action: row.activity_type,
      valueUsdc: row.amount_usdc,
      shares: row.shares,
      txHash: row.tx_hash,
      timestamp: row.occurred_at.toISOString(),
      source: "indexed" as const,
    }));
  }

  const fixedRows = await many<{
    id: string;
    principal_usdc: string;
    created_tx_hash: string | null;
    start_at: Date;
  }>(
    pool,
    `select id, principal_usdc, created_tx_hash, start_at
     from v2_fixed_income_positions
     ${options.wallet ? "where wallet = $1" : ""}
     order by start_at desc
     limit ${limitParam}`,
    params,
  );
  const fixedEventRows = options.wallet
    ? await many<{
        id: string;
        event_name: string;
        payload: Record<string, unknown>;
        tx_hash: string;
        block_timestamp: Date | null;
      }>(
        pool,
        `select id, event_name, payload, tx_hash, block_timestamp
         from v2_contract_events
         where actor_wallet = $1
           and event_name in ('FixedIncomeYieldClaimed', 'YieldClaimed', 'FixedIncomeRedeemed', 'Redeemed', 'FixedIncomeEarlyExited', 'EarlyExited')
         order by block_timestamp desc nulls last
         limit $2`,
        params,
      )
    : [];

  return [
    ...rows.map((row) => ({
    id: row.id,
    action: row.activity_type,
    valueUsdc: row.amount_usdc,
    shares: row.shares,
    txHash: row.tx_hash,
    timestamp: row.occurred_at.toISOString(),
    source: "indexed" as const,
    })),
    ...fixedRows.map((row) => ({
      id: row.id,
      action: "Fixed-income deposit",
      valueUsdc: row.principal_usdc,
      txHash: row.created_tx_hash ?? undefined,
      timestamp: row.start_at.toISOString(),
      source: "indexed" as const,
    })),
    ...fixedEventRows.map((row) => ({
      id: row.id,
      action: fixedIncomeActivityLabel(row.event_name),
      valueUsdc: decimalString(row.payload?.amountUsdc),
      txHash: row.tx_hash,
      timestamp: (row.block_timestamp ?? new Date()).toISOString(),
      source: "indexed" as const,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime())
    .slice(0, limit);
}

async function manyMarketplaceListings(pool: Pool, where: string, params: unknown[]) {
  return many<{
    id: string;
    onchain_listing_id: string;
    title: string | null;
    seller_wallet: string;
    shares_remaining: string;
    price_per_share_usdc: string;
    status: string;
    created_at: Date;
  }>(
    pool,
    `select l.id, l.onchain_listing_id, d.title, l.seller_wallet, l.shares_remaining,
            l.price_per_share_usdc, l.status, l.created_at
     from v2_marketplace_listings l
     left join v2_deals d on d.id = l.deal_id
     ${where}
     order by l.created_at desc
     limit 100`,
    params,
  );
}

async function getV2Pool() {
  if (!POSTGRES_URL) return null;

  const globalWithPg = globalThis as typeof globalThis & {
    __arcV2PgPool?: Pool;
    __arcV2PgReady?: Promise<void>;
  };

  if (!globalWithPg.__arcV2PgPool) {
    globalWithPg.__arcV2PgPool = new Pool({
      connectionString: POSTGRES_URL,
      ssl: needsSsl(POSTGRES_URL) ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
  }

  if (!globalWithPg.__arcV2PgReady) {
    globalWithPg.__arcV2PgReady = ensureV2Schema(globalWithPg.__arcV2PgPool);
  }

  await globalWithPg.__arcV2PgReady;
  return globalWithPg.__arcV2PgPool;
}

async function ensureV2Schema(pool: Pool) {
  await pool.query(`
    create table if not exists v2_contract_events (
      id uuid primary key,
      chain_id integer not null,
      contract_address text not null,
      event_name text not null,
      tx_hash text not null,
      log_index integer not null,
      block_number numeric(78, 0) not null,
      block_timestamp timestamptz,
      actor_wallet text,
      payload jsonb not null default '{}',
      indexed_at timestamptz not null default now(),
      unique (chain_id, tx_hash, log_index)
    );

    create table if not exists v2_users (
      wallet text primary key,
      first_seen_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      kyc_status text not null default 'unverified',
      metadata jsonb not null default '{}'
    );

    create table if not exists v2_deals (
      id uuid primary key,
      chain_id integer not null default ${ARC_TESTNET_CHAIN_ID},
      deal_vault_address text unique,
      title text not null,
      subtitle text,
      description text,
      category text,
      risk_level text,
      status text not null default 'open',
      target_raise_usdc numeric(38, 6),
      min_investment_usdc numeric(38, 6),
      total_raised_usdc numeric(38, 6) not null default 0,
      ownership_issued numeric(38, 6) not null default 0,
      investor_count integer not null default 0,
      funding_deadline timestamptz,
      closed_at timestamptz,
      revenue_distribution_model text,
      expected_payout_schedule text,
      cover_image_url text,
      metadata jsonb not null default '{}',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists v2_monthly_vault_positions (
      wallet text primary key,
      shares numeric(38, 6) not null default 0,
      current_value_usdc numeric(38, 6) not null default 0,
      claimable_yield_usdc numeric(38, 6) not null default 0,
      updated_at timestamptz not null default now()
    );

    create table if not exists v2_monthly_vault_activity (
      id uuid primary key,
      wallet text not null,
      activity_type text not null,
      amount_usdc numeric(38, 6) not null default 0,
      shares numeric(38, 6) not null default 0,
      tx_hash text not null unique,
      occurred_at timestamptz not null
    );

    create table if not exists v2_fixed_income_positions (
      id uuid primary key,
      wallet text not null,
      onchain_position_id text,
      principal_usdc numeric(38, 6) not null,
      apy_bps integer not null,
      duration_seconds integer not null,
      start_at timestamptz not null,
      maturity_at timestamptz not null,
      claimable_yield_usdc numeric(38, 6) not null default 0,
      redeemed_at timestamptz,
      created_tx_hash text,
      updated_at timestamptz not null default now()
    );

    create table if not exists v2_deal_investments (
      id uuid primary key,
      deal_id uuid references v2_deals(id),
      investor_wallet text not null,
      amount_usdc numeric(38, 6) not null,
      shares numeric(38, 6) not null,
      tx_hash text not null unique,
      invested_at timestamptz not null
    );

    create table if not exists v2_marketplace_listings (
      id uuid primary key,
      chain_id integer not null default ${ARC_TESTNET_CHAIN_ID},
      onchain_listing_id text not null,
      deal_id uuid references v2_deals(id),
      seller_wallet text not null,
      shares_total numeric(38, 6) not null,
      shares_remaining numeric(38, 6) not null,
      price_per_share_usdc numeric(38, 6) not null,
      status text not null default 'active',
      created_tx_hash text,
      created_at timestamptz not null,
      cancelled_at timestamptz,
      unique (chain_id, onchain_listing_id)
    );

    create table if not exists v2_marketplace_trades (
      id uuid primary key,
      listing_id uuid references v2_marketplace_listings(id),
      buyer_wallet text not null,
      seller_wallet text not null,
      shares numeric(38, 6) not null,
      total_price_usdc numeric(38, 6) not null,
      tx_hash text not null unique,
      traded_at timestamptz not null
    );

    create table if not exists v2_treasury_movements (
      id uuid primary key,
      movement_type text not null,
      operator_wallet text,
      destination text,
      amount_usdc numeric(38, 6) not null,
      tx_hash text,
      metadata jsonb not null default '{}',
      occurred_at timestamptz not null default now()
    );

    create table if not exists v2_admin_activity (
      id uuid primary key,
      operator_wallet text,
      action text not null,
      summary text not null,
      tx_hash text,
      metadata jsonb not null default '{}',
      created_at timestamptz not null default now()
    );

    create table if not exists v2_portfolio_snapshots (
      id uuid primary key,
      wallet text not null,
      total_value_usdc numeric(38, 6) not null default 0,
      wallet_cash_usdc numeric(38, 6) not null default 0,
      monthly_vault_usdc numeric(38, 6) not null default 0,
      fixed_income_usdc numeric(38, 6) not null default 0,
      deal_holdings_usdc numeric(38, 6) not null default 0,
      claimable_yield_usdc numeric(38, 6) not null default 0,
      snapshot_at timestamptz not null default now()
    );

    create table if not exists v2_indexer_cursors (
      name text primary key,
      last_block numeric(78, 0) not null,
      updated_at timestamptz not null default now()
    );

    create index if not exists v2_portfolio_snapshots_wallet_idx on v2_portfolio_snapshots (wallet, snapshot_at desc);
    create index if not exists v2_contract_events_actor_idx on v2_contract_events (actor_wallet, block_timestamp desc);
    create index if not exists v2_deals_status_idx on v2_deals (status, funding_deadline);
    create index if not exists v2_monthly_vault_activity_wallet_idx on v2_monthly_vault_activity (wallet, occurred_at desc);
    create index if not exists v2_marketplace_listings_status_idx on v2_marketplace_listings (status, created_at desc);
  `);
}

async function projectV2Event(pool: Pool, event: V2IndexedEventInput) {
  const payload = event.payload ?? {};
  const timestamp = event.blockTimestamp ? new Date(event.blockTimestamp).toISOString() : new Date().toISOString();
  const eventName = event.eventName.toLowerCase();
  const wallet = stringValue(payload.user ?? payload.investor ?? payload.wallet ?? event.actorWallet)?.toLowerCase();
  const amountUsdc = usdcValue(payload.amountUsdc, payload.amount ?? payload.assets ?? payload.netAssets ?? payload.principal);
  const shares = decimalString(payload.shares ?? payload.shareAmount ?? payload.value);

  if (wallet) {
    await pool.query(
      `insert into v2_users (wallet, first_seen_at, last_seen_at)
       values ($1, $2, $2)
       on conflict (wallet) do update set last_seen_at = excluded.last_seen_at`,
      [wallet, timestamp],
    );
  }

  if ((eventName === "deposit" || eventName === "monthlydeposit") && wallet) {
    await pool.query(
      `insert into v2_monthly_vault_activity (id, wallet, activity_type, amount_usdc, shares, tx_hash, occurred_at)
       values ($1, $2, 'Monthly Vault deposit', $3, $4, $5, $6)
       on conflict (tx_hash) do nothing`,
      [crypto.randomUUID(), wallet, amountUsdc, shares, event.txHash, timestamp],
    );
    await pool.query(
      `insert into v2_monthly_vault_positions (wallet, shares, current_value_usdc, updated_at)
       values ($1, $2, $3, $4)
       on conflict (wallet) do update set
         shares = v2_monthly_vault_positions.shares + excluded.shares,
         current_value_usdc = v2_monthly_vault_positions.current_value_usdc + excluded.current_value_usdc,
         updated_at = excluded.updated_at`,
      [wallet, shares, amountUsdc, timestamp],
    );
  }

  if ((eventName === "withdraw" || eventName === "monthlywithdrawexecuted") && wallet) {
    await pool.query(
      `insert into v2_monthly_vault_activity (id, wallet, activity_type, amount_usdc, shares, tx_hash, occurred_at)
       values ($1, $2, 'Monthly Vault withdrawal', $3, $4, $5, $6)
       on conflict (tx_hash) do nothing`,
      [crypto.randomUUID(), wallet, amountUsdc, shares, event.txHash, timestamp],
    );
    await pool.query(
      `insert into v2_monthly_vault_positions (wallet, shares, current_value_usdc, updated_at)
       values ($1, 0, 0, $2)
       on conflict (wallet) do update set
         current_value_usdc = greatest(v2_monthly_vault_positions.current_value_usdc - $3::numeric, 0),
         updated_at = excluded.updated_at`,
      [wallet, timestamp, amountUsdc],
    );
  }

  if ((eventName === "invested" || eventName === "dealinvested" || eventName === "dealinvestment") && wallet) {
    const dealId = await findDealIdByVaultAddress(pool, event.contractAddress);
    await pool.query(
      `insert into v2_deal_investments (id, deal_id, investor_wallet, amount_usdc, shares, tx_hash, invested_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (tx_hash) do nothing`,
      [crypto.randomUUID(), dealId || null, wallet, amountUsdc, shares, event.txHash, timestamp],
    );
    if (dealId) {
      await pool.query(
        `update v2_deals
         set total_raised_usdc = total_raised_usdc + $2::numeric,
             ownership_issued = ownership_issued + $3::numeric,
             investor_count = (
               select count(distinct investor_wallet)::int
               from v2_deal_investments
               where deal_id = $1
             ),
             updated_at = now()
         where id = $1`,
        [dealId, amountUsdc, shares],
      );
    }
  }

  if (eventName === "dealcreated") {
    const dealId = stringValue(payload.dealId) ?? "0";
    const dealVault = stringValue(payload.dealVault);
    const metadataId = stringValue(payload.metadataId);
    await pool.query(
      `insert into v2_deals (
         id, chain_id, deal_vault_address, title, subtitle, status,
         target_raise_usdc, min_investment_usdc, funding_deadline, metadata
       )
       values ($1, $2, $3, $4, $5, 'open', $6, $7, to_timestamp($8), $9)
       on conflict (deal_vault_address) do update set
         target_raise_usdc = excluded.target_raise_usdc,
         min_investment_usdc = excluded.min_investment_usdc,
         funding_deadline = excluded.funding_deadline,
         updated_at = now()`,
      [
        crypto.randomUUID(),
        event.chainId ?? ARC_TESTNET_CHAIN_ID,
        dealVault?.toLowerCase() ?? null,
        metadataId ? `Deal ${metadataId}` : `Deal #${dealId}`,
        metadataId ?? "Awaiting admin metadata",
        usdcValue(payload.amountUsdc, payload.targetRaise),
        usdcValue(undefined, payload.minRaise),
        Number(payload.closeTime ?? 0),
        { onchainDealId: dealId, metadataId },
      ],
    );
  }

  if ((eventName === "fixedincomepositionopened" || eventName === "deposited") && wallet) {
    const start = Number(payload.start ?? timestampSeconds(timestamp));
    const duration = Number(payload.duration ?? 0);
    const maturity = Number(payload.maturity ?? (duration > 0 ? start + duration : start));
    await pool.query(
      `insert into v2_fixed_income_positions (
         id, wallet, onchain_position_id, principal_usdc, apy_bps,
         duration_seconds, start_at, maturity_at, claimable_yield_usdc, created_tx_hash
       )
       select $1, $2, $3, $4, $5, $6, to_timestamp($7), to_timestamp($8), 0, $9
       where not exists (
         select 1 from v2_fixed_income_positions where created_tx_hash = $9
       )`,
      [
        crypto.randomUUID(),
        wallet,
        stringValue(payload.positionId) ?? "0",
        usdcValue(payload.amountUsdc, payload.principal ?? payload.amount),
        Number(payload.apyBps ?? 0),
        duration,
        start,
        maturity,
        event.txHash,
      ],
    );
  }

  if ((eventName === "fixedincomeyieldclaimed" || eventName === "yieldclaimed") && wallet) {
    const positionId = stringValue(payload.positionId) ?? "0";
    await pool.query(
      `update v2_fixed_income_positions
       set claimable_yield_usdc = greatest(claimable_yield_usdc - $3::numeric, 0),
           updated_at = $4
       where wallet = $1 and onchain_position_id = $2`,
      [wallet, positionId, amountUsdc, timestamp],
    );
  }

  if ((eventName === "fixedincomeredeemed" || eventName === "redeemed" || eventName === "fixedincomeearlyexited" || eventName === "earlyexited") && wallet) {
    const positionId = stringValue(payload.positionId) ?? "0";
    await pool.query(
      `update v2_fixed_income_positions
       set redeemed_at = coalesce(redeemed_at, $3),
           claimable_yield_usdc = 0,
           updated_at = $3
       where wallet = $1 and onchain_position_id = $2`,
      [wallet, positionId, timestamp],
    );
  }

  if (eventName === "monthlyyieldinjected") {
    const operator = stringValue(payload.operator ?? event.actorWallet)?.toLowerCase();
    await pool.query(
      `insert into v2_treasury_movements (
         id, movement_type, operator_wallet, destination, amount_usdc, tx_hash, occurred_at
       )
       select $1, 'monthly_yield', $2, $3, $4, $5, $6
       where not exists (select 1 from v2_treasury_movements where tx_hash = $5)`,
      [
        crypto.randomUUID(),
        operator ?? null,
        event.contractAddress.toLowerCase(),
        usdcValue(payload.amountUsdc, payload.amount),
        event.txHash,
        timestamp,
      ],
    );
  }

  if (eventName === "marketplacelistingcreated") {
    const listingId = stringValue(payload.listingId) ?? "0";
    const seller = stringValue(payload.seller)?.toLowerCase();
    const token = stringValue(payload.token);
    const dealId = token ? await findDealIdByVaultAddress(pool, token) : null;
    if (seller) {
      await pool.query(
        `insert into v2_users (wallet, first_seen_at, last_seen_at)
         values ($1, $2, $2)
         on conflict (wallet) do update set last_seen_at = excluded.last_seen_at`,
        [seller, timestamp],
      );
      await pool.query(
        `insert into v2_marketplace_listings (
           id, chain_id, onchain_listing_id, deal_id, seller_wallet,
           shares_total, shares_remaining, price_per_share_usdc,
           status, created_tx_hash, created_at
         )
         values ($1, $2, $3, $4, $5, $6, $6, $7, 'active', $8, $9)
         on conflict (chain_id, onchain_listing_id) do update set
           shares_remaining = excluded.shares_remaining,
           price_per_share_usdc = excluded.price_per_share_usdc,
           status = 'active'`,
        [
          crypto.randomUUID(),
          event.chainId ?? ARC_TESTNET_CHAIN_ID,
          listingId,
          dealId,
          seller,
          sharesString(payload.amount),
          usdcDecimalString(payload.pricePerShare),
          event.txHash,
          timestamp,
        ],
      );
    }
  }

  if (eventName === "dealrevenuedistributed") {
    const operator = stringValue(payload.operator ?? event.actorWallet)?.toLowerCase();
    await pool.query(
      `insert into v2_treasury_movements (
         id, movement_type, operator_wallet, destination, amount_usdc, tx_hash, occurred_at
       )
       select $1, 'deal_revenue', $2, $3, $4, $5, $6
       where not exists (select 1 from v2_treasury_movements where tx_hash = $5)`,
      [
        crypto.randomUUID(),
        operator ?? null,
        event.contractAddress.toLowerCase(),
        usdcValue(payload.amountUsdc, payload.amount),
        event.txHash,
        timestamp,
      ],
    );
  }

  if (eventName === "marketplacelistingfilled") {
    const listingId = stringValue(payload.listingId) ?? "0";
    const buyer = stringValue(payload.buyer)?.toLowerCase();
    const seller = stringValue(payload.seller)?.toLowerCase();
    const listing = await one<{ id: string }>(
      pool,
      `select id
       from v2_marketplace_listings
       where chain_id = $1 and onchain_listing_id = $2`,
      [event.chainId ?? ARC_TESTNET_CHAIN_ID, listingId],
    );
    if (buyer && seller && listing) {
      await pool.query(
        `insert into v2_marketplace_trades (
           id, listing_id, buyer_wallet, seller_wallet, shares,
           total_price_usdc, tx_hash, traded_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (tx_hash) do nothing`,
        [
          crypto.randomUUID(),
          listing.id,
          buyer,
          seller,
          sharesString(payload.amount),
          usdcDecimalString(payload.totalPrice),
          event.txHash,
          timestamp,
        ],
      );
      await pool.query(
        `update v2_marketplace_listings
         set shares_remaining = $3::numeric,
             status = case when $3::numeric <= 0 then 'filled' else status end
         where chain_id = $1 and onchain_listing_id = $2`,
        [event.chainId ?? ARC_TESTNET_CHAIN_ID, listingId, sharesString(payload.amountRemaining)],
      );
      for (const user of [buyer, seller]) {
        await pool.query(
          `insert into v2_users (wallet, first_seen_at, last_seen_at)
           values ($1, $2, $2)
           on conflict (wallet) do update set last_seen_at = excluded.last_seen_at`,
          [user, timestamp],
        );
      }
    }
  }

  if (eventName === "marketplacelistingcancelled") {
    const listingId = stringValue(payload.listingId) ?? "0";
    await pool.query(
      `update v2_marketplace_listings
       set status = 'cancelled',
           shares_remaining = 0,
           cancelled_at = $3
       where chain_id = $1 and onchain_listing_id = $2`,
      [event.chainId ?? ARC_TESTNET_CHAIN_ID, listingId, timestamp],
    );
  }

  if (wallet) {
    await refreshV2PortfolioSnapshot(pool, wallet);
  }
}

async function one<T extends QueryResultRow>(pool: Pool, text: string, values: unknown[] = []) {
  const result = await pool.query<T>(text, values);
  return result.rows[0] ?? null;
}

async function many<T extends QueryResultRow>(pool: Pool, text: string, values: unknown[] = []) {
  const result = await pool.query<T>(text, values);
  return result.rows;
}

function emptyDashboard(status: V2DataStatus) {
  return {
    status,
    totalPortfolioValue: "0",
    availableIncome: "0",
    walletCash: "0",
    allocation: [],
    lastUpdated: null,
    activity: [],
  };
}

function emptyPortfolio(status: V2DataStatus) {
  return {
    status,
    monthlyVault: null,
    fixedIncomePositions: [],
    dealHoldings: [],
    activity: [],
  };
}

function deriveDealStatus(status: string, deadline?: Date | null) {
  if (status !== "open") return status;
  if (deadline && deadline.getTime() <= Date.now()) return "closed";
  return "open";
}

function durationLabel(durationSeconds: number) {
  const days = durationSeconds / 86_400;
  if (days >= 1090) return "3 year pool";
  if (days >= 725) return "2 year pool";
  if (days >= 360) return "1 year pool";
  return "Fixed-term pool";
}

function fixedIncomeActivityLabel(eventName: string) {
  const normalized = eventName.toLowerCase();
  if (normalized.includes("earlyexited")) return "Fixed-income early exit";
  if (normalized.includes("redeemed")) return "Fixed-income redemption";
  if (normalized.includes("yieldclaimed")) return "Fixed-income yield claim";
  return "Fixed-income activity";
}

function normalizeWallet(wallet: string) {
  return wallet.trim().toLowerCase();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function decimalString(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && value.trim()) return value.trim();
  return "0";
}

function sharesString(value: unknown) {
  return decimalString(value);
}

function usdcDecimalString(value: unknown) {
  const raw = decimalString(value);
  if (raw.includes(".")) return raw;
  try {
    const padded = raw.padStart(7, "0");
    const whole = padded.slice(0, -6) || "0";
    const fraction = padded.slice(-6);
    return `${whole}.${fraction}`;
  } catch {
    return "0";
  }
}

function usdcValue(preferred: unknown, fallback: unknown) {
  const explicit = decimalString(preferred);
  if (explicit !== "0") return explicit;
  return usdcDecimalString(fallback);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function timestampSeconds(timestamp: string) {
  const millis = new Date(timestamp).getTime();
  return Number.isFinite(millis) ? Math.floor(millis / 1000) : Math.floor(Date.now() / 1000);
}

async function refreshV2PortfolioSnapshot(pool: Pool, wallet: string) {
  await pool.query(
    `with monthly as (
       select coalesce(current_value_usdc, 0) as value, coalesce(claimable_yield_usdc, 0) as yield
       from v2_monthly_vault_positions
       where wallet = $1
     ),
     fixed as (
       select coalesce(sum(principal_usdc) filter (where redeemed_at is null), 0) as value,
              coalesce(sum(claimable_yield_usdc) filter (where redeemed_at is null), 0) as yield
       from v2_fixed_income_positions
       where wallet = $1
     ),
     deals as (
       select coalesce(sum(amount_usdc), 0) as value
       from v2_deal_investments
       where investor_wallet = $1
     ),
     totals as (
       select
         coalesce((select value from monthly), 0) as monthly_value,
         coalesce((select value from fixed), 0) as fixed_value,
         coalesce((select value from deals), 0) as deal_value,
         coalesce((select yield from monthly), 0) + coalesce((select yield from fixed), 0) as claimable_yield
     )
     insert into v2_portfolio_snapshots (
       id, wallet, total_value_usdc, wallet_cash_usdc, monthly_vault_usdc,
       fixed_income_usdc, deal_holdings_usdc, claimable_yield_usdc, snapshot_at
     )
     select
       $2, $1,
       monthly_value + fixed_value + deal_value,
       0,
       monthly_value,
       fixed_value,
       deal_value,
       claimable_yield,
       now()
     from totals`,
    [wallet, crypto.randomUUID()],
  );
}

async function findDealIdByVaultAddress(pool: Pool, address?: string | null) {
  if (!address) return null;
  const deal = await one<{ id: string }>(
    pool,
    `select id from v2_deals where lower(deal_vault_address) = lower($1) limit 1`,
    [address],
  );
  return deal?.id ?? null;
}

function needsSsl(connectionString: string) {
  try {
    const host = new URL(connectionString).hostname;
    return !new Set(["localhost", "127.0.0.1"]).has(host);
  } catch {
    return true;
  }
}
