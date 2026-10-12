// Independent Iconify API client. SVG text is data; never inject it into HTML.
const API = 'https://api.iconify.design';
const PREFIX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ICON = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FAVORITES_KEY = 'desigma.icon-browser.favorites.v1';
const TIMEOUT_MS = 15000;

export function validIcon(id) {
  return typeof id === 'string' && id.length <= 256 && ICON.test(id);
}

export function svgUrl(id, { color = '#23262f', size = 24, rotate = 0, flip = false } = {}) {
  if (!validIcon(id)) throw new Error('Invalid icon identifier.');
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Choose a six-digit hex color.');
  if (!Number.isInteger(size) || size < 8 || size > 512) throw new Error('Size must be a whole number from 8 to 512.');
  if (![0, 90, 180, 270].includes(rotate)) throw new Error('Rotation must be 0, 90, 180 or 270 degrees.');
  if (typeof flip !== 'boolean') throw new Error('Flip must be a boolean.');
  const url = new URL(`${API}/${id.replace(':', '/')}.svg`);
  url.searchParams.set('color', color);
  url.searchParams.set('height', String(size));
  if (rotate) url.searchParams.set('rotate', `${rotate}deg`);
  if (flip) url.searchParams.set('flip', 'horizontal');
  return url.href;
}

async function request(url, format, signal) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
  try {
    if (controller.signal.aborted) throw new DOMException('Request cancelled.', 'AbortError');
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', redirect: 'error' });
    if (!response.ok) {
      if (response.status === 429) throw new Error('Icon service is busy. Please try again shortly.');
      throw new Error(`Icon service returned HTTP ${response.status}. Please try again.`);
    }
    return await response[format]();
  } catch (error) {
    if (timedOut) throw new Error('Icon service timed out. Please try again.');
    if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
    if (error instanceof TypeError) throw new Error('Unable to reach the icon service. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function getCollections(signal) {
  const result = await request(`${API}/collections`, 'json', signal);
  if (!object(result)) throw new Error('Icon service returned invalid collection data.');
  return Object.fromEntries(Object.entries(result).filter(([prefix, info]) => PREFIX.test(prefix) && object(info)));
}

export async function searchIcons(query, prefix = '', limit = 64, signal) {
  if (typeof query !== 'string') throw new Error('Search query must be text.');
  if (typeof prefix !== 'string' || (prefix && !PREFIX.test(prefix))) throw new Error('Invalid collection.');
  if (!Number.isInteger(limit) || limit < 32 || limit > 999) throw new Error('Search limit must be from 32 to 999.');
  if (!query.trim()) return { icons: [], collections: {}, hasMore: false };
  const url = new URL(`${API}/search`);
  url.searchParams.set('query', query.trim());
  url.searchParams.set('limit', String(limit));
  if (prefix) url.searchParams.set('prefix', prefix);
  const result = await request(url.href, 'json', signal);
  if (!object(result) || !Array.isArray(result.icons) || !object(result.collections) || !Number.isInteger(result.limit) || result.limit < 1) {
    throw new Error('Icon service returned invalid search data.');
  }
  return {
    icons: [...new Set(result.icons.filter(validIcon))],
    collections: Object.fromEntries(Object.entries(result.collections).filter(([key, info]) => PREFIX.test(key) && object(info))),
    hasMore: result.icons.length === result.limit,
  };
}

export async function getSvg(id, options, signal) {
  const svg = await request(svgUrl(id, options), 'text', signal);
  // This is an envelope check, not an SVG sanitizer. Render as an image or download only.
  if (typeof svg !== 'string' || svg.length > 2 * 1024 * 1024 || !/^\s*<svg\b[^>]*>[\s\S]*<\/svg>\s*$/i.test(svg)) {
    throw new Error('Icon service returned invalid SVG data.');
  }
  return svg;
}

function cleanFavorites(ids) {
  return Array.isArray(ids) ? [...new Set(ids.filter(validIcon))].slice(0, 200) : [];
}

export function readFavorites(storage) {
  try { return cleanFavorites(JSON.parse(storage.getItem(FAVORITES_KEY))); }
  catch { return []; }
}

export function writeFavorites(storage, ids) {
  try { storage.setItem(FAVORITES_KEY, JSON.stringify(cleanFavorites(ids))); return true; }
  catch { return false; }
}

// Cache immutable default previews in this module; callers sanitize before Blob use.
const iconBatchCache = new Map();
function resolveBatchIcon(data, name) {
  const layers = [], seen = new Set();
  let current = name;
  while (true) {
    if (seen.has(current) || seen.size >= 64) return null;
    seen.add(current);
    const direct = Object.hasOwn(data.icons, current) ? data.icons[current] : null;
    if (object(direct)) { layers.unshift(direct); break; }
    const alias = object(data.aliases) && Object.hasOwn(data.aliases, current) ? data.aliases[current] : null;
    if (!object(alias) || typeof alias.parent !== 'string' || !PREFIX.test(alias.parent)) return null;
    layers.unshift(alias); current = alias.parent;
  }
  const icon = { width: 16, height: 16, left: 0, top: 0, rotate: 0, hFlip: false, vFlip: false };
  for (const layer of [data, ...layers]) {
    for (const key of ['width', 'height', 'left', 'top', 'body']) if (Object.hasOwn(layer, key)) icon[key] = layer[key];
    if (Object.hasOwn(layer, 'rotate')) {
      if (!Number.isInteger(layer.rotate)) return null;
      icon.rotate += layer.rotate;
    }
    for (const key of ['hFlip', 'vFlip']) {
      if (Object.hasOwn(layer, key) && typeof layer[key] !== 'boolean') return null;
      if (layer[key]) icon[key] = !icon[key];
    }
  }
  if (typeof icon.body !== 'string' || icon.body.length > 2 * 1024 * 1024) return null;
  if (!['width', 'height', 'left', 'top'].every(key => Number.isFinite(icon[key]) && Math.abs(icon[key]) <= 1000000) || icon.width <= 0 || icon.height <= 0) return null;
  return icon;
}
function batchSvg(icon) {
  const { width: w, height: h, left, top, hFlip, vFlip } = icon;
  const rotation = ((icon.rotate % 4) + 4) % 4;
  let body = icon.body;
  if (left || top) body = `<g transform="translate(${-left} ${-top})">${body}</g>`;
  if (hFlip || vFlip) body = `<g transform="translate(${hFlip ? w : 0} ${vFlip ? h : 0}) scale(${hFlip ? -1 : 1} ${vFlip ? -1 : 1})">${body}</g>`;
  const turns = ['', `translate(${h} 0) rotate(90)`, `translate(${w} ${h}) rotate(180)`, `translate(0 ${w}) rotate(270)`];
  if (rotation) body = `<g transform="${turns[rotation]}">${body}</g>`;
  const width = rotation % 2 ? h : w, height = rotation % 2 ? w : h;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${24 * width / height}" height="24" viewBox="0 0 ${width} ${height}" color="#23262f">${body}</svg>`;
}

export async function getIconBatch(ids, signal) {
  if (!Array.isArray(ids) || ids.some(id => !validIcon(id))) throw new Error('Invalid icon identifiers.');
  if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
  const output = {}, groups = new Map();
  for (const id of new Set(ids)) {
    if (iconBatchCache.has(id)) { output[id] = iconBatchCache.get(id); continue; }
    const [prefix, name] = id.split(':');
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(name);
  }
  for (const [prefix, names] of groups) {
    const chunks = []; let chunk = [];
    const batchUrl = list => `${API}/${prefix}.json?icons=${list.join(',')}`;
    for (const name of names.sort()) {
      if (chunk.length && batchUrl([...chunk, name]).length > 500) { chunks.push(chunk); chunk = []; }
      chunk.push(name);
    }
    if (chunk.length) chunks.push(chunk);
    for (const part of chunks) {
      const data = await request(batchUrl(part), 'json', signal);
      if (!object(data) || data.prefix !== prefix || !object(data.icons)) throw new Error('Icon service returned invalid icon data.');
      for (const name of part) {
        const icon = resolveBatchIcon(data, name);
        if (!icon) continue;
        const id = `${prefix}:${name}`, svg = batchSvg(icon);
        output[id] = svg; iconBatchCache.set(id, svg);
        if (iconBatchCache.size > 2000) iconBatchCache.delete(iconBatchCache.keys().next().value);
      }
    }
  }
  return output;
}
