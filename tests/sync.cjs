const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../core.js');
const M=require('../sync-model.js');
const DriveSync=require('../drive-sync.js');
const copy=x=>structuredClone(x);
function store(initial={}){const values=copy(initial);return {values,async get(keys){if(keys==null)return copy(values);const result={};for(const key of Array.isArray(keys)?keys:[keys])if(key in values)result[key]=copy(values[key]);return result;},async set(data){Object.assign(values,copy(data));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete values[key];}};}
function fakeDrive(){
  const files=new Map();let calls=0,next=0,offline=false,account='account-1',unauthorized=0;
  const fetcher=async(url,options={})=>{
    calls++;if(offline)throw Error('Network unavailable');
    if(unauthorized>0){unauthorized--;return new Response('{}',{status:401});}
    const u=new URL(url),response=data=>new Response(JSON.stringify(data),{status:200});
    if(u.pathname.endsWith('/about'))return response({user:{permissionId:account,email:account+'@example.test',emailAddress:account+'@example.test'}});
    if(u.pathname==='/drive/v3/files'){
      assert.equal(u.searchParams.get('spaces'),'appDataFolder');
      return response({files:[...files].map(([id,f])=>({id,name:f.metadata.name,appProperties:f.metadata.appProperties}))});
    }
    if(u.pathname==='/upload/drive/v3/files'){
      assert.equal(options.method,'POST');
      const boundary=options.headers['Content-Type'].split('boundary=')[1],parts=options.body.split('--'+boundary);
      const parse=part=>JSON.parse(part.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim());
      const metadata=parse(parts[1]),entry=parse(parts[2]);assert.deepEqual(metadata.parents,['appDataFolder']);M.validate(entry);
      const id='file-'+(++next);files.set(id,{metadata,entry});return response({id});
    }
    const id=u.pathname.split('/').at(-1);if(files.has(id))return response(files.get(id).entry);
    return new Response('{}',{status:404});
  };
  return {files,fetcher,get calls(){return calls;},set offline(x){offline=x;},set account(x){account=x;},set unauthorized(x){unauthorized=x;}};
}
function device(remote,name,initial={}){
  const storage=store(initial);let queue=Promise.resolve(),time=100000;
  const atomic=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
  const identity={tokens:[],removed:0,async getAuthToken(details){this.tokens.push(details);return {token:'test-token',grantedScopes:['https://www.googleapis.com/auth/drive.appdata']};},async removeCachedAuthToken(){this.removed++;},async clearAllCachedAuthTokens(){}};
  const sync=new DriveSync({storage,atomic,fetcher:remote.fetcher,identity,clock:()=>++time,uuid:()=>name});
  return {storage,sync,identity,write:async(s,kind='record',changed=false)=>atomic(()=>sync.change(s,kind,changed)),delete:async id=>atomic(()=>sync.remove(id)),time:x=>time=x};
}
const game=()=>({...C.seeds()[0],id:'new-game',source:'recorded',startedAt:1000,endedAt:2000,score:1,questions:[{text:'2 + 2',index:1,shownMs:0,correct:true,responseMs:1000,events:[{type:'keydown',atMs:100,key:'4',code:'Digit4',seq:1}],inputs:[{value:'4',atMs:101,seq:2}]}]});
test('no network or interactive login occurs before explicit connection',async()=>{
  const remote=fakeDrive(),a=device(remote,'a');await a.write(game());await a.sync.sync();assert.equal(remote.calls,0);assert.equal(a.identity.tokens.length,0);
});
test('complete records round-trip across two devices; repeated sync does not duplicate uploads',async()=>{
  const remote=fakeDrive(),a=device(remote,'a'),b=device(remote,'b');const original=game();await a.write(original);await a.sync.connect();
  assert.equal(remote.files.size,1);await b.sync.connect();assert.deepEqual(b.storage.values['session:new-game'],original);
  await a.sync.sync();await b.sync.sync();assert.equal(remote.files.size,1);
  assert(a.identity.tokens[0].interactive);assert(a.identity.tokens.slice(1).every(t=>!t.interactive));
});
test('concurrent annotation and recording changes merge without losing keystrokes',async()=>{
  const remote=fakeDrive(),a=device(remote,'a'),b=device(remote,'b');await a.write(game());await a.sync.connect();await b.sync.connect();
  const edited={...b.storage.values['session:new-game'],metadata:{...C.unknownMeta,music:'yes',notes:'Edited on laptop'}};
  await b.write(edited,'annotation');
  const improved=copy(game());improved.score=2;improved.questions[0].events.push({type:'keyup',key:'4',atMs:102,seq:3});
  await a.write(improved);await a.sync.sync();await b.sync.sync();await a.sync.sync();
  for(const d of [a,b]){const s=d.storage.values['session:new-game'];assert.equal(s.score,2);assert.equal(s.questions[0].events.length,2);assert.equal(s.metadata.notes,'Edited on laptop');}
});
test('offline records remain local and retry; expired access tokens refresh once',async()=>{
  const remote=fakeDrive(),a=device(remote,'a');await a.sync.connect();remote.offline=true;await a.write(game());await a.sync.sync();
  assert.equal(a.storage.values['session:new-game'].score,1);assert.equal((await a.sync.status()).state,'error');
  remote.offline=false;remote.unauthorized=1;await a.sync.sync();assert.equal(remote.files.size,1);assert.equal(a.identity.removed,1);assert.equal((await a.sync.status()).state,'synced');
});
test('account mismatch blocks uploads; disconnect leaves local data and stops network requests',async()=>{
  const remote=fakeDrive(),a=device(remote,'a');await a.sync.connect();await a.write(game());remote.account='other-account';await a.sync.sync();
  assert.equal(remote.files.size,0);assert.match((await a.sync.status()).error,/account changed/);await a.sync.disconnect();const calls=remote.calls;await a.sync.sync();assert.equal(remote.calls,calls);assert(a.storage.values['session:new-game']);
});
test('deletion syncs as a tombstone, and an explicit import can restore a game',async()=>{
  const remote=fakeDrive(),a=device(remote,'a'),b=device(remote,'b');await a.write(game());await a.sync.connect();await b.sync.connect();
  await a.delete('new-game');await a.sync.sync();await b.sync.sync();assert(!b.storage.values['session:new-game']);
  await b.write(game(),'import');await b.sync.sync();await a.sync.sync();assert.equal(a.storage.values['session:new-game'].score,1);
});
test('malformed cloud data is rejected and local recording survives',async()=>{
  const remote=fakeDrive(),a=device(remote,'a');await a.write(game());remote.files.set('bad',{metadata:{name:'bad'},entry:{id:'wrong'}});
  await a.sync.connect();assert.match((await a.sync.status()).error,/Invalid Drive/);assert.equal(a.storage.values['session:new-game'].score,1);
});
test('active games are kept local until a durable partial checkpoint is old enough',async()=>{
  const remote=fakeDrive(),a=device(remote,'a');await a.write({...game(),status:'recording',updatedAt:100000});await a.sync.connect();assert.equal(remote.files.size,0);
  a.time(200000);await a.sync.sync();assert.equal(remote.files.size,1);
});
test('merge is commutative, associative and idempotent for independently versioned fields',()=>{
  const a=M.fromSession(game(),{clock:1,device:'a'}),b={...a,annotations:{version:{clock:2,device:'b'},data:{date:a.annotations.data.date,metadata:{...C.unknownMeta,notes:'b'}}}},c={...a,deletion:{version:{clock:3,device:'c'},value:true}};
  assert.deepEqual(M.merge(a,b),M.merge(b,a));assert.deepEqual(M.merge(M.merge(a,b),c),M.merge(a,M.merge(b,c)));assert.deepEqual(M.merge(a,a),a);
});
test('a pending Drive upload does not block local recording checkpoints',async()=>{
  const remote=fakeDrive(),a=device(remote,'a');await a.sync.connect();await a.write(game());
  const original=a.sync.fetcher;let release,started;const began=new Promise(r=>started=r),gate=new Promise(r=>release=r);
  a.sync.fetcher=async(url,options)=>{if(url.includes('/upload/')){started();await gate;}return original(url,options);};
  const pending=a.sync.sync();await began;
  const update={...game(),score:2};
  await Promise.race([a.write(update),new Promise((_,reject)=>{const timeout=setTimeout(()=>reject(Error('Local checkpoint blocked on Drive')),1000);timeout.unref();})]);
  assert.equal(a.storage.values['session:new-game'].score,2);release();await pending;
  await a.sync.sync();const b=device(remote,'b');await b.sync.connect();assert.equal(b.storage.values['session:new-game'].score,2);
});
test('existing local history migrates without resetting recorded details',async()=>{
  const remote=fakeDrive(),original=game(),a=device(remote,'a',{'session:new-game':original,initialized:true});
  await a.sync.connect();assert.deepEqual(a.storage.values['session:new-game'],original);assert.equal(remote.files.size,1);
  const b=device(remote,'b');await b.sync.connect();assert.deepEqual(b.storage.values['session:new-game'],original);
});
