import { getCollections, searchIcons, svgUrl, getIconBatch, readFavorites, writeFavorites } from './api.js';

const $ = (id) => document.getElementById(id);
let storage;
try { storage = localStorage; } catch { /* Private browsing may disable storage. */ }
let favorites = readFavorites(storage);
let collections = {}, icons = [], selected = '', view = 'all', hasMore = false;
let searchController, searchRevision = 0, exportBusy = false;
let activeQuery = '', activePrefix = '', visibleCount = 64;
// Set when running inside Desigma: the host serves host.json next to the panel.
let host = null;
const sources = new Map(), pendingSources = new Map();
const notice = (message) => { $('notice').textContent = message; };
const options = () => ({ color: $('color').value, size: Number($('size').value), rotate: Number($('rotate').value), flip: $('flip').checked });
const text = (id, value) => { if ($(id)) $(id).textContent = value; };
async function loadSources(ids) {
  const missing = ids.filter(id => !sources.has(id) && !pendingSources.has(id));
  if (missing.length) {
    const pending = getIconBatch(missing).then(data => {
      for (const [id, svg] of Object.entries(data)) {
        try { sources.set(id, safeSvg(svg)); } catch { /* Unsupported icons get a placeholder. */ }
      }
    }).finally(() => { for (const id of missing) pendingSources.delete(id); });
    for (const id of missing) pendingSources.set(id, pending);
  }
  await Promise.all([...new Set(ids.map(id => pendingSources.get(id)).filter(Boolean))]);
}
function customize(source, settings) {
  const { color = '#23262f', size = 24, rotate = 0, flip = false } = settings;
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml'), root = doc.documentElement;
  const [x,y,w,h] = root.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
  if (![x,y,w,h].every(Number.isFinite) || w <= 0 || h <= 0) throw new Error('Invalid icon dimensions.');
  const swapped = rotate === 90 || rotate === 270, width = swapped ? h : w, height = swapped ? w : h;
  const rotation = rotate === 90 ? `translate(${h} 0) rotate(90)` : rotate === 180 ? `translate(${w} ${h}) rotate(180)` : rotate === 270 ? `translate(0 ${w}) rotate(270)` : '';
  const group = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('transform', `${rotation} ${flip ? `translate(${w} 0) scale(-1 1)` : ''} translate(${-x} ${-y})`.trim());
  while (root.firstChild) group.append(root.firstChild);
  root.append(group); root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  root.setAttribute('width', String(size * width / height)); root.setAttribute('height', String(size)); root.setAttribute('color', color);
  return new XMLSerializer().serializeToString(root);
}
function image(id, settings, reportError = false) {
  svgUrl(id, settings); // Share API option validation with export.
  const img = new Image(); img.alt = ''; img.loading = 'lazy';
  loadSources([id]).then(() => {
    if (!img.isConnected) return;
    if (!sources.has(id)) throw new Error('This icon cannot be previewed as a static SVG.');
    const url = URL.createObjectURL(new Blob([customize(sources.get(id), settings)], {type:'image/svg+xml'}));
    img.onload = () => URL.revokeObjectURL(url);
    img.onerror = () => { URL.revokeObjectURL(url); img.alt = 'Icon preview unavailable'; };
    img.src = url;
  }).catch(error => { img.alt = 'Unavailable'; img.title = error.message; if (reportError) notice(error.message); });
  return img;
}
function displayed() {
  if (view === 'all') return icons.slice(0, visibleCount);
  const query = $('query').value.trim().toLowerCase(), prefix = $('collection').value;
  return favorites.filter(id => (!prefix || id.startsWith(prefix + ':')) && id.includes(query));
}
function renderGrid() {
  const list = displayed(), fragment = document.createDocumentFragment();
  loadSources(list).catch(error => notice(error.message));
  for (const id of list) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'icon-card'; button.title = id;
    button.setAttribute('aria-label', id); button.setAttribute('aria-pressed', String(id === selected));
    button.classList.toggle('is-selected', id === selected);
    button.classList.toggle('is-favorite', favorites.includes(id));
    const art = document.createElement('span'); art.className = 'icon-art'; art.append(image(id, { size: 24 }));
    const label = document.createElement('span'); label.className = 'icon-label'; label.textContent = id.split(':')[1];
    button.append(art, label); button.addEventListener('click', () => {
      const previous = $('results').querySelector('.is-selected');
      if (previous) { previous.classList.remove('is-selected'); previous.setAttribute('aria-pressed', 'false'); }
      selected = id; button.classList.add('is-selected'); button.setAttribute('aria-pressed', 'true'); renderSelection();
    });
    fragment.append(button);
  }
  if (!list.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state';
    empty.textContent = view === 'favorites' ? 'No matching favorites. Save an icon using the star in its details.' : 'No icons found. Try a different word or collection.';
    fragment.append(empty);
  }
  $('results').replaceChildren(fragment);
  text('result-count', `${list.length} icons`);
  $('load-more').hidden = view !== 'all' || (!hasMore && visibleCount >= icons.length);
  $('all-tab').setAttribute('aria-pressed', String(view === 'all'));
  $('all-tab').classList.toggle('active', view === 'all');
  $('favorites-tab').setAttribute('aria-pressed', String(view === 'favorites'));
  $('favorites-tab').classList.toggle('active', view === 'favorites');
}
function renderSelection() {
  const enabled = Boolean(selected);
  for (const id of ['favorite', 'copy', 'download', 'color', 'size', 'rotate', 'flip']) $(id).disabled = !enabled || exportBusy;
  $('insert').disabled = !enabled || exportBusy || !host;
  if (!enabled) return;
  text('selected-name', selected.split(':')[1]);
  const info = collections[selected.split(':')[0]];
  text('selected-collection', info?.name || selected.split(':')[0]);
  text('selected-author', info?.author?.name ? `By ${info.author.name}` : 'Author information unavailable');
  $('license').replaceChildren();
  const licenseName = info?.license?.title || info?.license?.spdx || 'License information unavailable';
  let url;
  try { url = new URL(info?.license?.url); } catch { /* Missing license URL. */ }
  if (url?.protocol === 'https:') {
    const link = document.createElement('a'); link.textContent = licenseName;
    link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; $('license').append(link);
  } else $('license').textContent = licenseName;
  $('favorite').textContent = favorites.includes(selected) ? '★' : '☆';
  $('favorite').setAttribute('aria-label', favorites.includes(selected) ? 'Remove from favorites' : 'Add to favorites');
  $('favorite').title = $('favorite').getAttribute('aria-label');
  $('favorite').setAttribute('aria-pressed', String(favorites.includes(selected)));
  try {
    $('selected-preview').replaceChildren(image(selected, options(), true));
  } catch (error) { notice(error.message); }
}
async function search(limit = 64) {
  searchController?.abort(); const revision = ++searchRevision;
  visibleCount = limit === 999 ? 128 : 64;
  $('load-more').disabled = false; $('results').setAttribute('aria-busy', 'false');
  if (view === 'favorites') { $('status').textContent = 'Your saved icons'; renderGrid(); return; }
  const query = $('query').value.trim(), prefix = $('collection').value;
  if (!query) { icons = []; hasMore = false; renderGrid(); $('status').textContent = 'Enter a word to search icons.'; return; }
  searchController = new AbortController();
  $('status').textContent = 'Searching icons…'; $('load-more').disabled = true; $('results').setAttribute('aria-busy', 'true');
  // Clear old results when the search changes; never label stale results as a new query.
  if (query !== activeQuery || prefix !== activePrefix) { icons = []; hasMore = false; renderGrid(); }
  activeQuery = query; activePrefix = prefix;
  try {
    const result = await searchIcons(query, prefix, limit, searchController.signal);
    if (revision !== searchRevision) return;
    collections = { ...collections, ...result.collections };
    icons = result.icons; hasMore = result.hasMore && limit < 999;
    if (!selected && icons.length) selected = icons[0];
    renderGrid(); renderSelection();
    $('status').textContent = icons.length ? `${icons.length}${hasMore ? '+' : ''} results for “${query}”` : `No results for “${query}”`;
  } catch (error) {
    if (revision === searchRevision && error.name !== 'AbortError') $('status').textContent = `${error.message} Press Search to retry.`;
  } finally {
    if (revision === searchRevision) { $('load-more').disabled = false; $('results').setAttribute('aria-busy', 'false'); }
  }
}
function safeSvg(source) {
  const document = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') throw new Error('The icon service returned invalid SVG.');
  // Exports stay static: reject active content and external resource references.
  const allowed = new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','clippath','mask','lineargradient','radialgradient','stop','title','desc','use','symbol']);
  for (const element of document.querySelectorAll('*')) {
    if (!allowed.has(element.localName.toLowerCase())) throw new Error('This icon uses unsupported SVG content.');
    for (const attribute of element.attributes) {
      const name = attribute.name.toLowerCase(), value = attribute.value.trim();
      if (name.startsWith('on') || name === 'style' || ((name === 'href' || name.endsWith(':href')) && !/^#[\w-]+$/.test(value)) || (/url\s*\(/i.test(value) && !/^url\(#[\w-]+\)$/.test(value))) throw new Error('This SVG contains unsupported resource references.');
    }
  }
  return new XMLSerializer().serializeToString(document.documentElement);
}
async function exportSvg(kind) {
  if (!selected || exportBusy) return;
  const id = selected;
  let settings;
  try { settings = options(); svgUrl(id, settings); } catch (error) { notice(error.message); return; }
  exportBusy = true; renderSelection(); notice('Preparing SVG…');
  try {
    await loadSources([id]);
    if (!sources.has(id)) throw new Error('This icon cannot be exported as a static SVG.');
    const svg = safeSvg(customize(sources.get(id), settings));
    if (kind === 'insert') {
      const response = await fetch('insert-svg', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', 'X-Desigma-Token': host.token }, body: JSON.stringify({ svg, name: id.split(':')[1] }) });
      const reply = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(reply.error || 'Desigma could not insert this icon.');
      notice(`Inserted ${id}. Check the collection’s license before using it.`);
    } else if (kind === 'copy') {
      await navigator.clipboard.writeText(svg); notice(`Copied ${id} as SVG.`);
    } else {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const link = document.createElement('a'); link.href = url; link.download = id.replace(':','-') + '.svg';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      notice(`Downloaded ${id}. Check the collection’s license before using it.`);
    }
  } catch (error) { notice(kind === 'copy' && error.name === 'NotAllowedError' ? 'Clipboard access unavailable. Use Download SVG instead.' : error.message); }
  finally { exportBusy = false; renderSelection(); }
}
$('search-form').addEventListener('submit', event => { event.preventDefault(); search(); });
$('collection').addEventListener('change', () => search());
$('query').addEventListener('input', () => { if (view === 'favorites') renderGrid(); });
$('all-tab').addEventListener('click', () => { view = 'all'; search(); });
$('favorites-tab').addEventListener('click', () => { view = 'favorites'; search(); });
$('load-more').addEventListener('click', () => {
  if (visibleCount < icons.length) { visibleCount += 64; renderGrid(); } else search(999);
});
for (const id of ['color', 'size', 'rotate', 'flip']) $(id).addEventListener('change', () => { notice(''); renderSelection(); });
$('favorite').addEventListener('click', () => {
  if (!selected) return;
  if (!favorites.includes(selected) && favorites.length >= 200) { notice('You can save up to 200 favorites. Remove one first.'); return; }
  favorites = favorites.includes(selected) ? favorites.filter(id => id !== selected) : [...favorites, selected];
  const saved = writeFavorites(storage, favorites);
  notice(saved ? 'Favorites updated.' : 'Favorites updated for this session; browser storage is unavailable.');
  renderGrid(); renderSelection();
});
$('copy').addEventListener('click', () => exportSvg('copy'));
$('download').addEventListener('click', () => exportSvg('download'));
$('insert').addEventListener('click', () => exportSvg('insert'));
fetch('host.json', { credentials: 'omit' }).then(r => r.ok ? r.json() : null).then(info => {
  if (!info?.token || !info.permissions?.includes('document:insert-svg')) return;
  host = info;
  $('insert').title = 'Insert the icon into the current Desigma document';
  $('runtime-note').textContent = 'Inserts editable layers. One Undo removes it.';
  renderSelection();
}).catch(() => { /* Standalone preview: no host. */ });
renderSelection();
getCollections().then(data => {
  collections = { ...collections, ...data };
  for (const [prefix, info] of Object.entries(data).sort((a,b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]))) {
    const option = document.createElement('option'); option.value = prefix; option.textContent = info.name || prefix; $('collection').append(option);
  }
  renderSelection();
}).catch(error => notice(`Collection list unavailable. Search still works. ${error.message}`));
search();
