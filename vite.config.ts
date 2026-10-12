/// <reference types="vitest/config" />
import { defineConfig } from 'vite';


export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        main: 'index.html',
        timeToGrow: 'time-to-grow.html',
        againstTheCurrent: 'against-the-current.html',
        againstTheCurrentWatercolor: 'against-the-current-watercolor.html',
        riverSceneTest: 'river-scene-test.html',
        slice: 'slice.html',
        sceneTest: 'scene-test.html',
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
