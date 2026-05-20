import { arcCapitalContracts, isConfiguredAddress, type ArcCapitalContractName } from "./contracts";
import { serverEnv } from "./env";
import { getV2EventSources } from "./v2-event-adapters";
import { getV2BackendStatus } from "./v2-store";

const REQUIRED_V2_CONTRACTS: Array<{ key: ArcCapitalContractName; label: string }> = [
  { key: "usdc", label: "Arc USDC" },
  { key: "monthlyVaultV2", label: "Monthly Vault V2" },
  { key: "longTermVaultV2", label: "Long-Term Vault V2" },
  { key: "dealFactoryV2", label: "Deal Factory V2" },
  { key: "marketplaceV2", label: "Marketplace V2" },
];

export async function getV2Health() {
  const database = await getV2BackendStatus();
  const contracts = REQUIRED_V2_CONTRACTS.map((contract) => {
    const address = arcCapitalContracts[contract.key];
    return {
      key: contract.key,
      label: contract.label,
      configured: isConfiguredAddress(address),
      address: isConfiguredAddress(address) ? address : null,
    };
  });
  const missingContracts = contracts.filter((contract) => !contract.configured).map((contract) => contract.key);
  const eventSources = getV2EventSources();

  return {
    status: database.database === "connected" && missingContracts.length === 0 ? "ready" : "action_required",
    database,
    contracts,
    indexer: {
      webhookSecretConfigured: Boolean(process.env.INDEXER_WEBHOOK_SECRET),
      ingestUrlConfigured: Boolean(process.env.V2_INDEXER_INGEST_URL),
      circleWebhookPath: "/api/v2/indexer/circle",
      normalizedEventSourceCount: eventSources.length,
    },
    circle: {
      apiKeyConfigured: Boolean(serverEnv.circleApiKey),
      entitySecretConfigured: Boolean(serverEnv.circleEntitySecret),
    },
    admin: {
      adminWalletCount: serverEnv.adminWallets.length,
    },
    notes: [
      "Secrets are intentionally not returned by this endpoint.",
      "Circle event monitors should post to /api/v2/indexer/circle with x-indexer-secret when configured.",
    ],
  };
}
