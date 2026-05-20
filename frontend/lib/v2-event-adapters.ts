import { decodeEventLog, parseAbiItem, type Address, type Hex, type Log } from "viem";
import { arcCapitalContracts, isConfiguredAddress } from "./contracts";
import { type V2IndexedEventInput } from "./v2-store";
import { ARC_TESTNET_CHAIN_ID } from "./arc";

const USDC_DECIMAL_SCALE = BigInt(1_000_000);

const EVENT_DEFINITIONS = [
  {
    source: "monthlyVault",
    address: arcCapitalContracts.monthlyVault,
    abiItem: parseAbiItem("event Deposit(address indexed user, uint256 amount, uint256 shares)"),
  },
  {
    source: "monthlyVault",
    address: arcCapitalContracts.monthlyVault,
    abiItem: parseAbiItem("event Withdraw(address indexed user, uint256 amount)"),
  },
  {
    source: "monthlyVault",
    address: arcCapitalContracts.monthlyVault,
    abiItem: parseAbiItem("event WithdrawRequested(address indexed user, uint256 shares)"),
  },
  {
    source: "longTermVault",
    address: arcCapitalContracts.longTermVault,
    abiItem: parseAbiItem("event Deposited(address indexed user, uint256 indexed positionId, uint256 amount, uint256 duration, uint256 apyBps)"),
  },
  {
    source: "longTermVault",
    address: arcCapitalContracts.longTermVault,
    abiItem: parseAbiItem("event YieldClaimed(address indexed user, uint256 indexed positionId, uint256 amount)"),
  },
  {
    source: "longTermVault",
    address: arcCapitalContracts.longTermVault,
    abiItem: parseAbiItem("event Redeemed(address indexed user, uint256 indexed positionId, uint256 principal)"),
  },
  {
    source: "longTermVault",
    address: arcCapitalContracts.longTermVault,
    abiItem: parseAbiItem("event EarlyExited(address indexed user, uint256 indexed positionId, uint256 returnedPrincipal, uint256 penalty)"),
  },
  {
    source: "dealVault",
    address: undefined,
    abiItem: parseAbiItem("event Invested(address indexed investor, uint256 assets, uint256 shares)"),
  },
  {
    source: "dealVault",
    address: undefined,
    abiItem: parseAbiItem("event RevenueDistributed(address indexed source, uint256 amount)"),
  },
  {
    source: "dealVault",
    address: undefined,
    abiItem: parseAbiItem("event YieldClaimed(address indexed investor, uint256 amount)"),
  },
  {
    source: "dealVault",
    address: undefined,
    abiItem: parseAbiItem("event RaiseClosed()"),
  },
  {
    source: "marketplace",
    address: arcCapitalContracts.marketplace,
    abiItem: parseAbiItem("event ListingCreated(uint256 indexed listingId, address indexed seller, address indexed token, uint256 dealId, uint256 amount, uint256 pricePerShare)"),
  },
  {
    source: "marketplace",
    address: arcCapitalContracts.marketplace,
    abiItem: parseAbiItem("event ListingFilled(uint256 indexed listingId, address indexed buyer, uint256 amount, uint256 totalPrice)"),
  },
  {
    source: "marketplace",
    address: arcCapitalContracts.marketplace,
    abiItem: parseAbiItem("event ListingCancelled(uint256 indexed listingId)"),
  },
] as const;

export type V2EventSource = (typeof EVENT_DEFINITIONS)[number];

export type CircleContractEventWebhook = {
  notificationType?: string;
  notification?: {
    contractAddress?: string;
    blockchain?: string;
    txHash?: string;
    transactionHash?: string;
    eventName?: string;
    eventSignature?: string;
    topics?: Hex[];
    data?: Hex;
    logIndex?: number | string;
    blockNumber?: number | string;
    blockTimestamp?: string;
    args?: Record<string, unknown>;
  };
  timestamp?: string;
  version?: number;
};

export function getV2EventSources() {
  return EVENT_DEFINITIONS.filter((definition) => !definition.address || isConfiguredAddress(definition.address));
}

export function normalizeArcLog(log: Log, blockTimestamp?: string): V2IndexedEventInput | undefined {
  if (!log.transactionHash || log.logIndex === null) return undefined;
  for (const definition of getV2EventSources()) {
    if (definition.address && log.address.toLowerCase() !== definition.address.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: [definition.abiItem],
        data: log.data,
        topics: log.topics,
      });
      return {
        chainId: ARC_TESTNET_CHAIN_ID,
        contractAddress: log.address,
        eventName: decoded.eventName,
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber?.toString() ?? "0",
        blockTimestamp,
        actorWallet: inferActor(decoded.args),
        payload: normalizePayload(decoded.args, definition.source),
      };
    } catch {
      continue;
    }
  }

  return undefined;
}

export function normalizeCircleWebhook(body: CircleContractEventWebhook): V2IndexedEventInput[] {
  const notification = body.notification;
  if (!notification?.contractAddress) return [];
  const contractAddress = notification.contractAddress as Address;
  const txHash = (notification.txHash ?? notification.transactionHash) as Hex | undefined;
  if (!txHash) return [];

  const definition = findDefinitionForCircleEvent(contractAddress, notification.eventName ?? notification.eventSignature);
  const base = {
    chainId: ARC_TESTNET_CHAIN_ID,
    contractAddress,
    txHash,
    logIndex: Number(notification.logIndex ?? 0),
    blockNumber: notification.blockNumber ?? "0",
    blockTimestamp: notification.blockTimestamp ?? body.timestamp,
  };

  if (notification.args) {
    return [
      {
        ...base,
        eventName: cleanCircleEventName(notification.eventName ?? notification.eventSignature ?? "Unknown"),
        actorWallet: inferActor(notification.args),
        payload: normalizePayload(notification.args, definition?.source),
      },
    ];
  }

  if (!definition || !notification.topics || !notification.data) {
    return [
      {
        ...base,
        eventName: cleanCircleEventName(notification.eventName ?? notification.eventSignature ?? "Unknown"),
        payload: { rawTopics: notification.topics ?? [], rawData: notification.data ?? "0x" },
      },
    ];
  }

  const decoded = decodeEventLog({
    abi: [definition.abiItem],
    data: notification.data,
    topics: notification.topics as [Hex, ...Hex[]],
  });

  return [
    {
      ...base,
      eventName: decoded.eventName,
      actorWallet: inferActor(decoded.args),
      payload: normalizePayload(decoded.args, definition.source),
    },
  ];
}

export function eventSignatureForSource(source: V2EventSource) {
  const inputTypes = "inputs" in source.abiItem ? source.abiItem.inputs.map((input) => input.type).join(",") : "";
  return `${source.abiItem.name}(${inputTypes})`;
}

function findDefinitionForCircleEvent(contractAddress: string, eventNameOrSignature?: string) {
  const cleanName = cleanCircleEventName(eventNameOrSignature ?? "");
  return getV2EventSources().find((definition) => {
    const addressMatches = !definition.address || definition.address.toLowerCase() === contractAddress.toLowerCase();
    return addressMatches && definition.abiItem.name === cleanName;
  });
}

function cleanCircleEventName(eventNameOrSignature: string) {
  return eventNameOrSignature.split("(")[0] || eventNameOrSignature;
}

function inferActor(args: unknown) {
  if (!args || typeof args !== "object") return undefined;
  const record = args as Record<string, unknown>;
  return stringValue(record.user ?? record.investor ?? record.seller ?? record.buyer ?? record.source);
}

function normalizePayload(args: unknown, source?: string) {
  const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries({
      ...record,
      source,
      amountUsdc: decimalFromRaw(record.amount ?? record.assets ?? record.principal ?? record.totalPrice ?? record.returnedPrincipal),
    }).map(([key, value]) => [key, serializeValue(value)]),
  );
}

function decimalFromRaw(value: unknown) {
  if (typeof value !== "bigint") return undefined;
  const whole = value / USDC_DECIMAL_SCALE;
  const fraction = value % USDC_DECIMAL_SCALE;
  return `${whole.toString()}.${fraction.toString().padStart(6, "0")}`;
}

function serializeValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serializeValue(nested)]));
  }
  return value;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
