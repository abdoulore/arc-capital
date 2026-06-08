"use client";

import { ReactNode } from "react";

type ModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ title, open, onClose, children }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#080c10]/88 p-4 backdrop-blur-sm">
      <div className="arc-panel w-full max-w-lg">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-2xl leading-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="arc-link px-2 py-1 text-sm"
            aria-label="Close modal"
          >
            X
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
