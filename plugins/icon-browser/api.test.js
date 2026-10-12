import test from 'node:test';
import assert from 'node:assert/strict';
import { validIcon, svgUrl, getCollections, searchIcons, getSvg, getIconBatch, readFavorites, writeFavorites } from './api.js';

function mockFetch(t, data, status = 200) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: status >= 200 && status < 300, status, json: async () => data, text: async () => data };
  });
  return calls;
}

test('only safe fully qualified icon names are accepted', () => {
  for (const id of ['mdi:home', 'material-symbols:home-rounded', '1set:2icon']) assert.equal(validIcon(id), true);
  for (const id of ['', 'home', '../home', 'mdi:Home', 'mdi:home?color=red', 'mdi:home/evil', 'mdi::home', null, {}, 'mdi:-home']) assert.equal(validIcon(id), false);
});

test('SVG URL validates options and preserves aspect ratio', () => {
  const url = new URL(svgUrl('mdi:home', { color: '#aAbbCC', size: 48, rotate: 90, flip: true }));
  assert.equal(url.origin, 'https://api.iconify.design');
  assert.equal(url.pathname, '/mdi/home.svg');
  assert.equal(url.searchParams.get('color'), '#aAbbCC');
  assert.equal(url.searchParams.get('height'), '48');
  assert.equal(url.searchParams.has('width'), false);
  assert.equal(url.searchParams.get('rotate'), '90deg');
  assert.equal(url.searchParams.get('flip'), 'horizontal');
  for (const options of [{ color: 'red' }, { color: '#abc' }, { size: 7 }, { size: 513 }, { size: 24.5 }, { rotate: 45 }, { flip: 'yes' }]) assert.throws(() => svgUrl('mdi:home', options));
  assert.throws(() => svgUrl('../bad'));
});

test('search encodes parameters and uses response limit, not total', async (t) => {
  const calls = mockFetch(t, { icons: ['mdi:home', 'mdi:house'], limit: 2, total: 9000, collections: { mdi: { name: 'Material Design' } } });
  const result = await searchIcons('home & house', 'mdi', 64);
  assert.equal(result.hasMore, true);
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get('query'), 'home & house');
  assert.equal(url.searchParams.get('prefix'), 'mdi');
  assert.equal(url.searchParams.get('limit'), '64');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.redirect, 'error');
});

test('search filters malformed IDs and does not claim more for a short result', async (t) => {
  mockFetch(t, { icons: ['mdi:home', 'mdi:home', '../bad'], limit: 64, collections: {} });
  assert.deepEqual(await searchIcons('home'), { icons: ['mdi:home'], collections: {}, hasMore: false });
});

test('empty queries do not fetch and invalid filters fail before fetch', async (t) => {
  const calls = mockFetch(t, {});
  assert.deepEqual(await searchIcons('  '), { icons: [], collections: {}, hasMore: false });
  await assert.rejects(searchIcons('home', '../bad'), /Invalid collection/);
  await assert.rejects(searchIcons('home', '', 12), /limit/);
  assert.equal(calls.length, 0);
});

test('collection metadata retains attribution and filters invalid keys', async (t) => {
  const mdi = { name: 'Material Design Icons', license: { title: 'Apache 2.0' }, author: { name: 'Pictogrammers' } };
  mockFetch(t, { mdi, '../bad': {}, other: null });
  assert.deepEqual(await getCollections(), { mdi });
});

test('bad service responses and HTTP errors have helpful failures', async (t) => {
  mockFetch(t, {}, 429);
  await assert.rejects(getCollections(), /busy/);
  t.mock.restoreAll();
  mockFetch(t, {}, 503);
  await assert.rejects(getCollections(), /HTTP 503/);
  t.mock.restoreAll();
  mockFetch(t, []);
  await assert.rejects(getCollections(), /invalid collection/);
  t.mock.restoreAll();
  mockFetch(t, { icons: 'bad' });
  await assert.rejects(searchIcons('home'), /invalid search/);
});

test('network failures are explained', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(getCollections(), /Check your connection/);
});

test('pre-aborted and in-flight requests remain cancellation, not generic failures', async (t) => {
  const before = new AbortController();
  before.abort();
  await assert.rejects(getCollections(before.signal), { name: 'AbortError' });
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  }));
  const during = new AbortController();
  const pending = getCollections(during.signal);
  during.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('timeout aborts request and gives retry guidance', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  }));
  const pending = getCollections();
  const checked = assert.rejects(pending, /timed out/);
  t.mock.timers.tick(15000);
  await checked;
});

test('SVG download checks envelope and rejects HTML service errors', async (t) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
  mockFetch(t, svg);
  assert.equal(await getSvg('mdi:home'), svg);
  t.mock.restoreAll();
  mockFetch(t, '<html>Bad gateway</html>');
  await assert.rejects(getSvg('mdi:home'), /invalid SVG/);
  t.mock.restoreAll();
  mockFetch(t, '<svg></svg><script>oops</script>');
  await assert.rejects(getSvg('mdi:home'), /invalid SVG/);
});

test('favorites sanitize, deduplicate and cap entries; blocked storage is graceful', () => {
  let saved;
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  assert.deepEqual(readFavorites(storage), []);
  assert.equal(writeFavorites(storage, ['mdi:home', 'mdi:home', '../bad', ...Array.from({ length: 220 }, (_, i) => `mdi:icon-${i}`)]), true);
  const ids = readFavorites(storage);
  assert.equal(ids.length, 200);
  assert.equal(ids[0], 'mdi:home');
  assert.equal(new Set(ids).size, 200);
  saved = '{}';
  assert.deepEqual(readFavorites(storage), []);
  const blocked = { getItem() { throw new Error(); }, setItem() { throw new Error(); } };
  assert.deepEqual(readFavorites(blocked), []);
  assert.equal(writeFavorites(blocked, ['mdi:home']), false);
  assert.deepEqual(readFavorites(undefined), []);
});


test('batch groups sorted names by collection, preserves currentColor, and caches', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(String(url));
    const prefix = new URL(url).pathname.slice(1, -5);
    const names = new URL(url).searchParams.get('icons').split(',');
    return { ok: true, json: async () => ({ prefix, width: 24, height: 24, icons: Object.fromEntries(names.map(name => [name, { body: '<path fill="currentColor" d="M0 0"/>' }])) }) };
  });
  const result = await getIconBatch(['testbatch:b', 'testbatch:a', 'testother:a', 'testbatch:a']);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /testbatch.json\?icons=a,b$/);
  assert.match(result['testbatch:a'], /color="#23262f"/);
  assert.match(result['testbatch:a'], /fill="currentColor"/);
  assert.match(result['testbatch:a'], /viewBox="0 0 24 24"/);
  assert.deepEqual(await getIconBatch(['testbatch:a']), { 'testbatch:a': result['testbatch:a'] });
  assert.equal(calls.length, 2);
});

test('batch resolves alias chains, dimensions, offsets and accumulated transforms', async (t) => {
  mockFetch(t, { prefix: 'aliasbatch', width: 20, height: 10,
    icons: { original: { body: '<path/>', left: 2, top: 3, hFlip: true, rotate: 1 } },
    aliases: { mirrored: { parent: 'original', hFlip: true, rotate: 1 }, turned: { parent: 'mirrored', vFlip: true, rotate: -1 }, cycle: { parent: 'cycle' } },
  });
  const result = await getIconBatch(['aliasbatch:turned', 'aliasbatch:cycle', 'aliasbatch:missing']);
  assert.deepEqual(Object.keys(result), ['aliasbatch:turned']);
  assert.match(result['aliasbatch:turned'], /viewBox="0 0 10 20"/);
  assert.match(result['aliasbatch:turned'], /width="12" height="24"/);
  assert.match(result['aliasbatch:turned'], /translate\(-2 -3\)/);
  assert.match(result['aliasbatch:turned'], /translate\(0 10\) scale\(1 -1\)/);
  assert.match(result['aliasbatch:turned'], /translate\(10 0\) rotate\(90\)/);
});

test('batch chunks long URLs and processes requests sequentially', async (t) => {
  const calls = []; let active = false;
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(active, false); active = true;
    calls.push(String(url));
    return { ok: true, json: async () => { await Promise.resolve(); active = false; return { prefix: 'chunkbatch', icons: {} }; } };
  });
  await getIconBatch(Array.from({ length: 64 }, (_, i) => `chunkbatch:long-name-for-icon-${i}`));
  assert.ok(calls.length > 1 && calls.length < 10);
  assert.ok(calls.every(url => url.length <= 500));
});

test('batch rejects invalid requests/data, omits malformed icons, and respects abort', async (t) => {
  await assert.rejects(getIconBatch(['../bad']), /Invalid icon identifiers/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(getIconBatch(['testbatch:a'], abort.signal), { name: 'AbortError' });
  mockFetch(t, { prefix: 'badbatch', icons: { invalid: { body: '<path/>', width: '24' } } });
  assert.deepEqual(await getIconBatch(['badbatch:invalid']), {});
  t.mock.restoreAll();
  mockFetch(t, { prefix: 'wrong', icons: {} });
  await assert.rejects(getIconBatch(['badbatch:invalid']), /invalid icon data/);
});
