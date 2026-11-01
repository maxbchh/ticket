/* Ticket — bus database, city-aware routes and vehicle register. */
(function(){
'use strict';
if(window.__ticketBusDatabaseReady)return;
window.__ticketBusDatabaseReady=true;
const $=id=>document.getElementById(id);
const KEY='ticket_bus_database_v1';
const ROUTE_KEY='conductor_routes';
const DELETED_ROUTES_KEY='conductor_deleted_route_ids';
const CITIES=['Тверь','Новоозёрск'];
const STATUSES=['В эксплуатации','На рейсе','Не в эксплуатации','Ремонт','Капитальный ремонт','Списан','Выведен из эксплуатации'];
let activeView='fleet';
let sortField='number',sortAsc=true;
let selectedVehicles=new Set();
let lastDatabaseSnapshot='';
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function canonicalCity(v){const s=String(v||'').trim().toLocaleLowerCase('ru-RU');if(s==='новоозерск'||s==='новоозёрск')return 'Новоозёрск';return s==='тверь'?'Тверь':(CITIES.includes(v)?v:'Тверь');}
function db(){
 if(typeof state==='undefined')return null;
 if(!state.busDatabase||typeof state.busDatabase!=='object'){
  try{state.busDatabase=JSON.parse(localStorage.getItem(KEY)||'null')}catch(_){state.busDatabase=null}
 }
 if(!state.busDatabase||typeof state.busDatabase!=='object')state.busDatabase={vehicles:[],stops:[],selectedCity:'Тверь',updatedAt:'',deletedVehicleIds:[],deletedStopIds:[],seedVersion:0};
 const d=state.busDatabase;
 if(!Array.isArray(d.vehicles))d.vehicles=[];
 if(!Array.isArray(d.stops))d.stops=[];
 if(!Array.isArray(d.deletedVehicleIds))d.deletedVehicleIds=[];
 if(!Array.isArray(d.deletedStopIds))d.deletedStopIds=[];
 if(!CITIES.includes(canonicalCity(d.selectedCity)))d.selectedCity='Тверь';
 d.selectedCity=canonicalCity(d.selectedCity);
 return d;
}
function city(){return canonicalCity(db()?.selectedCity||$('busDbCity')?.value||'Тверь');}
function routes(){return Array.isArray(state.routes)?state.routes:[];}
function routeCity(r){return canonicalCity(r?.city||r?.map||'Тверь');}
function isBusRoute(r){return (r.transport||r.transportType||r.type||'bus')==='bus';}
function filterRoutes(list){return (Array.isArray(list)?list:routes()).filter(r=>isBusRoute(r)&&routeCity(r)===city());}
function uid(prefix){return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}
function now(){return new Date().toISOString();}
function writeRoutes(){localStorage.setItem(ROUTE_KEY,JSON.stringify(routes()));}
function refreshOtherViews(){
 try{if(typeof window.renderRoutesTable==='function')window.renderRoutesTable()}catch(e){console.warn(e)}
 try{if(typeof window.updateRouteDropdowns==='function')window.updateRouteDropdowns()}catch(e){console.warn(e)}
 try{if(typeof window.renderDriverShift==='function')window.renderDriverShift()}catch(e){console.warn(e)}
}
function save(){
 const d=db();if(!d)return;
 d.updatedAt=now();
 try{
  localStorage.setItem(KEY,JSON.stringify(d));
  writeRoutes();
  if(typeof window.forceReliableCloudSync==='function')window.forceReliableCloudSync();
 }catch(e){console.error('Ошибка сохранения автобусной базы:',e)}
 render();populateShiftSelector();refreshOtherViews();
}
function saveRoutesOnly(){
 writeRoutes();
 try{if(typeof window.forceReliableCloudSync==='function')window.forceReliableCloudSync()}catch(e){console.warn(e)}
 refreshOtherViews();render();
}
function deletedRouteIds(){try{const a=JSON.parse(localStorage.getItem(DELETED_ROUTES_KEY)||'[]');return Array.isArray(a)?a:[]}catch(_){return[]}}
function markRouteDeleted(id){const a=deletedRouteIds();if(!a.includes(String(id)))a.push(String(id));localStorage.setItem(DELETED_ROUTES_KEY,JSON.stringify(a))}
function routeName(r){return String(r?.name||r?.route||'').trim();}
function reverseRouteName(n){const s=String(n||'').trim();if(/\s+обратный$/i.test(s))return s.replace(/\s+обратный$/i,'').trim()||'Обратный маршрут';return s?s+' обратный':'Обратный маршрут';}
function routePairName(n){return String(n||'').replace(/\s*\(?обратный\)?$/i,'').trim();}
function findRouteById(id){return routes().find(r=>String(r.id)===String(id));}
function ensureNovoozyorskRoutes(){
 let changed=false;
 const defs=['2','5','100'];
 const wanted=new Set(defs.flatMap(n=>[n,n+' обратный']).map(x=>x.toLocaleLowerCase('ru-RU')));
 const seen=new Map(), kept=[];
 routes().forEach(r=>{
  if(!isBusRoute(r)||routeCity(r)!=='Новоозёрск'||!wanted.has(routeName(r).toLocaleLowerCase('ru-RU'))){kept.push(r);return}
  const key=routeName(r).toLocaleLowerCase('ru-RU'),old=seen.get(key);
  if(!old){seen.set(key,r);kept.push(r);return}
  if((r.stops||[]).length>(old.stops||[]).length){old.stops=(r.stops||[]).slice();old.farePerStop=Number(r.farePerStop)||old.farePerStop;old.updatedAt=r.updatedAt||old.updatedAt}
  changed=true;
 });
 if(kept.length!==routes().length){state.routes=kept;changed=true}
 defs.forEach(base=>{
  let forward=routes().find(r=>isBusRoute(r)&&routeCity(r)==='Новоозёрск'&&routeName(r).toLocaleLowerCase('ru-RU')===base.toLocaleLowerCase('ru-RU'));
  let reverse=routes().find(r=>isBusRoute(r)&&routeCity(r)==='Новоозёрск'&&routeName(r).toLocaleLowerCase('ru-RU')===(base+' обратный').toLocaleLowerCase('ru-RU'));
  if(!forward){forward={id:'busroute_novoozyorsk_'+base+'_out',name:base,transport:'bus',city:'Новоозёрск',stops:[],farePerStop:0.5,reverseOfId:null,updatedAt:now()};routes().push(forward);changed=true}
  if(!reverse){reverse={id:'busroute_novoozyorsk_'+base+'_back',name:base+' обратный',transport:'bus',city:'Новоозёрск',stops:Array.isArray(forward.stops)?forward.stops.slice().reverse():[],farePerStop:Number(forward.farePerStop)||0.5,reverseOfId:forward.id,updatedAt:now()};routes().push(reverse);changed=true}
  if(forward.reverseOfId!==reverse.id){forward.reverseOfId=reverse.id;changed=true}
  if(reverse.reverseOfId!==forward.id){reverse.reverseOfId=forward.id;changed=true}
 });
 if(changed){writeRoutes();try{if(typeof window.forceReliableCloudSync==='function')window.forceReliableCloudSync()}catch(_){}}
 const d=db();if(d)d.seedVersion=1;
}
function routeModal(existing){
 const r=existing||{};
 modal(existing?'Изменить маршрут':'Добавить маршрут',[
  {id:'name',label:'Номер / название маршрута',placeholder:'Например, 7'},
  {id:'city',label:'Город / карта',type:'select',options:CITIES.map(x=>({value:x,label:x}))},
  {id:'stops',label:'Остановки по порядку',type:'textarea',wide:true,rows:5,placeholder:'Названия через запятую или с новой строки'},
  {id:'fare',label:'Стоимость за одну остановку (BYN)',type:'number',step:'0.01'},
  {id:'alsoReverse',label:'Автоматически создать обратное направление',type:'checkbox',wide:true}
 ],{
  name:routeName(r),city:routeCity(r),stops:(r.stops||[]).join(', '),fare:r.farePerStop??0.5,
  alsoReverse:existing?!!r.reverseOfId:true
 },v=>{
  const name=v.name.trim(),cityName=canonicalCity(v.city);
  const stops=v.stops.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
  if(!name){alert('Укажи номер или название маршрута.');return false}
  if(stops.length===1){alert('Укажи минимум две остановки или оставь поле пустым, чтобы заполнить маршрут позже.');return false}
  if(existing){
   Object.assign(existing,{name,city:cityName,transport:'bus',stops,farePerStop:Math.max(0,Number(v.fare)||0),updatedAt:now()});
   const partner=existing.reverseOfId?findRouteById(existing.reverseOfId):null;
   if(partner&&v.alsoReverse){partner.city=cityName;partner.stops=stops.slice().reverse();partner.farePerStop=existing.farePerStop;partner.name=reverseRouteName(name);partner.updatedAt=now()}
   if(!v.alsoReverse&&partner){delete partner.reverseOfId;delete existing.reverseOfId}
   if(v.alsoReverse&&!partner)createReverse(existing);
  }else{
   const rec={id:uid('busroute'),name,transport:'bus',city:cityName,stops,farePerStop:Math.max(0,Number(v.fare)||0),updatedAt:now()};
   routes().push(rec);
   if(v.alsoReverse)createReverse(rec);
  }
  saveRoutesOnly();
 });
}
function createReverse(r){
 const name=reverseRouteName(routeName(r));
 let partner=r.reverseOfId?findRouteById(r.reverseOfId):null;
 if(!partner)partner=routes().find(x=>String(x.id)!==String(r.id)&&isBusRoute(x)&&routeCity(x)===routeCity(r)&&routeName(x).toLocaleLowerCase('ru-RU')===name.toLocaleLowerCase('ru-RU'));
 if(!partner){partner={id:uid('busroute'),name,transport:'bus',city:routeCity(r),stops:(r.stops||[]).slice().reverse(),farePerStop:Number(r.farePerStop)||0,updatedAt:now()};routes().push(partner)}
 r.reverseOfId=partner.id;partner.reverseOfId=r.id;partner.name=name;partner.city=routeCity(r);partner.stops=(r.stops||[]).slice().reverse();partner.farePerStop=Number(r.farePerStop)||0;partner.updatedAt=now();
}
function addVehicle(existing){
 const v=existing||{};
 modal(existing?'Изменить автобус':'Добавить автобус в парк',[
  {id:'number',label:'Бортовой номер',placeholder:'Например, 7042'},
  {id:'model',label:'Модель',placeholder:'Например, МАЗ-103.065'},
  {id:'city',label:'Город / парк',type:'select',options:CITIES.map(x=>({value:x,label:x}))},
  {id:'buildDate',label:'Дата постройки',type:'date'},
  {id:'status',label:'Статус',type:'select',options:STATUSES.map(x=>({value:x,label:x}))},
  {id:'routes',label:'Бригадные маршруты',wide:true,placeholder:'Например: 2, 5, 100'},
  {id:'note',label:'Примечание',type:'textarea',wide:true,rows:3}
 ],{
  number:v.number||'',model:v.model||'',city:canonicalCity(v.city||city()),buildDate:v.buildDate||'',
  status:v.status||'В эксплуатации',routes:(v.routes||[]).join(', '),note:v.note||''
 },x=>{
  if(!x.number.trim()){alert('Укажи бортовой номер автобуса.');return false}
  if(!x.model.trim()){alert('Укажи модель автобуса.');return false}
  const duplicate=db().vehicles.find(y=>String(y.id)!==String(v.id||'')&&canonicalCity(y.city)===canonicalCity(x.city)&&String(y.number||'').trim().toLowerCase()===x.number.trim().toLowerCase());
  if(duplicate){alert('В этом городском парке уже есть автобус с таким бортовым номером.');return false}
  const data={id:v.id||uid('bus'),number:x.number.trim(),model:x.model.trim(),city:canonicalCity(x.city),buildDate:x.buildDate,status:x.status,routes:x.routes.split(',').map(s=>s.trim()).filter(Boolean),note:x.note.trim(),updatedAt:now()};
  if(existing)Object.assign(v,data);else db().vehicles.push(data);
  db().deletedVehicleIds=db().deletedVehicleIds.filter(id=>String(id)!==String(data.id));
  save();
 });
}
function addStop(existing){
 const s=existing||{};
 modal(existing?'Изменить остановку':'Добавить остановку',[
  {id:'name',label:'Название остановки'},
  {id:'city',label:'Город / карта',type:'select',options:CITIES.map(x=>({value:x,label:x}))},
  {id:'note',label:'Примечание',type:'textarea',wide:true}
 ],{name:s.name||'',city:canonicalCity(s.city||city()),note:s.note||''},x=>{
  if(!x.name.trim()){alert('Укажи название остановки.');return false}
  const data={id:s.id||uid('stop'),name:x.name.trim(),city:canonicalCity(x.city),note:x.note.trim(),updatedAt:now()};
  if(existing)Object.assign(s,data);else db().stops.push(data);
  db().deletedStopIds=db().deletedStopIds.filter(id=>String(id)!==String(data.id));
  save();
 });
}
function modal(title,fields,values,onSave){
 const host=$('busDbModal');if(!host)return;
 host.innerHTML='<div class="bus-db-modal-bg"><div class="bus-db-modal"><div class="bus-db-modal-head"><h2>'+esc(title)+'</h2><button type="button" class="btn btn-outline" data-bus-cancel>✕</button></div><form id="busDbForm" class="bus-db-form">'+fields.map(f=>{
  const val=values[f.id]??f.value??'';
  let input='';
  if(f.type==='textarea')input='<textarea id="'+f.id+'" rows="'+(f.rows||3)+'" placeholder="'+esc(f.placeholder||'')+'">'+esc(val)+'</textarea>';
  else if(f.type==='select')input='<select id="'+f.id+'">'+f.options.map(o=>'<option value="'+esc(o.value)+'" '+(String(o.value)===String(val)?'selected':'')+'>'+esc(o.label)+'</option>').join('')+'</select>';
  else if(f.type==='checkbox')input='<input id="'+f.id+'" type="checkbox" '+(val?'checked':'')+'>';
  else input='<input id="'+f.id+'" type="'+(f.type||'text')+'" '+(f.step?'step="'+f.step+'"':'')+' '+(f.placeholder?'placeholder="'+esc(f.placeholder)+'"':'')+' value="'+esc(val)+'">';
  return '<label class="'+(f.wide?'wide':'')+(f.type==='checkbox'?' bus-db-check':'')+'">'+(f.type==='checkbox'?'':'<span>'+esc(f.label)+'</span>')+input+(f.type==='checkbox'?'<span>'+esc(f.label)+'</span>':'')+'</label>';
 }).join('')+'</form><div class="bus-db-modal-foot"><button type="button" class="btn btn-outline" data-bus-cancel>Отмена</button><button type="button" class="btn btn-cyan" id="busDbSave">Сохранить</button></div></div></div>';
 host.querySelectorAll('[data-bus-cancel]').forEach(b=>b.onclick=()=>host.innerHTML='');
 $('busDbSave').onclick=()=>{const result={};fields.forEach(f=>{const el=$(f.id);result[f.id]=f.type==='checkbox'?!!el?.checked:(el?.value??'')});if(onSave(result)!==false)host.innerHTML=''};
}
function statusClass(s){if(s==='В эксплуатации')return 'bus-status-ok';if(s==='На рейсе')return 'bus-status-run';if(/ремонт/i.test(s))return 'bus-status-repair';if(s==='Списан'||s==='Выведен из эксплуатации')return 'bus-status-off';return 'bus-status-other';}
function cityVehicles(){return db().vehicles.filter(v=>canonicalCity(v.city)===city());}
function cityRoutes(){return filterRoutes(routes());}
function cityStops(){
 const map=new Map();
 db().stops.filter(s=>canonicalCity(s.city)===city()).forEach(s=>{const key=String(s.name||'').trim().toLocaleLowerCase('ru-RU');if(!key)return;map.set(key,{...s,city:city(),routes:Array.isArray(s.routes)?s.routes.slice():[],source:'manual'})});
 cityRoutes().forEach(r=>(r.stops||[]).forEach(name=>{const key=String(name||'').trim().toLocaleLowerCase('ru-RU');if(!key)return;const current=map.get(key)||{id:'route_stop_'+key.replace(/[^a-zа-я0-9]+/gi,'_'),name:String(name).trim(),city:city(),routes:[],source:'route'};if(!current.routes.includes(routeName(r)))current.routes.push(routeName(r));map.set(key,current)}));
 return [...map.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),'ru'));
}
function setView(view){
 activeView=view;
 document.querySelectorAll('[data-bus-view]').forEach(b=>b.classList.toggle('active',b.dataset.busView===view));
 ['routes','fleet','stops'].forEach(v=>{const el=$('busDb'+v[0].toUpperCase()+v.slice(1));if(el)el.hidden=v!==view});
 render();
}
function renderStats(vs){
 const counts={total:vs.length};
 STATUSES.forEach(s=>counts[s]=vs.filter(v=>v.status===s).length);
 const labels=[['Всего автобусов',counts.total],['В эксплуатации',counts['В эксплуатации']],['На рейсе',counts['На рейсе']],['Не в эксплуатации',counts['Не в эксплуатации']],['В ремонте',counts['Ремонт']+counts['Капитальный ремонт']],['Списано / выведено',counts['Списан']+counts['Выведен из эксплуатации']]];
 return '<div class="bus-db-stats">'+labels.map(x=>'<div class="bus-db-stat"><span>'+esc(x[0])+'</span><b>'+x[1]+'</b></div>').join('')+'</div>';
}
function renderFleet(vs){
 const host=$('busDbFleet');if(!host)return;
 const q=String($('busFleetSearch')?.value||'').trim().toLocaleLowerCase('ru-RU');
 const status=$('busFleetStatus')?.value||'';
 const filtered=vs.filter(v=>(!status||v.status===status)&&(!q||[v.number,v.model,v.buildDate,(v.routes||[]).join(' '),v.note].join(' ').toLocaleLowerCase('ru-RU').includes(q)));
 filtered.sort((a,b)=>{const A=String(a[sortField]??'').toLocaleLowerCase('ru-RU'),B=String(b[sortField]??'').toLocaleLowerCase('ru-RU');return A<B?(sortAsc?-1:1):A>B?(sortAsc?1:-1):0});
 host.innerHTML=renderStats(vs)+
 '<div class="bus-db-toolbar"><input id="busFleetSearch" type="search" placeholder="Поиск по борту, модели или маршруту" value="'+esc(q)+'"><select id="busFleetStatus"><option value="">Все статусы</option>'+STATUSES.map(s=>'<option value="'+esc(s)+'" '+(s===status?'selected':'')+'>'+esc(s)+'</option>').join('')+'</select><button class="btn btn-cyan" id="busAddVehicle">＋ Добавить автобус</button><button class="btn btn-outline" id="busExportJson">Экспорт JSON</button><button class="btn btn-outline" id="busExportCsv">Экспорт CSV</button><button class="btn btn-outline" id="busImportButton">Импорт JSON</button><input type="file" id="busImportFile" accept=".json,application/json" hidden></div>'+
 '<div class="bus-db-bulk"><label><input type="checkbox" id="busSelectAll"> Выбрать все</label><select id="busBulkStatus"><option value="">Изменить статус выбранных…</option>'+STATUSES.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('')+'</select><button class="btn btn-outline" id="busApplyBulk">Применить</button><span id="busSelectedCount">Выбрано: '+selectedVehicles.size+'</span></div>'+
 '<div class="bus-db-table-wrap"><table class="bus-db-table"><thead><tr><th></th><th data-sort="number">Бортовой номер ↕</th><th data-sort="model">Модель ↕</th><th data-sort="buildDate">Дата постройки ↕</th><th>Бригадные маршруты</th><th data-sort="status">Статус ↕</th><th>Примечание</th><th>Действия</th></tr></thead><tbody>'+
 (filtered.length?filtered.map(v=>'<tr><td><input type="checkbox" data-vehicle-check="'+esc(v.id)+'" '+(selectedVehicles.has(String(v.id))?'checked':'')+'></td><td><b>'+esc(v.number||'—')+'</b></td><td>'+esc(v.model||'—')+'</td><td>'+esc(v.buildDate||'—')+'</td><td>'+esc((v.routes||[]).join(', ')||'—')+'</td><td><span class="bus-status '+statusClass(v.status)+'">'+esc(v.status||'Не указан')+'</span></td><td>'+esc(v.note||'—')+'</td><td><div class="bus-db-actions"><button class="btn btn-outline" data-edit-vehicle="'+esc(v.id)+'">✏️</button><button class="btn btn-red" data-delete-vehicle="'+esc(v.id)+'">Удалить</button></div></td></tr>').join(''):'<tr><td colspan="8" class="bus-db-empty">В парке города «'+esc(city())+'» пока нет автобусов. Добавь первую единицу.</td></tr>')+
 '</tbody></table></div><div class="bus-db-footnote">Показано '+filtered.length+' из '+vs.length+' автобусов городского парка «'+esc(city())+'».</div>';
 $('busFleetSearch').oninput=()=>renderFleet(cityVehicles());
 $('busFleetStatus').onchange=()=>renderFleet(cityVehicles());
 $('busAddVehicle').onclick=()=>addVehicle();
 $('busExportJson').onclick=()=>download('bus-park-'+slug(city())+'.json',JSON.stringify(vs,null,2),'application/json');
 $('busExportCsv').onclick=()=>exportCsv(vs);
 $('busImportButton').onclick=()=>$('busImportFile').click();
 $('busImportFile').onchange=importVehicles;
 $('busSelectAll').onchange=e=>{filtered.forEach(v=>e.target.checked?selectedVehicles.add(String(v.id)):selectedVehicles.delete(String(v.id)));renderFleet(vs)};
 $('busBulkStatus').onchange=()=>{};
 $('busApplyBulk').onclick=()=>{const s=$('busBulkStatus').value;if(!s){alert('Выбери новый статус.');return}if(!selectedVehicles.size){alert('Отметь хотя бы один автобус.');return}vs.forEach(v=>{if(selectedVehicles.has(String(v.id))){v.status=s;v.updatedAt=now()}});selectedVehicles.clear();save()};
 host.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{const f=b.dataset.sort;if(sortField===f)sortAsc=!sortAsc;else{sortField=f;sortAsc=true}renderFleet(cityVehicles())});
 host.querySelectorAll('[data-vehicle-check]').forEach(b=>b.onchange=()=>{b.checked?selectedVehicles.add(String(b.dataset.vehicleCheck)):selectedVehicles.delete(String(b.dataset.vehicleCheck));const n=$('busSelectedCount');if(n)n.textContent='Выбрано: '+selectedVehicles.size});
 host.querySelectorAll('[data-edit-vehicle]').forEach(b=>b.onclick=()=>{const v=db().vehicles.find(x=>String(x.id)===b.dataset.editVehicle);if(v)addVehicle(v)});
 host.querySelectorAll('[data-delete-vehicle]').forEach(b=>b.onclick=()=>{if(!confirm('Удалить автобус из парка города «'+city()+'»?'))return;const id=String(b.dataset.deleteVehicle);db().vehicles=db().vehicles.filter(v=>String(v.id)!==id);db().deletedVehicleIds.push(id);selectedVehicles.delete(id);save()});
}
function slug(s){return String(s).toLowerCase().replace(/ё/g,'e').replace(/[^a-zа-я0-9]+/gi,'-').replace(/^-|-$/g,'')}
function download(name,content,type){
 const blob=new Blob([content],{type:type+';charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportCsv(vs){
 const rows=[['Бортовой номер','Модель','Город','Дата постройки','Статус','Бригадные маршруты','Примечание'],...vs.map(v=>[v.number,v.model,canonicalCity(v.city),v.buildDate,v.status,(v.routes||[]).join(', '),v.note])];
 const csv='\uFEFF'+rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
 download('bus-park-'+slug(city())+'.csv',csv,'text/csv');
}
function importVehicles(e){
 const f=e.target.files?.[0];if(!f)return;
 const reader=new FileReader();
 reader.onload=()=>{
  try{
   const data=JSON.parse(reader.result);if(!Array.isArray(data))throw Error('Ожидается JSON-массив автобусов.');
   const incoming=data.map(v=>({id:String(v.id||uid('bus')),number:String(v.number||v.boardNumber||'').trim(),model:String(v.model||v.series||'').trim(),city:city(),buildDate:String(v.buildDate||v.buildDate||''),status:STATUSES.includes(v.status)?v.status:'В эксплуатации',routes:Array.isArray(v.routes)?v.routes:String(v.routes||'').split(',').map(x=>x.trim()).filter(Boolean),note:String(v.note||v.notes||''),updatedAt:now()})).filter(v=>v.number&&v.model);
   const keep=db().vehicles.filter(v=>canonicalCity(v.city)!==city());
   db().vehicles=[...keep,...incoming];db().deletedVehicleIds=[];
   selectedVehicles.clear();save();alert('Импортировано автобусов: '+incoming.length);
  }catch(err){alert('Не удалось импортировать базу: '+err.message)}
  e.target.value='';
 };
 reader.onerror=()=>alert('Не удалось прочитать файл.');
 reader.readAsText(f);
}
function renderRoutes(){
 const host=$('busDbRoutes');if(!host)return;
 const rs=cityRoutes();
 host.innerHTML='<div class="bus-db-toolbar"><input id="busRouteSearch" type="search" placeholder="Поиск маршрута или остановки"><button class="btn btn-cyan" id="busAddRoute">＋ Добавить маршрут</button></div><div class="bus-db-grid">'+
 (rs.length?rs.map(r=>'<article class="bus-db-item"><div class="bus-db-tag">'+esc(city())+'</div><h3>'+esc(routeName(r)||'Без названия')+'</h3><div class="bus-db-meta">'+esc((r.stops||[]).join(' → ')||'Остановки ещё не заполнены')+'</div><div class="bus-db-meta">Остановок: '+(r.stops||[]).length+' · '+(Number(r.farePerStop)||0).toFixed(2)+' BYN / остановка</div><div class="bus-db-actions"><button class="btn btn-outline" data-edit-route="'+esc(r.id)+'">✏️ Изменить</button><button class="btn btn-red" data-delete-route="'+esc(r.id)+'">Удалить</button></div></article>').join(''):'<div class="bus-db-empty">В этой карте пока нет автобусных маршрутов.</div>')+'</div>';
 $('busRouteSearch').oninput=()=>{const q=$('busRouteSearch').value.toLocaleLowerCase('ru-RU');host.querySelectorAll('.bus-db-item').forEach(el=>el.hidden=!el.textContent.toLocaleLowerCase('ru-RU').includes(q))};
 $('busAddRoute').onclick=()=>routeModal();
 host.querySelectorAll('[data-edit-route]').forEach(b=>b.onclick=()=>{const r=findRouteById(b.dataset.editRoute);if(r)routeModal(r)});
 host.querySelectorAll('[data-delete-route]').forEach(b=>b.onclick=()=>{const r=findRouteById(b.dataset.deleteRoute);if(!r)return;if(!confirm('Удалить маршрут «'+routeName(r)+'»?'))return;const partner=r.reverseOfId?findRouteById(r.reverseOfId):null;if(partner)delete partner.reverseOfId;markRouteDeleted(r.id);state.routes=routes().filter(x=>String(x.id)!==String(r.id));saveRoutesOnly()});
}
function renderStops(){
 const host=$('busDbStops');if(!host)return;
 const ss=cityStops();
 host.innerHTML='<div class="bus-db-toolbar"><input id="busStopSearch" type="search" placeholder="Поиск остановки"><button class="btn btn-cyan" id="busAddStop">＋ Добавить остановку</button></div><div class="bus-db-grid">'+
 (ss.length?ss.map(s=>'<article class="bus-db-item"><h3>'+esc(s.name)+'</h3><div class="bus-db-meta">'+esc(s.note||((s.routes||[]).length?'Маршруты: '+s.routes.join(', '):s.source==='route'?'Маршрут: '+(s.routes||[]).join(', '):'Остановка'))+'</div>'+(s.source==='route'?'':'<div class="bus-db-actions"><button class="btn btn-outline" data-edit-stop="'+esc(s.id)+'">✏️ Изменить</button><button class="btn btn-red" data-delete-stop="'+esc(s.id)+'">Удалить</button></div>')+'</article>').join(''):'<div class="bus-db-empty">Остановок пока нет. Добавь остановку или заполни список маршрута.</div>')+'</div>';
 $('busStopSearch').oninput=()=>{const q=$('busStopSearch').value.toLocaleLowerCase('ru-RU');host.querySelectorAll('.bus-db-item').forEach(el=>el.hidden=!el.textContent.toLocaleLowerCase('ru-RU').includes(q))};
 $('busAddStop').onclick=()=>addStop();
 host.querySelectorAll('[data-edit-stop]').forEach(b=>b.onclick=()=>{const x=db().stops.find(s=>String(s.id)===b.dataset.editStop);if(x)addStop(x)});
 host.querySelectorAll('[data-delete-stop]').forEach(b=>b.onclick=()=>{const id=String(b.dataset.deleteStop);if(!confirm('Удалить остановку?'))return;db().stops=db().stops.filter(s=>String(s.id)!==id);db().deletedStopIds.push(id);save()});
}
function render(){
 if(!db())return;
 const d=db(),vs=cityVehicles(),rs=cityRoutes(),ss=cityStops(),counts=$('busDbCounts');
 if(counts)counts.textContent='Город: '+city()+' · Маршрутов: '+rs.length+' · Автобусов: '+vs.length+' · Остановок: '+ss.length;
 const citySel=$('busDbCity');if(citySel&&citySel.value!==city())citySel.value=city();
 renderRoutes();renderFleet(vs);renderStops();
}
function populateShiftSelector(){
 const sel=$('shiftBusSelect');if(!sel||!db())return;
 const old=sel.value;
 sel.innerHTML='<option value="">— выбрать автобус —</option><option value="manual">Ввести модель вручную</option>'+
 cityVehicles().filter(v=>v.status!=='Списан'&&v.status!=='Выведен из эксплуатации').map(v=>'<option value="'+esc(v.id)+'" '+(v.status!=='В эксплуатации'?'disabled':'')+'>'+esc(v.number?v.number+' · ':'')+esc(v.model)+' — '+esc(v.status)+'</option>').join('');
 if(old&&Array.from(sel.options).some(o=>o.value===old))sel.value=old;
}
function connectShift(){
 const sel=$('shiftBusSelect'),model=$('shiftVehicleModel');if(!sel||!model||sel.dataset.busDbConnected==='1')return;
 sel.dataset.busDbConnected='1';
 sel.addEventListener('change',()=>{
  const v=db().vehicles.find(x=>String(x.id)===String(sel.value));
  if(v){model.value=v.model;model.readOnly=true;model.dataset.busId=v.id}
  else{model.readOnly=false;delete model.dataset.busId;if(sel.value==='manual')model.focus();else model.value=''}
 });
}
function wrapShift(){
 const start=window.startDriverShift;
 if(typeof start==='function'&&!start.__busDbWrapped){
  const wrapped=function(){
   const id=$('shiftBusSelect')?.value||'',v=db().vehicles.find(x=>String(x.id)===String(id));
   if(v&&v.status!=='В эксплуатации'){alert('Этот автобус нельзя выбрать: его статус — «'+v.status+'».');return}
   if(v&&$('shiftVehicleModel'))$('shiftVehicleModel').value=v.model;
   const result=start.apply(this,arguments),s=state.driverShift;
   if(s&&s.active){s.vehicleId=v?.id||null;s.vehicleNumber='';s.vehicle=v?v.model:($('shiftVehicleModel')?.value.trim()||'');if(v){v.status='На рейсе';v.updatedAt=now()}save()}
   return result;
  };
  wrapped.__busDbWrapped=true;window.startDriverShift=wrapped;
 }
 const finish=window.finishDriverShift;
 if(typeof finish==='function'&&!finish.__busDbWrapped){
  const wrapped=function(){
   const s=state.driverShift,vehicle=s?.vehicleId?db().vehicles.find(v=>String(v.id)===String(s.vehicleId)):null;
   const result=finish.apply(this,arguments);
   if(s&&!s.active&&vehicle&&vehicle.status==='На рейсе'){vehicle.status='В эксплуатации';vehicle.updatedAt=now()}
   save();return result;
  };
  wrapped.__busDbWrapped=true;window.finishDriverShift=wrapped;
 }
}
function setCity(value){
 const next=canonicalCity(value),d=db();if(!d)return;
 d.selectedCity=next;d.updatedAt=now();
 if($('busDbCity'))$('busDbCity').value=next;if($('newRouteCity'))$('newRouteCity').value=next;
 try{localStorage.setItem(KEY,JSON.stringify(d));if(typeof window.forceReliableCloudSync==='function')window.forceReliableCloudSync()}catch(e){console.warn(e)}
 selectedVehicles.clear();
 render();populateShiftSelector();refreshOtherViews();
 document.dispatchEvent(new CustomEvent('ticket-city-change',{detail:{city:next}}));
}
function refresh(){if(!db())return;if($('busDbCity'))$('busDbCity').value=city();if($('newRouteCity'))$('newRouteCity').value=city();render();populateShiftSelector();refreshOtherViews();}
function wrapRoutePair(){const original=window.saveRoutePair;if(typeof original!=='function'||original.__busDbCityWrapped)return;const wrapped=function(){const selectedCity=canonicalCity($('newRouteCity')?.value||city()),before=new Set(routes().map(r=>String(r.id)));let editId=null;try{if(typeof editingRouteId!=='undefined')editId=editingRouteId}catch(_){}const result=original.apply(this,arguments);routes().forEach(r=>{if(!before.has(String(r.id))||String(r.id)===String(editId))r.city=selectedCity});saveRoutesOnly();return result};wrapped.__busDbCityWrapped=true;window.saveRoutePair=wrapped;}
function watchRemoteChanges(){const snapshot=()=>{try{return JSON.stringify({db:db(),routes:routes()})}catch(_){return ''}};lastDatabaseSnapshot=snapshot();setInterval(()=>{const next=snapshot();if(next&&next!==lastDatabaseSnapshot){ensureNovoozyorskRoutes();lastDatabaseSnapshot=snapshot();render();populateShiftSelector();refreshOtherViews()}},2500)}
function boot(){
 if(!db())return;
 const d=db();
 // Existing routes without a city belong to the original default map, Tver.
 routes().forEach(r=>{if(isBusRoute(r)&&!r.city)r.city=canonicalCity(r.map||'Тверь')});
 ensureNovoozyorskRoutes();
 const citySel=$('busDbCity');
 if(citySel){citySel.value=d.selectedCity||'Тверь';citySel.onchange=()=>setCity(citySel.value)}
 if($('newRouteCity'))$('newRouteCity').value=d.selectedCity||'Тверь'
 document.querySelectorAll('[data-bus-view]').forEach(b=>b.onclick=()=>setView(b.dataset.busView));
 connectShift();populateShiftSelector();wrapShift();wrapRoutePair();render();refreshOtherViews();watchRemoteChanges();
 if(state.driverShift?.active&&state.driverShift.vehicleId){
  const v=db().vehicles.find(x=>String(x.id)===String(state.driverShift.vehicleId));
  if(v&&v.status==='В эксплуатации'){v.status='На рейсе';v.updatedAt=now();save()}
 }
 document.addEventListener('ticket-city-change',()=>{populateShiftSelector();render()});
 window.addEventListener('focus',refresh);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.TicketBusDatabase={
 render,refresh,populateShiftSelector,setCity,getCity:city,filterRoutes,
 getDatabase:()=>db(),
 save
};
})();