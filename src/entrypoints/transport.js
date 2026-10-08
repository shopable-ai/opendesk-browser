import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {installNativeTransport} from '../native-agent/transport.js';

// Self-contained same-extension script, statically imported at SW initialization.
// Not exposed to websites; no second business controller or background executor.
export default defineUnlistedScript(() => installNativeTransport());
