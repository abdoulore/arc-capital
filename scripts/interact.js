const hre = require("hardhat");

async function main() {
    const [user] = await hre.ethers.getSigners();

    console.log("Using account:", user.address);

    // DEPLOYED ADDRESSES
    const USDC_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const VAULT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

    console.log("USDC address:", USDC_ADDRESS);
    console.log("Vault address:", VAULT_ADDRESS);

    const usdc = await hre.ethers.getContractAt("MockUSDC", USDC_ADDRESS);
    const vault = await hre.ethers.getContractAt("MonthlyVault", VAULT_ADDRESS);

    // STEP 1 — Check initial balance
    let balance = await usdc.balanceOf(user.address);
    console.log("USDC balance:", balance.toString());

    // STEP 2 — Approve vault
    console.log("Approving vault...");
    const approveTx = await usdc.approve(VAULT_ADDRESS, 1000n);
    await approveTx.wait();

    // STEP 3 — Deposit
    console.log("Depositing...");
    const depositTx = await vault.deposit(1000n);
    await depositTx.wait();

    let vaultBalance = await vault.balances(user.address);
    console.log("Vault balance:", vaultBalance.toString());

    // simulate time passing (ONLY works on local network)
    await hre.network.provider.send("evm_increaseTime", [10 * 24 * 60 * 60]);
    await hre.network.provider.send("evm_mine");

    // STEP 4 — Withdraw
    console.log("Withdrawing...");
    const withdrawTx = await vault.withdraw(1000n);
    await withdrawTx.wait();

    balance = await usdc.balanceOf(user.address);
    console.log("Final USDC balance:", balance.toString());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});