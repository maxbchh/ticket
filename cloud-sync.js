/* Conductor terminal cloud sync: no automatic page reloads and no polling. */
(() => {
  const URL = 'https://ubhfigqpsepnpokrbdyo.supabase.co/rest/v1/ticket_shared_state';
  const KEY = 'sb_publishable_yN8W8pvQq8hWsYMO8z1Rzw_6zKQ-8D1';
  const ROW = 'main';
  const LOCAL_KEYS = [
    'conductor_routes','conductor_tickets','conductor_shift_active',
    'conductor_name','conductor_terminal_id','conductor_org_name',
    'conductor_ticket_footer','conductor_paper_width','conductor_last_num',
    'conductor_operations','conductor_compositions','conductor_current_composition',
    'conductor_shift_started_at'
  ];
  const headers = {'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'};
  let timer = null;
  let saving = false;
  let queued = false;
  let originalsReady = false;
  let originalSetItem = null;
  let originalRemoveItem = null;

  function stateFromLocal(){
    const get=(k,def)=>{const v=localStorage.getItem(k);if(v===null)return def;try{return JSON.parse(v)}catch(_){return v}};
    return {
      routes:get('conductor_routes',[]),
      tickets:get('conductor_tickets',[]),
      shiftActive:get('conductor_shift_active',false)===true || get('conductor_shift_active',false)==='true',
      conductorName:get('conductor_name','Кондуктор №1'),
      terminalID:get('conductor_terminal_id','POS-88'),
      orgName:get('conductor_org_name','Узкоколейная ЖД'),
      ticketFooter:get('conductor_ticket_footer','Счастливого пути!'),
      paperWidth:get('conductor_paper_width','58mm'),
      lastTicketNum:Number(get('conductor_last_num',1001)),
      operations:get('conductor_operations',[]),
      compositions:get('conductor_compositions',[]),
      currentComposition:get('conductor_current_composition',''),
      shiftStartedAt:get('conductor_shift_started_at','')
    };
  }

  async function saveNow(){
    if(saving){queued=true;return;}
    saving=true;
    try{
      const r=await fetch(URL,{
        method:'POST',
        headers:{...headers,'Prefer':'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify({id:ROW,data:stateFromLocal(),updated_at:new Date().toISOString()})
      });
      if(!r.ok)throw new Error('POST '+r.status);
      setStatus('☁️ Синхронизировано');
    }catch(e){
      console.error('Cloud sync:',e);
      setStatus('⚠️ Ошибка синхронизации');
    }finally{
      saving=false;
      if(queued){queued=false;saveNow();}
    }
  }

  function scheduleSave(){clearTimeout(timer);timer=setTimeout(saveNow,700)}
  function setStatus(text){const e=document.getElementById('cloudStatus');if(e)e.innerHTML='<span class="sync-dot sync-ok"></span>'+text}

  function installWatcher(){
    if(originalsReady)return;
    originalsReady=true;
    originalSetItem=Storage.prototype.setItem;
    originalRemoveItem=Storage.prototype.removeItem;
    Storage.prototype.setItem=function(key,value){
      const result=originalSetItem.call(this,key,value);
      if(this===window.localStorage&&LOCAL_KEYS.includes(key))scheduleSave();
      return result;
    };
    Storage.prototype.removeItem=function(key){
      const result=originalRemoveItem.call(this,key);
      if(this===window.localStorage&&LOCAL_KEYS.includes(key))scheduleSave();
      return result;
    };
  }

  /* Deliberately no cloud request on page load and no setInterval/focus polling. */
  function start(){
    if(window.__conductorCloudSyncStarted)return;
    window.__conductorCloudSyncStarted=true;
    installWatcher();
    window.forceReliableCloudSync=saveNow;
    setStatus('☁️ Готово к синхронизации');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();