// src/vault.js

import { ethers } from "ethers";
import { VAULT_ADDRESS, VAULT_ABI, USDC_ADDRESS, ERC20_ABI } from "./config";

export async function getContracts() {
  if (!window.ethereum) throw new Error("No wallet");

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);
  const token = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

  return { provider, signer, vault, token };
}