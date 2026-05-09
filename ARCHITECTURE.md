# RWA Investment Platform Architecture

## Contract Map

```text
USDC
  |
  +-- VaultFactory
  |     +-- MonthlyVaultUpgradeable (UUPS proxy per semi-liquid product)
  |     +-- LongTermVault (fixed-income tranche vault)
  |
  +-- DealVaultFactory
  |     +-- DealVault[] (isolated ERC-1155 deal vaults)
  |
  +-- Marketplace (escrows DealVault ERC-1155 shares, settles in USDC)
  |
  +-- YieldRouter / Treasury
  |
  +-- NAVOracle / operators
```

## Modules

- `MonthlyVaultUpgradeable`: NAV-priced share vault with strategy allocation, liquidity buffer, withdrawal requests, monthly free window, and outside-window penalty redistribution.
- `LongTermVault`: deterministic fixed-income positions per duration bucket: 1 year, 2 years, and 3 years. APY is fixed at deposit time and yield is claimable in monthly increments.
- `DealVault`: one isolated private-market deal per contract. Investors receive ERC-1155 shares, and revenue is distributed by accumulated revenue per share.
- `Marketplace`: pure orderbook escrow. Sellers lock ERC-1155 deal shares, buyers fill partially or fully using USDC.
- `VaultFactory` and `DealVaultFactory`: controlled creation surfaces for scaling products without mixing accounting.
- `YieldRouter`: auditable routing surface for RWA yield, penalties, and fees.
- `NAVOracle`: operator-fed NAV reporting surface for hybrid/offchain valuation.

## Storage Layout Notes

- Monthly vault share balances and pending withdrawal requests are separate, which prevents a user from requesting a withdrawal and transferring/withdrawing the same shares twice.
- Deal revenue uses `accRevenuePerShare` and per-user `rewardDebt`, so yield rights follow ERC-1155 ownership transfers.
- Long-term vault positions snapshot `principal`, `duration`, `apyBps`, `start`, `maturity`, and `lastClaim`, preventing dilution across tranches.
- Marketplace listings store remaining escrowed amount, not just the original amount, enabling partial fills while preventing phantom listings.

## Interaction Flows

1. Monthly deposit: user transfers USDC, receives shares, vault allocates excess idle funds to configured strategies.
2. Monthly withdrawal: user requests shares, later executes; if outside the configured window, penalty remains in the vault and benefits remaining shareholders through NAV/share price.
3. Fixed income: user deposits into a duration bucket, claims deterministic monthly yield, and redeems principal at maturity.
4. Deal investment: operator creates a deal, investors buy ERC-1155 shares, operator distributes realized revenue, holders claim pro-rata yield.
5. Secondary sale: seller escrows shares in `Marketplace`, buyer pays USDC, settlement atomically transfers USDC to seller and shares to buyer.

## Offchain Components

- NAV operator/oracle: signs or submits updated RWA valuations from custodians, administrators, and bank/cash-flow statements.
- Indexer: tracks deposits, claims, deal orderbooks, revenue distributions, and performance analytics.
- Compliance service: optional allowlist/KYC hooks can be added at deposit, transfer, and listing boundaries.
- Operations console: manages strategy weights, NAV updates, deal creation, and revenue routing.

## Gas Considerations

- Avoid unbounded loops in user-facing paths as the strategy/deal counts grow; production deployments should cap active strategies or use paginated allocation.
- Deal revenue uses accumulator accounting instead of iterating through holders.
- Marketplace stores listing IDs by deal for indexing convenience; production orderbook depth should primarily be served by offchain indexing.
- Fixed-income positions are append-only per user; UI/indexers should query events rather than large onchain arrays for analytics.
