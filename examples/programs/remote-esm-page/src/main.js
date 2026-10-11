// Standard remote import lives in the local add.js wrapper (locked before build).
import {addNumbers} from './add.js';

export default async function main() {
  return {value: addNumbers(20, 22), pageTitle: document.title};
}
