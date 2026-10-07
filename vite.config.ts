/// <reference types="vitest/config" />
import { defineConfig } from 'vite';


export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        main: 'index.html',
        timeToGrow: 'time-to-grow.html',
        slice: 'slice.html',
        sceneTest: 'scene-test.html',
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
