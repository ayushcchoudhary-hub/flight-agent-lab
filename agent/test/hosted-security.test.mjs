import test from 'node:test';
import assert from 'node:assert/strict';
import {clientErrorMessage,createCredentialGuard} from '../hosted-security.mjs';

test('hosted server hides unexpected error detail but keeps intentional recovery guidance',()=>{
 assert.equal(clientErrorMessage(new Error('database-password-leaked')),'Request failed. Please try again.');
 assert.equal(clientErrorMessage(new Error('This chat expired. Start a new chat.')),'This chat expired. Start a new chat.');
});

test('credential guard locks an identifier after ten failed attempts for fifteen minutes',()=>{
 let time=1_000;
 const guard=createCredentialGuard({username:'demo',password:'correct',now:()=>time});
 for(let i=0;i<10;i++)assert.deepEqual(guard.verify('client','demo','wrong'),{allowed:false,locked:false,retryAfterSeconds:0});
 assert.deepEqual(guard.verify('client','demo','correct'),{allowed:false,locked:true,retryAfterSeconds:900});
 time+=15*60*1000;
 assert.deepEqual(guard.verify('client','demo','correct'),{allowed:true,locked:false,retryAfterSeconds:0});
});

test('credential guard isolates clients and clears failures after a valid login',()=>{
 const guard=createCredentialGuard({username:'demo',password:'correct'});
 guard.verify('one','demo','wrong');
 assert.equal(guard.verify('two','demo','correct').allowed,true);
 assert.equal(guard.verify('one','demo','correct').allowed,true);
 assert.equal(guard.status('one').locked,false);
});
