const ListSpider = require('../src/core/ListSpider');
const ChromeSpider = require('../src/core/ChromeSpider');
const Response = require('../src/http/Response');
const Request = require('../src/http/Request');
async function collect(iterable) { const result = []; for await (const value of iterable) result.push(value); return result; }
afterEach(() => vi.useRealTimers());
it('ListSpider propagates actual parser syntax errors', async () => {
  const spider = new ListSpider({ itemConfig: { title: '[' } });
  await expect(collect(spider.parse(new Response({ url: 'https://a.local/list', body: '<h1>good</h1>' })))).rejects.toThrow();
});
it('ChromeSpider propagates next-page click errors instead of claiming last page', async () => {
  const error = new Error('bridge failed');
  const spider = new ChromeSpider({ puppeteerConfig: { nextPageSelector: '.next' } });
  const page = { async $() { return { async click() { throw error; } }; }, async evaluate() { return false; } };
  await expect(spider.goToNextPage(page)).rejects.toBe(error);
});
it('ListSpider explicit delay zero does not add a parse timer; delay belongs to request eligibility', async () => {
  vi.useFakeTimers(); const timer = vi.spyOn(global, 'setTimeout');
  const req = new Request('https://a.local/first', null, { retry_times: 0, responseType: 'text' });
  const spider = new ListSpider({ delay: 0, itemConfig: { title: 'h1' }, nextPageSelector: '.next' });
  const result = collect(spider.parse(new Response({ url: req.url, request: req, body: '<h1>one</h1><a class="next" href="/second">next</a>' })));
  await vi.advanceTimersByTimeAsync(2000); const values = await result;
  expect(timer).not.toHaveBeenCalled();
  const next = values.find(value => value instanceof Request);
  expect(next).toMatchObject({ url: 'https://a.local/second', retry_times: 0, responseType: 'text' });
});
