/**
 * The loading screen every demonstration shows while its watercolor is painted (markup and styles, inlined into
 * each page by the `loader-screen` plugin in vite.config.ts wherever a page has `<!-- loader: Its Title -->`).
 * It appears at once, before scripts, fonts or images, and fades away when the page marks itself ready.
 */
export const LOADER_HTML = `<style>
  /* The loading screen every demonstration shows while its watercolor is painted. Inline so it appears at once,
     before scripts, fonts or images; it fades away when the page marks itself ready (body or html data-ready). */
  .loader {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    background: #fbf6ea url('/assets/paper-tile.webp') repeat;
    color: #2f2a22;
    transition: opacity 0.7s ease 0.15s, visibility 0s linear 0.85s;
  }
  body[data-ready] .loader,
  html[data-ready] .loader {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .loader-inner {
    display: grid;
    justify-items: center;
    gap: 14px;
    text-align: center;
    padding: 0 24px;
  }
  .loader svg {
    width: 112px;
    height: 112px;
    overflow: visible;
  }
  .loader-title {
    margin: 6px 0 0;
    font: 400 34px/1.1 'Libre Caslon Display', 'Libre Caslon Text', Georgia, serif;
    letter-spacing: 0.01em;
  }
  .loader-note {
    margin: 0;
    font: italic 400 18px/1.4 'Libre Caslon Text', Georgia, serif;
    color: #574e40;
  }
  .loader-note i {
    font-style: normal;
    opacity: 0;
    animation: loader-dot 1.8s ease-in-out infinite;
  }
  .loader-note i:nth-child(2) {
    animation-delay: 0.3s;
  }
  .loader-note i:nth-child(3) {
    animation-delay: 0.6s;
  }
  /* the ink ring is drawn round and round, like a brush going over it again */
  .loader-ring {
    stroke-dasharray: 300;
    stroke-dashoffset: 300;
    animation: loader-ring 2.6s cubic-bezier(0.45, 0.05, 0.4, 0.95) infinite;
  }
  /* the sprout grows up out of the soil and its leaves open, then rests and sways */
  .loader-stem {
    stroke-dasharray: 40;
    stroke-dashoffset: 40;
    animation: loader-stem 2.6s ease-out infinite;
  }
  .loader-leaf {
    transform-box: fill-box;
    opacity: 0;
    animation: loader-leaf 2.6s ease-out infinite;
  }
  .loader-leaf.l {
    transform-origin: 100% 100%;
  }
  .loader-leaf.r {
    transform-origin: 0% 100%;
  }
  .loader-wash {
    animation: loader-wash 2.6s ease-in-out infinite;
  }
  @keyframes loader-ring {
    0% { stroke-dashoffset: 300; opacity: 0.85; }
    55% { stroke-dashoffset: 0; opacity: 0.85; }
    85% { stroke-dashoffset: 0; opacity: 0.85; }
    100% { stroke-dashoffset: 0; opacity: 0; }
  }
  @keyframes loader-stem {
    0%, 10% { stroke-dashoffset: 40; }
    45%, 100% { stroke-dashoffset: 0; }
  }
  @keyframes loader-leaf {
    0%, 35% { opacity: 0; transform: scale(0.2) rotate(0deg); }
    60% { opacity: 1; transform: scale(1) rotate(0deg); }
    78% { opacity: 1; transform: scale(1) rotate(-4deg); }
    92% { opacity: 1; transform: scale(1) rotate(2deg); }
    100% { opacity: 0; transform: scale(1) rotate(0deg); }
  }
  @keyframes loader-wash {
    0%, 100% { opacity: 0.55; }
    50% { opacity: 0.8; }
  }
  @keyframes loader-dot {
    0%, 100% { opacity: 0; }
    40%, 60% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .loader-ring, .loader-stem, .loader-leaf, .loader-wash, .loader-note i {
      animation: none;
      stroke-dashoffset: 0;
      opacity: 1;
    }
  }
</style>
<div class="loader" role="status" aria-live="polite">
  <div class="loader-inner">
    <svg viewBox="0 0 112 112" aria-hidden="true">
      <!-- a soft wash of paper green behind, two glazes slightly offset like watercolor -->
      <g class="loader-wash">
        <ellipse cx="56" cy="60" rx="38" ry="36" fill="#c6da55" fill-opacity="0.22" />
        <ellipse cx="53" cy="57" rx="33" ry="32" fill="#7db343" fill-opacity="0.14" />
      </g>
      <!-- the hand-drawn ink ring -->
      <path class="loader-ring" d="M56 12c25 0 45 19 45 44s-20 45-45 45S11 81 11 56 31 11 58 13" fill="none" stroke="#3a2a20" stroke-width="1.6" stroke-linecap="round" />
      <!-- a mound of soil -->
      <path d="M30 80c8-6 18-8 26-8s19 2 26 8c-9 3-17 4-26 4s-18-1-26-4z" fill="#8a6a48" fill-opacity="0.55" />
      <path d="M34 80c7-4 14-5 22-5s16 1 22 5" fill="none" stroke="#5a4030" stroke-width="0.9" stroke-opacity="0.6" stroke-linecap="round" />
      <!-- the sprout -->
      <path class="loader-stem" d="M56 77c-1-10 0-20 1-28" fill="none" stroke="#4f8a3a" stroke-width="2.2" stroke-linecap="round" />
      <g class="loader-leaf l">
        <path d="M56 52c-4-9-13-12-21-10 2 8 10 13 21 10z" fill="#7db343" fill-opacity="0.85" />
        <path d="M56 52c-5-7-11-9-18-9" fill="none" stroke="#3f6e2e" stroke-width="0.9" stroke-linecap="round" />
      </g>
      <g class="loader-leaf r">
        <path d="M57 49c5-9 14-11 22-8-3 8-11 12-22 8z" fill="#58a03f" fill-opacity="0.85" />
        <path d="M57 49c6-6 12-8 19-7" fill="none" stroke="#2f5f24" stroke-width="0.9" stroke-linecap="round" />
      </g>
    </svg>
    <p class="loader-title">%LOADER_TITLE%</p>
    <p class="loader-note">Painting the scene<i>.</i><i>.</i><i>.</i></p>
  </div>
</div>`;
