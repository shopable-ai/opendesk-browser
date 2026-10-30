import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {initHttpRelaySettings} from '../native-agent/http-relay-settings.js';
export default defineUnlistedScript(()=>initHttpRelaySettings());
