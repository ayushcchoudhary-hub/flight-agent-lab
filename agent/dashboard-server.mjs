import './register.mjs';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const envFile=fileURLToPath(new URL('./.env',import.meta.url));
if(existsSync(envFile))loadEnvFile(envFile);
const { createChatService }=await import('./chat-service.mjs');
const { accountPreferenceStore }=await import('./preferences.mjs');
const preferenceStore=process.env.AGENT_PREFERENCES_API_BASE&&process.env.AGENT_PREFERENCES_API_TOKEN?accountPreferenceStore({baseURL:process.env.AGENT_PREFERENCES_API_BASE,token:process.env.AGENT_PREFERENCES_API_TOKEN,label:'Authenticated local development account'}):undefined;
const chat=createChatService(preferenceStore?{preferenceStore}:{});
const csrf=randomBytes(32).toString('hex');
const root=fileURLToPath(new URL('.',import.meta.url));
const port=Number(process.env.AGENT_DASHBOARD_PORT||5180);
const assets={'/scope':['scope.html','text/html'],'/policy-examples':['policy-examples.html','text/html'],'/reply-preview':['reply-preview.html','text/html'],'/compare':['compare.html','text/html'],'/compare.js':['compare.js','text/javascript'],'/compare.css':['compare.css','text/css'],'/chat':['chat.html','text/html'],'/chat.js':['chat.js','text/javascript'],'/chat.css':['chat.css','text/css'],'/evals':['index.html','text/html'],'/':['overview.html','text/html'],'/overview.css':['overview.css','text/css'],'/overview.js':['overview.js','text/javascript'],'/dashboard.js':['dashboard.js','text/javascript'],'/dashboard.css':['dashboard.css','text/css']};
const send=(res,status,value,type='application/json')=>{res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"});res.end(typeof value==='string'?value:JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host))return send(res,403,{error:'Local access only.'});
  const url=new URL(req.url,`http://127.0.0.1:${port}`);
  try{
    if(req.method==='POST'){
      if(req.headers.origin!==`http://${req.headers.host}`||req.headers['x-lab-csrf']!==csrf||req.headers['content-type']!=='application/json')return send(res,403,{error:'Use the local dashboard to send a message.'});
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192)return send(res,413,{error:'Message is too large.'});}
      let input;try{input=JSON.parse(body);}catch{return send(res,400,{error:'Invalid request.'});}
      if(!input||Array.isArray(input)||typeof input!=='object')return send(res,400,{error:'Invalid request.'});
      try{
        if(url.pathname==='/api/preferences')return send(res,200,await chat.savePreferences(input.preferences));
        if(url.pathname==='/api/chat/welcome')return send(res,200,await chat.welcome(input.mode));
        if(url.pathname==='/api/chat/deals')return send(res,200,await chat.welcomeDeals(input.mode));
        if(url.pathname==='/api/chat/start')return send(res,200,await chat.start(input.mode,input.model,input.effort,typeof input.welcomeKey==='string'?input.welcomeKey.slice(0,300):null));
        if(url.pathname==='/api/chat/turn')return send(res,200,await chat.turn(input.id,input.text));
        if(url.pathname==='/api/chat/close')return send(res,200,chat.close(input.id));
      }catch(e){return send(res,400,{error:e.message});}
      return send(res,404,{error:'Not found.'});
    }
    if(req.method!=='GET')return send(res,405,{error:'Method unavailable.'});
    if(url.pathname==='/api/chat/status')return send(res,200,{...await chat.status(),csrf});
    if(assets[url.pathname]){const [file,type]=assets[url.pathname];return send(res,200,await readFile(join(root,'dashboard',file),'utf8'),type);}
    if(url.pathname==='/api/comparisons'){
      const names=(await readdir(join(root,'eval-results'),{withFileTypes:true})).filter(x=>x.isDirectory()&&/^compare-[\w.-]+$/.test(x.name)).map(x=>x.name).sort().reverse();
      return send(res,200,{runs:names});
    }
    if(url.pathname==='/api/comparison'){
      const id=url.searchParams.get('id');
      if(!id||!/^compare-[\w.-]+$/.test(id))return send(res,400,{error:'Invalid comparison.'});
      return send(res,200,JSON.parse(await readFile(join(root,'eval-results',id,'report.json'),'utf8')));
    }
    if(url.pathname==='/api/runs'){
      const names=(await readdir(join(root,'eval-results'),{withFileTypes:true})).filter(x=>x.isDirectory()&&/^live-[\w.-]+$/.test(x.name)).map(x=>x.name).sort().reverse();
      return send(res,200,{runs:names});
    }
    if(url.pathname==='/api/report'){
      const id=url.searchParams.get('id');
      if(!id||!/^live-[\w.-]+$/.test(id))return send(res,400,{error:'Invalid report.'});
      const path=join(root,'eval-results',id,'report.json');
      // A writer may be midway through replacing this local file; retry on the next poll.
      const report=JSON.parse(await readFile(path,'utf8'));
      const cases=JSON.parse(await readFile(join(root,'eval-results',id,'cases.json'),'utf8'));
      return send(res,200,{report,cases,updatedAt:(await stat(path)).mtime.toISOString()});
    }
    return send(res,404,{error:'Not found.'});
  }catch(e){return send(res,e instanceof SyntaxError?503:404,{error:e instanceof SyntaxError?'Report updating; retry shortly.':'Report unavailable.'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Flight agent dashboard: http://127.0.0.1:${port}`));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
