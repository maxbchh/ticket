/* Conductor terminal cloud sync + reverse-route helper. */
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
  let hydrating = false;
  let watcherInstalled = false;
  let originalSetItem = null;
  let originalRemoveItem = null;

  function getLocal(key, def){
    const value = localStorage.getItem(key);
    if(value === null) return def;
    try{return JSON.parse(value)}catch(_){return value}
  }

  function stateFromLocal(){
    return {
      routes:getLocal('conductor_routes',[]),
      tickets:getLocal('conductor_tickets',[]),
      shiftActive:getLocal('conductor_shift_active',false)===true || getLocal('conductor_shift_active',false)==='true',
      conductorName:getLocal('conductor_name','Кондуктор №1'),
      terminalID:getLocal('conductor_terminal_id','POS-88'),
      orgName:getLocal('conductor_org_name','Узкоколейная ЖД'),
      ticketFooter:getLocal('conductor_ticket_footer','Счастливого пути!'),
      paperWidth:getLocal('conductor_paper_width','58mm'),
      lastTicketNum:Number(getLocal('conductor_last_num',1001)),
      operations:getLocal('conductor_operations',[]),
      compositions:getLocal('conductor_compositions',[]),
      currentComposition:getLocal('conductor_current_composition',''),
      shiftStartedAt:getLocal('conductor_shift_started_at','')
    };
  }

  function setStatus(text, ok=true){
    const e=document.getElementById('cloudStatus');
    if(e)e.innerHTML='<span class="sync-dot '+(ok?'sync-ok':'sync-wait')+'"></span>'+text;
  }

  async function saveNow(){
    if(saving){queued=true;return;}
    saving=true;
    try{
      const r=await fetch(URL,{method:'POST',headers:{...headers,'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:ROW,data:stateFromLocal(),updated_at:new Date().toISOString()})});
      if(!r.ok)throw new Error('POST '+r.status);
      setStatus('☁️ Синхронизировано',true);
    }catch(e){console.error('Cloud sync:',e);setStatus('⚠️ Ошибка синхронизации',false)}
    finally{saving=false;if(queued){queued=false;saveNow()}}
  }

  function scheduleSave(){
    if(hydrating)return;
    clearTimeout(timer);
    timer=setTimeout(saveNow,700);
  }

  function installWatcher(){
    if(watcherInstalled)return;
    watcherInstalled=true;
    originalSetItem=window.localStorage.setItem.bind(window.localStorage);
    originalRemoveItem=window.localStorage.removeItem.bind(window.localStorage);
    window.localStorage.setItem=function(key,value){
      const result=originalSetItem(key,value);
      if(LOCAL_KEYS.includes(key))scheduleSave();
      return result;
    };
    window.localStorage.removeItem=function(key){
      const result=originalRemoveItem(key);
      if(LOCAL_KEYS.includes(key))scheduleSave();
      return result;
    };
  }

  function applyRemote(remote){
    if(!remote || typeof remote!=='object' || !Array.isArray(remote.routes))return false;
    hydrating=true;
    try{
      if(typeof state==='undefined')return false;
      state={...state,...remote};
      if(!Array.isArray(state.routes))state.routes=[];
      if(!Array.isArray(state.tickets))state.tickets=[];
      if(!Array.isArray(state.operations))state.operations=[];
      if(!Array.isArray(state.compositions))state.compositions=[];
      if(typeof state.lastTicketNum!=='number')state.lastTicketNum=1001;
      const write=(k,v)=>originalSetItem(k,typeof v==='string'?v:JSON.stringify(v));
      write('conductor_routes',state.routes);
      write('conductor_tickets',state.tickets);
      write('conductor_shift_active',state.shiftActive?'true':'false');
      write('conductor_name',state.conductorName||'');
      write('conductor_terminal_id',state.terminalID||'');
      write('conductor_org_name',state.orgName||'');
      write('conductor_ticket_footer',state.ticketFooter||'');
      write('conductor_paper_width',state.paperWidth||'58mm');
      write('conductor_last_num',String(state.lastTicketNum));
      write('conductor_operations',state.operations);
      write('conductor_compositions',state.compositions);
      write('conductor_current_composition',state.currentComposition||'');
      write('conductor_shift_started_at',state.shiftStartedAt||'');
      if(typeof renderRoutesTable==='function')renderRoutesTable();
      if(typeof onTransportTypeChange==='function')onTransportTypeChange();
      if(typeof updateShiftStats==='function')updateShiftStats();
      if(typeof renderOperations==='function')renderOperations();
      if(typeof searchTickets==='function')searchTickets();
      if(typeof updatePreview==='function')updatePreview();
      const ids={conductorName:'conductorName',terminalID:'terminalID',orgName:'orgName',ticketFooter:'ticketFooter',paperWidth:'paperWidthSelect'};
      Object.entries(ids).forEach(([key,id])=>{const e=document.getElementById(id);if(e&&state[key]!==undefined)e.value=state[key]});
      const badge=document.getElementById('shiftBadge');
      if(badge){badge.className=state.shiftActive?'badge badge-active':'badge badge-closed';badge.innerText=state.shiftActive?'СМЕНА ОТКРЫТА':'СМЕНА ЗАКРЫТА'}
      if(typeof changePaperWidth==='function')changePaperWidth();
      return true;
    }finally{hydrating=false}
  }

  async function pullNow(){
    try{
      setStatus('☁️ Загрузка общей базы…',true);
      const r=await fetch(URL+'?select=data,updated_at&id=eq.'+encodeURIComponent(ROW),{headers:{'apikey':KEY,'Authorization':'Bearer '+KEY}});
      if(!r.ok)throw new Error('GET '+r.status);
      const rows=await r.json();
      const row=rows&&rows[0];
      if(row&&row.data&&Object.keys(row.data).length){
        applyRemote(row.data);
        setStatus('☁️ Общая база загружена',true);
      }else setStatus('☁️ Готово к синхронизации',true);
    }catch(e){console.error('Cloud pull:',e);setStatus('⚠️ Не удалось загрузить общую базу',false)}
  }

  function routeNameReverse(name){
    const s=String(name||'').trim();
    const separators=['→','↔',' - ',' — ','–','-'];
    for(const sep of separators){
      if(s.includes(sep)){
        const parts=s.split(sep).map(x=>x.trim()).filter(Boolean);
        if(parts.length===2)return parts[1]+'-'+parts[0];
      }
    }
    return s ? s+' (обратный)' : 'Обратный маршрут';
  }

  function addReverseRouteButton(){
    const save=document.getElementById('routeSaveButton');
    if(!save || document.getElementById('routePairButton'))return;
    const b=document.createElement('button');
    b.id='routePairButton';
    b.className='btn btn-outline';
    b.type='button';
    b.textContent='↔️ Сохранить + обратный маршрут';
    b.onclick=window.saveRoutePair;
    save.parentElement.appendChild(b);
  }

  window.saveRoutePair=function(){
    const name=document.getElementById('newRouteName')?.value.trim();
    const transport=document.getElementById('newRouteTransport')?.value;
    const fare=parseFloat(document.getElementById('newRouteFarePerStop')?.value||0);
    const min=parseFloat(document.getElementById('newRouteMinPrice')?.value||0);
    const raw=document.getElementById('newRouteStops')?.value.trim();
    if(!name||!raw){alert('Заполните название маршрута и список остановок!');return}
    const stops=raw.split(',').map(s=>s.trim()).filter(Boolean);
    if(stops.length<2){alert('Для обратного маршрута нужно минимум 2 остановки.');return}
    const reverseName=routeNameReverse(name);
    const sameName=(state.routes||[]).some(r=>String(r.name).trim()===reverseName&&r.transport===transport&&JSON.stringify(r.stops||[])===JSON.stringify(stops.slice().reverse()));
    if(editingRouteId && typeof editRoute==='function'){
      const current=state.routes.find(r=>r.id===editingRouteId);
      if(current){current.name=name;current.transport=transport;current.farePerStop=fare;current.minPrice=min;current.stops=stops;localStorage.setItem('conductor_routes',JSON.stringify(state.routes));
        if(!sameName)state.routes.push({id:'route_'+Date.now()+'_rev',name:reverseName,transport,farePerStop:fare,minPrice:min,stops:stops.slice().reverse()});
      }
    }else{
      const now=Date.now();
      state.routes.push({id:'route_'+now,name,transport,farePerStop:fare,minPrice:min,stops});
      if(!sameName)state.routes.push({id:'route_'+now+'_rev',name:reverseName,transport,farePerStop:fare,minPrice:min,stops:stops.slice().reverse()});
    }
    localStorage.setItem('conductor_routes',JSON.stringify(state.routes));
    if(typeof renderRoutesTable==='function')renderRoutesTable();
    if(typeof updateRouteDropdowns==='function')updateRouteDropdowns();
    if(typeof resetRouteForm==='function')resetRouteForm();
    saveNow();
    soundBeep(1200,80);
    alert('Созданы два маршрута: «'+name+'» и «'+reverseName+'».');
  };

  function start(){
    if(window.__conductorCloudSyncStarted)return;
    window.__conductorCloudSyncStarted=true;
    installWatcher();
    window.forceReliableCloudSync=saveNow;
    window.syncConductorData=saveNow;
    addReverseRouteButton();
    pullNow();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();