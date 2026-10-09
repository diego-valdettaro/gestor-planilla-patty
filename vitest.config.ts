import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Las integraciones comparten PostgreSQL: un archivo puede crear un grupo entre la aprobación y el cierre de otro.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
