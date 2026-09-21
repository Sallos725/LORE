import {LiteStore} from './lite-store.mjs';
import {FullStore} from './full-store.mjs';
import {openUI} from './ui.mjs';
export async function install(host,edition) {
  let ui=null,alive=true;const registrations=[];
  const open=async()=>{
    if(!alive)return;ui?.close();
    ui=openUI({edition,host,connect:async options=>edition==='Full'?new FullStore(host,options.url,options.token):new LiteStore(await host.getLocalPluginStorage(),options.notebook)});
    await host.showContainer('fullscreen');
  };
  const dispose=async()=>{alive=false;ui?.close();ui=null;for(const id of registrations)await host.unregisterUIPart?.(id);registrations.length=0;await host.hideContainer?.();};
  await host.onUnload(dispose);
  const setting=await host.registerSetting(`LORE ${edition}`,open,'📖','html',`lore-${edition.toLowerCase()}-settings`);
  if(setting?.id)registrations.push(setting.id);
  const button=await host.registerButton?.({name:`LORE ${edition}`,icon:'📖',iconType:'html',location:'chat',id:`lore-${edition.toLowerCase()}-chat`},open);
  if(button?.id)registrations.push(button.id);
  if(!alive)await dispose();
  return {open,dispose};
}
