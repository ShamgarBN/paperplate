// Proxy: lives in @paperplate/core. Re-exported here so legacy
// `@/lib/planner/autoSelect` imports across the desktop codebase keep working.
export { autoSelect } from "@paperplate/core";
export type {
  AutoSelectOptions,
  AutoSelectResult,
} from "@paperplate/core";
