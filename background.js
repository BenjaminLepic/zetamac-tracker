importScripts('core.js');
let queue=Promise.resolve();
function serial(fn){ const result=queue.then(fn); queue=result.catch(()=>{}); return result; }
let initialized=false;
async function initialize(){
  if(initialized)return;
  const data=await chrome.storage.local.get('initialized');
  if(!data.initialized){ const values={initialized:true}; for(const s of ZetaCore.seeds()) values['session:'+s.id]=s; await chrome.storage.local.set(values); }
  initialized=true;
}
chrome.runtime.onInstalled.addListener(()=>serial(initialize));
chrome.action.onClicked.addListener(()=>chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')}));
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  const fromDashboard=sender.url===chrome.runtime.getURL('dashboard.html');
  const fromGame=sender.url?.startsWith('https://arithmetic.zetamac.com/');
  if(!fromDashboard&&!fromGame) return false;
  serial(async()=>{
    await initialize();
    switch(message.type){
      case 'getData': return chrome.storage.local.get(null);
      case 'getRecorderState': return chrome.storage.local.get('metadata');
      case 'saveSession': {
        const s=ZetaCore.validateSessions([message.session])[0];
        const key='session:'+s.id;
        if(fromGame){const old=(await chrome.storage.local.get(key))[key];if((old?.revision??0)>(s.revision??0))return true;}
        await chrome.storage.local.set({[key]:s}); return true;
      }
      case 'editSession': {
        if(!fromDashboard)throw new Error('Open the dashboard to edit a session.');
        const key='session:'+message.id, current=(await chrome.storage.local.get(key))[key];
        if(!current)throw new Error('Session no longer exists.');
        const updated=ZetaCore.validateSessions([{...current,date:message.date,metadata:message.metadata}])[0];
        await chrome.storage.local.set({[key]:updated});return true;
      }
      case 'setMetadata': await chrome.storage.local.set({metadata:message.metadata}); return true;
      case 'openDashboard': await chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')}); return true;
      case 'import': {
        if(!fromDashboard) throw new Error('Open the dashboard to import data.');
        const sessions=ZetaCore.validateSessions(message.data), values={};
        for(const s of sessions) values['session:'+s.id]=s;
        await chrome.storage.local.set(values); return sessions.length;
      }
      case 'deleteSession': {
        if(!fromDashboard) throw new Error('Open the dashboard to delete a session.');
        await chrome.storage.local.remove('session:'+message.id); return true;
      }
      default: throw new Error('Unknown request');
    }
  }).then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error.message}));
  return true;
});
