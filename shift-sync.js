/* Share the active driver shift with the public QR purchase page. */
(function(){
'use strict';
var ENDPOINT='',API_KEY='',lastLocal='',running=false;
function parseStored(){try{return JSON.parse(localStorage.getItem('conductor_driver_shift_v1')||'null')}catch(_){return null}}
async function init(){
  try{
    var res=await fetch('./cloud-sync.js',{cache:'no-store'});if(!res.ok)return;
    var src=await res.text(),u=src.match(/const URL='([^']+)'/),k=src.match(/const KEY='([^']+)'/);
    if(!u||!k)return;ENDPOINT=u[1];API_KEY=k[1];
    await syncShift();
    setInterval(syncShift,1400);
  }catch(e){console.warn('Синхронизация водительской смены:',e);}
}
async function syncShift(){
 if(running||!ENDPOINT||!API_KEY)return;
 var shift=parseStored(),raw=JSON.stringify(shift);
 if(raw===lastLocal)return;
 if(!shift){lastLocal=raw;return;}
 running=true;
 try{
  var h={apikey:API_KEY,Authorization:'Bearer '+API_KEY};
  var get=await fetch(ENDPOINT+'?select=data&id=eq.main',{headers:h,cache:'no-store'});if(!get.ok)throw Error('GET '+get.status);
  var rows=await get.json(),data=rows&&rows[0]&&rows[0].data||{};
  var copy=shift?Object.assign({},shift,{updatedAt:shift.updatedAt||new Date().toISOString()}):null;
  data.driverShift=copy;
  var localArchives=[];try{localArchives=JSON.parse(localStorage.getItem('ticket_report_archives_v1')||'[]')}catch(_){}
  var archiveMap=new Map();[...(Array.isArray(data.reportArchives)?data.reportArchives:[]),...(Array.isArray(localArchives)?localArchives:[])].forEach(function(x){if(x&&x.id){var id=String(x.id),old=archiveMap.get(id);if(!old||(Date.parse(x.finishedAt||x.updatedAt||'')||0)>=(Date.parse(old.finishedAt||old.updatedAt||'')||0))archiveMap.set(id,x)}});
  data.reportArchives=Array.from(archiveMap.values()).sort(function(a,b){return (Date.parse(a.finishedAt||a.startedAt||'')||0)-(Date.parse(b.finishedAt||b.startedAt||'')||0)}).slice(-500);
  var save=await fetch(ENDPOINT,{method:'POST',headers:Object.assign({},h,{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify({id:'main',data:data,updated_at:new Date().toISOString()})});
  if(!save.ok)throw Error('POST '+save.status);
  lastLocal=raw;
 }catch(e){console.warn('Не удалось синхронизировать водительскую смену:',e);}
 finally{running=false;}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();