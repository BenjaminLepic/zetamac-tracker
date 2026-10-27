/* Shared, dependency-free data functions. */
(function (root) {
  const defaults = {add:true,sub:true,mul:true,div:true,add_left_min:2,add_left_max:100,add_right_min:2,add_right_max:100,mul_left_min:2,mul_left_max:12,mul_right_min:2,mul_right_max:100,duration:120};
  const unknownMeta = {music:'unknown',location:'unknown',meeting:'unknown',glasses:'unknown',notes:''};
  function isDefault(settings) { return !!settings && Object.entries(defaults).every(([k,v]) => (settings[k] ?? (k === 'duration' ? 120 : null)) === v); }
  function parseProblem(text) {
    const m = text.trim().match(/^(-?\d+)\s*([+−–\-×*÷/])\s*(-?\d+)$/);
    if (!m) return null;
    const a=Number(m[1]), b=Number(m[3]), op=m[2];
    const operation=op==='+'?'addition':/[−–-]/.test(op)?'subtraction':/[×*]/.test(op)?'multiplication':'division';
    const answer=operation==='addition'?a+b:operation==='subtraction'?a-b:operation==='multiplication'?a*b:a/b;
    return {text:text.trim(),a,b,operation,answer};
  }
  function seeds() {
    const scores=[54,45,44,34,42,42,44,52,30,45,45,44,53,47,57,35];
    const music=['yes','yes','no','no','no','yes','yes','yes','yes','yes','yes','yes','no','no','no','no'];
    return scores.map((score,i)=>({id:`historical-2024-10-26-${i+1}`,date:'2024-10-26',order:i+1,startedAt:null,endedAt:null,status:'completed',score,source:'historical',settings:{...defaults},defaultSettings:true,questions:[],metadata:{music:music[i],location:i<12?'work':'home',meeting:'no',glasses:i===11?'yes':'no',notes:''},timingPrecision:'date only; original list order'}));
  }
  const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
  function validateSessions(data) {
    const sessions=Array.isArray(data)?data:data?.sessions;
    if(!Array.isArray(sessions)) throw new Error('Choose a Training Log JSON backup.');
    const ids=new Set();
    for(const s of sessions) {
      if(!s || typeof s.id!=='string' || !s.id || s.id.length>200 || ids.has(s.id) || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !Number.isInteger(s.score) || s.score<0 || !['completed','recording','interrupted'].includes(s.status) || !Array.isArray(s.questions) || !s.metadata || typeof s.metadata!=='object' || (s.startedAt!=null&&!Number.isFinite(s.startedAt))) throw new Error('Backup contains an invalid or duplicate session.');
      const parsedDate=new Date(s.date+'T00:00:00Z');
      if(!Number.isFinite(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==s.date)throw new Error('Backup contains an invalid date.');
      if(s.metadata.notes!=null&&typeof s.metadata.notes!=='string')throw new Error('Invalid session notes.');
      ids.add(s.id);
      for(const q of s.questions) if(!q || typeof q.text!=='string' || !Array.isArray(q.events) || !Array.isArray(q.inputs) || !Number.isFinite(q.shownMs) || (q.responseMs!=null&&!Number.isFinite(q.responseMs))) throw new Error('Backup contains an invalid question.');
      for(const q of s.questions) {
        if(typeof q.correct!=='boolean'||q.shownMs<0)throw new Error('Invalid question status.');
        for(const e of [...q.events,...q.inputs])if(!e||typeof e!=='object'||!Number.isFinite(e.atMs)||e.atMs<0||(e.key!=null&&typeof e.key!=='string')||(e.value!=null&&typeof e.value!=='string'))throw new Error('Invalid captured event.');
      }
      for(const [k,choices] of Object.entries({music:['yes','no','unknown'],location:['work','home','other','unknown'],meeting:['yes','no','unknown'],glasses:['yes','no','unknown']})) if(!choices.includes(s.metadata[k])) throw new Error(`Invalid ${k} metadata.`);
    }
    return sessions.map(s=>({...s,defaultSettings:isDefault(s.settings)}));
  }
  root.ZetaCore={defaults,unknownMeta,isDefault,parseProblem,seeds,mean,validateSessions};
  if(typeof module!=='undefined') module.exports=root.ZetaCore;
})(typeof globalThis!=='undefined'?globalThis:window);
