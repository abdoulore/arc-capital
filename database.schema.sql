CREATE TABLE admin_activity_logs (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  operator_wallet TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  tx_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE treasury_distributions (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  operator_wallet TEXT NOT NULL,
  destination TEXT NOT NULL,
  amount_usdc NUMERIC(38, 6) NOT NULL,
  distribution_type TEXT NOT NULL,
  tx_hash TEXT NOT NULL
);

CREATE TABLE protocol_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL
);

CREATE TABLE deal_metadata (
  id UUID PRIMARY KEY,
  deal_vault_address TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  category TEXT,
  risk_level TEXT,
  target_raise_usdc NUMERIC(38, 6),
  min_investment_usdc NUMERIC(38, 6),
  funding_deadline TIMESTAMPTZ,
  revenue_distribution_model TEXT,
  cover_image_url TEXT,
  expected_payout_schedule TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE uploaded_documents (
  id UUID PRIMARY KEY,
  deal_id UUID REFERENCES deal_metadata(id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Arc Capital V2 indexed source-of-truth schema.
-- These tables are intentionally namespaced to avoid breaking the existing V1
-- local/admin store tables while V2 is rolled out incrementally.

CREATE TABLE IF NOT EXISTS v2_contracts (
  id UUID PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  deployed_tx_hash TEXT,
  deployed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, address)
);

CREATE TABLE IF NOT EXISTS v2_contract_events (
  id UUID PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  event_name TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp TIMESTAMPTZ,
  actor_wallet TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS v2_users (
  wallet TEXT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kyc_status TEXT NOT NULL DEFAULT 'unverified',
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS v2_deals (
  id UUID PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  deal_vault_address TEXT UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  category TEXT,
  risk_level TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  target_raise_usdc NUMERIC(38, 6),
  min_investment_usdc NUMERIC(38, 6),
  total_raised_usdc NUMERIC(38, 6) NOT NULL DEFAULT 0,
  ownership_issued NUMERIC(38, 6) NOT NULL DEFAULT 0,
  investor_count INTEGER NOT NULL DEFAULT 0,
  funding_deadline TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  revenue_distribution_model TEXT,
  expected_payout_schedule TEXT,
  cover_image_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_deal_documents (
  id UUID PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES v2_deals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_deal_investments (
  id UUID PRIMARY KEY,
  deal_id UUID REFERENCES v2_deals(id),
  investor_wallet TEXT NOT NULL,
  amount_usdc NUMERIC(38, 6) NOT NULL,
  shares NUMERIC(38, 6) NOT NULL,
  tx_hash TEXT NOT NULL,
  invested_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tx_hash)
);

CREATE TABLE IF NOT EXISTS v2_deal_distributions (
  id UUID PRIMARY KEY,
  deal_id UUID REFERENCES v2_deals(id),
  operator_wallet TEXT NOT NULL,
  amount_usdc NUMERIC(38, 6) NOT NULL,
  tx_hash TEXT NOT NULL,
  distributed_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tx_hash)
);

CREATE TABLE IF NOT EXISTS v2_monthly_vault_positions (
  wallet TEXT PRIMARY KEY,
  shares NUMERIC(38, 6) NOT NULL DEFAULT 0,
  current_value_usdc NUMERIC(38, 6) NOT NULL DEFAULT 0,
  claimable_yield_usdc NUMERIC(38, 6) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_monthly_vault_activity (
  id UUID PRIMARY KEY,
  wallet TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  amount_usdc NUMERIC(38, 6) NOT NULL DEFAULT 0,
  shares NUMERIC(38, 6) NOT NULL DEFAULT 0,
  tx_hash TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tx_hash)
);

CREATE TABLE IF NOT EXISTS v2_fixed_income_positions (
  id UUID PRIMARY KEY,
  wallet TEXT NOT NULL,
  onchain_position_id TEXT,
  principal_usdc NUMERIC(38, 6) NOT NULL,
  apy_bps INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  maturity_at TIMESTAMPTZ NOT NULL,
  claimable_yield_usdc NUMERIC(38, 6) NOT NULL DEFAULT 0,
  redeemed_at TIMESTAMPTZ,
  created_tx_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_fixed_income_claims (
  id UUID PRIMARY KEY,
  position_id UUID REFERENCES v2_fixed_income_positions(id),
  wallet TEXT NOT NULL,
  amount_usdc NUMERIC(38, 6) NOT NULL,
  tx_hash TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tx_hash)
);

CREATE TABLE IF NOT EXISTS v2_marketplace_listings (
  id UUID PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  onchain_listing_id TEXT NOT NULL,
  deal_id UUID REFERENCES v2_deals(id),
  seller_wallet TEXT NOT NULL,
  shares_total NUMERIC(38, 6) NOT NULL,
  shares_remaining NUMERIC(38, 6) NOT NULL,
  price_per_share_usdc NUMERIC(38, 6) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  UNIQUE (chain_id, onchain_listing_id)
);

CREATE TABLE IF NOT EXISTS v2_marketplace_trades (
  id UUID PRIMARY KEY,
  listing_id UUID REFERENCES v2_marketplace_listings(id),
  buyer_wallet TEXT NOT NULL,
  seller_wallet TEXT NOT NULL,
  shares NUMERIC(38, 6) NOT NULL,
  total_price_usdc NUMERIC(38, 6) NOT NULL,
  tx_hash TEXT NOT NULL,
  traded_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tx_hash)
);

CREATE TABLE IF NOT EXISTS v2_treasury_movements (
  id UUID PRIMARY KEY,
  movement_type TEXT NOT NULL,
  operator_wallet TEXT,
  destination TEXT,
  amount_usdc NUMERIC(38, 6) NOT NULL,
  tx_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_admin_activity (
  id UUID PRIMARY KEY,
  operator_wallet TEXT,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  tx_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_portfolio_snapshots (
  id UUID PRIMARY KEY,
  wallet TEXT NOT NULL,
  total_value_usdc NUMERIC(38, 6) NOT NULL DEFAULT 0,
  wallet_cash_usdc NUMERIC(38, 6) NOT NULL DEFAULT 0,
  monthly_vault_usdc NUMERIC(38, 6) NOT NULL DEFAULT 0,
  fixed_income_usdc NUMERIC(38, 6) NOT NULL DEFAULT 0,
  deal_holdings_usdc NUMERIC(38, 6) NOT NULL DEFAULT 0,
  claimable_yield_usdc NUMERIC(38, 6) NOT NULL DEFAULT 0,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS v2_contract_events_actor_idx ON v2_contract_events (actor_wallet, block_timestamp DESC);
CREATE INDEX IF NOT EXISTS v2_deals_status_idx ON v2_deals (status, funding_deadline);
CREATE INDEX IF NOT EXISTS v2_monthly_vault_activity_wallet_idx ON v2_monthly_vault_activity (wallet, occurred_at DESC);
CREATE INDEX IF NOT EXISTS v2_fixed_income_positions_wallet_idx ON v2_fixed_income_positions (wallet, maturity_at);
CREATE INDEX IF NOT EXISTS v2_marketplace_listings_status_idx ON v2_marketplace_listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS v2_portfolio_snapshots_wallet_idx ON v2_portfolio_snapshots (wallet, snapshot_at DESC);
