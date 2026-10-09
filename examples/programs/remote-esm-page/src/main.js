// Remote ESM is fetched only when the developer explicitly runs --lock-remote.
// Subsequent builds use the committed SHA-256 cache offline.
import add from 'https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/add.js';

export default async function main() {
  return {value: add(20, 22), pageTitle: document.title};
}
