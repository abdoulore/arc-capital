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

## Contracts To Monitor

- Monthly Vault V2
- Long-Term Vault V2
- Deal Factory V2
- Marketplace V2
- Every Deal Vault V2 created by the factory

Deal Vaults are created over time, so add each new deal vault to Circle monitoring after creation or use the development backfill worker as a recovery path.

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
