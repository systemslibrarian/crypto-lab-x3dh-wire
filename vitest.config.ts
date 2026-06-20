import { defineConfig } from "vitest/config";

// Tests run in Node, which provides a standards-compliant WebCrypto
// (globalThis.crypto.subtle) — the same surface the browser app uses.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
