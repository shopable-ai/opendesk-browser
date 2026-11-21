import { randomBytes } from 'node:crypto';
import { createLocalFixture } from './local-fixture-server.mjs';

const extensionOrigin = process.argv[2];
if (!/^chrome-extension:\/\/[a-p]{32}$/.test(extensionOrigin ?? '')) {
  throw Error('Usage: npm run start:manual-test -- chrome-extension://<test extension id>');
}

const runId = randomBytes(4).toString('hex').toUpperCase();
const entries = Array.from({ length: 6 }, (_, index) =>
  [`MANUAL-${runId}-${index + 1}`, index % 2 === 0 ? 'shared-a' : 'shared-b']);
const { server } = createLocalFixture({
  extensionOrigin,
  sessionTarget: 'http://127.0.0.1:7904/manual-session/',
  voucherAssignments: Object.fromEntries(entries),
  getMemberState: () => ({
    account: { state: 'bound', id: `manual-${runId}`, displayNameMasked: 'm***@fixture.test' },
    entitlements: [],
  }),
});

server.listen({ host: '127.0.0.1', port: 7904, exclusive: true }, () => {
  console.log('本机模拟手测 http://127.0.0.1:7904/manual-session/');
  console.log('一次性模拟码 ' + entries.map(([code]) => code).join(' '));
});
