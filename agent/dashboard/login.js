const form=document.querySelector('#login-form');
const error=document.querySelector('#error');
const button=document.querySelector('#login-button');
form.onsubmit=async event=>{
 event.preventDefault();error.hidden=true;button.disabled=true;
 try{
  const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.querySelector('#username').value,password:document.querySelector('#password').value})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Sign in failed.');location.replace('/');
 }catch(reason){error.textContent=reason.message;error.hidden=false;button.disabled=false;}
};
