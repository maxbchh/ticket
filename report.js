/* Compact 58 mm shift/trip reports. Keeps existing ticketing and cloud sync logic intact. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const TYPES={bus:'Автобус',trolley:'Троллейбус',tram:'Трамвай',minibus:'Маршрутное такси',uzd:'Узкоколейная ЖД',train:'Железная дорога'};
const KEY='ticket_report_current_shift_v1';
let mode='shift';
let selectedArchive=null;
const ARCHIVES_KEY='ticket_report_archives_v1';
function archives(){return read(ARCHIVES_KEY,[])}
function saveArchives(a){write(ARCHIVES_KEY,a.slice(-50));if(typeof window.forceReliableCloudSync==='function')window.forceReliableCloudSync()}
function archiveCurrentShift(cashShiftIdOverride){
 const existing=read(ARCHIVES_KEY,[]);
 const driver=read('conductor_driver_shift_v1',null)||{};
 const meta=read(KEY,null)||{};
 const id=meta.id||('shift_'+(driver.realStartedAt||Date.now()));
 const previousIndex=existing.findIndex(a=>a.id===id);
 const cashShiftId=cashShiftIdOverride||localStorage.getItem('conductor_current_shift_id');
 const allTickets=tickets(),taggedTickets=allTickets.filter(t=>t.reportShiftId===id||(cashShiftId&&t.shiftId===cashShiftId));
 const allSales=sales(),taggedSales=allSales.filter(s=>s.reportShiftId===id);
 const finishedAt=new Date().toISOString(),startedAt=driver.startedAt||meta.startedAt||finishedAt;
 const recoveredTickets=allTickets.filter(t=>t.reportShiftId===id||(cashShiftId&&t.shiftId===cashShiftId));
 const combinedTickets=Array.from(new Map([...taggedTickets,...recoveredTickets].map(t=>[String(t.num??t.id??JSON.stringify(t)),t])).values());
 const recoveredSales=allSales.filter(s=>s.reportShiftId===id);
 const combinedSales=Array.from(new Map([...taggedSales,...recoveredSales].map(s=>[String(s.id??(s.name+'|'+s.time)),s])).values());
 const archive={id,cashShiftId,startedAt,finishedAt,gameStartTime:driver.gameStartTime||meta.gameStartTime||'не задано',gameTimeAtFinish:nowGame(),vehicle:{type:driver.transport||'bus',vehicleNo:driver.vehicleNumber||localStorage.getItem('conductor_vehicle_number')||'—',model:driver.vehicle||'—',routeName:driver.routeName||'—'},tickets:combinedTickets,buffet:combinedSales,ops:operations(),driverShift:driver,conductorSurname:$('reportConductorSurname')?.value||'',driverSurname:$('reportDriverSurname')?.value||'',printedAt:null};
 if(previousIndex>=0)existing[previousIndex]=archive;else existing.push(archive);saveArchives(existing);selectedArchive=archive;return archive;
}

function openManual(){
 const box=$('reportManualEditor');if(!box)return;box.style.display='block';
 const a=selectedArchive;const v=a?.vehicle||getVehicle();const dt=a?.startedAt||new Date().toISOString();
 const set=(id,val)=>{const el=$(id);if(el)el.value=val==null?'':String(val)};
 set('manualReportDate',new Date(dt).toISOString().slice(0,16));
 set('manualReportTransport',a?.vehicle?.type||read('conductor_driver_shift_v1',null)?.transport||'bus');
 set('manualReportVehicleNo',v.vehicleNo||'');set('manualReportModel',v.model||'');set('manualReportRoute',v.routeName||'');
 const ar=a||{tickets:tickets(),buffet:sales()};
 const tr=(ar.tickets||[]).filter(t=>t.status!=='cancelled'&&t.status!=='annulled');
 set('manualReportTicketCount',tr.reduce((n,t)=>n+Math.max(1,Number(t.quantity||t.qty||1)),0));
 set('manualReportTicketRevenue',tr.reduce((n,t)=>n+Number(t.total!=null?t.total:(Number(t.price||0)*Number(t.quantity||1))),0).toFixed(2));
 set('manualReportGoodsRevenue',(ar.buffet||[]).reduce((n,s)=>n+Number(s.total||0),0).toFixed(2));
 set('manualReportChange',tr.reduce((n,t)=>n+Number(t.change||t.changeAmount||0),0).toFixed(2));
 set('manualReportGameTime',a?.gameTimeAtFinish||nowGame().replace('не задано','12:00'));
 set('manualReportConductor',a?.conductorSurname||$('reportConductorSurname')?.value||'');
 set('manualReportDriver',a?.driverSurname||$('reportDriverSurname')?.value||'');
 set('manualReportStops',tr.length?Array.from(tr.reduce((m,t)=>{const name=String(t.to||t.destination||'Не указана'),q=Math.max(1,Number(t.quantity||t.qty||1)),sum=Number(t.total!=null?t.total:Number(t.price||0)*q),v=m.get(name)||{q:0,sum:0};v.q+=q;v.sum+=sum;m.set(name,v);return m},new Map()).entries()).map(([n,x])=>x.q+'; '+n+'; '+x.sum.toFixed(2)).join('\n'):'');
 set('manualReportGoods',(ar.buffet||[]).map(s=>Math.max(1,Number(s.quantity||1))+'; '+(s.name||'Товар')+'; '+Number(s.total||0).toFixed(2)).join('\n'));
}
function cancelManual(){const b=$('reportManualEditor');if(b)b.style.display='none'}
function saveManual(){
 const val=id=>$(id)?.value||'';
 const num=id=>Math.max(0,Number(val(id))||0);
 const parseRows=(id,kind)=>val(id).split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
  const p=line.split(';').map(x=>x.trim());if(p.length<3)throw new Error('Проверь строку: '+line);
  const qty=Math.max(0,Number(p[0])||0),name=p.slice(1,-1).join(';')||kind,total=Math.max(0,Number(p[p.length-1].replace(',','.'))||0);
  return {qty,name,total};
 });
 let stops,goods;try{stops=parseRows('manualReportStops','Остановка');goods=parseRows('manualReportGoods','Товар')}catch(e){alert(e.message);return}
 const ticketCount=num('manualReportTicketCount'),ticketRevenue=num('manualReportTicketRevenue'),goodsRevenue=num('manualReportGoodsRevenue'),change=num('manualReportChange');
 const ticketsOut=[];let stopCount=stops.reduce((n,x)=>n+x.qty,0);
 if(stops.length){stops.forEach((x,i)=>ticketsOut.push({id:'manual_'+Date.now()+'_'+i,quantity:x.qty,qty:x.qty,total:x.total,price:x.qty?x.total/x.qty:0,to:x.name,passengerType:'full',paymentMethod:'cash',change:0,status:'issued',manualReport:true}))}
 else if(ticketCount||ticketRevenue)ticketsOut.push({id:'manual_'+Date.now(),quantity:ticketCount,qty:ticketCount,total:ticketRevenue,price:ticketCount?ticketRevenue/ticketCount:0,to:'Не указана',passengerType:'full',paymentMethod:'cash',change,status:'issued',manualReport:true});
 const salesOut=goods.length?goods.map((x,i)=>({id:'manual_goods_'+Date.now()+'_'+i,quantity:x.qty,name:x.name,total:x.total,paymentMethod:'cash',manualReport:true})):goodsRevenue?[{id:'manual_goods_'+Date.now(),quantity:1,name:'Товары (итого)',total:goodsRevenue,paymentMethod:'cash',manualReport:true}]:[];
 const iso=val('manualReportDate')?new Date(val('manualReportDate')).toISOString():new Date().toISOString();
 const v={type:val('manualReportTransport')||'bus',vehicleNo:val('manualReportVehicleNo')||'—',model:val('manualReportModel')||'—',routeName:val('manualReportRoute')||'—'};
 const all=archives();const id=selectedArchive?.id||('manual_shift_'+Date.now());
 const a={id,manual:true,startedAt:iso,finishedAt:iso,gameTimeAtFinish:val('manualReportGameTime')||'не задано',vehicle:v,tickets:ticketsOut,buffet:salesOut,ops:[],driverShift:{transport:v.type,vehicleNumber:v.vehicleNo,vehicle:v.model,routeName:v.routeName,startedAt:iso},conductorSurname:val('manualReportConductor'),driverSurname:val('manualReportDriver'),printedAt:null,manualTotals:{ticketCount,ticketRevenue,goodsRevenue,change}};
 const i=all.findIndex(x=>x.id===id);if(i>=0)all[i]=a;else all.push(a);saveArchives(all);selectedArchive=a;mode='shift';
 if($('reportConductorSurname'))$('reportConductorSurname').value=a.conductorSurname;
 if($('reportDriverSurname'))$('reportDriverSurname').value=a.driverSurname;
 cancelManual();render();alert('Отчёт сохранён. Его можно распечатать сейчас или позже из списка сохранённых отчётов.');
}
function selectArchive(id){if(!id){selectedArchive=null;mode='shift';render();return}const a=archives().find(x=>x.id===id);if(a){selectedArchive=a;mode='shift';render()}}
function pendingArchive(){return archives().find(a=>!a.printedAt)}
function read(k,fallback){try{const x=JSON.parse(localStorage.getItem(k));return x==null?fallback:x}catch(_){return fallback}}
function write(k,v){localStorage.setItem(k,JSON.stringify(v))}
function money(n){return (Math.round((Number(n)||0)*100)/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN'}
function escape(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function nowGame(){const s=read('conductor_driver_shift_v1',null);if(s&&s.gameStartTime){const p=s.gameStartTime.split(':').map(Number),base=(p[0]||0)*60+(p[1]||0),started=Number(s.realStartedAt||Date.parse(s.startedAt)||Date.now()),m=(base+Math.max(0,Math.floor((Date.now()-started)/60000)))%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}return 'не задано'}
function shiftMeta(){let m=read(KEY,null);const cashId=localStorage.getItem('conductor_current_shift_id');const active=localStorage.getItem('conductor_shift_active')==='true';if(!m||(active&&cashId&&m.cashShiftId!==cashId)){m={id:'report_'+(cashId||Date.now()),cashShiftId:cashId||null,startedAt:new Date().toISOString(),gameStartTime:nowGame()};write(KEY,m)}return m}
function ensureShift(){if(localStorage.getItem('conductor_shift_active')==='true')return shiftMeta();return read(KEY,null)||shiftMeta()}
function tickets(){return read('conductor_tickets',[])}
function sales(){return read('ticket_excursion_buffet_sales_v1',[])}
function operations(){return read('conductor_operations',[])}
function activeShiftId(){return shiftMeta().id}
function getVehicle(){
 const s=read('conductor_driver_shift_v1',null);
 const route=(read('conductor_routes',[])).find(r=>String(r.id)===String(s&&s.routeId));
 const type=selectedArchive?.vehicle?.type||s&&s.transport||$('transportType')?.value||'bus';
 const routeName=selectedArchive?.vehicle?.routeName||s&&s.routeName||route&&route.name||$('routeSelect')?.selectedOptions?.[0]?.text||'—';
 const model=selectedArchive?.vehicle?.model||s&&s.vehicle||$('shiftVehicleModel')?.value||'—';
 const vehicleNo=selectedArchive?.vehicle?.vehicleNo||s&&s.vehicleNumber||localStorage.getItem('conductor_vehicle_number')||'—';
 return {type:TYPES[type]||type,model,routeName,vehicleNo,shift:s};
}
function currentRecords(which){
 const id=activeShiftId(),ts=tickets(),bs=sales();
 const cashShiftId=localStorage.getItem('conductor_current_shift_id');
 const ticketRows=ts.filter(t=>t.reportShiftId===id||(cashShiftId&&t.shiftId===cashShiftId));
 const buffetRows=bs.filter(s=>s.reportShiftId===id);
 if(which==='trip'){
   const trip=read('conductor_current_trip_id',null);
   const driver=read('conductor_driver_shift_v1',null);
   const route=read('conductor_current_trip_route',null)||(driver&&driver.routeId);
   return {tickets:ticketRows.filter(t=>(trip&&t.reportTripId===trip)||(route&&String(t.routeId||'')===String(route))),buffet:buffetRows.filter(s=>(trip&&s.reportTripId===trip)||(route&&String(s.reportRouteId||'')===String(route))),ops:operations().filter(o=>!o.reportShiftId||o.reportShiftId===id)};
 }
 return {tickets:ticketRows,buffet:buffetRows,ops:operations().filter(o=>!o.reportShiftId||o.reportShiftId===id)};
}
function archiveRecords(a){
 if(!a||a.manual)return {tickets:a?.tickets||[],buffet:a?.buffet||[],ops:a?.ops||[]};
 const start=Date.parse(a.startedAt||''),end=Date.parse(a.finishedAt||'');
 const belongsToArchive=t=>t.reportShiftId===a.id||(a.cashShiftId&&t.shiftId===a.cashShiftId);
 const recovered=tickets().filter(belongsToArchive);
 const saved=(a.tickets||[]).filter(belongsToArchive),combinedTickets=Array.from(new Map([...saved,...recovered].map(t=>[String(t.num??t.id??JSON.stringify(t)),t])).values());
 const recoveredSales=sales().filter(s=>s.reportShiftId===a.id),savedSales=a.buffet||[],combinedSales=Array.from(new Map([...savedSales,...recoveredSales].map(s=>[String(s.id??(s.name+'|'+s.time)),s])).values());
 return {tickets:combinedTickets,buffet:combinedSales,ops:a.ops||[]};
}
function paymentKind(value){const s=String(value||'').toLowerCase();if(s.includes('qr')||s.includes('кьюар'))return 'qr';if(s.includes('card')||s.includes('карт'))return 'card';return 'cash'}
function render(){
  const archiveSelect=$('reportArchiveSelect');if(archiveSelect){const list=archives();const selected=selectedArchive?.id||'';archiveSelect.innerHTML='<option value="">Текущая смена</option>'+list.slice().reverse().map(a=>'<option value="'+escape(a.id)+'">'+escape(new Date(a.finishedAt||a.startedAt).toLocaleString('ru-RU'))+' — '+escape((a.vehicle?.routeName)||'смена')+(a.printedAt?' (напечатан)':' (не напечатан)')+'</option>').join('');archiveSelect.value=selected;}
 const host=$('ticketReportPreview');if(!host)return;
 const data=(selectedArchive&&mode==='shift')?archiveRecords(selectedArchive):currentRecords(mode),v=getVehicle(),ts=data.tickets.filter(t=>t.status!=='cancelled'&&t.status!=='annulled'),cancelled=data.tickets.filter(t=>t.status==='cancelled'||t.status==='annulled');
 const byType=new Map(),byStop=new Map(),byMethod={cash:0,card:0,qr:0};
 let ticketRevenue=0, ticketCount=0,change=0;
 ts.forEach(t=>{
  const qty=Math.max(1,Number(t.quantity||t.qty||1)),price=Number(t.total!=null?t.total:(Number(t.price||0)*qty));
  ticketRevenue+=price;ticketCount+=qty;
  const rawKind=t.passengerType||t.passenger||t.category||'Билет';const kind=({full:'Полный',lgt:'Льготный',child:'Школьный',luggage:'Багаж / животные'})[rawKind]||rawKind;
  const prev=byType.get(kind)||{qty:0,sum:0};prev.qty+=qty;prev.sum+=price;byType.set(kind,prev);
  const stop=String(t.to||t.destination||'Не указана');const st=byStop.get(stop)||{qty:0,sum:0};st.qty+=qty;st.sum+=price;byStop.set(stop,st);
  const method=paymentKind(t.paymentMethod);byMethod[method]+=price;
  change+=Number(t.change||t.changeAmount||0);
 });
 const products=new Map();let goodsRevenue=0,goodsCount=0;
 data.buffet.forEach(s=>{const q=Math.max(0,Number(s.quantity||1)),sum=Number(s.total||0);goodsRevenue+=sum;goodsCount+=q;const p=products.get(s.name)||{qty:0,sum:0};p.qty+=q;p.sum+=sum;products.set(s.name,p);const m=paymentKind(s.paymentMethod);byMethod[m]+=sum});
 const total=ticketRevenue+goodsRevenue;
 const allMethods=byMethod.cash+byMethod.card;
 const s=selectedArchive?.driverShift||read('conductor_driver_shift_v1',null),started=selectedArchive?.startedAt||(s&&s.startedAt)||shiftMeta().startedAt;
 const printed=selectedArchive?.gameTimeAtFinish||nowGame();
 const lines=(map,kind)=>Array.from(map.entries()).map(([name,x])=>'<div>'+escape(x.qty)+' × '+escape(name)+' — '+money(x.sum)+'</div>').join('')||'<div>Нет записей</div>';
 const stamp='<div class="rp-line"></div><div class="rp-center rp-small">МЕСТО ДЛЯ ПЕЧАТИ ОРГАНИЗАЦИИ</div><div style="height:24px"></div>';
 host.innerHTML='<div id="ticketReportPaper">'+
 '<div class="rp-center"><b>ОТЧЁТ ПО '+(mode==='shift'?'СМЕНЕ':'ПОЕЗДКЕ')+'</b></div>'+
 '<div class="rp-transport">'+escape(v.type)+' №'+escape(v.vehicleNo)+' · '+escape(v.model)+' · '+escape(v.routeName)+'</div>'+
 '<div class="rp-line"></div>'+
 '<div>Смена: '+escape(new Date(started).toLocaleString('ru-RU'))+'</div>'+
 '<div>Печать: '+escape(printed)+' (игровое)</div>'+
 '<div>Печатное время: '+escape(new Date().toLocaleString('ru-RU'))+'</div>'+
 '<div class="rp-line"></div><b>БИЛЕТЫ</b>'+
 '<div>Количество: '+ticketCount+' шт.</div>'+lines(byType,'ticket')+
 '<div class="rp-line"></div><b>ТОВАРЫ</b><div>Количество: '+goodsCount+' шт.</div>'+lines(products,'goods')+
 '<div class="rp-line"></div><b>ПО ОСТАНОВКАМ</b>'+Array.from(byStop.entries()).map(([name,x])=>'<div>'+x.qty+' × '+escape(name)+'</div>').join('')+'<div class="rp-line"></div>'+
 '<b>ФИНАНСЫ</b><div class="rp-row"><span>Билеты</span><b>'+money(ticketRevenue)+'</b></div><div class="rp-row"><span>Товары</span><b>'+money(goodsRevenue)+'</b></div><div class="rp-row"><span>ВЫРУЧКА</span><b>'+money(total)+'</b></div>'+
 '<div class="rp-row"><span>Наличные (оценка)</span><span>'+money(byMethod.cash)+'</span></div><div class="rp-row"><span>Карта (оценка)</span><span>'+money(byMethod.card)+'</span></div><div class="rp-row"><span>QR / электронная оплата</span><span>'+money(byMethod.qr)+'</span></div><div class="rp-row"><span>Сдача (если записана)</span><span>'+money(change)+'</span></div><div class="rp-row"><span>Аннулировано</span><span>'+cancelled.length+'</span></div>'+
 '<div class="rp-line"></div><div class="rp-sign">Кондуктор: '+escape($('reportConductorSurname')?.value||'')+'<br>Фамилия / подпись: __________________</div>'+
 '<div class="rp-sign">Водитель: '+escape($('reportDriverSurname')?.value||'')+'<br>Фамилия / подпись: __________________</div>'+stamp+'</div>';
}
function print(){render();document.body.classList.add('print-ticket-report');const cleanup=()=>{document.body.classList.remove('print-ticket-report');window.removeEventListener('afterprint',cleanup)};window.addEventListener('afterprint',cleanup);window.print();if(selectedArchive){const all=archives();const a=all.find(x=>x.id===selectedArchive.id);if(a){a.printedAt=new Date().toISOString();saveArchives(all);selectedArchive=a}}setTimeout(cleanup,3000)}
function setMode(m){mode=m==='trip'?'trip':'shift';render()}
function refresh(){render()}
window.TicketReports={setMode,refresh,print,selectArchive,openManual,cancelManual,saveManual};
const originalCloseCashShift=window.closeShift;
if(typeof originalCloseCashShift==='function')window.closeShift=function(){const cashShiftIdBefore=localStorage.getItem('conductor_current_shift_id');const result=originalCloseCashShift.apply(this,arguments);if(localStorage.getItem('conductor_shift_active')==='false')archiveCurrentShift(cashShiftIdBefore);return result};
const originalFinishDriverShift=window.finishDriverShift;
if(typeof originalFinishDriverShift==='function')window.finishDriverShift=function(){const result=originalFinishDriverShift.apply(this,arguments);try{archiveCurrentShift();render();if(typeof window.forceReliableCloudSync==='function')window.forceReliableCloudSync()}catch(e){console.error('Не удалось сохранить отчёт завершённой смены:',e)}return result};
const originalSwitchTab=window.switchTab;
if(typeof originalSwitchTab==='function')window.switchTab=function(tabId,btn){const result=originalSwitchTab.apply(this,arguments);if(tabId==='reports'){try{selectedArchive=null;render()}catch(e){console.error('Ошибка вкладки отчётов:',e);const host=$('ticketReportPreview');if(host)host.textContent='Не удалось загрузить отчёт. Нажми «Обновить» или перезагрузи страницу.'}}return result};
const oldOpen=window.openShift;
window.openShift=function(){if(typeof oldOpen==='function')oldOpen();const m={id:'shift_'+Date.now(),startedAt:new Date().toISOString(),gameStartTime:nowGame()};write(KEY,m);render()};
const oldTicket=window.processTicketSale;
if(typeof oldTicket==='function')window.processTicketSale=function(){const before=tickets().length,result=oldTicket.apply(this,arguments),all=tickets();if(all.length>before){const added=all.slice(before),trip=read('conductor_current_trip_id',null),routeId=$('routeSelect')?.value||null,change=Number($('cashSaleChange')?.textContent?.replace(/[^0-9,.-]/g,'').replace(',','.')||0);added.forEach((t,i)=>{t.reportShiftId=activeShiftId();t.reportTripId=trip;t.routeId=t.routeId||routeId;t.passengerType=t.passengerType||$('passengerType')?.value||'full';t.paymentMethod=paymentKind(t.paymentMethod||window.__cashPaymentMethod||'cash');t.quantity=1;t.qty=1;t.total=Math.round(Number(t.price||0)*100)/100;t.change=i===added.length-1?change:0;t.transportType=t.transportType||$('transportType')?.value||''});write('conductor_tickets',all)}render();return result};
const oldBuffet=window.completeBuffetPayment;
if(typeof oldBuffet==='function')window.completeBuffetPayment=function(items,method,total){const before=sales().map(s=>s.id);const r=oldBuffet.apply(this,arguments);const known=new Set(before),all=sales(),id=activeShiftId();all.forEach(s=>{if(!known.has(s.id)){s.reportShiftId=id;s.reportTripId=read('conductor_current_trip_id',null);s.reportRouteId=read('conductor_current_trip_route',null)||(read('conductor_driver_shift_v1',null)||{}).routeId}});write('ticket_excursion_buffet_sales_v1',all);render();return r};
['reportConductorSurname','reportDriverSurname'].forEach(id=>$(id)?.addEventListener('input',render));
window.addEventListener('load',()=>{if(localStorage.getItem('conductor_shift_active')==='true')shiftMeta();const p=pendingArchive();if(p)selectedArchive=p;render()});
window.addEventListener('focus',render);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render()});
})();