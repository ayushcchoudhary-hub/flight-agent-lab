import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {validatePreferences} from './preferences.mjs';

const defaultRoot=new URL('./local-state/',import.meta.url);
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
async function readJSON(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function atomicJSON(path,value){await mkdir(dirname(path),{recursive:true,mode:0o700});const tmp=path+'.tmp';await writeFile(tmp,JSON.stringify(value,null,2),{mode:0o600});await rename(tmp,path);}

export async function createPreferencesDevBackend({host='127.0.0.1',port=5181,dataFile=new URL('account-preferences.json',defaultRoot).pathname,accounts}={}){
 const tokenFile=new URL('preferences-backend-token',defaultRoot).pathname;
 const usesDefaultAccount=!accounts;
 if(!accounts){let token;try{token=(await readFile(tokenFile,'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;token=randomBytes(32).toString('base64url');await mkdir(dirname(tokenFile),{recursive:true,mode:0o700});await writeFile(tokenFile,token,{mode:0o600});}accounts=new Map([[token,'local-demo-user']]);}
 if(usesDefaultAccount){
  const existing=await readJSON(dataFile,null);
  if(existing===null){
   const legacy=await readJSON(new URL('preferences.json',defaultRoot).pathname,null);
   if(legacy!==null)await atomicJSON(dataFile,{'local-demo-user':validatePreferences(legacy)});
  }
 }
 let writeQueue=Promise.resolve();
 const server=http.createServer(async(req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  if(req.headers.host!==`${host}:${server.address()?.port??port}`||req.url!=='/v1/me')return send(404,{error:'Not found.'});
  const supplied=(req.headers.authorization??'').replace(/^Bearer /,'');let user='';for(const [token,id] of accounts)if(equal(supplied,token))user=id;
  if(!user)return send(401,{error:'Authentication required.'});
  try{
   if(req.method==='GET'){const db=await readJSON(dataFile,{});return send(200,{profile:{travelPreferences:validatePreferences(db[user]??{})}});}
   if(req.method!=='PATCH')return send(405,{error:'Method unavailable.'});
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return send(413,{error:'Request too large.'});}
   const input=JSON.parse(body);if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).length!==1||!Object.hasOwn(input,'travelPreferences'))return send(400,{error:'Only travelPreferences can be changed.'});
   const preferences=validatePreferences(input.travelPreferences);
   writeQueue=writeQueue.then(async()=>{const db=await readJSON(dataFile,{});db[user]=preferences;await atomicJSON(dataFile,db);});await writeQueue;
   return send(200,{profile:{travelPreferences:preferences}});
  }catch{return send(400,{error:'Invalid preference request.'});}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 return {server,baseURL:`http://${host}:${server.address().port}`,tokenFile,close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}

if(process.argv[1]===new URL(import.meta.url).pathname){const backend=await createPreferencesDevBackend();console.log(`Local authenticated preferences API: ${backend.baseURL}`);}
