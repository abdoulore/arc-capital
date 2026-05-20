import { parseAbi, type Address } from "viem";
import { ARC_USDC_ADDRESS, ZERO_ADDRESS } from "@/lib/network";

const PUBLIC_ADDRESSES: Record<string, string | undefined> = {
  NEXT_PUBLIC_VAULT_ADDRESS: process.env.NEXT_PUBLIC_VAULT_ADDRESS,
  NEXT_PUBLIC_USDC_ADDRESS: process.env.NEXT_PUBLIC_USDC_ADDRESS,
  NEXT_PUBLIC_LONG_TERM_VAULT_ADDRESS: process.env.NEXT_PUBLIC_LONG_TERM_VAULT_ADDRESS,
  NEXT_PUBLIC_VAULT_FACTORY_ADDRESS: process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS,
  NEXT_PUBLIC_DEAL_FACTORY_ADDRESS: process.env.NEXT_PUBLIC_DEAL_FACTORY_ADDRESS,
  NEXT_PUBLIC_SAMPLE_DEAL_ADDRESS: process.env.NEXT_PUBLIC_SAMPLE_DEAL_ADDRESS,
  NEXT_PUBLIC_MARKETPLACE_ADDRESS: process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS,
  NEXT_PUBLIC_YIELD_ROUTER_ADDRESS: process.env.NEXT_PUBLIC_YIELD_ROUTER_ADDRESS,
  NEXT_PUBLIC_NAV_ORACLE_ADDRESS: process.env.NEXT_PUBLIC_NAV_ORACLE_ADDRESS,
  NEXT_PUBLIC_MONTHLY_VAULT_V2_ADDRESS: process.env.NEXT_PUBLIC_MONTHLY_VAULT_V2_ADDRESS,
  NEXT_PUBLIC_LONG_TERM_VAULT_V2_ADDRESS: process.env.NEXT_PUBLIC_LONG_TERM_VAULT_V2_ADDRESS,
  NEXT_PUBLIC_DEAL_FACTORY_V2_ADDRESS: process.env.NEXT_PUBLIC_DEAL_FACTORY_V2_ADDRESS,
  NEXT_PUBLIC_MARKETPLACE_V2_ADDRESS: process.env.NEXT_PUBLIC_MARKETPLACE_V2_ADDRESS,
};

export const VAULT_ADDRESS = publicAddress("NEXT_PUBLIC_VAULT_ADDRESS");
export const USDC_ADDRESS = publicAddress("NEXT_PUBLIC_USDC_ADDRESS", ARC_USDC_ADDRESS);
export const LONG_TERM_VAULT_ADDRESS = publicAddress("NEXT_PUBLIC_LONG_TERM_VAULT_ADDRESS");
export const VAULT_FACTORY_ADDRESS = publicAddress("NEXT_PUBLIC_VAULT_FACTORY_ADDRESS");
export const DEAL_FACTORY_ADDRESS = publicAddress("NEXT_PUBLIC_DEAL_FACTORY_ADDRESS");
export const SAMPLE_DEAL_ADDRESS = publicAddress("NEXT_PUBLIC_SAMPLE_DEAL_ADDRESS");
export const MARKETPLACE_ADDRESS = publicAddress("NEXT_PUBLIC_MARKETPLACE_ADDRESS");
export const YIELD_ROUTER_ADDRESS = publicAddress("NEXT_PUBLIC_YIELD_ROUTER_ADDRESS");
export const NAV_ORACLE_ADDRESS = publicAddress("NEXT_PUBLIC_NAV_ORACLE_ADDRESS");
export const MONTHLY_VAULT_V2_ADDRESS = publicAddress("NEXT_PUBLIC_MONTHLY_VAULT_V2_ADDRESS", VAULT_ADDRESS);
export const LONG_TERM_VAULT_V2_ADDRESS = publicAddress("NEXT_PUBLIC_LONG_TERM_VAULT_V2_ADDRESS", LONG_TERM_VAULT_ADDRESS);
export const DEAL_FACTORY_V2_ADDRESS = publicAddress("NEXT_PUBLIC_DEAL_FACTORY_V2_ADDRESS", DEAL_FACTORY_ADDRESS);
export const MARKETPLACE_V2_ADDRESS = publicAddress("NEXT_PUBLIC_MARKETPLACE_V2_ADDRESS", MARKETPLACE_ADDRESS);

function publicAddress(name: string, fallback: Address = ZERO_ADDRESS) {
  const value = PUBLIC_ADDRESSES[name]?.trim();
  return (value && value.startsWith("0x") ? value : fallback) as Address;
}

// ✅ COMPLETE VAULT ABI (aligned with your latest contract)
export const VAULT_ABI = parseAbi([
  // ---------- core ----------
  "function deposit(uint256 amount)",
  "function withdraw(uint256 shareAmount)",
  "function requestWithdraw(uint256 shareAmount)",
  "function executeWithdraw()",
  "function withdrawRequests(address user) view returns (uint256 shares,uint256 requestTime)",
  "function applyPenalty(uint256 amount) view returns (uint256)",

  // ---------- NAV ----------
  "function totalAssets() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function pricePerShare() view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function convertToShares(uint256 assets) view returns (uint256)",
  "function shares(address user) view returns (uint256)",

  // ---------- strategy ----------
  "function strategy() view returns (address)",
  "function deployToStrategy(uint256 amount)",
  "function withdrawFromStrategy(uint256 amount)",

  // ---------- config ----------
  "function managementFee() view returns (uint256)",
  "function performanceFee() view returns (uint256)",
  "function maxWithdrawBps() view returns (uint256)",

  "function idleBufferBps() view returns (uint256)",
  "function setIdleBuffer(uint256)",
  "function setPenalty(uint256)",
  "function setWithdrawLimit(uint256)",
  "function setWithdrawalWindow(uint256,uint256)",
  "function updateNAV(uint256)",
  "function penaltyBps() view returns (uint256)",
  "function withdrawalWindowStart() view returns (uint256)",
  "function withdrawalWindowDuration() view returns (uint256)",

  // ---------- events ----------
  "event Deposit(address indexed user, uint256 amount, uint256 shares)",
  "event Withdraw(address indexed user, uint256 amount)",
  "event FeesAccrued(uint256 mgmt, uint256 perf)"
]);

// ✅ USDC ABI (fully safe for frontend usage)
export const USDC_ABI = parseAbi([
  "function approve(address spender, uint256 amount)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function mint(address to, uint256 amount)",
  "function transfer(address to, uint256 amount)"
]);

export const LONG_TERM_VAULT_ABI = parseAbi([
  "function deposit(uint256 amount, uint256 duration) returns (uint256 positionId)",
  "function claimYield(uint256 positionId) returns (uint256 amount)",
  "function redeemAtMaturity(uint256 positionId)",
  "function earlyExit(uint256 positionId)",
  "function claimableYield(uint256 positionId) view returns (uint256)",
  "function configureTranche(uint256 duration, uint256 apyBps, bool enabled)",
  "function setTreasury(address treasury)",
  "function positions(uint256 positionId) view returns (address owner,uint256 principal,uint256 duration,uint256 apyBps,uint256 start,uint256 maturity,uint256 lastClaim,bool redeemed)",
  "function getUserPositions(address user) view returns (uint256[])",
  "function tranches(uint256 duration) view returns (uint256 duration,uint256 apyBps,bool enabled)"
]);

export const MONTHLY_VAULT_V2_ABI = parseAbi([
  "function deposit(uint256 assets) returns (uint256 sharesOut)",
  "function requestWithdraw(uint256 shareAmount) returns (uint256 requestId)",
  "function executeWithdraw() returns (uint256 netAssets)",
  "function cancelWithdrawRequest()",
  "function injectYield(uint256 amount)",
  "function updateNAV(uint256 nav)",
  "function configureWithdrawalWindow(uint256 start,uint256 duration)",
  "function configurePenalty(uint256 penaltyBps)",
  "function configureLiquidityReserve(uint256 reserveBps)",
  "function configureMaxWithdraw(uint256 maxWithdrawBps)",
  "function pauseDeposits(bool paused)",
  "function pauseWithdrawals(bool paused)",
  "function totalAssets() view returns (uint256)",
  "function totalInvestorCapital() view returns (uint256)",
  "function totalRoutedYield() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function shares(address user) view returns (uint256)",
  "function pricePerShare() view returns (uint256)",
  "function previewDeposit(uint256 assets) view returns (uint256 sharesOut)",
  "function previewWithdraw(uint256 shares) view returns (uint256 grossAssets,uint256 penalty,uint256 netAssets)",
  "function isWithdrawalWindowOpen() view returns (bool)",
]);

export const LONG_TERM_VAULT_V2_ABI = parseAbi([
  "function deposit(uint256 amount,uint256 duration) returns (uint256 positionId)",
  "function claimYield(uint256 positionId) returns (uint256 amount)",
  "function redeemAtMaturity(uint256 positionId)",
  "function earlyExit(uint256 positionId)",
  "function claimableYield(uint256 positionId) view returns (uint256)",
  "function previewEarlyExit(uint256 positionId) view returns (uint256 returnedPrincipal,uint256 penalty)",
  "function tranche(uint256 duration) view returns (uint256 apyBps,bool enabled)",
  "function getUserPositions(address user) view returns (uint256[])",
  "function positions(uint256 positionId) view returns (address owner,uint256 principal,uint256 duration,uint256 apyBps,uint256 start,uint256 maturity,uint256 lastClaim,bool redeemed)",
  "function configureTranche(uint256 duration,uint256 apyBps,bool enabled)",
  "function configureEarlyExitPenalty(uint256 penaltyBps)",
  "function pauseDeposits(bool paused)",
]);

export const DEAL_FACTORY_ABI = parseAbi([
  "function allDeals(uint256 index) view returns (address)",
  "function dealCount() view returns (uint256)",
  "function createDeal(string dealName,string uri,uint256 targetRaise,uint256 minRaise,uint256 pricePerShare,uint256 closeTime) returns (address dealVault)"
]);

export const DEAL_FACTORY_V2_ABI = parseAbi([
  "function allDeals(uint256 index) view returns (address)",
  "function dealById(uint256 dealId) view returns (address)",
  "function dealCount() view returns (uint256)",
  "function createDeal(string dealName,string metadataId,string uri,uint256 targetRaise,uint256 minRaise,uint256 pricePerShare,uint256 closeTime) returns (address dealVault)",
]);

export const DEAL_VAULT_ABI = parseAbi([
  "function invest(uint256 amount)",
  "function claimYield() returns (uint256 amount)",
  "function closeRaise()",
  "function adminCloseRaise()",
  "function markCapitalDeployed()",
  "function distributeRevenue(uint256 amount)",
  "function pendingYield(address user) view returns (uint256)",
  "function getShareBalance(address user) view returns (uint256)",
  "function totalRaised() view returns (uint256)",
  "function targetRaise() view returns (uint256)",
  "function minRaise() view returns (uint256)",
  "function closeTime() view returns (uint256)",
  "function pricePerShare() view returns (uint256)",
  "function raiseClosed() view returns (bool)",
  "function capitalDeployed() view returns (bool)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function setApprovalForAll(address operator, bool approved)",
  "function isApprovedForAll(address account, address operator) view returns (bool)"
]);

export const DEAL_VAULT_V2_ABI = parseAbi([
  "function dealId() view returns (uint256)",
  "function metadataId() view returns (string)",
  "function invest(uint256 amount)",
  "function claimYield() returns (uint256 amount)",
  "function closeRaise()",
  "function adminCloseRaise()",
  "function markCapitalDeployed()",
  "function distributeRevenue(uint256 amount)",
  "function pendingYield(address user) view returns (uint256)",
  "function getShareBalance(address user) view returns (uint256)",
  "function previewInvestment(uint256 assets) view returns (uint256 shares)",
  "function dealStatus() view returns (uint8)",
  "function totalRaised() view returns (uint256)",
  "function targetRaise() view returns (uint256)",
  "function minRaise() view returns (uint256)",
  "function closeTime() view returns (uint256)",
  "function pricePerShare() view returns (uint256)",
  "function balanceOf(address account,uint256 id) view returns (uint256)",
  "function setApprovalForAll(address operator,bool approved)",
  "function isApprovedForAll(address account,address operator) view returns (bool)",
]);

export const MARKETPLACE_ABI = parseAbi([
  "function nextListingId() view returns (uint256)",
  "function createListing(address token, uint256 dealId, uint256 amount, uint256 pricePerShare) returns (uint256 listingId)",
  "function cancelListing(uint256 listingId)",
  "function fillListing(uint256 listingId, uint256 amount)",
  "function getOrderbook(uint256 dealId) view returns (uint256[])",
  "function listings(uint256 listingId) view returns (address seller,address token,uint256 dealId,uint256 amountRemaining,uint256 pricePerShare,bool active)"
]);

export const MARKETPLACE_V2_ABI = parseAbi([
  "function nextListingId() view returns (uint256)",
  "function createListing(address token,uint256 dealId,uint256 amount,uint256 pricePerShare) returns (uint256 listingId)",
  "function cancelListing(uint256 listingId)",
  "function fillListing(uint256 listingId,uint256 amount)",
  "function getOrderbook(uint256 dealId) view returns (uint256[])",
  "function getSellerListings(address seller) view returns (uint256[])",
  "function listings(uint256 listingId) view returns (address seller,address token,uint256 dealId,uint256 amountRemaining,uint256 pricePerShare,bool active)",
  "function pauseMarketplace(bool paused)",
]);

export const YIELD_ROUTER_ABI = parseAbi([
  "function routeYield(address destination,uint256 amount,string yieldType)",
  "function collectFee(uint256 amount,string yieldType)",
  "function treasury() view returns (address)"
]);

export const NAV_ORACLE_ABI = parseAbi([
  "function updateNAV(address vault,uint256 nav)",
  "function latestNAV(address vault) view returns (uint256 nav,uint256 timestamp)"
]);
