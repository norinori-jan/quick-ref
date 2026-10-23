// quick-ref -> flow-hub handoff builder
(function(){
  const SESSION='quick_ref_hub_activity_session_v1';
  const URLS={
    'quick-ref':'https://norinori-jan.github.io/quick-ref/',
    'flow-hub':'https://norinori-jan.github.io/flow-hub/'
  };
  function read(){try{return JSON.parse(localStorage.getItem(SESSION)||'[]')}catch(e){return[]}}
  function clean(v){return String(v||'').replace(/\s+/g,' ').trim().slice(0,160)}
  function build(){
    const events=read();
    const semantic=events.filter(e=>e.kind==='semantic');
    const latest=[...semantic].reverse().find(e=>e.type);
    const created=semantic.filter(e=>e.type==='created').length;
    const saved=semantic.filter(e=>e.type==='saved').length;
    const reviewed=semantic.filter(e=>e.type==='reviewed').length;
    const searched=semantic.filter(e=>e.type==='searched').length;
    const progress=created||saved||reviewed;
    const next=progress
      ? {app:'quick-ref',action:'review',label:'quick-refで知識を振り返る',sourceRef:URLS['quick-ref']}
      : {app:'quick-ref',action:'continue',label:'quick-refで知識を整理する',sourceRef:URLS['quick-ref']};
    const summary=created
      ? `quick-refで${created}件の知識項目を作成・整理しました。`
      : searched
        ? 'quick-refで知識を検索しました。'
        : 'quick-refの活動を記録しました。';
    const activity={
      app:'quick-ref',stage:'knowledge',stageLabel:'知識・整理',
      sourceAction:latest?clean(latest.detail):'quick-ref',sourceRef:URLS['quick-ref'],
      appsUsed:['quick-ref'],completedSteps:semantic.filter(e=>e.type==='completed').map(e=>clean(e.detail)).slice(-20),
      outputs:created?['知識項目']:[],currentStatus:latest?latest.type:'opened',
      canAdvance:!!progress,semanticEvents:semantic.slice(-30),actions:events.map(e=>clean(e.action||e.detail)).filter(Boolean).slice(-20),
      summary
    };
    return {
      protocol:'hub_handoff_v1',id:crypto.randomUUID(),createdAt:new Date().toISOString(),
      source:'quick-ref',sourceRef:URLS['quick-ref'],intent:'knowledge.review',
      context:{text:summary,tags:['quick-ref','knowledge'],emotion:null,focus:'review'},
      payload:{stage:'knowledge',status:'recorded',activity,nextAction:next.action,message:progress?'知識の整理結果を確認できます。':'まずquick-refで知識を整理します。',recommendation:next},
      next:{app:'flow-hub',action:'review'},returnTo:URLS['flow-hub']
    };
  }
  window.QuickRefHandoff={build};
})();
