import { create } from "zustand";

type FilterKind =
  | "cuisines"
  | "proteins"
  | "types"
  | "effort"
  | "tags"
  | "dietary";

interface LibraryState {
  search: string;
  selectedCuisines: number[];
  selectedProteins: number[];
  selectedTypes: number[];
  selectedEffort: number[];
  selectedTags: number[];
  selectedDietary: number[];
  minRating: number;
  setSearch: (q: string) => void;
  setSelected: (kind: FilterKind, ids: number[]) => void;
  toggleSelected: (kind: FilterKind, id: number) => void;
  setMinRating: (r: number) => void;
  reset: () => void;
}

const initial = {
  search: "",
  selectedCuisines: [] as number[],
  selectedProteins: [] as number[],
  selectedTypes: [] as number[],
  selectedEffort: [] as number[],
  selectedTags: [] as number[],
  selectedDietary: [] as number[],
  minRating: 0,
};

const fieldByKind = {
  cuisines: "selectedCuisines",
  proteins: "selectedProteins",
  types: "selectedTypes",
  effort: "selectedEffort",
  tags: "selectedTags",
  dietary: "selectedDietary",
} as const;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  ...initial,
  setSearch: (q) => set({ search: q }),
  setSelected: (kind, ids) =>
    set({ [fieldByKind[kind]]: ids } as Partial<LibraryState>),
  toggleSelected: (kind, id) => {
    const field = fieldByKind[kind];
    const current = get()[field];
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    set({ [field]: next } as Partial<LibraryState>);
  },
  setMinRating: (r) => set({ minRating: r }),
  reset: () => set(initial),
}));
