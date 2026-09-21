import {pocketRisuReader} from './pocketrisu.mjs';
import {createExtractor} from '../shared/extraction.mjs';
import {mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Store} from './store.mjs';
import {createServer} from './http.mjs';
const directory = process.env.LORE_DATA_DIR ?? './data';
let credentials;
try {
  credentials = JSON.parse(process.env.LORE_CREDENTIALS_FILE
    ? readFileSync(process.env.LORE_CREDENTIALS_FILE, 'utf8') : process.env.LORE_CREDENTIALS_JSON ?? '[]');
} catch { throw new Error('Invalid LORE credentials configuration'); }
mkdirSync(directory,{recursive:true});
const store = new Store(join(directory,'lore.sqlite'));
const extractor=process.env.LORE_LLM_URL?createExtractor({provider:process.env.LORE_LLM_PROVIDER,url:process.env.LORE_LLM_URL,model:process.env.LORE_LLM_MODEL,apiKey:process.env.LORE_LLM_API_KEY,timeoutMs:process.env.LORE_LLM_TIMEOUT_MS,jsonMode:['1','true'].includes(process.env.LORE_LLM_JSON_MODE??'false')}):null;
const server = createServer(store, credentials,{extractor,hostReader:process.env.LORE_POCKETRISU_URL?pocketRisuReader(process.env.LORE_POCKETRISU_URL):null});
const port = Number(process.env.PORT ?? 6011);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
server.listen(port, process.env.HOST ?? '127.0.0.1', () => console.log(`LORE listening on port ${port}`));
let stopping=false;
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => {
  if (stopping) return; stopping=true;
  server.close(() => { store.activeExtraction?.controller.abort();const finish=()=>{if(store.extractionRunning){setTimeout(finish,25);return;}store.close();process.exit(0);};finish(); });
  setTimeout(() => { server.closeAllConnections(); }, 5000).unref();
});
