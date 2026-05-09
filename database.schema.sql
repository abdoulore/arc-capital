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
