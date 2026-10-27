/* Versioned game data. Recording and annotations merge independently. */
(function(root){
  const zero={clock:0,device:''};
  function compare(a=zero,b=zero){return a.clock-b.clock||a.device.localeCompare(b.device);}
  function newer(a,b){return !a?b:!b?a:compare(a.version,b.version)>=0?a:b;}
  function fromSession(session,version=zero){return {schemaVersion:1,id:session.id,record:{version,data:session},annotations:{version,data:{date:session.date,metadata:session.metadata}},deletion:{version:zero,value:false}};}
  function merge(a,b){
    if(!a)return b;if(!b)return a;
    if(a.id!==b.id)throw new Error('Cannot merge different sessions.');
    return {schemaVersion:1,id:a.id,record:newer(a.record,b.record),annotations:newer(a.annotations,b.annotations),deletion:newer(a.deletion,b.deletion)};
  }
  function session(entry){if(entry.deletion.value)return null;return {...entry.record.data,...entry.annotations.data};}
  function signature(e){return JSON.stringify([e.record.version,e.annotations.version,e.deletion.version,e.deletion.value]);}
  function maxClock(e){return Math.max(e.record.version.clock,e.annotations.version.clock,e.deletion.version.clock);}
  function validate(e){
    if(!e||e.schemaVersion!==1||typeof e.id!=='string'||!e.record||!e.annotations||!e.deletion||typeof e.deletion.value!=='boolean')throw new Error('Invalid Drive game record.');
    for(const part of [e.record,e.annotations,e.deletion])if(!Number.isSafeInteger(part.version?.clock)||part.version.clock<0||typeof part.version.device!=='string')throw new Error('Invalid Drive record version.');
    if(e.record.data?.id!==e.id)throw new Error('Drive session ID mismatch.');
    root.ZetaCore.validateSessions([{...e.record.data,...e.annotations.data}]);return e;
  }
  root.ZetaSyncModel={zero,compare,fromSession,merge,session,signature,maxClock,validate};
  if(typeof module!=='undefined')module.exports=root.ZetaSyncModel;
})(globalThis);
