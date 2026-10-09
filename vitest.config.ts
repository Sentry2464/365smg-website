import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: { SMG_SECRET_KEY: Buffer.alloc(32, 7).toString('base64') },
  },
})
