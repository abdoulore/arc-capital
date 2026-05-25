# Circle Event Monitoring Setup For Arc Capital V2

Arc Capital V2 indexes portfolio, activity, treasury, and marketplace data from contract events. In production, Circle Smart Contract Platform event monitors should feed the V2 indexer instead of making user-facing API routes scan Arc RPC history.

## Required Vercel Environment

Set these in Vercel for the frontend project:

```env
POSTGRES_URL=postgres://...
INDEXER_WEBHOOK_SECRET=<long random secret>
CIRCLE_API_KEY=<server-side only>
CIRCLE_ENTITY_SECRET=<server-side only, when needed>
NEXT_PUBLIC_CHAIN_ID=5042002
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
NEXT_PUBLIC_MONTHLY_VAULT_V2_ADDRESS=0x...
NEXT_PUBLIC_LONG_TERM_VAULT_V2_ADDRESS=0x...
NEXT_PUBLIC_DEAL_FACTORY_V2_ADDRESS=0x...
NEXT_PUBLIC_MARKETPLACE_V2_ADDRESS=0x...
```

Never expose Circle keys, entity secrets, private keys, or PostgreSQL URLs with `NEXT_PUBLIC_`.

## Health Check

After deploy, open:

```text
https://your-domain.vercel.app/api/v2/status
```

Expected production state:

- `status`: `ready`
- `database.database`: `connected`
- every V2 contract has `configured: true`
- `indexer.webhookSecretConfigured`: `true`
- `indexer.normalizedEventSourceCount` is greater than zero

The endpoint reports only configuration status and public contract addresses. It does not return secrets.

## Circle Monitor Target

Create event monitors for the deployed Arc contracts and send webhooks to:

```text
https://your-domain.vercel.app/api/v2/indexer/circle
```

Required request header:

```text
x-indexer-secret: <INDEXER_WEBHOOK_SECRET>
```

If the Circle Console webhook screen does not provide a custom header field, use a secret query parameter in the URL instead:

```text
https://your-domain.vercel.app/api/v2/indexer/circle?secret=<INDEXER_WEBHOOK_SECRET>
```

The endpoint accepts either the `x-indexer-secret` header or the `secret` query parameter. Keep the secret long and random, and do not publish the webhook URL publicly.

Circle may send a `HEAD` request and a `webhooks.test` notification when registering the endpoint. The V2 endpoint responds to both so the subscription can be saved successfully.

## Contracts To Monitor

- Monthly Vault V2
- Long-Term Vault V2
- Deal Factory V2
- Marketplace V2
- Every Deal Vault V2 created by the factory

Deal Vaults are created over time, so add each new deal vault to Circle monitoring after creation or use the development backfill worker as a recovery path.

## Create Monitors With The Script

If the Circle Console does not expose event monitor creation, run the repository script from `frontend`:

```bash
npm install
npm run circle:monitors:v2
```

Required local env vars:

```env
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
NEXT_PUBLIC_MONTHLY_VAULT_V2_ADDRESS=
NEXT_PUBLIC_LONG_TERM_VAULT_V2_ADDRESS=
NEXT_PUBLIC_DEAL_FACTORY_V2_ADDRESS=
NEXT_PUBLIC_MARKETPLACE_V2_ADDRESS=
```

Optional, for manually supplied deal vaults:

```env
DEAL_VAULT_V2_ADDRESSES=0xDealVault1,0xDealVault2
```

The script also scans `DealFactoryV2` `DealCreated` logs on Arc Testnet and automatically adds monitors for discovered deal vault addresses. You can bound discovery with:

```env
V2_MONITOR_FROM_BLOCK=0
V2_MONITOR_TO_BLOCK=
V2_MONITOR_CHUNK_SIZE=9000
```

The script imports each contract on `ARC-TESTNET` and creates monitors for the V2 event signatures. It is safe to rerun; duplicate imports and duplicate monitors are treated as already complete.

Some current Arc Capital deployments emit earlier event names while the V2 backend is being migrated. The monitor script subscribes to both canonical V2 signatures and the legacy signatures emitted by those deployed contracts, including `Deposit`, `Withdraw`, `Deposited`, `Invested`, and legacy marketplace listing events. This keeps Circle monitoring aligned with the contracts actually live on Arc Testnet.

## Event Coverage

The normalizer currently recognizes:

- Monthly deposit
- Monthly withdrawal request
- Monthly withdrawal execution
- Monthly yield injection
- Fixed-income position opened
- Fixed-income yield claim
- Fixed-income redemption
- Fixed-income early exit
- Deal created
- Deal investment
- Deal closed
- Deal revenue distributed
- Deal yield claimed
- Marketplace listing created
- Marketplace listing filled
- Marketplace listing cancelled

The canonical event list lives in:

```text
frontend/lib/v2-event-adapters.ts
```

## Development Backfill

For local development or recovery, run the RPC polling worker from `frontend`:

```bash
npm run index:v2
```

Use these variables to control the scan:

```env
V2_INDEXER_INGEST_URL=http://localhost:3000/api/v2/indexer/events
V2_INDEXER_FROM_BLOCK=0
V2_INDEXER_TO_BLOCK=
V2_INDEXER_CHUNK_SIZE=1000
```

Production should prefer Circle event monitors. The backfill worker is useful for testnet recovery, local testing, and one-time historical syncs.

## Automatic Polling Fallback

If Circle webhook logs remain empty, V2 exposes a server-side poller that can be called by Vercel Cron, an external cron service, or manually:

```text
GET /api/v2/indexer/poll?secret=<INDEXER_WEBHOOK_SECRET>
```

The poller scans configured V2 contracts from the last stored cursor, ingests matching events, and advances the cursor. It is idempotent because events are deduplicated by `chainId + txHash + logIndex`.

Useful Vercel env vars:

```env
V2_POLLER_FROM_BLOCK=43970000
V2_POLLER_MAX_BLOCKS=500
V2_POLLER_INITIAL_LOOKBACK=5000
CRON_SECRET=
```

Use `V2_POLLER_FROM_BLOCK` once when starting the poller so it begins near the V2 deployment block. After the first successful run, the database cursor takes over.

To re-run projections for already-stored raw events after a projection fix:

```bash
curl -X POST "https://your-domain.vercel.app/api/v2/indexer/debug?secret=<INDEXER_WEBHOOK_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"action":"reproject-events"}'
```
