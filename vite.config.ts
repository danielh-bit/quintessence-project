import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      // The sandbox (index.html) and the game (game.html) are two entry points on one core.
      input: { sandbox: "index.html", game: "game.html" },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
  },
});
