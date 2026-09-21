"""Install a narrowly scoped V3 extension in a pinned PocketRisu source checkout.
No full char/chat snapshots leave the host. No live service is replaced.
"""
import argparse
from pathlib import Path
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
PIN='a14c911fd927a2bf63c8665bae202f29643920b4'
parser=argparse.ArgumentParser()
parser.add_argument('checkout',type=Path)
parser.add_argument('--apply',action='store_true')
args=parser.parse_args()
path=args.checkout/'src/ts/plugins/apiV3/v3.svelte.ts'
text=path.read_text()
if 'getLoreChatDelta:' in text:
    helper=path.parent/'lore-host.mjs'
    if not helper.exists() or helper.read_bytes()!=(ROOT/'integration/pocketrisu-lore.mjs').read_bytes():
        raise SystemExit('An older or modified LORE extension exists; apply to a fresh pinned checkout')
    print('LORE host extension already installed');raise SystemExit(0)
sha=subprocess.check_output(['git','-C',str(args.checkout),'rev-parse','HEAD'],text=True).strip()
if sha!=PIN:raise SystemExit('Unsupported PocketRisu commit; revalidate adapter before installing')
anchor='        getCurrentChatIndex: () => {'
assert text.count(anchor)==1
imports='''import { Sha256 as LoreSha256 } from '@aws-crypto/sha256-js';
import { readLoreDelta } from './lore-host.mjs';
import { ChatTokenizer as LoreTokenizer } from 'src/ts/tokenizer';
'''
methods='''        getLoreChatDelta: async (cursor: any, mode = 'delta') => {
            if (!await getPluginPermission(plugin.name, 'db', 'periodically')) throw new Error('LORE: permission denied');
            const storage = forageStorage as any;
            const state = typeof storage.getWriterLockState === 'function' ? await storage.getWriterLockState() : 'unknown';
            if (!['active','free'].includes(state)) throw new Error('LORE: active writer session required');
            const character = DBState.db.characters?.[get(selectedCharID)];
            return readLoreDelta(character, cursor, {
                mode, generating: get(doingChat),
                hashFactory: () => { const hash = new LoreSha256(); return { update: (value: string) => hash.update(value), hex: () => Array.from(hash.digestSync()).map(n => n.toString(16).padStart(2,'0')).join('') }; }
            });
        },
        checkLoreBudget: async (messages: any[], memory: string, memoryBudget: number, responseReserve = 0) => {
            if (!await getPluginPermission(plugin.name, 'replacer', 'periodically')) throw new Error('LORE: permission denied');
            if (!Array.isArray(messages) || messages.length > 1000 || typeof memory !== 'string' || memory.length > 20000) throw new Error('LORE: request too large');
            if (messages.some(m => typeof m.content !== 'string' || m.multimodals?.length || m.thoughts?.length || m.tool_calls || m.function_call)) throw new Error('LORE: only plain text requests are supported');
            const db = DBState.db;
            if (getModelInfo(db.aiModel).format !== LLMFormat.OpenAICompatible) throw new Error('LORE: injection currently supports OpenAI-compatible text requests');
            const tokenizer = new LoreTokenizer(8, 'name');
            const memoryTokens = memory ? await tokenizer.tokenizeChat({role:'system',content:memory}) : 0;
            const requestTokens = await tokenizer.tokenizeChats(messages) + memoryTokens + 32;
            const reserve = Math.max(Number(db.maxResponse), Number(responseReserve)), limit = Number(db.maxContext);
            if (!Number.isFinite(limit) || !Number.isFinite(reserve) || limit <= reserve || !Number.isInteger(memoryBudget) || memoryBudget < 0) throw new Error('LORE: invalid prompt budget');
            return {fits: memoryTokens <= memoryBudget && requestTokens + reserve <= limit, memoryTokens, requestTokens, reserve, limit, method:'host-tokenizer-plus-framing-margin'};
        },
'''
if args.apply:
    dirty=subprocess.check_output(['git','-C',str(args.checkout),'status','--porcelain'],text=True).strip()
    if dirty:raise SystemExit('Use a clean host checkout; refusing to mix existing edits')
    branch='lore-bounded-plugin-api'
    suffix=1
    while subprocess.run(['git','-C',str(args.checkout),'show-ref','--verify','--quiet','refs/heads/'+branch]).returncode==0:
        suffix+=1
        branch=f'lore-bounded-plugin-api-{suffix}'
    subprocess.run(['git','-C',str(args.checkout),'switch','-c',branch],check=True)
    path.write_text(imports+text.replace(anchor,methods+anchor))
    shutil.copyfile(ROOT/'integration/pocketrisu-lore.mjs',path.parent/'lore-host.mjs')
    print('Installed. Build PocketRisu normally; no running service was changed.')
else:
    print('Compatible pinned checkout. Pass --apply to create a branch and install.')
