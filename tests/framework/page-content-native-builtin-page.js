// Test-only SOURCE entrypoint for the real CFT fixture. Its bytes are bundled
// by Webpack and verified in the same extension-owned resource manifest as the
// Controller Worker. Never inject this into the website MAIN world.
import {installBuiltinLibraries} from '../../src/runtime/builtin-libraries/core.js';
installBuiltinLibraries(globalThis);
