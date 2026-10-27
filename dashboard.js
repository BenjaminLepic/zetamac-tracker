(async () => {
  const C=ZetaCore, $=s=>document.querySelector(s), extension=!!globalThis.chrome?.runtime?.id;
  let sessions=[], grouping='session', selected=null, toastTimer;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={yes:'Yes',no:'No',unknown:'Unknown',work:'Work',home:'Home',other:'Other'};
  const dateLabel=d=>new Date(d+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
  const display=n=>n==null?'—':n.toFixed(1);
  const notify=t=>{$('#toast').textContent=t;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);};
  async function call(message){const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw Error(r?.error||'Extension unavailable');return r.data;}
  async function read(){
    if(extension){const data=await call({type:'getData'});sessions=Object.entries(data).filter(([k])=>k.startsWith('session:')).map(([,s])=>s);}
    else {const raw=localStorage.getItem('zeta-preview-v1');sessions=raw?C.validateSessions(JSON.parse(raw)):C.seeds();}
    sessions.sort((a,b)=>a.date.localeCompare(b.date)||(a.startedAt??0)-(b.startedAt??0)||(a.order??0)-(b.order??0)||a.id.localeCompare(b.id));
  }
  async function save(s,patch=false){
    if(extension)await call(patch?{type:'editSession',id:s.id,date:s.date,metadata:s.metadata}:{type:'saveSession',session:s});
    else {const i=sessions.findIndex(x=>x.id===s.id);if(i<0)sessions.push(s);else sessions[i]=s;localStorage.setItem('zeta-preview-v1',JSON.stringify(sessions));}
    await read();render();
  }
  function filter(){return sessions.filter(s=>{
    const mode=$('#settings-filter').value, music=$('#music-filter').value,location=$('#location-filter').value;
    return (mode==='all'||(mode==='default'?C.isDefault(s.settings):!C.isDefault(s.settings)))&&(!$('#since').value||s.date>=$('#since').value)&&(!$('#until').value||s.date<=$('#until').value)&&(music==='all'||s.metadata.music===music)&&(location==='all'||s.metadata.location===location);
  });}
  function completed(){return filter().filter(s=>s.status==='completed');}
  function render(){
    const all=filter(), done=all.filter(s=>s.status==='completed'),scores=done.map(s=>s.score),avg=C.mean(scores);
    const recent=C.mean(scores.slice(-5)),previous=C.mean(scores.slice(-10,-5)),change=recent!=null&&previous!=null?recent-previous:null;
    $('#summary').innerHTML=`<div><strong>${done.length}</strong><span>sessions</span></div><div><strong>${display(avg)}</strong><span>mean</span></div><div><strong>${scores.length?Math.max(...scores):'—'}</strong><span>best</span></div><div><strong class="change">${change==null?'—':(change>=0?'+':'')+change.toFixed(1)}</strong><span>last 5 vs prior 5</span></div>`;
    $('#session-count').textContent=all.length;
    $('#sessions').innerHTML=[...all].reverse().map(s=>`<tr data-id="${esc(s.id)}" class="${selected===s.id?'selected':''}"><td><button data-open="${esc(s.id)}">${esc(dateLabel(s.date))}</button><span class="date-sub">${s.startedAt?esc(new Date(s.startedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})):'Session '+s.order+' · time unknown'}</span></td><td>${s.score}</td><td>${s.metadata.music==='yes'?'On':s.metadata.music==='no'?'Off':'Unknown'}</td><td>${esc(labels[s.metadata.location]||'Unknown')}</td><td>${esc(labels[s.metadata.meeting]||'Unknown')}</td><td>${esc(labels[s.metadata.glasses]||'Unknown')}</td><td><span class="tag ${s.source==='recorded'?'live':''}">${s.status!=='completed'?'Partial':s.source==='recorded'?'Recorded':'Score only'}</span></td></tr>`).join('')||'<tr><td colspan="7">No sessions match these filters.</td></tr>';
    $('#history-note').textContent='Select a date to inspect its raw record, edit conditions, or export it. Historical scores retain their supplied order.';
    document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.open)));
    renderChart(done);renderComparisons(done);renderOperations(done);
  }
  function renderChart(done){
    let points=done.map((s,i)=>({x:i,y:s.score,s,label:`${dateLabel(s.date)} · ${s.score}`}));
    if(grouping==='day'){
      const days=new Map();for(const s of done){if(!days.has(s.date))days.set(s.date,[]);days.get(s.date).push(s);}
      points=[...days].map(([d,ss])=>({x:Date.parse(d+'T00:00:00Z'),y:C.mean(ss.map(s=>s.score)),s:ss.at(-1),label:`${dateLabel(d)} · ${ss.length} sessions · ${display(C.mean(ss.map(s=>s.score)))}`}));
    }
    $('#chart-caption').textContent=grouping==='session'?'Correct answers · ordered by date, then session':'Daily mean score · positioned by calendar date';
    if(!points.length){$('#chart').innerHTML='<div class="empty">No completed sessions in this view. Play a game or add a score.</div>';return;}
    const width=Math.max($('#chart').clientWidth,300),height=$('#chart').clientHeight,L=35,R=22,T=22,B=32;
    const min=Math.max(0,Math.floor((Math.min(...points.map(p=>p.y))-8)/10)*10),max=Math.max(min+20,Math.ceil((Math.max(...points.map(p=>p.y))+5)/10)*10);
    const x0=points[0].x,x1=points.at(-1).x;
    const px=x=>x1===x0?width/2:L+(x-x0)/(x1-x0)*(width-L-R),py=y=>T+(max-y)/(max-min)*(height-T-B);
    let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Score progression. Each point opens a session.">`;
    for(let i=0;i<=4;i++){const v=min+(max-min)*i/4;svg+=`<line class="grid" x1="${L}" x2="${width-R}" y1="${py(v)}" y2="${py(v)}"/><text x="${L-10}" y="${py(v)+4}" text-anchor="end">${Math.round(v)}</text>`;}
    const mean=C.mean(points.map(p=>p.y));svg+=`<line class="mean-line" x1="${L}" x2="${width-R}" y1="${py(mean)}" y2="${py(mean)}"/><path class="trace" d="${points.map((p,i)=>(i?'L':'M')+px(p.x)+','+py(p.y)).join(' ')}"/>`;
    points.forEach((p,i)=>{svg+=`<circle class="dot ${p.s.id===selected?'selected':''}" cx="${px(p.x)}" cy="${py(p.y)}" r="5" tabindex="0" role="button" aria-label="${esc(p.label)}" data-point="${esc(p.s.id)}"><title>${esc(p.label)}</title></circle>`;if(i===0||i===points.length-1||points.length<8)svg+=`<text x="${px(p.x)}" y="${height-7}" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}">${grouping==='session'?'#'+(i+1):esc(new Date(p.s.date+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}))}</text>`;});
    $('#chart').innerHTML=svg+'</svg>';
    $('#chart-detail').textContent=grouping==='day'?'Select a daily point to inspect its latest session.':'Select a point to inspect a session.';
    document.querySelectorAll('[data-point]').forEach(p=>{p.addEventListener('click',()=>openDetail(p.dataset.point));p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetail(p.dataset.point);}});});
  }
  function renderComparisons(done){
    const key=$('#compare').value,groups=new Map();for(const s of done){const k=s.metadata[key]||'unknown';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s.score);}
    const max=Math.max(1,...done.map(s=>s.score));
    $('#comparisons').innerHTML=[...groups].map(([k,values])=>{const avg=C.mean(values);return `<div class="compare-row"><div><span>${key==='music'?(k==='yes'?'Music on':k==='no'?'Music off':'Unknown'):esc(labels[k]||k)} <small>n=${values.length}</small></span><strong>${display(avg)}</strong></div><div class="bar"><span style="width:${avg/max*100}%"></span></div></div>`;}).join('')||'<p class="muted small">No completed sessions yet.</p>';
  }
  function renderOperations(done){
    const qs=done.flatMap(s=>s.questions).filter(q=>q.correct&&Number.isFinite(q.responseMs));
    $('#operations').innerHTML=qs.length?['addition','subtraction','multiplication','division'].map(op=>{const a=qs.filter(q=>q.operation===op);return `<div class="operation"><span>${op[0].toUpperCase()+op.slice(1)} <small>n=${a.length}</small></span><strong>${a.length?(C.mean(a.map(q=>q.responseMs))/1000).toFixed(2)+'s':'—'}</strong></div>`;}).join(''):'<p class="muted small">No recorded questions yet.</p>';
  }
  function metaFields(container,meta){
    container.innerHTML='';
    for(const [key,label,choices]of [['music','Music',['unknown','yes','no']],['location','Location',['unknown','work','home','other']],['meeting','In a meeting',['unknown','yes','no']],['glasses','Glasses',['unknown','yes','no']]]){
      const row=document.createElement('label');row.textContent=label;const select=document.createElement('select');select.name=key;
      for(const value of choices){const o=document.createElement('option');o.value=value;o.textContent=key==='music'&&value!=='unknown'?(value==='yes'?'On':'Off'):labels[value];select.append(o);}select.value=meta[key]||'unknown';row.append(select);container.append(row);
    }
  }
  function download(data,name,type='application/json'){
    const url=URL.createObjectURL(new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportCSV(records){
    const headers=['session_id','date','status','score','question_index','question','expected_answer','correct','shown_ms','solved_ms','response_ms','event_type','at_ms','key','code','value','input_type'];
    const rows=[headers];
    for(const s of records)for(const q of s.questions){const base=[s.id,s.date,s.status,s.score,q.index,q.text,q.answer,q.correct,q.shownMs,q.solvedMs,q.responseMs];const events=[...q.events,...q.inputs.map(e=>({...e,type:'input'}))].sort((a,b)=>a.atMs-b.atMs);if(!events.length)rows.push([...base]);for(const e of events)rows.push([...base,e.type,e.atMs,e.key,e.code,e.type==='input'?e.value:e.valueBefore,e.inputType]);}
    const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');download(csv,'zetamac-events.csv','text/csv');
  }
  function openDetail(id){
    const s=sessions.find(s=>s.id===id);if(!s)return;selected=id;render();
    const solved=s.questions.filter(q=>q.correct), backspaces=s.questions.reduce((n,q)=>n+q.events.filter(e=>e.type==='keydown'&&e.key==='Backspace').length,0);
    $('#detail-title').textContent=dateLabel(s.date)+(s.order?' · session '+s.order:'');
    $('#detail-content').innerHTML=`<div class="detail-top"><div><div class="detail-score">${s.score}</div><p class="muted">${s.status==='completed'?'correct answers':'correct so far · partial record'}</p></div><div class="small muted">${s.questions.length} questions observed<br>${backspaces} backspaces<br>${solved.length?display(C.mean(solved.map(q=>q.responseMs))/1000)+'s mean response':'No timing data'}</div></div><p class="status-copy">${s.source==='recorded'?'Recorded in '+esc(s.timezone||'unknown timezone')+'. Timing starts when the extension observes the first question.':'Historical score. Questions, keystrokes and time of day were not recorded.'}${s.initialScore?' Joined with score '+s.initialScore+'; earlier questions were not captured.':''}</p><form id="edit-form"><div class="form-pair"><label>Date <input type="date" name="date" value="${esc(s.date)}" required></label><div></div></div><div class="metadata-grid" id="edit-metadata"></div><label>Notes<textarea name="notes" rows="2">${esc(s.metadata.notes)}</textarea></label><button type="submit" class="primary">Save conditions</button></form><div class="detail-actions"><div><button id="session-json">Export raw JSON</button> <button id="session-csv">Export event CSV</button></div><button id="delete-session" class="danger">Delete session</button></div><h3>Question record</h3><ol class="question-list">${s.questions.map(q=>`<li><div class="question-head"><strong>${q.index}. ${esc(q.text)} = ${esc(q.answer)}</strong><small>${q.correct?'Correct · '+(q.responseMs/1000).toFixed(3)+'s':'Unfinished'} · ${q.events.filter(e=>e.type==='keydown').length} keys</small></div><p class="status-copy">Input sequence: ${q.inputs.length?q.inputs.map(e=>esc(JSON.stringify(e.value))).join(' → '):'No input'}</p><details><summary>Inspect ${q.events.length+q.inputs.length} events</summary><div class="events"><table><thead><tr><th>ms from start</th><th>Event</th><th>Key / value</th></tr></thead><tbody>${[...q.events,...q.inputs.map(e=>({...e,type:'input'}))].sort((a,b)=>a.atMs-b.atMs).map(e=>`<tr><td>${esc(e.atMs)}</td><td>${esc(e.type)}</td><td>${esc(e.type==='input'?JSON.stringify(e.value):e.key??e.valueBefore??'')}</td></tr>`).join('')}</tbody></table></div></details></li>`).join('')||'<p class="muted">This session contains a score only.</p>'}</ol>`;
    metaFields($('#edit-metadata'),s.metadata);
    $('#edit-form').addEventListener('submit',async e=>{e.preventDefault();const data=new FormData(e.target);const updated={...s,date:data.get('date'),metadata:{...s.metadata,...Object.fromEntries(['music','location','meeting','glasses','notes'].map(k=>[k,data.get(k)]))}};try{await save(updated,true);notify('Conditions saved');}catch(e){notify(e.message);}});
    $('#session-json').onclick=()=>download({schemaVersion:1,exportedAt:new Date().toISOString(),sessions:[sessions.find(x=>x.id===s.id)||s]},`zetamac-${s.id}.json`);
    $('#session-csv').onclick=()=>exportCSV([sessions.find(x=>x.id===s.id)||s]);
    $('#delete-session').onclick=async()=>{if(!confirm('Delete this session from this browser? Export a backup first if you want to keep it.'))return;try{if(extension)await call({type:'deleteSession',id:s.id});else{sessions=sessions.filter(x=>x.id!==s.id);localStorage.setItem('zeta-preview-v1',JSON.stringify(sessions));}$('#detail-dialog').close();await read();render();notify('Session deleted');}catch(e){notify(e.message);}};
    if(!$('#detail-dialog').open)$('#detail-dialog').showModal();
  }
  for(const field of ['settings-filter','since','until','music-filter','location-filter','compare'])$('#'+field).addEventListener('change',render);
  $('#reset').onclick=()=>{$('#settings-filter').value='default';$('#music-filter').value='all';$('#location-filter').value='all';$('#since').value='';$('#until').value='';render();};
  for(const [id,mode]of [['by-session','session'],['by-day','day']])$('#'+id).onclick=()=>{grouping=mode;$('#by-session').setAttribute('aria-pressed',String(mode==='session'));$('#by-day').setAttribute('aria-pressed',String(mode==='day'));render();};
  for(const b of document.querySelectorAll('.close'))b.onclick=()=>b.closest('dialog').close();
  $('#help').onclick=()=>$('#help-dialog').showModal();
  $('#export').onclick=()=>download({schemaVersion:1,exportedAt:new Date().toISOString(),sessions},'zetamac-backup-'+new Date().toISOString().slice(0,10)+'.json');
  $('#import').onclick=()=>$('#import-file').click();
  $('#import-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const imported=C.validateSessions(JSON.parse(await file.text()));if(extension)await call({type:'import',data:imported});else{const merged=new Map(sessions.map(s=>[s.id,s]));for(const s of imported)merged.set(s.id,s);localStorage.setItem('zeta-preview-v1',JSON.stringify([...merged.values()]));}await read();render();notify(`${imported.length} sessions imported`);}catch(e){notify(e.message);}finally{$('#import-file').value='';}};
  metaFields($('#add-metadata'),C.unknownMeta);
  $('#add').onclick=()=>{const d=new Date();$('#add-form [name=date]').value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);$('#add-dialog').showModal();};
  $('#add-form').onsubmit=async e=>{e.preventDefault();const data=new FormData(e.target);try{const s={id:crypto.randomUUID(),date:data.get('date'),startedAt:null,endedAt:null,status:'completed',score:Number(data.get('score')),source:'manual',settings:{...C.defaults},defaultSettings:true,questions:[],metadata:Object.fromEntries(['music','location','meeting','glasses','notes'].map(k=>[k,data.get(k)])),order:Math.max(0,...sessions.filter(s=>s.date===data.get('date')).map(s=>s.order||0))+1};await save(s);$('#add-dialog').close();e.target.reset();notify('Score saved');}catch(e){notify(e.message);}};
  if(!extension){$('#mode-banner').hidden=false;$('#mode-banner').textContent='Historical preview. To record games, load this folder as a Chrome / Edge extension, then open the dashboard from its toolbar button. Preview records are stored separately.';}
  if(extension)chrome.storage.onChanged.addListener(async changes=>{if(Object.keys(changes).some(k=>k.startsWith('session:'))){await read();render();}});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>renderChart(completed()),100);});
  try{await read();render();}catch(e){notify('Could not load records: '+e.message);}
})();
