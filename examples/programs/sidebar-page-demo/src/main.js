import {readFixture} from './fixture.js';
import {renderProof} from './proof.js';

// Page USER_SCRIPT runs in the DOM, without Controller page/params globals.
export default async function main() {
  const fixture = readFixture(document);
  if (!fixture) return {status:'SKIPPED_OUT_OF_SCOPE'};
  return {status:'PAGE_DEMO_OK',heading:fixture.heading,message:renderProof(document,fixture)};
}
