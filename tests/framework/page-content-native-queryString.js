// Native CFT fixture: package genuine upstream query-string in the approved
// independently hashed USER_SCRIPT resource, never as a fake global.
import {installPageQueryString} from '../../src/libs/packages/query-string.js';
installPageQueryString(globalThis);
