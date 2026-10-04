const fs = require('fs');
const os = require('os');
const path = require('path');
const { Writable } = require('stream');
const FeedExport = require('../src/exporter/FeedExport');
const ExportManager = require('../src/exporter/ExportManager');
const turn = () => new Promise(resolve => setImmediate(resolve));
let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scrapy-export-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(tmp, { recursive: true, force: true }); });

describe('stream acknowledgements', () => {
  it('does not acknowledge write true before callback; rejects the original callback error', async () => {
    let callback; const error = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    const stream = new Writable({ write(chunk, encoding, cb) { callback = cb; } });
    // The helper itself must own the error event, even after a failed callback.
    let settled = false; const result = ExportManager.writeToStream(stream, 'x').then(() => { settled = true; return null; }, e => { settled = true; return e; });
    await turn(); expect(settled).toBe(false); callback(error); expect(await result).toBe(error); await turn();
  });
  it('handles backpressure followed by callback error and premature close', async () => {
    for (const fail of ['error', 'close']) {
      let callback; const error = new Error('write failed');
      const stream = new Writable({ highWaterMark: 1, write(chunk, encoding, cb) { callback = cb; } });
      const observed = ExportManager.writeToStream(stream, 'long').then(() => null, e => e);
      if (fail === 'error') callback(error); else stream.destroy();
      expect(await observed).toBeInstanceOf(Error); await turn();
    }
  });
  it('rejects final callback error and does not mistake close for finish', async () => {
    const error = new Error('final'); const stream = new Writable({ write(c, e, cb) { cb(); }, final(cb) { cb(error); } });
    await expect(ExportManager.endStream(stream)).rejects.toBe(error);
    const premature = new Writable({ write() {} });
    const result = ExportManager.endStream(premature); premature.destroy();
    await expect(result).rejects.toThrow(/close/i);
  });
  it('static export returns the actual save promise and rejection', async () => {
    let release; const promise = new Promise(resolve => { release = resolve; });
    vi.spyOn(ExportManager, 'saveToFileNode').mockReturnValue(promise);
    const actual = ExportManager.export([{ id: 1 }], path.join(tmp, 'x.json'));
    expect(actual).toBeInstanceOf(Promise); release(); await actual;
  });
});

describe('serialized exporter and atomic publication', () => {
  for (const format of ['json', 'jsonl', 'csv']) {
    it(`${format}: empty replaces prior output; flush and finalize are serialized and idempotent`, async () => {
      const file = path.join(tmp, `items.${format}`); fs.writeFileSync(file, 'old');
      const empty = new FeedExport(file); await empty.exportData();
      expect(fs.readFileSync(file, 'utf8')).toBe(format === 'json' ? '[]\n' : '');
      const exporter = new FeedExport(file);
      exporter.addItem({ id: 1 }); const first = exporter.flushBuffer(); exporter.addItem({ id: 2 }); const second = exporter.flushBuffer();
      const final = exporter.exportData(); await Promise.all([first, second, final, exporter.exportData()]);
      const contents = fs.readFileSync(file, 'utf8');
      if (format === 'json') expect(JSON.parse(contents)).toEqual([{ id: 1 }, { id: 2 }]);
      else if (format === 'jsonl') expect(contents.trim().split('\n').map(JSON.parse)).toEqual([{ id: 1 }, { id: 2 }]);
      else expect(contents).toBe('id\n1\n2\n');
      expect(exporter.delivery).toMatchObject({ accepted: 2, committed: 2, pending: 0, deliveryUnknown: 0 });
      expect(() => exporter.addItem({ id: 3 })).toThrow(/clos|final/i);
    });
  }

  it('temp-file writes are pending and do not truncate existing targets', async () => {
    const file = path.join(tmp, 'data.jsonl'); fs.writeFileSync(file, 'old');
    const exporter = new FeedExport(file); exporter.addItem({ id: 1 }); await exporter.flushBuffer();
    expect(fs.readFileSync(file, 'utf8')).toBe('old'); expect(exporter.delivery).toMatchObject({ committed: 0, pending: 1 });
    await exporter.exportData(); expect(fs.readFileSync(file, 'utf8')).toBe('{"id":1}\n');
  });

  it('rejects same-process output conflicts, overwrite false, symlinks and special paths', async () => {
    const file = path.join(tmp, 'data.json'); const a = new FeedExport(file); const b = new FeedExport(file);
    a.addItem({ id: 1 }); b.addItem({ id: 2 }); await a.flushBuffer();
    await expect(b.exportData()).rejects.toThrow(/conflict|busy|owned/i); await a.exportData();
    const protectedOutput = new FeedExport(file, { overwrite: false });
    await expect(protectedOutput.exportData()).rejects.toThrow(/exist|overwrite/i);
    const link = path.join(tmp, 'link.json'); fs.symlinkSync(file, link);
    await expect(new FeedExport(link).exportData()).rejects.toThrow(/regular|symlink|special/i);
    const dir = path.join(tmp, 'dir.json'); fs.mkdirSync(dir);
    await expect(new FeedExport(dir).exportData()).rejects.toThrow(/regular|special|directory/i);
    expect(JSON.parse(fs.readFileSync(file))).toEqual([{ id: 1 }]);
  });

  it('serialization and publish failures reject and protect old output', async () => {
    const file = path.join(tmp, 'data.json'); fs.writeFileSync(file, 'old');
    const exporter = new FeedExport(file); const circular = {}; circular.self = circular;
    let error; try { exporter.addItem(circular); await exporter.exportData(); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Error); expect(fs.readFileSync(file, 'utf8')).toBe('old');
    const error2 = new Error('rename failure'); vi.spyOn(fs.promises, 'rename').mockRejectedValue(error2);
    const second = new FeedExport(file); second.addItem({ id: 1 });
    await expect(second.exportData()).rejects.toBe(error2); expect(fs.readFileSync(file, 'utf8')).toBe('old'); expect(second.delivery.committed).toBe(0);
  });

  it('CSV escapes headers and values and detects collisions and unknown columns', async () => {
    expect(ExportManager.toCSV([{ 'a,b': 'x\ry', 'q"q': 'v"v' }])).toBe('"a,b","q""q"\n"x\ry","v""v"');
    expect(() => ExportManager.flattenObject({ a_b: 1, a: { b: 2 } })).toThrow(/collision/i);
    const exporter = new FeedExport(path.join(tmp, 'x.csv')); exporter.addItem({ id: 1 }); await exporter.flushBuffer(); exporter.addItem({ id: 2, late: 3 });
    await expect(exporter.exportData()).rejects.toThrow(/unknown|column/i);
    const fixed = new FeedExport(path.join(tmp, 'fixed.csv'), { fields: ['id', 'late'] }); fixed.addItem({ id: 1 }); await fixed.flushBuffer(); fixed.addItem({ id: 2, late: 3 }); await fixed.exportData();
    expect(fs.readFileSync(path.join(tmp, 'fixed.csv'), 'utf8')).toBe('id,late\n1,\n2,3\n');
  });

  it('no-output mode has no redundant buffer and incidental browser globals do not disable Node files', async () => {
    const memory = new FeedExport(null); memory.addItem({ id: 1 }); expect(memory.buffer).toEqual([]); await memory.exportData(); expect(memory.data).toEqual([{ id: 1 }]);
    const original = global.window; global.window = {}; try {
      const file = path.join(tmp, 'file.json'); const exporter = new FeedExport(file); exporter.addItem({ id: 1 }); await exporter.exportData();
      expect(JSON.parse(fs.readFileSync(file))).toEqual([{ id: 1 }]);
    } finally { if (original === undefined) delete global.window; else global.window = original; }
  });
});
