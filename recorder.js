(() => {
  if (window.__zetaTrainingLog) return;
  window.__zetaTrainingLog = true;
  const C = ZetaCore;
  let metadata = {...C.unknownMeta}, session = null, question = null;
  let lastScore = 0, panel = null, status = null, loaded = false;
  let origin = 0, sequence = 0, flushPending = false;
  const pressed = new Map();
  const elapsed = () => Math.max(0, Math.round(performance.now() - origin));
  const stamp = () => ({seq: ++sequence, atMs: elapsed()});
  const answerField = target => target instanceof HTMLInputElement && target.matches('#game input.answer');
  function show(text) { if (status && status.textContent !== text) status.textContent = text; }
  async function call(message) {
    const result = await chrome.runtime.sendMessage(message);
    if (!result?.ok) throw new Error(result?.error || 'Extension unavailable');
    return result.data;
  }
  // Every event schedules a checkpoint in the same task. The service worker serializes writes.
  function save() {
    if (flushPending || !session) return;
    flushPending = true;
    queueMicrotask(() => {
      flushPending = false;
      session.updatedAt = Date.now();
      session.revision = (session.revision || 0) + 1;
      const snapshot = JSON.parse(JSON.stringify(session));
      call({type:'saveSession', session:snapshot}).then(() => {
        if (session.status === 'completed' && snapshot.revision === session.revision) show(`Saved · score ${session.score}`);
      }).catch(() => show('Save failed. Keep this tab open; use Download record.'));
    });
  }
  function settings() {
    for (const script of document.querySelectorAll('script[type="module"]')) {
      const match = script.textContent.match(/\binit\((\{[^;]*\})\)/);
      if (match) { try { const options = JSON.parse(match[1]); return {...options, duration:options.duration ?? 120}; } catch {} }
    }
    return null;
  }
  function addQuestion(text) {
    const parsed = C.parseProblem(text);
    if (!parsed) { session.warnings.push('Unrecognized problem: ' + text); return; }
    question = {...parsed, index:session.questions.length+1, shownMs:elapsed(), solvedMs:null, responseMs:null, correct:false, events:[], inputs:[]};
    session.questions.push(question);
  }
  function start(text, score, secondsLeft) {
    origin = performance.now();
    const date = new Date();
    session = {schemaVersion:1, id:crypto.randomUUID(), date:new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10), startedAt:date.getTime(), endedAt:null, status:'recording', score, source:'recorded', settings:settings(), metadata:{...metadata}, questions:[], lifecycle:[], warnings:[], defaultSettings:false, initialScore:score, initialSecondsLeft:secondsLeft, timingPrecision:'milliseconds relative to first observed question; DOM-confirmed acceptance', userAgent:navigator.userAgent, timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
    session.defaultSettings = C.isDefault(session.settings);
    if (score > 0 || (secondsLeft != null && session.settings && secondsLeft < session.settings.duration)) session.warnings.push('Joined a game already in progress. Earlier activity was not recorded.');
    if (!session.settings) session.warnings.push('Could not identify game settings. Excluded from default-settings comparisons.');
    lastScore = score;
    addQuestion(text);
    session.lifecycle.push({type:'recording-started', ...stamp(), visibility:document.visibilityState});
    show(`${score} correct · recording`);
    save();
  }
  function sync() {
    const game = document.querySelector('#game');
    const input = game?.querySelector('input.answer');
    const problem = game?.querySelector('.problem');
    if (!game || !input || !problem) return;
    const text = problem.textContent.trim();
    const score = Number(game.querySelector('.correct')?.textContent.match(/\d+/)?.[0] ?? 0);
    const seconds = Number(game.querySelector('.left')?.textContent.match(/-?\d+/)?.[0]);
    if (!session && text && !input.disabled) start(text, score, Number.isFinite(seconds)?seconds:null);
    if (!session || session.status !== 'recording') return;
    if (score > lastScore) {
      if (score - lastScore !== 1) session.warnings.push(`Observed score jump ${lastScore} to ${score}. Some questions may be missing.`);
      if (question) {
        question.correct = true;
        question.solvedMs = elapsed();
        question.responseMs = question.solvedMs - question.shownMs;
        question.acceptedInput = question.inputs.at(-1)?.value ?? null;
      }
      session.score = score; lastScore = score;
      // Score change, rather than text change, also handles identical consecutive questions.
      if (!input.disabled) addQuestion(text);
      show(`${score} correct · recording`); save();
    } else if (question && text && text !== question.text && !input.disabled) {
      session.warnings.push('Question changed without a score increment.');
      addQuestion(text); save();
    }
    if (input.disabled) {
      session.status = 'completed'; session.endedAt = Date.now(); session.elapsedMs = elapsed();
      session.lifecycle.push({type:'game-completed', ...stamp()});
      show('Saving…'); save();
    }
  }
  function active(event) {
    // Synchronize before a key, even if initialization or a DOM observer was delayed.
    sync();
    return session?.status === 'recording' && answerField(event.target) && !event.target.disabled;
  }
  document.addEventListener('keydown', event => {
    if (!active(event) || !question) return;
    const record = {type:'keydown', ...stamp(), key:event.key, code:event.code, repeat:event.repeat, location:event.location, ctrl:event.ctrlKey, alt:event.altKey, shift:event.shiftKey, meta:event.metaKey, valueBefore:event.target.value, selectionStart:event.target.selectionStart, selectionEnd:event.target.selectionEnd};
    question.events.push(record);
    pressed.set(event.code, {question, seq:record.seq});
    save();
  }, true);
  document.addEventListener('keyup', event => {
    if (!session || !answerField(event.target)) return;
    const press = pressed.get(event.code);
    const target = press?.question || (session.status === 'recording' ? question : null);
    if (!target) return;
    target.events.push({type:'keyup', ...stamp(), key:event.key, code:event.code, keydownSeq:press?.seq ?? null});
    pressed.delete(event.code); save();
  }, true);
  document.addEventListener('beforeinput', event => {
    if (!active(event) || !question) return;
    question.events.push({type:'beforeinput', ...stamp(), inputType:event.inputType, data:event.data, isComposing:event.isComposing, valueBefore:event.target.value, selectionStart:event.target.selectionStart, selectionEnd:event.target.selectionEnd});
    save();
  }, true);
  document.addEventListener('input', event => {
    if (!active(event) || !question) return;
    // Capture phase runs before Zetamac's input listener clears a correct answer.
    question.inputs.push({...stamp(), value:event.target.value, inputType:event.inputType ?? 'unknown', isComposing:event.isComposing ?? false});
    save(); queueMicrotask(sync);
  }, true);
  for (const type of ['compositionstart','compositionend','focus','blur']) document.addEventListener(type, event => {
    if (session?.status !== 'recording' || !answerField(event.target) || !question) return;
    question.events.push({type, ...stamp(), data:event.data ?? null}); save();
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (session?.status !== 'recording') return;
    session.lifecycle.push({type:'visibility', ...stamp(), state:document.visibilityState}); save();
  });
  window.addEventListener('pagehide', () => {
    if (session?.status !== 'recording') return;
    session.status = 'interrupted'; session.endedAt = Date.now(); session.elapsedMs = elapsed();
    session.lifecycle.push({type:'page-left', ...stamp()}); save();
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted || session?.status !== 'interrupted') return;
    if (document.querySelector('#game input.answer')?.disabled) return;
    session.status = 'recording'; session.endedAt = null;
    session.lifecycle.push({type:'page-restored', ...stamp()}); save(); sync();
  });
  function download() {
    if (!session) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({schemaVersion:1, exportedAt:new Date().toISOString(), sessions:[session]},null,2)], {type:'application/json'}));
    const a = document.createElement('a'); a.href=url; a.download=`zetamac-${session.id}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function mount() {
    if (panel || !document.body) return;
    panel=document.createElement('div'); panel.id='zeta-training-log';
    const shadow=panel.attachShadow({mode:'open'});
    shadow.innerHTML=`<style>:host{all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;font:13px -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#152b48}details{width:250px;background:#f7faff;border:1px solid #b8cbea;border-radius:12px;box-shadow:0 4px 24px #152b4819}summary{cursor:pointer;padding:13px;font-weight:600}section{padding:0 13px 13px}label{display:flex;justify-content:space-between;align-items:center;margin:9px 0}select,button,textarea{font:inherit;border:1px solid #b8cbea;border-radius:5px;background:white;padding:5px;color:#152b48}button{cursor:pointer;width:100%;margin-top:6px}textarea{width:100%;box-sizing:border-box;resize:vertical;margin:5px 0}small{display:block;line-height:1.5;color:#526780}select:focus-visible,button:focus-visible,textarea:focus-visible{outline:2px solid #275bd8}</style><details><summary>Training log · <span id="status">Ready</span></summary><section><small>Records this game’s answer field. Conditions are optional and carry over.</small><div id="fields"></div><textarea id="notes" rows="2" aria-label="Optional notes" placeholder="Optional notes"></textarea><button id="download">Download this record</button><button id="dashboard">Records & backups</button></section></details>`;
    status=shadow.querySelector('#status');
    const fields=shadow.querySelector('#fields');
    const updateMeta=()=>{if(session){session.metadata={...metadata};session.lifecycle.push({type:'conditions-updated',...stamp(),metadata:{...metadata}});save();}call({type:'setMetadata',metadata}).catch(()=>show('Could not save conditions'));};
    for(const [key,label,choices] of [['music','Music',[['unknown','Unknown'],['yes','On'],['no','Off']]],['location','Location',[['unknown','Unknown'],['work','Work'],['home','Home'],['other','Other']]],['meeting','In a meeting',[['unknown','Unknown'],['yes','Yes'],['no','No']]],['glasses','Glasses',[['unknown','Unknown'],['yes','Yes'],['no','No']]]]) {
      const row=document.createElement('label'); row.textContent=label;
      const select=document.createElement('select'); select.dataset.meta=key;
      for(const [value,name] of choices){const option=document.createElement('option');option.value=value;option.textContent=name;select.append(option);}
      select.value=metadata[key]; select.addEventListener('change',()=>{metadata[key]=select.value;updateMeta();}); row.append(select);fields.append(row);
    }
    const notes=shadow.querySelector('#notes'); notes.value=metadata.notes;
    notes.addEventListener('change',()=>{metadata.notes=notes.value;updateMeta();});
    shadow.querySelector('#dashboard').addEventListener('click',()=>call({type:'openDashboard'}).catch(()=>show('Extension unavailable')));
    shadow.querySelector('#download').addEventListener('click',download);
    document.body.append(panel);
    if(session)show(`${session.score} correct · recording`);
  }
  const observer=new MutationObserver(()=>{sync();if(loaded)mount();});
  observer.observe(document,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled']});
  call({type:'getRecorderState'}).then(data=>{
    metadata={...C.unknownMeta,...data.metadata}; loaded=true;
    if(session){session.metadata={...metadata};save();} mount();sync();
  }).catch(()=>{loaded=true;mount();show('Storage unavailable · download records here');sync();});
  // Checkpoints also detect completion if the game changes its DOM update pattern.
  setInterval(sync,1000);
})();
