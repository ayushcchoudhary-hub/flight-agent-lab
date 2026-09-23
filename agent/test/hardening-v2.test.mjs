import test from 'node:test';
import assert from 'node:assert/strict';
import {gradeV2Step} from '../hardening-v2.mjs';

const conversation={publicState:()=>({origin:null,destination:null,cabin:'business',dates:null,sort:'cheapest',nonstopOnly:true,pending:null,maxPriceUsd:null})};
const adapter={mode:'synthetic',calls:[]};

test('held-out v2 grading checks richer evidence and allowed outcomes',()=>{
 const result={status:'policy',text:'Please contact support@commonswyft.com.',sources:[]};
 const grade=gradeV2Step({outcomes:[{status:'clarify'},{status:'policy',sourceOrSupport:true,sort:'cheapest',nonstopOnly:true}]},result,conversation,adapter,{});
 assert.equal(grade.pass,true);
});

// A8 accepts either route to the same honest answer.
import {HARDENING_CASES_V2} from '../hardening-cases-v2.mjs';
test('held-out A8 accepts the overlap check or a direct clarifying question, never a search',()=>{
 const expected=HARDENING_CASES_V2.find(c=>c.id==='A8').steps[0].expected;
 const blank={publicState:()=>({origin:null,destination:null,cabin:'business',dates:null,pending:null,maxPriceUsd:null})},none={mode:'synthetic',calls:[]};
 const asked=gradeV2Step(expected,{status:'clarify',text:'Dubai is listed as both the departure and arrival. Where would you like to fly from Dubai?'},blank,none,{});
 assert.equal(asked.pass,true);
 const vague=gradeV2Step(expected,{status:'clarify',text:'Where would you like to go?'},blank,none,{});
 assert.equal(vague.pass,false,'a question that does not name the problem is not enough');
 const searched=gradeV2Step(expected,{status:'results',text:'Dubai to Dubai'},blank,{mode:'synthetic',calls:[{method:'POST'}]},{});
 assert.equal(searched.pass,false);
});
