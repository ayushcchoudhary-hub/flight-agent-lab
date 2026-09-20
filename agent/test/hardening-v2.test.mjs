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
