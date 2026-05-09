import { create } from "zustand";

type ThemeMode = "light" | "dark";

type AppState = {
  theme: ThemeMode;
  selectedDealId: string;
  setTheme: (theme: ThemeMode) => void;
  setSelectedDealId: (dealId: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  theme: "light",
  selectedDealId: "solar-credit-2026",
  setTheme: (theme) => set({ theme }),
  setSelectedDealId: (selectedDealId) => set({ selectedDealId }),
}));
