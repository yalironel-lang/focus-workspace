const STORE_KEY = 'fw_nb_images_v1';
const MAX_IMAGES = 40;
const MAX_BYTES_PER_IMAGE = 4 * 1024 * 1024;

function load(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}'); }
  catch { return {}; }
}
function save(store: Record<string, string>) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
  catch { console.warn('[NB Images] localStorage quota exceeded'); }
}

export function nbImageGet(key: string): string | null {
  return load()[key] ?? null;
}
export function nbImageSet(key: string, dataUrl: string): void {
  if (dataUrl.length > MAX_BYTES_PER_IMAGE) {
    console.warn('[NB Images] Image too large, skipping');
    return;
  }
  const store = load();
  const keys = Object.keys(store);
  if (keys.length >= MAX_IMAGES) delete store[keys[0]!];
  store[key] = dataUrl;
  save(store);
}
export function nbImageDelete(key: string): void {
  const store = load();
  delete store[key];
  save(store);
}
