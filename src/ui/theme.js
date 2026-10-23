// The MONOLIT look for every page: bundled fonts (the build works offline) and
// the shared stylesheet. Import this first from a page's main.js:
//   import '../../src/ui/theme.js';
// Only the latin subsets and the weights the design uses are pulled in.

import '@fontsource/inter-tight/latin-300.css';
import '@fontsource/inter-tight/latin-400.css';
import '@fontsource/inter-tight/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/newsreader/latin-400-italic.css';
import './monolit.css';
import './fresh.js';

// The palette for code that paints (three.js materials, SVG, canvas). The CSS
// custom properties in monolit.css carry the same values.
export const PALETTE = {
  ink: '#e9e6df',
  grey1: '#a29e96',
  grey2: '#8d8a83',
  grey3: '#5a5852',
  grey4: '#4a4843',
  bg0: '#3a3936',
  bg1: '#1d1c1b',
  bg2: '#0f0f0e',
  signal: '#ff5a1f',
  plaster: '#d8d2c7',
  ground: '#4a4744',
  edge: '#0f0f0e',
};
