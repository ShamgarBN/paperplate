// Monorepo-aware Metro config for Expo.
// Tells Metro to watch the entire workspace root for shared packages, and to
// resolve modules from both the app's own node_modules and the hoisted root.
// Required because npm workspaces hoist shared deps to the top-level
// node_modules; without this, Metro can't find them from apps/mobile/.

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..", "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
