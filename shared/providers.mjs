import {boundedString,requireValue} from './core.mjs';
export const PROVIDERS={
 openai:{label:'OpenAI',url:'https://api.openai.com/v1/chat/completions',format:'openai'},
 openrouter:{label:'OpenRouter',url:'https://openrouter.ai/api/v1/chat/completions',format:'openai'},
 anthropic:{label:'Anthropic',url:'https://api.anthropic.com/v1/messages',format:'anthropic'},
 gemini:{label:'Google Gemini',url:'https://generativelanguage.googleapis.com/v1beta',format:'gemini'},
 ollama:{label:'Ollama',url:'http://localhost:11434/v1/chat/completions',format:'openai'},
 custom:{label:'사용자 지정 · OpenAI 호환',url:'',format:'openai'}
};
export function providerConfig(config) {
 const provider=config.provider??'custom';requireValue(Object.hasOwn(PROVIDERS,provider),'Unknown LLM provider');
 const url=new URL(config.url||PROVIDERS[provider].url);requireValue(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&!url.hash&&!url.search,'Invalid LLM URL');
 boundedString(config.model,'model',160);requireValue(!config.apiKey||(typeof config.apiKey==='string'&&config.apiKey.length<=4096&&!/[\r\n]/.test(config.apiKey)),'Invalid API key');
 const timeoutMs=Number(config.timeoutMs??45000);requireValue(Number.isInteger(timeoutMs)&&timeoutMs>=100&&timeoutMs<=120000,'Invalid LLM timeout');
 return {provider,url:url.href.replace(/\/$/,''),model:config.model,apiKey:config.apiKey??'',timeoutMs,jsonMode:config.jsonMode===true};
}
export function providerRequest(config,messages) {
 const c=providerConfig(config),format=PROVIDERS[c.provider].format,headers={'content-type':'application/json'};let url=c.url,body;
 if(format==='anthropic'){
  if(c.apiKey)headers['x-api-key']=c.apiKey;headers['anthropic-version']='2023-06-01';
  body={model:c.model,max_tokens:4096,system:messages[0].content,messages:messages.slice(1)};
 }else if(format==='gemini'){
  if(c.apiKey)headers['x-goog-api-key']=c.apiKey;url+=`/models/${encodeURIComponent(c.model)}:generateContent`;
  body={systemInstruction:{parts:[{text:messages[0].content}]},contents:messages.slice(1).map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:4096,...(c.jsonMode?{responseMimeType:'application/json'}:{})}};
 }else{
  if(c.apiKey)headers.authorization=`Bearer ${c.apiKey}`;
  body={model:c.model,messages,max_tokens:4096,...(c.jsonMode?{response_format:{type:'json_object'}}:{})};
 }
 return {url,headers,body,format};
}
export function providerText(format,envelope) {
 let text;if(format==='anthropic')text=envelope.content?.filter(p=>p.type==='text').map(p=>p.text).join('');
 else if(format==='gemini')text=envelope.candidates?.[0]?.content?.parts?.filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('');
 else text=envelope.choices?.[0]?.message?.content;
 requireValue(typeof text==='string'&&text.length>0,'LLM returned no text',502);
 return text.replace(/^\s*```(?:json)?\s*\n([\s\S]*?)\n```\s*$/,'$1').trim();
}
