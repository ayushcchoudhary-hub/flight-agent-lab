import {timingSafeEqual} from 'node:crypto';

const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};

const publicErrors=new Set([
 'Wait for the current reply before saving defaults.',
 'Choose live staging or recorded staging.',
 'The demo is at its active-chat limit. Close a chat before starting another.',
 'Staging login has expired. Reconnect the staging session, or use recorded mode meanwhile.',
 'No recorded staging searches are available yet.',
 'This chat expired. Start a new chat.',
 'Enter a message of 1–2,000 characters.',
 'A message is still running. Wait for its reply.',
 'Demo message limit reached. No further model calls were made.',
 'Staging login has expired. Reconnect before sending; no model call was made.',
 'Wait for the current reply before resetting.',
 'Choose one of the evaluated model configurations.',
]);

export const clientErrorMessage=error=>{
 const message=error instanceof Error?error.message:String(error??'');
 return publicErrors.has(message)?message:'Request failed. Please try again.';
};

export function createCredentialGuard({username,password,maxFailures=10,lockMs=15*60*1000,now=Date.now}={}){
 const attempts=new Map();
 const status=identifier=>{
  const item=attempts.get(identifier);
  if(!item)return {locked:false,retryAfterSeconds:0};
  const remaining=item.lockedUntil-now();
  if(item.lockedUntil&&remaining<=0){attempts.delete(identifier);return {locked:false,retryAfterSeconds:0};}
  return {locked:remaining>0,retryAfterSeconds:remaining>0?Math.ceil(remaining/1000):0};
 },
 return {
  verify(identifier,suppliedUsername,suppliedPassword){
   const current=status(identifier);
   if(current.locked)return {allowed:false,...current};
   if(equal(suppliedUsername,username)&&equal(suppliedPassword,password)){attempts.delete(identifier);return {allowed:true,locked:false,retryAfterSeconds:0};}
   const previous=attempts.get(identifier)?.failures??0;
   const failures=previous+1;
   attempts.set(identifier,{failures,lockedUntil:failures>=maxFailures?now()+lockMs:0});
   return {allowed:false,locked:false,retryAfterSeconds:0};
  },
  status,
 };
}
