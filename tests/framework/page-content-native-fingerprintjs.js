// Real npm FingerprintJS with mandatory telemetry opt-out; this fixture
// never collects or transmits a visitorId on module installation.
import {installPageFingerprintJS} from '../../src/libs/packages/fingerprintjs.js';
installPageFingerprintJS(globalThis);
