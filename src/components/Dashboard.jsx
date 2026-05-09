// src/components/Dashboard.jsx

import { useEffect, useState } from "react";
import { getContracts } from "../vault";
import { ethers } from "ethers";

export default function Dashboard() {
  const [data, setData] = useState({});

  async function load() {
    const { vault, signer } = await getContracts();

    const address = await signer.getAddress();

    const totalAssets = await vault.totalAssets();
    const totalShares = await vault.totalShares();
    const price = await vault.pricePerShare();
    const userShares = await vault.shares(address);

    setData({
      totalAssets: ethers.formatUnits(totalAssets, 6),
      totalShares: ethers.formatUnits(totalShares, 18),
      price: ethers.formatUnits(price, 18),
      userShares: ethers.formatUnits(userShares, 18)
    });
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h3>Vault Dashboard</h3>
      <p>Total Assets: {data.totalAssets}</p>
      <p>Total Shares: {data.totalShares}</p>
      <p>Price Per Share: {data.price}</p>
      <p>Your Shares: {data.userShares}</p>
    </div>
  );
}