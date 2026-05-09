"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

type WalletGatedButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  disconnectedLabel?: string;
};

export function WalletGatedButton({
  children,
  disconnectedLabel = "Connect Wallet",
  disabled,
  onClick,
  type = "button",
  ...props
}: WalletGatedButtonProps) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  if (!isConnected) {
    return (
      <button
        {...props}
        type={type}
        onClick={(event) => {
          event.preventDefault();
          openConnectModal?.();
        }}
      >
        {disconnectedLabel}
      </button>
    );
  }

  return (
    <button {...props} type={type} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
