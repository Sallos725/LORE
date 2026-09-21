// Minimal standard MessagePack encoder for synthetic stock-HTTP fixtures.
export function encodeFixture(value){
 const chunks=[Uint8Array.of(0,82,73,83,85,83,65,86,69,0,7)];
 const byte=(...n)=>chunks.push(Uint8Array.from(n));
 const write=v=>{
  if(v===null){byte(192);return;}if(typeof v==='boolean'){byte(v?195:194);return;}
  if(typeof v==='number'){if(v>=0&&v<128)byte(v);else{const b=new Uint8Array(9);b[0]=203;new DataView(b.buffer).setFloat64(1,v);chunks.push(b);}return;}
  if(typeof v==='string'){const b=new TextEncoder().encode(v);if(b.length<32)byte(160+b.length);else byte(218,b.length>>8,b.length&255);chunks.push(b);return;}
  if(Array.isArray(v)){if(v.length<16)byte(144+v.length);else byte(220,v.length>>8,v.length&255);for(const item of v)write(item);return;}
  const entries=Object.entries(v);if(entries.length<16)byte(128+entries.length);else byte(222,entries.length>>8,entries.length&255);for(const [k,item] of entries){write(k);write(item);}
 };write(value);const result=new Uint8Array(chunks.reduce((s,c)=>s+c.length,0));let at=0;for(const c of chunks){result.set(c,at);at+=c.length;}return result;
}
