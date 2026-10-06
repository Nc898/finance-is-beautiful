/// <reference types="vitest/config" />
import { defineConfig } from 'vite';


export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        main: 'index.html',
        slice: 'slice.html',
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
