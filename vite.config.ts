/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { LOADER_HTML } from './src/shared/loaderHtml';

/**
 * The shared loading screen: a page that wants it puts `<!-- loader: Its Title -->` right after <body>, and the
 * markup and styles of src/shared/loaderHtml.ts are inlined there, so it shows before any script or font loads.
 */
function loaderScreen(): Plugin {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return {
    name: 'loader-screen',
    transformIndexHtml(html) {
      return html.replace(/<!--\s*loader:\s*(.*?)\s*-->/, (_m, title: string) =>
        LOADER_HTML.replace('%LOADER_TITLE%', esc(title)),
      );
    },
  };
}


export default defineConfig({
  plugins: [loaderScreen()],
  build: {
    rolldownOptions: {
      input: {
        main: 'index.html',
        about: 'about.html',
        timeToGrow: 'time-to-grow.html',
        againstTheCurrent: 'against-the-current.html',
        nipItInTheBud: 'nip-it-in-the-bud.html',
        onARoll: 'on-a-roll.html',
        brickByBrick: 'brick-by-brick.html',
        riverSceneTest: 'river-scene-test.html',
        slice: 'slice.html',
        sceneTest: 'scene-test.html',
        snowSceneTest: 'snow-scene-test.html',
        snowClimberTest: 'snow-climber-test.html',
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
