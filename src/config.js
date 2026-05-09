// src/config.js

export const VAULT_ADDRESS = "0x9A676e781A523b5d0C0e43731313A708CB607508";
export const USDC_ADDRESS = "0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0";

export const VAULT_ABI = [
  "function deposit(uint256 amount)",
  "function withdraw(uint256 shares)",

  "function totalAssets() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function pricePerShare() view returns (uint256)",
  "function shares(address) view returns (uint256)"
];

export const ERC20_ABI = [
  "function approve(address spender,uint256 amount)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];