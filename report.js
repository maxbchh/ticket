/* Compact 58 mm shift/trip reports. Keeps existing ticketing and cloud sync logic intact. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const TYPES={bus:'Автобус',trolley:'Троллейбус',tram:'Трамвай',minibus:'Маршрутное такси',uzd:'Узкоколейная ЖД',train:'Железная дорога'};
const KEY='ticket_report_current_shift_v1';
let mode='shift';
function read(k,fallback){try{const x=JSON.parse(localStorage.getItem(k));return x==null?fallback:x}catch(_){return fallback}}
function write(k,v){localStorage.setItem(k,JSON.stringify(v))}
function money(n){return (Math.round((Number(n)||0)*100)/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN'}
function escape(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function nowGame(){const s=read('conductor_driver_shift_v1',null);if(s&&s.gameStartTime){const p=s.gameStartTime.split(':').map(Number),base=(p[0]||0)*60+(p[1]||0),started=Number(s.realStartedAt||Date.parse(s.startedAt)||Date.now()),m=(base+Math.max(0,Math.floor((Date.now()-started)/60000)))%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}return 'не задано'}
function shiftMeta(){let m=read(KEY,null);if(!m){m={id:'shift_'+Date.now(),startedAt:new Date().toISOString(),gameStartTime:nowGame()};write(KEY,m)}return m}
function ensureShift(){if(localStorage.getItem('conductor_shift_active')==='true')return shiftMeta();return read(KEY,null)||shiftMeta()}
function tickets(){return read('conductor_tickets',[])}
function sales(){return read('ticket_excursion_buffet_sales_v1',[])}
function operations(){return read('conductor_operations',[])}
function activeShiftId(){return shiftMeta().id}
function getVehicle(){
 const s=read('conductor_driver_shift_v1',null);
 const route=(read('conductor_routes',[])).find(r=>String(r.id)===String(s&&s.routeId));
 const type=s&&s.transport||$('transportType')?.value||'bus';
 const routeName=s&&s.routeName||route&&route.name||$('routeSelect')?.selectedOptions?.[0]?.text||'—';
 const model=s&&s.vehicle||$('shiftVehicleModel')?.value||'—';
 const vehicleNo=s&&s.vehicleNumber||localStorage.getItem('conductor_vehicle_number')||'—';
 return {type:TYPES[type]||type,model,routeName,vehicleNo,shift:s};
}
function currentRecords(which){
 const id=activeShiftId(),ts=tickets(),bs=sales();
 const ticketRows=ts.filter(t=>t.reportShiftId===id);
 const buffetRows=bs.filter(s=>s.reportShiftId===id);
 if(which==='trip'){
   const trip=read('conductor_current_trip_id',null);
   const driver=read('conductor_driver_shift_v1',null);
   const route=read('conductor_current_trip_route',null)||(driver&&driver.routeId);
   return {tickets:ticketRows.filter(t=>(trip&&t.reportTripId===trip)||(route&&String(t.routeId||'')===String(route))),buffet:buffetRows.filter(s=>(trip&&s.reportTripId===trip)||(route&&String(s.reportRouteId||'')===String(route))),ops:operations().filter(o=>!o.reportShiftId||o.reportShiftId===id)};
 }
 return {tickets:ticketRows,buffet:buffetRows,ops:operations().filter(o=>!o.reportShiftId||o.reportShiftId===id)};
}
function render(){
 const host=$('ticketReportPreview');if(!host)return;
 const data=currentRecords(mode),v=getVehicle(),ts=data.tickets.filter(t=>t.status!=='cancelled'&&t.status!=='annulled'),cancelled=data.tickets.filter(t=>t.status==='cancelled'||t.status==='annulled');
 const byType=new Map(),byStop=new Map(),byMethod={cash:0,card:0},methodNames={cash:'Наличные',card:'Карта'};
 let ticketRevenue=0, ticketCount=0,change=0;
 ts.forEach(t=>{
  const qty=Math.max(1,Number(t.quantity||t.qty||1)),price=Number(t.total!=null?t.total:(Number(t.price||0)*qty));
  ticketRevenue+=price;ticketCount+=qty;
  const rawKind=t.passengerType||t.passenger||t.category||'Билет';const kind=({full:'Полный',lgt:'Льготный',child:'Школьный',luggage:'Багаж / животные'})[rawKind]||rawKind;
  const prev=byType.get(kind)||{qty:0,sum:0};prev.qty+=qty;prev.sum+=price;byType.set(kind,prev);
  const stop=String(t.to||t.destination||'Не указана');const st=byStop.get(stop)||{qty:0,sum:0};st.qty+=qty;st.sum+=price;byStop.set(stop,st);
  const method=t.paymentMethod==='card'?'card':'cash';byMethod[method]+=price;
  change+=Number(t.change||t.changeAmount||0);
 });
 const products=new Map();let goodsRevenue=0,goodsCount=0;
 data.buffet.forEach(s=>{const q=Math.max(0,Number(s.quantity||1)),sum=Number(s.total||0);goodsRevenue+=sum;goodsCount+=q;const p=products.get(s.name)||{qty:0,sum:0};p.qty+=q;p.sum+=sum;products.set(s.name,p);const m=s.paymentMethod==='card'?'card':'cash';byMethod[m]+=sum});
 const total=ticketRevenue+goodsRevenue;
 const allMethods=byMethod.cash+byMethod.card;
 const s=read('conductor_driver_shift_v1',null),started=(s&&s.startedAt)||shiftMeta().startedAt;
 const printed=nowGame();
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
 '<div class="rp-row"><span>Наличные (оценка)</span><span>'+money(byMethod.cash)+'</span></div><div class="rp-row"><span>Карта (оценка)</span><span>'+money(byMethod.card)+'</span></div><div class="rp-row"><span>Сдача (если записана)</span><span>'+money(change)+'</span></div><div class="rp-row"><span>Аннулировано</span><span>'+cancelled.length+'</span></div>'+
 '<div class="rp-line"></div><div class="rp-sign">Кондуктор: '+escape($('reportConductorSurname')?.value||'')+'<br>Фамилия / подпись: __________________</div>'+
 '<div class="rp-sign">Водитель: '+escape($('reportDriverSurname')?.value||'')+'<br>Фамилия / подпись: __________________</div>'+stamp+'</div>';
}
function print(){render();document.body.classList.add('print-ticket-report');const cleanup=()=>{document.body.classList.remove('print-ticket-report');window.removeEventListener('afterprint',cleanup)};window.addEventListener('afterprint',cleanup);window.print();setTimeout(cleanup,3000)}
function setMode(m){mode=m==='trip'?'trip':'shift';render()}
function refresh(){render()}
window.TicketReports={setMode,refresh,print};
const oldOpen=window.openShift;
window.openShift=function(){if(typeof oldOpen==='function')oldOpen();const m={id:'shift_'+Date.now(),startedAt:new Date().toISOString(),gameStartTime:nowGame()};write(KEY,m);render()};
const oldTicket=window.processTicketSale;
if(typeof oldTicket==='function')window.processTicketSale=function(){const before=tickets().length,result=oldTicket.apply(this,arguments),all=tickets();if(all.length>before){const t=all[all.length-1],s=read('conductor_driver_shift_v1',null),qty=Math.max(1,Number($('ticketQuantity')?.value||1));t.quantity=qty;t.total=Math.round(Number(t.price||0)*qty*100)/100;t.reportShiftId=activeShiftId();t.reportTripId=read('conductor_current_trip_id',null);t.routeId=$('routeSelect')?.value||null;t.passengerType=$('passengerType')?.value||'full';t.paymentMethod=window.__cashPaymentMethod==='card'?'card':'cash';t.change=Number($('cashSaleChange')?.textContent?.replace(/[^0-9,.-]/g,'').replace(',','.')||0);t.transportType=$('transportType')?.value||'';write('conductor_tickets',all)}render();return result};
const oldBuffet=window.completeBuffetPayment;
if(typeof oldBuffet==='function')window.completeBuffetPayment=function(items,method,total){const before=sales().map(s=>s.id);const r=oldBuffet.apply(this,arguments);const known=new Set(before),all=sales(),id=activeShiftId();all.forEach(s=>{if(!known.has(s.id)){s.reportShiftId=id;s.reportTripId=read('conductor_current_trip_id',null);s.reportRouteId=read('conductor_current_trip_route',null)||(read('conductor_driver_shift_v1',null)||{}).routeId}});write('ticket_excursion_buffet_sales_v1',all);render();return r};
['reportConductorSurname','reportDriverSurname'].forEach(id=>$(id)?.addEventListener('input',render));
window.addEventListener('load',()=>{if(localStorage.getItem('conductor_shift_active')==='true')shiftMeta();render()});
window.addEventListener('focus',render);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render()});
})();