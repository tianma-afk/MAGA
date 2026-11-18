import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from '../../../../web/node_modules/@playwright/test/index.mjs';
const root = process.cwd();
if (!process.argv[2]) throw Error('Usage from repo root: node docs/iteration3_jack/assets/p4t4/render.mjs PATH_TO_MERMAID_MIN_JS');
const base = path.join(root, 'docs/iteration3_jack');
const out = path.join(base, 'assets/p4t4');
await fs.mkdir(out, {recursive:true});
const source = await fs.readFile(path.join(base,'phase4-architecture-design-and-views.md'),'utf8');
const blocks = [...source.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)].map(m=>m[1]);
if(blocks.length!==4) throw Error('Expected four existing source diagrams');
const names=['01-module-view','02-runtime-context','03-baseline-sequence','04-enhanced-fallback-sequence'];
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1920,height:1200},deviceScaleFactor:1});
await page.setContent('<html><head><meta charset="utf-8"></head><body style="margin:0;background:white"><div id="drawing"></div></body></html>');
await page.addScriptTag({path:path.resolve(process.argv[2])});
const results=[];
for(let i=0;i<blocks.length;i++){
 const info=await page.evaluate(async ({code,index})=>{
  mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral',fontFamily:'Microsoft YaHei, Arial, sans-serif',flowchart:{useMaxWidth:false},sequence:{useMaxWidth:false,wrap:false,actorMargin:100,diagramMarginX:35,noteMargin:15}});
  const result=await mermaid.render('diagram'+index,code);
  const host=document.getElementById('drawing');host.innerHTML=result.svg;
  await document.fonts.ready;
  const svg=host.querySelector('svg');const box=svg.viewBox.baseVal;
  svg.style.maxWidth='none';svg.style.width=box.width+'px';svg.style.height=box.height+'px';
  return {svg:svg.outerHTML,width:box.width,height:box.height,text:svg.textContent};
 },{code:blocks[i],index:i});
 await fs.writeFile(path.join(out,names[i]+'.mmd'),blocks[i]);
 await fs.writeFile(path.join(out,names[i]+'.svg'),info.svg);
 await page.locator('#drawing svg').screenshot({path:path.join(out,names[i]+'.png')});
 results.push({name:names[i],width:info.width,height:info.height,sha256:crypto.createHash('sha256').update(blocks[i]).digest('hex')});
}
console.log(JSON.stringify({mermaid:'11.12.0',browser:browser.version()},null,2));
await browser.close();
console.log(JSON.stringify(results.map(({name,width,height,sha256})=>({name,width,height,sha256})),null,2));
