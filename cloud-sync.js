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
  let lastCloudData = null;

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

  function keyOf(item, type){
    if(!item || typeof item!=='object')return null;
    if(type==='tickets') return String(item.num ?? item.number ?? item.id ?? '');
    if(type==='routes') return String(item.id ?? item.name ?? '');
    return String(item.id ?? item.num ?? item.number ?? '');
  }

  function stampOf(item){
    const t=item && (item.updatedAt || item.updated_at || item.cancelledAt || item.createdAt || item.created_at);
    const n=t ? Date.parse(t) : NaN;
    return Number.isFinite(n) ? n : 0;
  }

  function mergeArray(local, remote, type){
    const out=[];
    const map=new Map();
    const add=(item,source)=>{
      if(!item || typeof item!=='object')return;
      const key=keyOf(item,type);
      if(!key){out.push(item);return;}
      const old=map.get(key);
      if(!old){map.set(key,{item,source});return;}
      const a=stampOf(old.item), b=stampOf(item);
      if(b>a || (b===a && source==='local')) map.set(key,{item,source});
      else if(type==='tickets' && item.status==='cancelled' && old.item.status!=='cancelled') map.set(key,{item,source});
    };
    (remote||[]).forEach(x=>add(x,'remote'));
    (local||[]).forEach(x=>add(x,'local'));
    map.forEach(v=>out.push(v.item));
    return out;
  }

  function mergeState(local, remote){
    local=local&&typeof local==='object'?local:{};
    remote=remote&&typeof remote==='object'?remote:{};
    const merged={...remote,...local};
    merged.routes=mergeArray(local.routes,remote.routes,'routes');
    merged.tickets=mergeArray(local.tickets,remote.tickets,'tickets');
    merged.operations=mergeArray(local.operations,remote.operations,'operations');
    merged.compositions=mergeArray(local.compositions,remote.compositions,'compositions');
    merged.lastTicketNum=Math.max(Number(local.lastTicketNum)||0,Number(remote.lastTicketNum)||0,1001);
    if(local.shiftStartedAt && !remote.shiftStartedAt) merged.shiftStartedAt=local.shiftStartedAt;
    if(local.conductorName==='Кондуктор №1' && remote.conductorName && remote.conductorName!=='Кондуктор №1') merged.conductorName=remote.conductorName;
    if(local.terminalID==='POS-88' && remote.terminalID && remote.terminalID!=='POS-88') merged.terminalID=remote.terminalID;
    if(local.orgName==='Узкоколейная ЖД' && remote.orgName && remote.orgName!=='Узкоколейная ЖД') merged.orgName=remote.orgName;
    if(local.ticketFooter==='Счастливого пути!' && remote.ticketFooter && remote.ticketFooter!=='Счастливого пути!') merged.ticketFooter=remote.ticketFooter;
    if(local.paperWidth==='58mm' && remote.paperWidth && remote.paperWidth!=='58mm') merged.paperWidth=remote.paperWidth;
    return merged;
  }

  function writeStateToLocal(data){
    if(!data || typeof data!=='object')return;
    hydrating=true;
    try{
      if(typeof state!=='undefined')state={...state,...data};
      const write=(k,v)=>originalSetItem(k,typeof v==='string'?v:JSON.stringify(v));
      write('conductor_routes',data.routes||[]);
      write('conductor_tickets',data.tickets||[]);
      write('conductor_shift_active',data.shiftActive?'true':'false');
      write('conductor_name',data.conductorName||'');
      write('conductor_terminal_id',data.terminalID||'');
      write('conductor_org_name',data.orgName||'');
      write('conductor_ticket_footer',data.ticketFooter||'');
      write('conductor_paper_width',data.paperWidth||'58mm');
      write('conductor_last_num',String(data.lastTicketNum||1001));
      write('conductor_operations',data.operations||[]);
      write('conductor_compositions',data.compositions||[]);
      write('conductor_current_composition',data.currentComposition||'');
      write('conductor_shift_started_at',data.shiftStartedAt||'');
      if(typeof renderRoutesTable==='function')renderRoutesTable();
      if(typeof onTransportTypeChange==='function')onTransportTypeChange();
      if(typeof updateShiftStats==='function')updateShiftStats();
      if(typeof renderOperations==='function')renderOperations();
      if(typeof searchTickets==='function')searchTickets();
      if(typeof updatePreview==='function')updatePreview();
      const ids={conductorName:'conductorName',terminalID:'terminalID',orgName:'orgName',ticketFooter:'ticketFooter',paperWidth:'paperWidthSelect'};
      Object.entries(ids).forEach(([key,id])=>{const e=document.getElementById(id);if(e&&data[key]!==undefined)e.value=data[key]});
      const badge=document.getElementById('shiftBadge');
      if(badge){badge.className=data.shiftActive?'badge badge-active':'badge badge-closed';badge.innerText=data.shiftActive?'СМЕНА ОТКРЫТА':'СМЕНА ЗАКРЫТА'}
      if(typeof changePaperWidth==='function')changePaperWidth();
    }finally{hydrating=false}
  }

  async function fetchCloud(){
    const r=await fetch(URL+'?select=data,updated_at&id=eq.'+encodeURIComponent(ROW),{headers:{'apikey':KEY,'Authorization':'Bearer '+KEY},cache:'no-store'});
    if(!r.ok)throw new Error('GET '+r.status);
    const rows=await r.json();
    return rows&&rows[0] ? rows[0] : null;
  }

  async function saveNow(){
    if(saving){queued=true;return;}
    saving=true;
    try{
      const local=stateFromLocal();
      let remote=null;
      try{remote=await fetchCloud()}catch(_){remote=null}
      const merged=remote&&remote.data&&Object.keys(remote.data).length ? mergeState(local,remote.data) : local;
      writeStateToLocal(merged);
      const r=await fetch(URL,{method:'POST',headers:{...headers,'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:ROW,data:merged,updated_at:new Date().toISOString()})});
      if(!r.ok)throw new Error('POST '+r.status);
      lastCloudData=merged;
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

  async function pullAndMerge(reason, baseLocal=null){
    try{
      setStatus('☁️ Синхронизация…',true);
      const local=baseLocal||stateFromLocal();
      const row=await fetchCloud();
      if(row&&row.data&&Object.keys(row.data).length){
        const merged=mergeState(local,row.data);
        const localChanged=JSON.stringify(merged)!==JSON.stringify(row.data);
        writeStateToLocal(merged);
        lastCloudData=merged;
        if(localChanged){
          const r=await fetch(URL,{method:'POST',headers:{...headers,'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:ROW,data:merged,updated_at:new Date().toISOString()})});
          if(!r.ok)throw new Error('POST '+r.status);
        }
      }else if(local.routes.length||local.tickets.length||local.operations.length){
        await saveNow();
        return;
      }
      setStatus(reason==='focus'?'☁️ Синхронизировано':'☁️ Общая база синхронизирована',true);
    }catch(e){console.error('Cloud pull:',e);setStatus('⚠️ Ошибка синхронизации',false)}
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
      if(current){current.name=name;current.transport=transport;current.farePerStop=fare;current.minPrice=min;current.stops=stops;
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
    // Preserve the local snapshot before legacy inline sync code can overwrite it.
    window.ticketCloudSave=saveNow;
    const startupLocal=stateFromLocal();
    pullAndMerge('startup',startupLocal);
    setTimeout(()=>{window.ticketCloudSave=saveNow;window.forceReliableCloudSync=saveNow;window.syncConductorData=saveNow;},350);
    window.addEventListener('focus',()=>pullAndMerge('focus'));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pullAndMerge('focus')});
    window.addEventListener('beforeunload',()=>{if(!hydrating)saveNow()});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();