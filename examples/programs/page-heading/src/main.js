import {firstHeading} from './dom.js';
import {describeHeading} from './describe.js';

export default async function main() {
  return describeHeading(firstHeading(document));
}
