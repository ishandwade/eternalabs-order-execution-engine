import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Change this line to match your singular "test" folder
    include: ['test/**/*.test.ts'], 
    testTimeout: 20000,
  },
});