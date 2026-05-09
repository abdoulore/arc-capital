import { create } from "zustand";

export type ToastStatus = "pending" | "success" | "error";

export type TransactionToast = {
  id: string;
  title: string;
  message?: string;
  status: ToastStatus;
  hash?: string;
};

export type TransactionToastState = {
  toasts: TransactionToast[];
  addToast: (toast: Omit<TransactionToast, "id">) => string;
  updateToast: (id: string, toast: Partial<Omit<TransactionToast, "id">>) => void;
  removeToast: (id: string) => void;
};

export const useTransactionToast = create<TransactionToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    return id;
  },
  updateToast: (id, toast) => {
    set((state) => ({
      toasts: state.toasts.map((item) => (item.id === id ? { ...item, ...toast } : item)),
    }));
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
  },
}));
