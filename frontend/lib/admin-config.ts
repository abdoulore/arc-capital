export const DEFAULT_ADMIN_WALLETS = [
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
];

export function getAdminWallets() {
  const configured = process.env.NEXT_PUBLIC_ADMIN_WALLETS;
  if (!configured) return DEFAULT_ADMIN_WALLETS;

  return configured
    .split(",")
    .map((wallet) => wallet.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminWallet(address?: string) {
  if (!address) return false;
  return getAdminWallets().includes(address.toLowerCase());
}
