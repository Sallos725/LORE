import http from 'node:http';
import {createHash} from 'node:crypto';
import {LIMITS, boundedString, requireValue, scopeKey} from '../shared/core.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');

export function createServer(store, credentials, {workerInterval = 250, extractor = null, hostReader = null} = {}) {
  requireValue(Array.isArray(credentials) && credentials.length > 0 && credentials.length <= 128, 'Configure 1–128 credentials');
  const principals = new Map();
  for (const item of credentials) {
    requireValue(typeof item.token === 'string' && item.token.length >= 32 && item.token.length <= 512, 'Use tokens of at least 32 characters');
    scopeKey(item.scope);
    boundedString(item.audience ?? 'world', 'audience');
    requireValue(!principals.has(digest(item.token)), 'Duplicate token');
    principals.set(digest(item.token), {...item, audience: item.audience ?? 'world'});
  }
  let active = 0;
  const json = (res, status, value) => {
    res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff'});
    res.end(JSON.stringify(value));
  };
  const body = async req => {
    requireValue(req.headers['content-type']?.split(';')[0] === 'application/json', 'Expected application/json', 415);
    requireValue(!req.headers['content-encoding'], 'Compressed requests unsupported', 415);
    requireValue(!req.headers['content-length'] || Number(req.headers['content-length']) <= LIMITS.bodyBytes, 'Body too large', 413);
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length; requireValue(size <= LIMITS.bodyBytes, 'Body too large', 413); chunks.push(chunk);
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Expected JSON object');
      requireValue(!('scope' in value) && !('audience' in value), 'Scope and audience are credential-bound');
      return value;
    } catch (error) { if (error.status) throw error; throw Object.assign(new Error('Invalid JSON'), {status:400}); }
  };
  const server = http.createServer(async (req, res) => {
    let counted = false;
    req.setTimeout(15000, () => req.destroy());
    try {
      const url = new URL(req.url, 'http://lore.internal');
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, {ok:true, service:'lore', apiVersion:1});
      const token = req.headers.authorization?.match(/^Bearer (.{32,512})$/)?.[1];
      const principal = token && principals.get(digest(token));
      requireValue(principal, 'Unauthorized', 401);
      requireValue(active < 16, 'Busy; retry later', 503); active++; counted = true;
      const {scope, audience} = principal;
      let parts;
      try { parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); }
      catch { requireValue(false, 'Invalid URL encoding'); }
      const [resource, id, action] = parts;
      requireValue(parts.length <= 3, 'Not found', 404);
      if (req.method === 'GET' && resource === 'identity' && parts.length === 1) return json(res,200,{scope,audience,scopeRevision:store.head(scope),extractionEnabled:!!extractor,collectionEnabled:principal.collect===true||principal.ingest===true});
      if(resource==='capture'&&req.method==='POST'&&parts.length===1){
        requireValue(principal.collect===true,'Collection credential required',403);
        requireValue(hostReader,'Configure LORE_POCKETRISU_URL on the sidecar',503);
        return json(res,200,await hostReader(store,scope,audience,await body(req)));
      }
      if(resource==='sync'&&parts.length===1){
        requireValue(principal.collect===true||principal.ingest===true,'Collection credential required',403);
        if(req.method==='GET')return json(res,200,store.syncState(scope));
        if(req.method==='POST')return json(res,200,store.sync(scope,await body(req),audience));
      }
      if(resource==='browse'&&req.method==='GET')return json(res,200,store.browse(scope,{audience,folder:url.searchParams.get('folder')??'',offset:Number(url.searchParams.get('offset')??0),limit:20}));
      if(resource==='resolve'&&req.method==='GET')return json(res,200,store.resolve(scope,url.searchParams.get('target')??'',audience));
      if(resource==='conflicts'&&id&&req.method==='DELETE')return json(res,200,store.dismissConflict(scope,id,audience));
      if(resource==='conflicts'&&req.method==='GET')return json(res,200,{conflicts:store.conflicts(scope,audience)});
      if(resource==='jobs'&&!id&&req.method==='GET')return json(res,200,{jobs:store.jobs(scope,audience)});
      if (resource === 'wiki') {
        if (req.method === 'GET' && !id) return json(res,200,store.list(scope,{query:url.searchParams.get('q') ?? '', offset:Number(url.searchParams.get('offset') ?? 0), limit:Number(url.searchParams.get('limit') ?? 20),audience}));
        if (req.method === 'GET' && id && !action) return json(res,200,store.page(scope,id,audience));
        if(req.method==='GET'&&id&&action==='links')return json(res,200,store.links(scope,id,audience));
        if (req.method === 'GET' && id && action === 'history') return json(res,200,{history:store.history(scope,id,audience,Number(url.searchParams.get('offset') ?? 0))});
        if (req.method === 'PATCH' && id && !action) {
          const data = await body(req); return json(res,200,store.put(scope,id,data.page,data.expectedRevision,audience));
        }
      }
      if (req.method === 'GET' && resource === 'sources' && id && action) return json(res,200,store.source(scope,id,Number(action),audience));
      if (resource === 'context' && req.method === 'POST' && parts.length === 1) {
        const data=await body(req); return json(res,200,store.context(scope,{query:data.query ?? '',budgetBytes:data.budgetBytes ?? 4096,audience}));
      }
      if (resource === 'events' && req.method === 'POST' && parts.length === 1) {
        requireValue(principal.ingest === true, 'Ingest credential required', 403);
        return json(res,202,store.enqueue(scope,await body(req),audience));
      }
      if (resource === 'jobs' && id) {
        requireValue(principal.ingest === true || principal.collect === true, 'Collection credential required', 403);
        requireValue(store.jobs(scope,audience).some(j=>j.id===id), 'Job not found',404);
        if (req.method === 'GET' && !action) return json(res,200,store.job(scope,id));
        if (req.method === 'POST' && action === 'retry') return json(res,200,store.retry(scope,id));
        if (req.method === 'POST' && action === 'cancel') return json(res,200,store.cancel(scope,id));
      }
      json(res,404,{error:'Not found'});
    } catch (error) {
      if (!res.destroyed && !res.headersSent) json(res,error.status ?? 500,{error:error.status ? error.message : 'Internal storage error'});
    } finally { if (counted) active--; }
  });
  server.headersTimeout = 10000; server.requestTimeout = 15000; server.maxHeadersCount = 40;
  server.maxConnections = 64;
  const timer = workerInterval > 0 ? setInterval(() => {
    try { if(extractor)store.runExtraction(extractor).catch(()=>{});else store.runOne(); } catch { console.error('LORE worker unavailable; check storage health'); }
  },workerInterval) : null;
  timer?.unref();
  server.on('close', () => {clearInterval(timer);store.activeExtraction?.controller.abort();});
  return server;
}
