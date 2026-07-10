// Vitest needs the same '@/' path alias tsconfig gives Next, so tests can
// exercise modules that import across the repo (lib/status.ts and friends).

import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
})
