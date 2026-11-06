import { defineConfig } from 'vitest/config';

// Fixed zone with daylight-saving transitions so time tests are deterministic.
process.env.TZ = 'America/New_York';

export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
