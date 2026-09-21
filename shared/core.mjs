export const LIMITS = Object.freeze({bodyBytes: 131072, pageBytes: 16384, pages: 128, contextBytes: 16384});
export function requireValue(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), {status});
}
export function boundedString(value, name, max = 160, allowEmpty = false) {
  requireValue(typeof value === 'string' && (allowEmpty || value.trim().length > 0) && value.length <= max, `Invalid ${name}`);
  return value;
}
export function revision(value) {
  requireValue(Number.isSafeInteger(value) && value >= 0, 'Invalid revision');
  return value;
}
export function scopeKey(scope) {
  return JSON.stringify(['installationId', 'userId', 'characterId', 'chatId', 'branchId'].map(k => boundedString(scope?.[k], k)));
}
export function validatePage(input) {
  requireValue(input && typeof input === 'object', 'Invalid page');
  const page = {
    title: boundedString(input.title, 'title', 160),
    kind: input.kind ?? 'event',
    body: boundedString(input.body, 'body', LIMITS.pageBytes),
    visibility: input.visibility ?? 'public',
    pinned: input.pinned ?? true,
  };
  requireValue(['person', 'event', 'scene'].includes(page.kind), 'Invalid page kind');
  boundedString(page.visibility, 'visibility');
  requireValue(typeof page.pinned === 'boolean', 'Invalid pinned');
  requireValue(new TextEncoder().encode(page.body).length <= LIMITS.pageBytes, 'Page body too large', 413);
  return page;
}
export function canRead(page, audience = 'world') {
  return page.visibility === 'public' || page.visibility === audience;
}
export function compileContext(pages, {budgetBytes = 4096, audience = 'world'} = {}) {
  requireValue(Number.isInteger(budgetBytes) && budgetBytes >= 0 && budgetBytes <= LIMITS.contextBytes, 'Invalid budgetBytes');
  const included = [], excluded = [];
  let text = '', usedBytes = 0;
  for (const page of pages) {
    // Do not disclose the existence of inaccessible pages.
    if (!canRead(page, audience)) continue;
    if (page.active === false) { excluded.push({id: page.id, reason: 'invalidated-evidence'}); continue; }
    const block = `## ${page.title}\n${page.body}\n\n`;
    const bytes = new TextEncoder().encode(block).length;
    if (usedBytes + bytes > budgetBytes) { excluded.push({id: page.id, reason: 'budget'}); continue; }
    text += block;
    usedBytes += bytes;
    included.push({id: page.id, revision: page.revision, origin: page.origin, evidence: page.evidence ?? []});
  }
  return {text, usedBytes, budgetBytes, included, excluded, budgetUnit: 'utf8-bytes', fullPromptChecked: false};
}
