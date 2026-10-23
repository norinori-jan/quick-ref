// quick-ref -> flow-hub activity adapter
// quick-ref remains the source of truth. This only records lightweight semantic progress.
(function(){
  const KEY='quick_ref_hub_activity_v1';
  const SESSION='quick_ref_hub_activity_session_v1';
  const MAX=120;
  const TYPES=new Set(['opened','searched','created','edited','saved','pinned','reviewed','exported','sent','completed']);
  function read(k){try{return JSON.parse(localStorage.getItem(k)||'[]')}catch(e){return[]}}
  function write(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  function clean(v){return String(v||'').replace(/\s+/g,' ').trim().slice(0,160)}
  function push(ev){
    const all=read(KEY);all.push(ev);while(all.length>MAX)all.shift();write(KEY,all);
    const session=read(SESSION);session.push(ev);while(session.length>MAX)session.shift();write(SESSION,session);
    return ev;
  }
  function semantic(type,detail,meta){
    if(!TYPES.has(type))throw new TypeError('Unknown quick-ref activity: '+type);
    return push({at:new Date().toISOString(),source:'quick-ref',app:'quick-ref',stage:'knowledge',kind:'semantic',type,detail:clean(detail),...(meta||{})});
  }
  function record(action,detail,meta){
    return push({at:new Date().toISOString(),source:'quick-ref',app:'quick-ref',stage:'knowledge',kind:'action',action:clean(action),detail:clean(detail),...(meta||{})});
  }
  function session(){return read(SESSION)}
  function all(){return read(KEY)}
  function clearSession(){write(SESSION,[])}
  function projectName(){
    const candidates=['title','memoTitle','itemTitle','name'];
    for(const id of candidates){const el=document.getElementById(id);if(el&&clean(el.value))return clean(el.value)}
    return null;
  }
  window.QuickRefActivity={semantic,record,session,all,clearSession,projectName};
  if(!session().some(e=>e.kind==='semantic'&&e.type==='opened'))semantic('opened','quick-ref');
  document.addEventListener('click',function(e){
    const el=e.target.closest('button,a,[role="button"],[data-action]');
    if(!el)return;
    const text=clean(el.innerText||el.getAttribute('aria-label')||el.getAttribute('title')||el.dataset.action);
    if(!text)return;
    record('click',text);
    if(el.dataset.hubActivity){semantic(el.dataset.hubActivity,text,{source:'explicit-ui'});return;}
    if(/検索|search/i.test(text))semantic('searched',text,{source:'ui'});
    else if(/保存|save/i.test(text))semantic('saved',text,{source:'ui'});
    else if(/追加|新規|作成|add|new|create/i.test(text))semantic('created',text,{source:'ui'});
    else if(/編集|edit/i.test(text))semantic('edited',text,{source:'ui'});
    else if(/pin|固定|ピン/i.test(text))semantic('pinned',text,{source:'ui'});
    else if(/共有|送る|送信|export|書き出し/i.test(text))semantic('sent',text,{source:'ui'});
    else if(/完了|確定|採用/i.test(text))semantic('completed',text,{source:'ui'});
  },true);
  document.addEventListener('change',function(e){
    const el=e.target;if(!el||el.type==='password')return;
    const name=clean(el.id||el.name||el.getAttribute('aria-label')||el.type);
    if(name)record('change',name,{source:'input'});
  },true);
})();
