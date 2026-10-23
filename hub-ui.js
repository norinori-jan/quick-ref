// quick-ref -> flow-hub UI bridge
(function(){
  const HUB='https://norinori-jan.github.io/flow-hub/';
  function openHub(){
    const h=window.QuickRefHandoff;
    if(!h)return;
    const payload=h.build();
    location.href=HUB+'#hub_handoff_v1='+encodeURIComponent(JSON.stringify(payload));
  }
  function addButton(){
    if(document.getElementById('hubReturnBtn'))return;
    const b=document.createElement('button');
    b.id='hubReturnBtn';b.type='button';b.textContent='⌂ flow-hubへ';
    b.style.cssText='position:fixed;right:14px;bottom:78px;z-index:60;padding:10px 13px;border:1px solid var(--border,#ddd);border-radius:12px;background:var(--card-bg,#fff);color:var(--text,#222);box-shadow:0 4px 18px rgba(0,0,0,.15);font-weight:700;cursor:pointer';
    b.addEventListener('click',openHub);
    document.body.appendChild(b);
  }
  function boot(){addButton()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
