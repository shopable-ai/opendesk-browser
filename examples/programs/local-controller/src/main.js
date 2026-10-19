import {readSummary} from './extract.js';

// The controlled Worker exposes page as an authorized lexical API.
// Importing a helper does not grant that module a separate execution world.
export default async function main() {
  return readSummary(page);
}
