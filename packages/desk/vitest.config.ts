import { defineConfig } from "vitest/config";

// Every test builds its own PGlite database (all migrations), which takes seconds when the
// whole workspace's tests run side by side; vitest's 10 s hook default then fails at random.
export default defineConfig({
  test: { hookTimeout: 60_000, testTimeout: 60_000 },
});
