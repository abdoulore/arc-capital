# Arc Capital V2 Contract And Event Specification

This document defines the contract surface V2 needs before Solidity changes begin. The indexer, API, admin console, and portfolio pages should be designed around these events.

## Global Rules

- All settlement uses ERC-20 USDC with 6 decimals.
- Events must include enough data to update PostgreSQL without extra RPC reads.
- Every user-facing financial state transition must emit a lifecycle event.
- Events should include the actor wallet, key amounts, and stable IDs.
- Admin/operator actions must emit the operator wallet.
- Deal and listing routes must use stable IDs, never array indexes alone.
- Contracts should not emit fake APY or calculated analytics. Backend calculates analytics from indexed facts.

## Monthly Vault V2

### State Needed

- `asset`
- `totalShares`
- `shares[user]`
- `investorCapital`
- `routedYield`
- `reportedNAV`
- `reportedNAVTime`
- `withdrawalWindowStart`
- `withdrawalWindowDuration`
- `penaltyBps`
- `liquidityReserveBps`
- `maxWithdrawBps`
- `pausedDeposits`
- `pausedWithdrawals`

### Required Reads

```solidity
function totalAssets() external view returns (uint256);
function totalInvestorCapital() external view returns (uint256);
function totalRoutedYield() external view returns (uint256);
function totalShares() external view returns (uint256);
function shares(address user) external view returns (uint256);
function pricePerShare() external view returns (uint256);
function previewDeposit(uint256 assets) external view returns (uint256 sharesOut);
function previewWithdraw(uint256 shares) external view returns (uint256 grossAssets, uint256 penalty, uint256 netAssets);
function isWithdrawalWindowOpen() external view returns (bool);
```

### Required Writes

```solidity
function deposit(uint256 assets) external returns (uint256 sharesOut);
function requestWithdraw(uint256 shares) external returns (uint256 requestId);
function executeWithdraw() external returns (uint256 netAssets);
function cancelWithdrawRequest() external;
function injectYield(uint256 amount) external;
function updateNAV(uint256 nav) external;
function configureWithdrawalWindow(uint256 start, uint256 duration) external;
function configurePenalty(uint256 penaltyBps) external;
function configureLiquidityReserve(uint256 reserveBps) external;
function pauseDeposits(bool paused) external;
function pauseWithdrawals(bool paused) external;
```

### Required Events

```solidity
event MonthlyDeposit(
    address indexed user,
    uint256 assets,
    uint256 shares,
    uint256 pricePerShareAfter
);

event MonthlyWithdrawRequested(
    address indexed user,
    uint256 indexed requestId,
    uint256 shares,
    uint256 grossAssets,
    uint256 requestTime
);

event MonthlyWithdrawExecuted(
    address indexed user,
    uint256 indexed requestId,
    uint256 shares,
    uint256 grossAssets,
    uint256 penalty,
    uint256 netAssets,
    bool inWindow
);

event MonthlyWithdrawCancelled(
    address indexed user,
    uint256 indexed requestId,
    uint256 shares
);

event MonthlyYieldInjected(
    address indexed operator,
    uint256 amount,
    uint256 routedYieldAfter,
    uint256 navAfter
);

event MonthlyNAVUpdated(
    address indexed operator,
    uint256 nav,
    uint256 timestamp
);

event MonthlyConfigUpdated(
    address indexed operator,
    string key,
    uint256 value
);
```

### V1 Gap

Current `Deposit` works for basic indexing. Current `Withdraw` only emits user and net amount, so the indexer cannot reliably know shares burned, gross amount, penalty, or whether the window was open.

## Long-Term Fixed Income V2

### State Needed

- Tranche configs by duration.
- Position records by stable `positionId`.
- User position IDs.
- Treasury/reserve wallet.
- Early exit penalty configuration.

### Required Reads

```solidity
function getUserPositions(address user) external view returns (uint256[] memory);
function positions(uint256 positionId) external view returns (Position memory);
function claimableYield(uint256 positionId) external view returns (uint256);
function previewEarlyExit(uint256 positionId) external view returns (uint256 returnedPrincipal, uint256 penalty);
function tranche(uint256 duration) external view returns (uint256 apyBps, bool enabled);
```

### Required Events

```solidity
event FixedIncomePositionOpened(
    address indexed user,
    uint256 indexed positionId,
    uint256 principal,
    uint256 duration,
    uint256 apyBps,
    uint256 start,
    uint256 maturity
);

event FixedIncomeYieldClaimed(
    address indexed user,
    uint256 indexed positionId,
    uint256 amount,
    uint256 lastClaimAfter
);

event FixedIncomeRedeemed(
    address indexed user,
    uint256 indexed positionId,
    uint256 principal,
    uint256 yieldPaid
);

event FixedIncomeEarlyExited(
    address indexed user,
    uint256 indexed positionId,
    uint256 returnedPrincipal,
    uint256 penalty
);

event FixedIncomeTrancheConfigured(
    address indexed operator,
    uint256 duration,
    uint256 apyBps,
    bool enabled
);
```

### V1 Gap

Current events are close. `Deposited` should include `start` and `maturity`. `Redeemed` should include yield paid. `TrancheConfigured` should include the operator.

## Deal Factory V2

### State Needed

- Stable deal IDs.
- Deal vault address mapping.
- Admin/operator role.

### Required Event

```solidity
event DealCreated(
    uint256 indexed dealId,
    address indexed dealVault,
    address indexed operator,
    string metadataId,
    uint256 targetRaise,
    uint256 minRaise,
    uint256 pricePerShare,
    uint256 closeTime
);
```

### V1 Gap

Current `DealCreated` does not include operator, `minRaise`, `closeTime`, or backend metadata ID.

## Deal Vault V2

### State Needed

- Stable `dealId`
- `targetRaise`
- `minRaise`
- `pricePerShare`
- `closeTime`
- `totalRaised`
- `raiseClosed`
- `capitalDeployed`
- `accRevenuePerShare`
- revenue claim accounting

### Required Reads

```solidity
function dealId() external view returns (uint256);
function dealStatus() external view returns (uint8);
function getShareBalance(address user) external view returns (uint256);
function pendingYield(address user) external view returns (uint256);
function previewInvestment(uint256 assets) external view returns (uint256 shares);
```

### Required Events

```solidity
event DealInvestment(
    uint256 indexed dealId,
    address indexed investor,
    uint256 assets,
    uint256 shares,
    uint256 totalRaisedAfter
);

event DealRaiseClosed(
    uint256 indexed dealId,
    address indexed operator,
    uint256 totalRaised,
    uint256 closedAt
);

event DealCapitalDeployed(
    uint256 indexed dealId,
    address indexed operator,
    uint256 amount
);

event DealRevenueDistributed(
    uint256 indexed dealId,
    address indexed operator,
    uint256 amount,
    uint256 accRevenuePerShareAfter
);

event DealYieldClaimed(
    uint256 indexed dealId,
    address indexed investor,
    uint256 amount
);
```

### V1 Gap

Current `Invested` lacks deal ID and total raised after. `RaiseClosed` lacks operator and close timestamp. `RevenueDistributed` calls the operator `source`, which is less clear for admin audit trails.

## Marketplace V2

### State Needed

- Stable listing IDs.
- Seller, deal vault, deal ID, shares remaining, price per share, active status.
- Optional marketplace pause.

### Required Reads

```solidity
function listings(uint256 listingId) external view returns (Listing memory);
function getOrderbook(uint256 dealId) external view returns (uint256[] memory);
function getSellerListings(address seller) external view returns (uint256[] memory);
```

### Required Events

```solidity
event MarketplaceListingCreated(
    uint256 indexed listingId,
    uint256 indexed dealId,
    address indexed seller,
    address token,
    uint256 amount,
    uint256 pricePerShare
);

event MarketplaceListingFilled(
    uint256 indexed listingId,
    uint256 indexed dealId,
    address indexed buyer,
    address seller,
    uint256 amount,
    uint256 totalPrice,
    uint256 amountRemaining
);

event MarketplaceListingCancelled(
    uint256 indexed listingId,
    uint256 indexed dealId,
    address indexed seller,
    address token,
    uint256 returnedShares
);

event MarketplacePaused(address indexed operator, bool paused);
```

### V1 Gap

Current cancel event only includes listing ID. The indexer must perform an extra RPC read to know seller, token, deal ID, and returned shares. V2 should emit these directly.

## Yield Router V2

### Required Events

```solidity
event TreasuryYieldRouted(
    address indexed operator,
    address indexed destination,
    uint256 amount,
    string yieldType
);

event TreasuryUpdated(
    address indexed operator,
    address indexed treasury
);
```

### V1 Gap

Current `TreasuryUpdated` omits the operator. `YieldRouted` names the operator `source`.

## Event Naming

V2 should avoid overloaded event names where possible. For example:

- Use `MonthlyDeposit`, not generic `Deposit`.
- Use `FixedIncomeYieldClaimed`, not generic `YieldClaimed`.
- Use `DealYieldClaimed`, not generic `YieldClaimed`.

This makes Circle event monitors, ABI decoding, and indexer routing simpler and safer.

## Migration Notes

- V1 indexer adapters can continue supporting old event names during migration.
- V2 contracts should emit V2 event names.
- Backend should store both raw events and projected summary rows.
- Once V2 contracts are live, the frontend should read from V2 APIs only.
