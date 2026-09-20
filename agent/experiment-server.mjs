import './register.mjs';
import {createHmac,timingSafeEqual} from 'node:crypto';
import http from 'node:http';
import {readFile,readdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createChatService} from './chat-service.mjs';
import {OpenRouterModel} from './model.mjs';
import {HOSTED_MODEL_OPTIONS,hostedModelSettings} from './hosted-model-options.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
const host=process.env.HOST||'0.0.0.0';
const port=Number(process.env.PORT||8080);
const publicOrigin=(process.env.PUBLIC_ORIGIN||'').replace(/\/$/,'');
const username=process.env.EXPERIMENT_USERNAME||'demo';
const password=process.env.EXPERIMENT_PASSWORD||'';
const apiKey=process.env.OPENROUTER_API_KEY||'';
const model=process.env.OPENROUTER_MODEL||'deepseek/deepseek-v4.1-flash';
const defaultSettings=hostedModelSettings(model);
if(!password)throw new Error('Set EXPERIMENT_PASSWORD before starting the hosted experiment.');
if(!apiKey)throw new Error('Set OPENROUTER_API_KEY before starting the hosted experiment.');

let preferences={};
const preferenceStore={
 label:'Temporary hosted demo profile',
 async read(){return {...preferences};},
 async replace(value){preferences={...value};return {...preferences};},
};
const chat=createChatService({
 preferenceStore,
 capturesLoader:async()=>[],
 status:async()=>({connected:false,reason:'not-used',expiresAt:null}),
 modelOptions:HOSTED_MODEL_OPTIONS,
 settingsFor:hostedModelSettings,
 defaultModel:defaultSettings.model,
 defaultEffort:defaultSettings.effort,
 modelFactory:(trace,settings)=>new OpenRouterModel({apiKey,model:settings.model,reasoningEffort:settings.effort,maxCalls:15,trace}),
 maxTotalTurns:Number(process.env.EXPERIMENT_MAX_TURNS||250),
 maxSessions:Number(process.env.EXPERIMENT_MAX_SESSIONS||25),
 maxSessionTurns:15,
});
const assets={
 '/':['overview.html','text/html'],
 '/scope':['scope.html','text/html'],
 '/agent':['experiment.html','text/html'],
 '/chat':['experiment.html','text/html'],
 '/evals':['index.html','text/html'],
 '/compare':['compare.html','text/html'],
 '/policy-examples':['policy-examples.html','text/html'],
 '/reply-preview':['reply-preview.html','text/html'],
 '/experiment.js':['experiment.js','text/javascript'],
 '/dashboard.js':['dashboard.js','text/javascript'],
 '/compare.js':['compare.js','text/javascript'],
 '/overview.js':['overview.js','text/javascript'],
 '/dashboard.css':['dashboard.css','text/css'],
 '/chat.css':['chat.css','text/css'],
 '/compare.css':['compare.css','text/css'],
 '/overview.css':['overview.css','text/css'],
 '/login':['login.html','text/html'],
 '/login.js':['login.js','text/javascript'],
};
const htmlPaths=new Set(Object.entries(assets).filter(([,asset])=>asset[1]==='text/html').map(([path])=>path));
const hostedHtml=html=>html
 .replaceAll('<a href="/chat">Try models</a>','')
 .replaceAll('<a href="/chat">Try different models</a>','')
 .replaceAll('href="/chat"','href="/agent"');
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const sessionCookie='commonswyft_demo';
const sessionToken=createHmac('sha256',password).update(`session-v1:${username}`).digest('base64url');
const cookieValue=req=>(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length+1)||'';
const authorized=req=>{
 if(equal(cookieValue(req),sessionToken))return true;
 const value=req.headers.authorization||'';
 if(!value.startsWith('Basic '))return false;
 try{const [user,...rest]=Buffer.from(value.slice(6),'base64').toString().split(':');return equal(user,username)&&equal(rest.join(':'),password);}catch{return false;}
};
const originFor=req=>publicOrigin||`${req.headers['x-forwarded-proto']||'http'}://${req.headers.host}`;
const send=(res,status,value,type='application/json',headers={})=>{res.writeHead(status,{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",...headers});res.end(typeof value==='string'?value:JSON.stringify(value));};
const readJson=async(req,res)=>{let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192){send(res,413,{error:'Message is too large.'});return null;}}try{const input=JSON.parse(body);if(!input||Array.isArray(input)||typeof input!=='object')throw new Error();return input;}catch{send(res,400,{error:'Invalid request.'});return null;}};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,originFor(req));
 if(url.pathname==='/health'||url.pathname==='/healthz')return send(res,200,{status:'ok'});
 try{
  if(req.method==='GET'&&['/login','/login.js','/dashboard.css','/chat.css'].includes(url.pathname)){
   const asset=assets[url.pathname];return send(res,200,await readFile(join(root,'dashboard',asset[0]),'utf8'),asset[1]);
  }
  if(url.pathname==='/api/login'){
   if(req.method!=='POST'||req.headers.origin!==originFor(req)||req.headers['content-type']!=='application/json')return send(res,403,{error:'Use the experiment sign-in page.'});
   const input=await readJson(req,res);if(!input)return;
   if(typeof input.username!=='string'||typeof input.password!=='string'||!equal(input.username,username)||!equal(input.password,password))return send(res,401,{error:'That username or password did not match.'});
   return send(res,200,{ok:true},'application/json',{'Set-Cookie':`${sessionCookie}=${sessionToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`});
  }
  if(!authorized(req)){
   if(req.method==='GET'&&htmlPaths.has(url.pathname))return send(res,302,'Sign in required.','text/plain',{Location:'/login'});
   return send(res,401,{error:'Sign in required.'});
  }
  if(url.pathname==='/api/logout')return send(res,200,{ok:true},'application/json',{'Set-Cookie':`${sessionCookie}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`});
  if(req.method==='GET'){
   if(url.pathname==='/api/status'){const state=await chat.status();return send(res,200,{models:state.models,model:state.model,label:state.label,effort:state.effort,remainingTurns:state.remainingTurns});}
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
    const report=JSON.parse(await readFile(path,'utf8'));
    const cases=JSON.parse(await readFile(join(root,'eval-results',id,'cases.json'),'utf8'));
    return send(res,200,{report,cases,updatedAt:(await stat(path)).mtime.toISOString()});
   }
   const asset=assets[url.pathname];if(!asset)return send(res,404,{error:'Not found.'});
   const body=await readFile(join(root,'dashboard',asset[0]),'utf8');
   return send(res,200,asset[1]==='text/html'?hostedHtml(body):body,asset[1]);
  }
  if(req.method!=='POST')return send(res,405,{error:'Method unavailable.'});
  if(req.headers.origin!==originFor(req)||req.headers['content-type']!=='application/json')return send(res,403,{error:'Send requests from the experiment page.'});
  const input=await readJson(req,res);if(!input)return;
  if(url.pathname==='/api/chat/start'){const settings=hostedModelSettings(input.model??defaultSettings.model);return send(res,200,await chat.start('staging-public',settings.model,settings.effort));}
  if(url.pathname==='/api/chat/turn')return send(res,200,await chat.turn(input.id,input.text));
  if(url.pathname==='/api/chat/close')return send(res,200,chat.close(input.id));
  return send(res,404,{error:'Not found.'});
 }catch(error){return send(res,400,{error:error.message||'Request failed.'});}
});
server.listen(port,host,()=>console.log(`CommonSwyft experiment listening on ${host}:${port} with ${model}`));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
