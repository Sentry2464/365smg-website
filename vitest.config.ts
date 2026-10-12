import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['src/**/*.test.ts'],
    env: { SMG_SECRET_KEY: Buffer.alloc(32, 7).toString('base64') },
  },
})
