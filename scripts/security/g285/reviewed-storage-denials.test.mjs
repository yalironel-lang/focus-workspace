import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewedStorageMutation, reviewedUserContentRead } from './reviewed-storage-denials.mjs';
const response = logical => ({data:null,error:{name:'StorageApiError',status:400,statusCode:logical},
  transportHttpStatus:400,transportClassification:logical==='403'?'STORAGE_AUTHORIZATION_ERROR':'STORAGE_NO_SUCH_KEY'});
const state = () => ({ownerIntact:true,attackerIntact:true,foreignDestinationAbsent:true,attackerDestinationAbsent:true,bindingVerified:true});
const readback = () => ({classification:'OWNER_READBACK_MATCH',ownerAccessible:true,pathUnchanged:true,identityMatches:true,bytesMatch:true});
const entries = [];
for(const i of [0,1])for(const bucket of ['pdfs','user-content'])for(const op of ['upload','overwrite','update','move-owned-to-foreign','move-foreign-source'])
  entries.push({label:`cross-${i}-${bucket}-${op}`,i,logical:op==='move-foreign-source'?'404':'403',check:reviewedStorageMutation,evidence:state});
for(const i of [0,1])for(const op of ['download','sign'])
  entries.push({label:`cross-${i}-user-content-${op}`,i,logical:'404',check:reviewedUserContentRead,evidence:readback});

test('all 24 reviewed operations accept only exact evidence and reject other operation/bucket/direction',()=>{
  assert.equal(entries.length,24);
  for(const x of entries){
    assert.equal(x.check(response(x.logical),x.evidence(),x.label,x.i),true,x.label);
    assert.equal(x.check(response(x.logical),x.evidence(),x.label,1-x.i),false);
    assert.equal(x.check(response(x.logical),x.evidence(),x.label+'-other',x.i),false);
    assert.equal(x.check(response(x.logical==='403'?'404':'403'),x.evidence(),x.label,x.i),false);
  }
  for(const i of [0,1])for(const op of ['download','sign'])
    assert.equal(reviewedUserContentRead(response('404'),readback(),`cross-${i}-pdfs-${op}`,i),false);
  assert.equal(reviewedStorageMutation(response('403'),state(),'cross-0-pdfs-delete',0),false);
});
test('every corrected operation rejects success, leaked data and all malformed/conflicting response evidence',()=>{
  for(const x of entries){
    const base=response(x.logical);
    for(const patch of [{data:undefined},{data:{}},{data:[]},{data:Buffer.alloc(0)},{data:{signedUrl:'PRIVATE_SENTINEL'}},
      {error:null},{error:{...base.error,status:'400'}},{error:{...base.error,status:403}},
      {error:{...base.error,statusCode:Number(x.logical)}},{error:{...base.error,statusCode:false}},
      {error:{...base.error,statusCode:{}}},{error:{...base.error,code:'42501'}},{error:{...base.error,error:'InvalidJWT'}},
      {status:400},{statusCode:x.logical},{code:'42501'},{transportHttpStatus:undefined},{transportHttpStatus:'400'},
      {transportHttpStatus:403},{transportClassification:undefined},{transportClassification:'STORAGE_NO_SUCH_BUCKET'},
      {transportClassification:'STORAGE_AUTHENTICATION_ERROR'},{transportClassification:'STORAGE_OPERATIONAL_ERROR'},
      {transportClassification:'TRANSPORT_CONTRADICTORY_ERROR'},{transportClassification:'TRANSPORT_SUCCESS_RESPONSE'},
      {transportFailureKind:'TLS_FAILURE'}])
      assert.equal(x.check({...base,...patch},x.evidence(),x.label,x.i),false,x.label);
  }
});
test('every evidence boolean is mandatory and literal; inherited and accessor errors cannot pass',()=>{
  let reads=0;
  for(const x of entries){
    for(const [key,v]of Object.entries(x.evidence()))for(const value of [false,null,undefined,1,'true'])
      assert.equal(x.check(response(x.logical),{...x.evidence(),[key]:value},x.label,x.i),false);
    const inherited=Object.assign(Object.create({code:'InvalidJWT'}),response(x.logical).error);
    assert.equal(x.check({...response(x.logical),error:inherited},x.evidence(),x.label,x.i),false);
    const error=Object.defineProperty({...response(x.logical).error},'statusCode',{get(){reads++;throw Error('PRIVATE_SENTINEL')}});
    assert.equal(x.check({...response(x.logical),error},x.evidence(),x.label,x.i),false);
    assert.equal(x.check(Object.assign([],response(x.logical)),x.evidence(),x.label,x.i),false);
    assert.equal(x.check({...response(x.logical),error:Object.assign([],response(x.logical).error)},x.evidence(),x.label,x.i),false);
    assert.equal(x.check(response(x.logical),Object.assign([],x.evidence()),x.label,x.i),false);
  }
  assert.equal(reads,0);
});
