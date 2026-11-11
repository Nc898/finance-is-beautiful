/** The About page: Nick's note, with soft watercolor washes in the margins beside it (decor.ts). */
import '@fontsource/libre-caslon-display';
import '@fontsource/libre-caslon-text/400.css';
import '@fontsource/libre-caslon-text/400-italic.css';
import '@fontsource-variable/figtree';
import '../styles/about.css';

import { paintMarginDecor } from './decor';

paintMarginDecor(document.getElementById('about-decor') as HTMLCanvasElement, document.querySelector('.about') as HTMLElement);
