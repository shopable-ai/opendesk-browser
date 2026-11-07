import {runCapture} from '../controller/capture.js';
import {listDetail} from './configs.js';
export default async function main() {
  // Each authorized navigation creates fresh document-bound Locators; detail
  // fields remain associated with the list URL and explicit identity field.
  return runCapture({...listDetail,url:params.url??listDetail.url},page);
}
