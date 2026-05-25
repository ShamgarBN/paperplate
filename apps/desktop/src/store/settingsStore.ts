import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PaperplateSettings {
  recentlyCookedDays: number;
  plannerBalance: number;
  varietyWeight: number;
  defaultBreakfastEnabled: boolean;
  defaultLunchEnabled: boolean;
  accentHue: number;
}

interface SettingsState extends PaperplateSettings {
  set: (patch: Partial<PaperplateSettings>) => void;
  reset: () => void;
}

const defaults: PaperplateSettings = {
  recentlyCookedDays: 14,
  plannerBalance: 0.5,
  varietyWeight: 0.4,
  defaultBreakfastEnabled: false,
  defaultLunchEnabled: false,
  accentHue: 16,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      set: (patch) => set((s) => ({ ...s, ...patch })),
      reset: () => set({ ...defaults }),
    }),
    { name: "paperplate.settings" },
  ),
);
