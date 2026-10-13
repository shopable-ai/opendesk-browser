// Developer Edition · standard ESM, exact npm version, no proprietary directive.
// Run resolves & pins original bytes through the existing SHA dependency cache.
import mitt from 'mitt@3.0.1';

export default async function main() {
  const events = [];
  const bus = mitt();
  bus.on('message', value => events.push(value));
  bus.emit('message', 'OpenDesk');
  return {events, count:events.length};
}
