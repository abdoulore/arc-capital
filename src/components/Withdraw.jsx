// src/components/Withdraw.jsx

import { useState } from "react";
import { getContracts } from "../vault";
import { ethers } from "ethers";

export default function Withdraw() {
  const [shares, setShares] = useState("");

  const handleWithdraw = async () => {
    const { vault } = await getContracts();

    const parsed = ethers.parseUnits(shares, 18);

    const tx = await vault.withdraw(parsed);
    await tx.wait();

    alert("Withdraw successful");
  };

  return (
    <div>
      <h3>Withdraw</h3>
      <input
        placeholder="Shares"
        value={shares}
        onChange={(e) => setShares(e.target.value)}
      />
      <button onClick={handleWithdraw}>Withdraw</button>
    </div>
  );
}