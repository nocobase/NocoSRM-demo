import { register } from 'tsx/esm/api';
import { builtinEnvironments, type Environment } from 'vitest/runtime';

// Register native TypeScript imports before jsdom replaces the global constructors.
register();

// Render in jsdom while loading the in-process application's Node workers as server modules.
export default {
  ...builtinEnvironments.jsdom,
  name: 'application',
  viteEnvironment: 'ssr',
} satisfies Environment;
