// A host match pattern may cover multiple ports. Keep writes inside this fixture.
export function readFixture(doc) {
  const url = doc.location;
  if (!url || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
      url.port !== '43111' || url.pathname !== '/demo-form.html') return null;
  const host = doc.querySelector('#lab-text');
  const title = doc.querySelector('#sample-title');
  if (!host || !title) return null;
  return {host,heading:String(title.textContent ?? '').trim()};
}
