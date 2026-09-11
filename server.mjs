import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {validateSchedule} from './public/schedule.mjs';
import demo from './public/demo.mjs';
const root=new URL('./public/',import.meta.url);
const files={'/':'index.html','/app.mjs':'dist/app.js','/schedule.mjs':'schedule.mjs','/layout.mjs':'layout.mjs','/style.css':'style.css','/fonts.css':'fonts.css'};
for(const name of ['oswald-latin-600-normal.woff2','roboto-condensed-latin-400-normal.woff2','roboto-condensed-latin-700-normal.woff2','oswald-LICENSE.txt','roboto-condensed-LICENSE.txt'])files[`/fonts/${name}`]=`dist/fonts/${name}`;
let cache, cachedAt=0;
async function schedule(){
 if(!process.env.SCHEDULE_URL&&!process.env.SCHEDULE_FILE){
  const fresh=await import(`./public/demo.mjs?t=${Date.now()}`);
  return fresh.default;
 }
 if(cache&&Date.now()-cachedAt<60000)return cache;
 let data;
 if(process.env.SCHEDULE_FILE)data=JSON.parse(await readFile(process.env.SCHEDULE_FILE,'utf8'));
 else {const url=new URL(process.env.SCHEDULE_URL);if(url.protocol!=='https:')throw Error('Schedule feed must use HTTPS.');const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:process.env.SCHEDULE_TOKEN?{Authorization:`Bearer ${process.env.SCHEDULE_TOKEN}`}:{}});if(!response.ok)throw Error('Schedule provider unavailable.');const body=await response.text();if(body.length>5000000)throw Error('Schedule feed too large.');data=JSON.parse(body);}
 cache={...validateSchedule(data),demo:false};cachedAt=Date.now();return cache;
}
export function createServer(){return http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 try{
 if(path==='/api/schedule'){const data=await schedule();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({...data,servedAt:new Date().toISOString()}));return;}
 if(!files[path]){res.writeHead(404);res.end('Not found');return;}
 const file=files[path];res.writeHead(200,{'Content-Type':file.endsWith('.woff2')?'font/woff2':file.endsWith('.txt')?'text/plain':file.endsWith('.css')?'text/css':(file.endsWith('.mjs')||file.endsWith('.js'))?'text/javascript':'text/html','X-Content-Type-Options':'nosniff'});res.end(await readFile(new URL(file,root)));
 }catch{res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Could not load the schedule. Check the feed configuration and data format.'}));}
 });}
if(process.argv[1]===fileURLToPath(import.meta.url))createServer().listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log(`Airline Atlas: http://localhost:${process.env.PORT||4173}`));
