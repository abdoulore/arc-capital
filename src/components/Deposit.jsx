// src/components/Deposit.jsx

import { useState } from "react";
import { getContracts } from "../vault";
import { ethers } from "ethers";

export default function Deposit() {
  const [amount, setAmount] = useState("");

  const handleDeposit = async () => {
    const { vault, token } = await getContracts();

    const decimals = await token.decimals();
    const parsed = ethers.parseUnits(amount, decimals);

    // approve first
    const tx1 = await token.approve(vault.target, parsed);
    await tx1.wait();

    // deposit
    const tx2 = await vault.deposit(parsed);
    await tx2.wait();

    alert("Deposit successful");
  };

  return (
    <div>
      <h3>Deposit</h3>
      <input
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button onClick={handleDeposit}>Deposit</button>
    </div>
  );
}