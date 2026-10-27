/* All network work lives outside the recorder's local storage queue. */
(function(root){
  class DriveSync {
    // Native fetch requires its Window/WorkerGlobalScope receiver, even when stored on an instance.
    constructor({storage,atomic,fetcher=root.fetch.bind(root),identity,configured=()=>true,clock=()=>Date.now(),uuid=()=>crypto.randomUUID()}){
      Object.assign(this,{storage,atomic,fetcher,identity,configured,clock,uuid});
      this.running=null;this.generation=0;this.replacementTokens=new Map();
    }
    async status(){const d=await this.storage.get(['drive:connection','drive:status']);return {configured:this.configured(),connection:d['drive:connection']||null,...d['drive:status']};}
    async setStatus(patch){await this.atomic(async()=>{const d=await this.storage.get('drive:status');await this.storage.set({'drive:status':{...d['drive:status'],...patch}});});}
    async ensureEntries(){return this.atomic(async()=>{
      const all=await this.storage.get(null), values={};
      if(!all['drive:device'])values['drive:device']=this.uuid();
      for(const [key,s]of Object.entries(all))if(key.startsWith('session:')&&!all['drive:entry:'+s.id])values['drive:entry:'+s.id]=ZetaSyncModel.fromSession(s);
      if(Object.keys(values).length)await this.storage.set(values);
    });}
    // Called only inside the local queue, together with the corresponding session write.
    async change(session,kind='record',metadataChanged=false){
      const key='drive:entry:'+session.id,d=await this.storage.get([key,'drive:clock','drive:device']);
      const old=d[key]||ZetaSyncModel.fromSession(session),device=d['drive:device']||this.uuid();
      const version={clock:Math.max(this.clock(),(d['drive:clock']||0)+1,ZetaSyncModel.maxClock(old)+1),device};
      const entry={...old};
      if(kind==='import'){entry.record={version,data:session};entry.annotations={version,data:{date:session.date,metadata:session.metadata}};entry.deletion={version,value:false};}
      else if(kind==='annotation')entry.annotations={version,data:{date:session.date,metadata:session.metadata}};
      else {entry.record={version,data:session};if(!d[key]||metadataChanged)entry.annotations={version,data:{date:session.date,metadata:session.metadata}};}
      const result=ZetaSyncModel.session(entry);
      const values={[key]:entry,'drive:clock':version.clock,'drive:device':device};
      if(result)values['session:'+session.id]=result;
      await this.storage.set(values);
      return entry;
    }
    async remove(id){
      const key='drive:entry:'+id,d=await this.storage.get([key,'session:'+id,'drive:clock','drive:device']);
      if(!d[key]&&!d['session:'+id])return;
      const entry=d[key]||ZetaSyncModel.fromSession(d['session:'+id]);
      const version={clock:Math.max(this.clock(),(d['drive:clock']||0)+1,ZetaSyncModel.maxClock(entry)+1),device:d['drive:device']||this.uuid()};
      await this.storage.set({[key]:{...entry,deletion:{version,value:true}},'drive:clock':version.clock,'drive:device':version.device});
      await this.storage.remove('session:'+id);
    }
    assertGeneration(generation){if(generation!==this.generation)throw new Error('Sync stopped.');}
    async token(interactive){
      if(!this.configured())throw new Error('Google connection needs its OAuth client configuration. Recording still works locally.');
      if(typeof this.identity?.getAuthToken!=='function')throw new Error('Google Drive sign-in currently requires Google Chrome. Local recording and JSON backups still work here.');
      const result=await this.identity.getAuthToken({interactive,enableGranularPermissions:true});
      const token=typeof result==='string'?result:result?.token;
      if(!token)throw new Error('Google sign-in did not return access.');
      if(result.grantedScopes&&!result.grantedScopes.includes('https://www.googleapis.com/auth/drive.appdata'))throw new Error('Allow the application-data permission to connect Drive.');
      return token;
    }
    async request(url,token,options={},retry=true){
      token=this.replacementTokens.get(token)||token;
      const response=await this.fetcher(url,{...options,headers:{...options.headers,Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});
      if(response.status===401&&retry){await this.identity.removeCachedAuthToken({token});const fresh=await this.token(false);this.replacementTokens.set(token,fresh);return this.request(url,fresh,options,false);}
      if(!response.ok){const error=new Error(response.status===401?'Reconnect Google Drive to resume syncing.':response.status===403?'Drive access was denied. Check the Drive API and app-data permission.':response.status===429?'Google Drive is busy. Sync will retry automatically.':`Google Drive returned ${response.status}. Sync will retry automatically.`);error.status=response.status;throw error;}
      return response.json();
    }
    async account(token){
      const result=await this.request('https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress,displayName)',token);
      if(!result.user?.permissionId)throw new Error('Could not identify this Google Drive account.');
      return {id:result.user.permissionId,email:result.user.emailAddress||'',name:result.user.displayName||''};
    }
    async connect(){
      const generation=++this.generation;this.replacementTokens.clear();
      const token=await this.token(true),account=await this.account(token);this.assertGeneration(generation);
      const connection={account,connectedAt:this.clock(),generation:this.uuid()};
      await this.storage.set({'drive:connection':connection});
      await this.setStatus({state:'connected',error:null,lastSyncedAt:null});
      if(this.running)await this.running;await this.sync();return this.status();
    }
    async disconnect(){
      ++this.generation;
      await this.storage.remove('drive:connection');
      await this.identity.clearAllCachedAuthTokens?.();this.replacementTokens.clear();
      await this.setStatus({state:'disconnected',error:null});
      return this.status();
    }
    async list(token){
      const files=[];let pageToken;
      do{
        const query=new URLSearchParams({spaces:'appDataFolder',pageSize:'1000',fields:'nextPageToken,files(id,name,appProperties)',q:"trashed = false and appProperties has { key='application' and value='zetamac-training-log' }"});
        if(pageToken)query.set('pageToken',pageToken);
        const result=await this.request('https://www.googleapis.com/drive/v3/files?'+query,token);
        files.push(...(result.files||[]));pageToken=result.nextPageToken;
      }while(pageToken);return files;
    }
    async upload(entry,token){
      const json=JSON.stringify(entry),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(json)))).map(n=>n.toString(16).padStart(2,'0')).join('');
      const metadata={name:`game-${hash}.json`,parents:['appDataFolder'],mimeType:'application/json',appProperties:{application:'zetamac-training-log',schema:'1',digest:hash}};
      const boundary='zetamac_'+this.uuid();
      const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
      return this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',token,{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
    }
    sync(){
      if(this.running)return this.running;
      const generation=this.generation;
      this.running=this.run(generation).catch(async error=>{
        if(generation===this.generation)await this.setStatus({state:'error',error:error.message});
        return {error:error.message};
      }).finally(()=>{this.running=null;});return this.running;
    }
    async run(generation){
      const d=await this.storage.get('drive:connection'),connection=d['drive:connection'];
      if(!connection)return;
      await this.ensureEntries();await this.setStatus({state:'syncing',error:null});
      const token=await this.token(false),account=await this.account(token);this.assertGeneration(generation);
      if(account.id!==connection.account.id)throw new Error('Google account changed. Disconnect and connect the intended account before syncing.');
      const cacheKey='drive:cache:'+account.id;
      let cache=(await this.storage.get(cacheKey))[cacheKey]||{seen:[],uploaded:{}};
      const seen=new Set(cache.seen),files=await this.list(token),remote=new Map();
      let downloaded=0,uploaded=0;
      for(const file of files){
        this.assertGeneration(generation);
        if(seen.has(file.id))continue;
        let entry;
        try{entry=ZetaSyncModel.validate(await this.request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media',token));}
        catch(error){if(error.status===404)continue;throw error;}
        this.assertGeneration(generation);
        await this.atomic(async()=>{
          const key='drive:entry:'+entry.id,current=(await this.storage.get(key))[key],merged=ZetaSyncModel.merge(current,entry),session=ZetaSyncModel.session(merged);
          const clock=(await this.storage.get('drive:clock'))['drive:clock']||0;
          await this.storage.set({[key]:merged,'drive:clock':Math.max(clock,ZetaSyncModel.maxClock(merged))});
          if(session)await this.storage.set({['session:'+entry.id]:session});else await this.storage.remove('session:'+entry.id);
        });
        remote.set(entry.id,ZetaSyncModel.merge(remote.get(entry.id),entry));seen.add(file.id);downloaded++;
      }
      // Snapshot without holding the recorder's local queue during any HTTP request.
      const all=await this.atomic(()=>this.storage.get(null));
      for(const [key,entry]of Object.entries(all)){
        if(!key.startsWith('drive:entry:'))continue;
        this.assertGeneration(generation);
        const signature=ZetaSyncModel.signature(entry),session=ZetaSyncModel.session(entry);
        // Ongoing games are checkpointed on the periodic alarm; never upload on every key.
        if(session?.status==='recording'&&this.clock()-(session.updatedAt||session.startedAt||0)<45000)continue;
        if(cache.uploaded[entry.id]===signature)continue;
        if(remote.has(entry.id)&&ZetaSyncModel.signature(remote.get(entry.id))===signature){cache.uploaded[entry.id]=signature;continue;}
        const file=await this.upload(entry,token);this.assertGeneration(generation);
        seen.add(file.id);cache.uploaded[entry.id]=signature;uploaded++;
        // Persist progress after each upload so a service-worker restart is retryable.
        await this.storage.set({[cacheKey]:{seen:[...seen],uploaded:cache.uploaded}});
      }
      this.assertGeneration(generation);
      await this.storage.set({[cacheKey]:{seen:[...seen],uploaded:cache.uploaded}});
      await this.setStatus({state:'synced',error:null,lastSyncedAt:this.clock(),uploaded,downloaded});
      return {uploaded,downloaded};
    }
  }
  root.ZetaDriveSync=DriveSync;
  if(typeof module!=='undefined')module.exports=DriveSync;
})(globalThis);
