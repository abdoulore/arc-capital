require("dotenv").config({ path: "./.env" });

const { ethers } = require("ethers");
const cron = require("node-cron");

// ---------- ENV CHECK ----------
console.log("ENV CHECK:");
console.log("RPC_URL:", process.env.RPC_URL);
console.log("PRIVATE_KEY:", process.env.PRIVATE_KEY ? "loaded" : "missing");
console.log("VAULT_ADDRESS:", process.env.VAULT_ADDRESS);

if (!process.env.RPC_URL) throw new Error("Missing RPC_URL");
if (!process.env.PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
if (!process.env.VAULT_ADDRESS) throw new Error("Missing VAULT_ADDRESS");

// ---------- CONFIG ----------
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const VAULT_ADDRESS = process.env.VAULT_ADDRESS;

// ---------- PROVIDER ----------
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

console.log("ORACLE SIGNER:", wallet.address);

// ---------- ABI (UPDATED) ----------
const VAULT_ABI = [
  "function updateOracleAssetsSigned(uint256 index,uint256 assets,uint256 timestamp,bytes signature)"
];

// ---------- CONTRACT ----------
const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);

// ---------- STATE ----------
let nonce;
let running = false;

// ---------- MOCK DATA ----------
async function fetchRwaYield(index) {
  const base = 1_000_000 * 1e6;
  const growth = Math.floor(Math.random() * 5000 * 1e6);
  return base + growth;
}

// ---------- SIGN FUNCTION ----------
async function signData(index, assets, timestamp) {
  const message = ethers.solidityPackedKeccak256(
    ["uint256", "uint256", "uint256", "address"],
    [index, assets, timestamp, VAULT_ADDRESS]
  );

  const signature = await wallet.signMessage(
    ethers.getBytes(message)
  );

  return signature;
}

// ---------- UPDATE ----------
async function updateStrategy(index) {
  try {
    const assets = await fetchRwaYield(index);
    const timestamp = Math.floor(Date.now() / 1000);

    const signature = await signData(index, assets, timestamp);

    console.log(`Updating strategy ${index} → ${assets}`);

    const tx = await vault.updateOracleAssetsSigned(
      index,
      assets,
      timestamp,
      signature,
      { nonce: nonce }
    );

    nonce++;

    await tx.wait();

    console.log(`✅ Updated strategy ${index}`);

    await new Promise((r) => setTimeout(r, 300));

  } catch (err) {
    console.error(`❌ Error updating strategy ${index}`, err);
  }
}

// ---------- LOOP ----------
async function runOracle() {
  if (running) {
    console.log("⏳ Skipping — previous run still executing");
    return;
  }

  running = true;

  try {
    console.log("🔄 Oracle tick...");

    nonce = await wallet.getNonce("latest");

    const STRATEGY_COUNT = 2;

    for (let i = 0; i < STRATEGY_COUNT; i++) {
      await updateStrategy(i);
    }

    console.log("✅ Done\n");
  } catch (err) {
    console.error("❌ Oracle loop error", err);
  }

  running = false;
}

// ---------- CRON ----------
cron.schedule("*/30 * * * * *", async () => {
  await runOracle();
});

// ---------- START ----------
console.log("🚀 Oracle started...");
runOracle();