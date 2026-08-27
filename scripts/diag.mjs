import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
async function rects(page){const ops=await page.getOperatorList();const n=Object.fromEntries(Object.entries(OPS).map(([k,v])=>[v,k]));const out=[];
for(let i=0;i<ops.fnArray.length;i++){if(n[ops.fnArray[i]]!=="constructPath")continue;const[fns,args]=ops.argsArray[i];let a=0;
for(const f of fns){const k=n[f];if(k==="rectangle"){out.push(args.slice(a,a+4).map(Number));a+=4}else if(k==="moveTo"||k==="lineTo")a+=2;else if(k==="curveTo")a+=6}}return out}
const key=(r)=>`${r[1].toFixed(1)}|${r[3].toFixed(1)}`;
function bands(rs){const m=new Map();for(const r of rs){if(r[2]<50||r[2]>160)continue;const k=key(r);if(!m.has(k))m.set(k,[]);const c=m.get(k);if(!c.some(x=>Math.abs(x[0]-r[0])<1))c.push(r)}
return [...m.values()].filter(c=>c.length===5).map(c=>c.sort((a,b)=>a[0]-b[0])).sort((a,b)=>b[0][1]-a[0][1])}
const dir=process.argv[2];
let totalBands=0, emptyName=0, emptyAddr=0;
const problems=[];
for(const f of readdirSync(dir).filter(f=>f.toLowerCase().endsWith(".pdf")).sort()){
  const doc=await getDocument({data:new Uint8Array(readFileSync(join(dir,f))),useSystemFonts:true}).promise;
  for(let p=1;p<=doc.numPages;p++){
    const page=await doc.getPage(p);
    const items=(await page.getTextContent()).items.filter(i=>i.str.trim());
    for(const cols of bands(await rects(page))){
      totalBands++;
      const cell=(rect)=>{const[x,y,w,h]=rect;return items.filter(it=>{const ix=it.transform[4],iy=it.transform[5];
        return ix>=x-1&&ix<x+w&&iy>=y-2&&iy<=y+h+2}).map(i=>i.str).join(" ").replace(/\s+/g," ").trim()};
      const c=cols.map(cell);
      if(c[0]==="Name") continue;
      if(!c[0]){emptyName++; if(problems.length<6)problems.push({f,p,y:cols[0][1],h:cols[0][3],cells:c});}
      else if(!c[1]){emptyAddr++; if(problems.length<6)problems.push({f,p,y:cols[0][1],h:cols[0][3],cells:c});}
    }
  }
}
console.error(`row bands (excl header): ${totalBands}`);
console.error(`dropped - empty name: ${emptyName}, empty address: ${emptyAddr}`);
console.error(JSON.stringify(problems,null,2).slice(0,1500));
