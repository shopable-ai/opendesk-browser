import * as dom from './dom.js';
import {describeHeading} from './utils.js';

export default async function main() {
  return describeHeading(dom.firstHeading(document));
}
