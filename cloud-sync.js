/* Reliable cross-device sync for the conductor terminal. */
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
  let lastLocal = '';
  let lastRemote = '';
  let applyingRemote = false;
  let busy = false;
  const headers = {'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json','Prefer':'return=minimal'};

  function readLocal(){const s={};for(const k of LOCAL_KEYS){const v=localStorage.getItem(k);if(v!==null){try{s[k]=JSON.parse(v)}catch(_){s[k]=v}}}return s}
  function normalizeRemote(data){if(!data||typeof data!=='object')return{};return data.data&&typeof data.data==='object'&&!Array.isArray(data.data)?data.data:data}
  function localFromState(s){const out={},map={routes:'conductor_routes',tickets:'conductor_tickets',shiftActive:'conductor_shift_active',conductorName:'conductor_name',terminalID:'conductor_terminal_id',orgName:'conductor_org_name',ticketFooter:'conductor_ticket_footer',paperWidth:'conductor_paper_width',lastTicketNum:'conductor_last_num',operations:'conductor_operations',compositions:'conductor_compositions',currentComposition:'conductor_current_composition',shiftStartedAt:'conductor_shift_started_at'};Object.entries(map).forEach(([p,k])=>{if(s[p]!==undefined)out[k]=s[p]});return out}
  function applyLocalMap(data){applyingRemote=true;try{for(const k of LOCAL_KEYS)localStorage.removeItem(k);for(const [k,v] of Object.entries(data||{})){if(LOCAL_KEYS.includes(k))localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v))}}finally{applyingRemote=false}}
  function stateFromLocal(){const x=readLocal();return{routes:Array.isArray(x.conductor_routes)?x.conductor_routes:[],tickets:Array.isArray(x.conductor_tickets)?x.conductor_tickets:[],shiftActive:x.conductor_shift_active===true||x.conductor_shift_active==='true',conductorName:x.conductor_name||'Кондуктор №1',terminalID:x.conductor_terminal_id||'POS-88',orgName:x.conductor_org_name||'Узкоколейная ЖД',ticketFooter:x.conductor_ticket_footer||'Счастливого пути!',paperWidth:x.conductor_paper_width||'58mm',lastTicketNum:Number(x.conductor_last_num||1001),operations:Array.isArray(x.conductor_operations)?x.conductor_operations:[],compositions:Array.isArray(x.conductor_compositions)?x.conductor_compositions:[],currentComposition:x.conductor_current_composition||'',shiftStartedAt:x.conductor_shift_started_at||''}}
  async function getRemote(){const r=await fetch(URL+'?id=eq.'+encodeURIComponent(ROW)+'&select=data,updated_at',{headers});if(!r.ok)throw new Error('GET '+r.status);const rows=await r.json();return rows[0]||null}
  async function putRemote(s){const r=await fetch(URL,{method:'POST',headers:{...headers,'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:ROW,data:s,updated_at:new Date().toISOString()})});if(!r.ok)throw new Error('POST '+r.status+' '+await r.text())}
  async function saveLocalToCloud(){if(busy||applyingRemote)return;busy=true;try{const s=stateFromLocal();await putRemote(s);lastLocal=JSON.stringify(readLocal());lastRemote=JSON.stringify(s);setStatus('☁️ Синхронизировано')}catch(e){console.error('Cloud sync save:',e);setStatus('⚠️ Ошибка синхронизации')}finally{busy=false}}
  async function startup(){try{const row=await getRemote(),remote=normalizeRemote(row),remoteKeys=Object.keys(remote).length,local=stateFromLocal();if(remoteKeys){const localText=JSON.stringify(local),remoteText=JSON.stringify(remote);lastRemote=remoteText;if(localText!==remoteText){applyLocalMap(localFromState(remote));lastLocal=JSON.stringify(readLocal());setStatus('☁️ Данные загружены');setTimeout(()=>location.reload(),80)}else{lastLocal=JSON.stringify(readLocal());setStatus('☁️ Синхронизировано')}}else{await saveLocalToCloud()}}catch(e){console.error('Cloud sync startup:',e);setStatus('⚠️ Облако недоступно — локальные данные сохранены')}}
  async function poll(){if(busy||applyingRemote)return;try{const localNow=JSON.stringify(readLocal());if(lastLocal&&localNow!==lastLocal){await saveLocalToCloud();return}const row=await getRemote(),remote=normalizeRemote(row);if(!Object.keys(remote).length)return;const remoteText=JSON.stringify(remote);if(!lastRemote){lastRemote=remoteText;return}if(remoteText!==lastRemote){const currentLocal=JSON.stringify(stateFromLocal());if(currentLocal===lastRemote){applyLocalMap(localFromState(remote));lastRemote=remoteText;lastLocal=JSON.stringify(readLocal());setStatus('☁️ Получены данные с другого устройства');setTimeout(()=>location.reload(),80)}else await saveLocalToCloud()}}catch(e){console.error('Cloud sync poll:',e)}}
  function setStatus(text){const e=document.getElementById('cloudStatus');if(e)e.innerHTML='<span class="sync-dot sync-ok"></span>'+text}
  window.forceReliableCloudSync=saveLocalToCloud;window.addEventListener('online',saveLocalToCloud);window.addEventListener('beforeunload',()=>{if(!applyingRemote)saveLocalToCloud()});
  function start(){if(window.__reliableCloudSyncStarted)return;window.__reliableCloudSyncStarted=true;startup();setInterval(poll,2000);setInterval(()=>{const now=JSON.stringify(readLocal());if(lastLocal&&now!==lastLocal)saveLocalToCloud()},700)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
