importScripts('core.js','sync-model.js','drive-sync.js');
let queue=Promise.resolve(),initialized=false;
function serial(fn){const result=queue.then(fn);queue=result.catch(()=>{});return result;}
const drive=new ZetaDriveSync({storage:chrome.storage.local,atomic:serial,identity:chrome.identity,configured:()=>Boolean(chrome.runtime.getManifest().oauth2?.client_id)});
async function initialize(){
  if(initialized)return;
  const d=await chrome.storage.local.get('initialized');
  if(!d.initialized){const values={initialized:true};for(const s of ZetaCore.seeds())values['session:'+s.id]=s;await chrome.storage.local.set(values);}
  initialized=true;
}
async function setup(){await serial(initialize);await drive.ensureEntries();await chrome.alarms.create('drive-periodic',{periodInMinutes:2});}
function schedule(){chrome.alarms.create('drive-soon',{delayInMinutes:0.5});}
chrome.runtime.onInstalled.addListener(()=>{setup().catch(console.error);});
chrome.runtime.onStartup.addListener(()=>{setup().then(()=>drive.sync()).catch(console.error);});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name.startsWith('drive-'))drive.sync();});
chrome.action.onClicked.addListener(()=>chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')}));
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  const fromDashboard=sender.url===chrome.runtime.getURL('dashboard.html');
  const fromGame=sender.url?.startsWith('https://arithmetic.zetamac.com/');
  if(!fromDashboard&&!fromGame)return false;
  // Auth and network operations must never occupy the local recording queue.
  if(['driveStatus','driveConnect','driveDisconnect','driveSync'].includes(message.type)){
    if(!fromDashboard){respond({ok:false,error:'Open records and backups to manage Google Drive.'});return false;}
    Promise.resolve().then(async()=>{
      await serial(initialize);
      if(message.type==='driveStatus')return drive.status();
      if(message.type==='driveConnect')return drive.connect();
      if(message.type==='driveDisconnect')return drive.disconnect();
      await drive.sync();return drive.status();
    }).then(data=>respond({ok:true,data}),e=>respond({ok:false,error:e.message}));return true;
  }
  serial(async()=>{
    await initialize();
    switch(message.type){
      case 'getData': {const d=await chrome.storage.local.get(null);return Object.fromEntries(Object.entries(d).filter(([key])=>key.startsWith('session:')||key==='metadata'));}
      case 'getRecorderState':return chrome.storage.local.get('metadata');
      case 'saveSession':{
        const s=ZetaCore.validateSessions([message.session])[0],key='session:'+s.id;
        const old=(await chrome.storage.local.get(key))[key];
        if(fromGame&&(old?.revision??0)>(s.revision??0))return true;
        const metaKey='drive:recorder-meta:'+s.id,previous=(await chrome.storage.local.get(metaKey))[metaKey];
        const metadataChanged=!old||(s.metadataRevision??0)>(previous??-1);
        await drive.change(s,fromGame?'record':'import',metadataChanged);
        if(fromGame)await chrome.storage.local.set({[metaKey]:s.metadataRevision??0});
        if(s.status!=='recording')schedule();return true;
      }
      case 'editSession':{
        if(!fromDashboard)throw new Error('Open records to edit a session.');
        const key='session:'+message.id,current=(await chrome.storage.local.get(key))[key];
        if(!current)throw new Error('Session no longer exists.');
        const updated=ZetaCore.validateSessions([{...current,date:message.date,metadata:message.metadata}])[0];
        await drive.change(updated,'annotation');schedule();return true;
      }
      case 'setMetadata':await chrome.storage.local.set({metadata:message.metadata});return true;
      case 'openDashboard':await chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')});return true;
      case 'import':{
        if(!fromDashboard)throw new Error('Open records to import data.');
        const sessions=ZetaCore.validateSessions(message.data);
        for(const s of sessions)await drive.change(s,'import');schedule();return sessions.length;
      }
      case 'deleteSession':{
        if(!fromDashboard)throw new Error('Open records to delete a session.');
        const s=(await chrome.storage.local.get('session:'+message.id))['session:'+message.id];
        if(s?.status==='recording'&&Date.now()-(s.updatedAt||0)<10000)throw new Error('Finish the active game before deleting its record.');
        await drive.remove(message.id);schedule();return true;
      }
      default:throw new Error('Unknown request');
    }
  }).then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error.message}));return true;
});
