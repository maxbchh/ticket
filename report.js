/* Driver-shift reports. Each archive is tied to one driver shift / trip. */
(function () {
  'use strict';
  const DRIVER_KEY='conductor_driver_shift_v1', TICKETS_KEY='conductor_tickets';
  const BUFFET_KEY='ticket_excursion_buffet_sales_v1', ARCHIVES_KEY='ticket_report_archives_v1';
  const TRIP_KEY='conductor_current_trip_id', $=id=>document.getElementById(id);
  const TYPES={bus:'Автобус',trolley:'Троллейбус',tram:'Трамвай',minibus:'Маршрутное такси',uzd:'Транспорт',train:'Железная дорога'};
  let selectedArchiveId='', root=null, renderQueued=false;

  function read(k,d){try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch(_){return d}}
  function write(k,v){localStorage.setItem(k,JSON.stringify(v));if(typeof window.forceReliableCloudSync==='function')window.forceReliableCloudSync()}
  function money(v){return (Math.round((Number(v)||0)*100)/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN'}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function date(v){const d=v?new Date(v):null;return d&&!Number.isNaN(d.getTime())?d.toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'}):'—'}
  function time(v){const d=v?new Date(v):null;return d&&!Number.isNaN(d.getTime())?d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'—'}
  function shift(){return read(DRIVER_KEY,null)}
  function tickets(){const x=read(TICKETS_KEY,[]);return Array.isArray(x)?x:[]}
  function sales(){const x=read(BUFFET_KEY,[]);return Array.isArray(x)?x:[]}
  function archives(){const z=read('ticket_z_report_v1',null);return z&&typeof z==='object'?[z]:[]}
  function saveArchives(list){const z=read('ticket_z_report_v1',null);if(z){const u=(list||[]).find(x=>String(x.id)===String(z.id));if(u)write('ticket_z_report_v1',u)}write(ARCHIVES_KEY,(list||[]).slice(-1))}
  function ticketKey(t){return String((t&&(t.num??t.number??t.id??t.purchaseId))??JSON.stringify(t||{}))}
  function saleKey(s){return String((s&&(s.id??s.saleId??s.purchaseId))??[s&&s.name,s&&s.time,s&&s.total,s&&s.quantity].join('|'))}
  function tripId(s){return (s&&(s.tripId||s.reportTripId||s.currentTripId))||null}
  function rowTime(row){for(const k of ['issuedAt','createdAt','created_at','timestamp','datetime','dateTime']){const v=row&&row[k];if(v){const n=Date.parse(v);if(!Number.isNaN(n))return n}}return null}
  function routeMatches(row,s){return !row.routeId||!s.routeId||String(row.routeId)===String(s.routeId)||String(row.reportRouteId||'')===String(s.routeId)||String(row.driverRouteId||'')===String(s.routeId)}
  function inWindow(row,s){const t=rowTime(row),a=Date.parse(s&&s.startedAt||''),b=Date.parse(s&&s.finishedAt||'')||Date.now();return t!==null&&!Number.isNaN(a)&&t>=a-60000&&t<=b+60000&&routeMatches(row,s||{})}
  function maxTicket(rows){return (rows||[]).reduce((m,t)=>Math.max(m,Number(t&&(t.num??t.number))||0),0)}
  function ensureMetadata(s,fresh){
    if(!s||typeof s!=='object')return s;
    const trip=tripId(s)||read(TRIP_KEY,null);
    if(!s.reportId)s.reportId='driver_report_'+String(s.realStartedAt||Date.parse(s.startedAt)||Date.now())+'_'+Math.random().toString(36).slice(2,7);
    if(trip)s.tripId=String(trip);
    if(!s.cashShiftId)s.cashShiftId=localStorage.getItem('conductor_current_shift_id')||null;
    if(s.ticketWatermark==null||fresh)s.ticketWatermark=maxTicket(tickets());
    if(!Array.isArray(s.ticketBaselineKeys)||fresh)s.ticketBaselineKeys=tickets().map(ticketKey).slice(-3000);
    if(!Array.isArray(s.salesBaselineKeys)||fresh)s.salesBaselineKeys=sales().map(saleKey).slice(-1000);
    if(!s.startedAt)s.startedAt=new Date().toISOString();
    if(!s.vehicleNumber)s.vehicleNumber=localStorage.getItem('conductor_vehicle_number')||'';
    return s;
  }
  function storeShift(s){
    if(!s)return;
    s.updatedAt=new Date().toISOString();
    localStorage.setItem(DRIVER_KEY,JSON.stringify(s));
    try{if(typeof state!=='undefined')state.driverShift=s;if(typeof persist==='function')persist()}catch(_){}
    if(typeof window.forceReliableCloudSync==='function')window.forceReliableCloudSync();
  }
  function shouldTag(row,s,kind){
    if(!row||!s||!s.reportId)return false;
    if(String(row.driverShiftReportId||'')===String(s.reportId))return true;
    const trip=tripId(s),rowTrip=row.reportTripId||row.tripId||row.currentTripId||row.driverTripId||null;
    if(trip&&rowTrip&&String(trip)===String(rowTrip))return true;
    const baseline=kind==='ticket'?(s.ticketBaselineKeys||[]):(s.salesBaselineKeys||[]);
    const key=kind==='ticket'?ticketKey(row):saleKey(row);
    const fresh=kind==='ticket'?(Number(row.num??row.number)>Number(s.ticketWatermark||0)||baseline.indexOf(key)<0):baseline.indexOf(key)<0;
    if(!fresh||!routeMatches(row,s))return false;
    const stamp=rowTime(row);
    return stamp!==null?inWindow(row,s):s.active===true;
  }
  function tagRows(s){
    if(!s||!s.reportId)return;
    let tc=false,sc=false;
    const trip=tripId(s),id=String(s.reportId),ts=tickets();
    ts.forEach(t=>{
      if(t.driverShiftReportId&&String(t.driverShiftReportId)!==id)return;
      if(!shouldTag(t,s,'ticket'))return;
      if(String(t.driverShiftReportId||'')!==id){t.driverShiftReportId=id;tc=true}
      if(trip&&!t.reportTripId){t.reportTripId=String(trip);tc=true}
      if(s.routeId&&!t.driverRouteId){t.driverRouteId=s.routeId;tc=true}
      if(s.startedAt&&!t.driverShiftStartedAt){t.driverShiftStartedAt=s.startedAt;tc=true}
    });
    const bs=sales();
    bs.forEach(v=>{
      if(v.driverShiftReportId&&String(v.driverShiftReportId)!==id)return;
      if(!shouldTag(v,s,'sale'))return;
      if(String(v.driverShiftReportId||'')!==id){v.driverShiftReportId=id;sc=true}
      if(trip&&!v.reportTripId){v.reportTripId=String(trip);sc=true}
      if(s.routeId&&!v.reportRouteId){v.reportRouteId=s.routeId;sc=true}
    });
    if(tc){localStorage.setItem(TICKETS_KEY,JSON.stringify(ts));try{if(typeof state!=='undefined')state.tickets=ts}catch(_){}}
    if(sc)localStorage.setItem(BUFFET_KEY,JSON.stringify(bs));
    if(tc||sc){try{if(typeof persist==='function')persist()}catch(_){}if(typeof window.forceReliableCloudSync==='function')window.forceReliableCloudSync()}
  }
  function belongs(row,s,archive,kind){
    const id=String((archive&&archive.id)||(s&&s.reportId)||''), rowId=String(row.driverShiftReportId||'');
    if(id&&rowId===id)return true;
    if(id&&rowId&&rowId!==id)return false;
    const trip=(archive&&archive.tripId)||tripId(s), rowTrip=row.reportTripId||row.tripId||row.currentTripId||row.driverTripId||null;
    if(trip&&rowTrip&&String(trip)===String(rowTrip))return true;
    if(archive&&archive.reportVersion>=2){
      const saved=kind==='ticket'?(archive.tickets||[]):(archive.buffet||[]);
      if(saved.some(x=>(kind==='ticket'?ticketKey(x):saleKey(x))===(kind==='ticket'?ticketKey(row):saleKey(row))))return true;
    }
    return inWindow(row,s||archive||{});
  }
  function unique(saved,live,keyFn){
    const map=new Map();(saved||[]).forEach(x=>map.set(keyFn(x),x));
    (live||[]).forEach(x=>map.set(keyFn(x),Object.assign({},map.get(keyFn(x))||{},x)));
    return Array.from(map.values());
  }
  function liveData(s){
    if(s&&s.cashShiftId){const id=String(s.cashShiftId);return {tickets:tickets().filter(t=>String(t.shiftId||t.cashShiftId||'')===id),buffet:sales().filter(v=>String(v.shiftId||v.cashShiftId||'')===id)}}
    tagRows(s);
    return {tickets:tickets().filter(t=>belongs(t,s,null,'ticket')),buffet:sales().filter(v=>belongs(v,s,null,'sale'))};
  }
  function archiveData(a){
    if(!a)return {tickets:[],buffet:[]};
    if(a.manual)return {tickets:a.tickets||[],buffet:a.buffet||[]};
    if(a.reportVersion<2&&!a.tripId&&!tripId(a.driverShift))return {tickets:[],buffet:[],legacyWarning:'Старый архив не содержит ID конкретной водительской смены. Чтобы не включить чужие рейсы, продажи из общей кассовой смены не подмешаны. Восстанови отчёт вручную или проверь следующий рейс.'};
    const s=Object.assign({},a.driverShift||{},{reportId:a.id,tripId:a.tripId||tripId(a.driverShift),startedAt:a.startedAt,finishedAt:a.finishedAt,routeId:(a.vehicle&&a.vehicle.routeId)||(a.driverShift&&a.driverShift.routeId),active:false});
    return {
      tickets:unique(a.tickets||[],tickets().filter(t=>belongs(t,s,a,'ticket')),ticketKey),
      buffet:unique(a.buffet||[],sales().filter(v=>belongs(v,s,a,'sale')),saleKey),
      legacyWarning:a.reportVersion<2?'Старый архив: новые отчёты будут связаны отдельно с каждой водительской сменой.':''
    };
  }
  function vehicle(s,a){
    s=s||(a&&a.driverShift)||{};
    const routes=read('conductor_routes',[]),route=Array.isArray(routes)?routes.find(r=>String(r.id)===String(s.routeId)):null;
    return {
      type:TYPES[(a&&a.vehicle&&a.vehicle.type)||s.transport||'bus']||((a&&a.vehicle&&a.vehicle.type)||s.transport||'Транспорт'),
      vehicleNo:(a&&a.vehicle&&a.vehicle.vehicleNo)||s.vehicleNumber||localStorage.getItem('conductor_vehicle_number')||'—',
      model:(a&&a.vehicle&&a.vehicle.model)||s.vehicle||'—',
      routeName:(a&&a.vehicle&&a.vehicle.routeName)||s.routeName||(route&&(route.name||route.route))||'—',
      routeId:s.routeId||(a&&a.vehicle&&a.vehicle.routeId)||null
    };
  }
  function payKind(v){const s=String(v||'').toLowerCase();if(s.includes('qr')||s.includes('кьюар')||s.includes('электрон'))return'qr';if(s.includes('card')||s.includes('карт')||s.includes('безнал'))return'card';return'cash'}
  function amount(t){const q=Math.max(1,Number(t.quantity||t.qty||1));return t.total!=null&&t.total!==''?(Number(t.total)||0):(Number(t.price||t.amount||0)||0)*q}
  function qty(t){return Math.max(1,Math.floor(Number(t.quantity||t.qty||1)))}
  function cancelled(t){return ['cancelled','annulled','аннулирован','возврат'].includes(String(t.status||'').toLowerCase())}
  function ticketType(t){const raw=String(t.passengerType||t.passenger||t.category||t.type||'Билет');return ({full:'Полный',lgt:'Льготный',child:'Школьный',student:'Школьный',luggage:'Багаж',baggage:'Багаж'})[raw.toLowerCase()]||raw}
  function summarize(data){
    const byStop=new Map(),byType=new Map(),goods=new Map(),payments={cash:0,card:0,qr:0};
    let count=0,gross=0,refunds=0,change=0,goodsCount=0,goodsRevenue=0,cancelledCount=0;
    data.tickets.forEach(t=>{
      const q=qty(t),sum=amount(t);gross+=sum;change+=Math.max(0,Number(t.change||t.changeAmount||0));
      if(cancelled(t)){cancelledCount+=q;refunds+=Math.max(0,Number(t.refund??t.refundAmount??sum));return}
      count+=q;
      const stop=String(t.to||t.destination||t.destinationName||'Не указана'),a=byStop.get(stop)||{qty:0,sum:0};a.qty+=q;a.sum+=sum;byStop.set(stop,a);
      const type=ticketType(t),b=byType.get(type)||{qty:0,sum:0};b.qty+=q;b.sum+=sum;byType.set(type,b);
      payments[payKind(t.paymentMethod)]+=sum;
    });
    data.buffet.forEach(v=>{
      const q=Math.max(0,Math.floor(Number(v.quantity||v.qty||1))),sum=v.total!=null?(Number(v.total)||0):(Number(v.price||0)*q);
      goodsCount+=q;goodsRevenue+=sum;const name=String(v.name||v.productName||v.title||'Товар'),p=goods.get(name)||{qty:0,sum:0};p.qty+=q;p.sum+=sum;goods.set(name,p);payments[payKind(v.paymentMethod)]+=sum;
    });
    return {ticketCount:count,cancelledCount,grossTicketRevenue:gross,refundTotal:refunds,netTicketRevenue:gross-refunds,goodsCount,goodsRevenue,totalRevenue:gross-refunds+goodsRevenue,change,byStop,byType,goods,payments};
  }
  function fmtRows(map,empty){
    const rows=Array.from(map.entries()).sort((a,b)=>b[1].sum-a[1].sum);
    if(!rows.length)return '<div class="report-empty">'+esc(empty||'Продаж пока нет')+'</div>';
    return '<div class="report-data-list">'+rows.map(([name,r])=>'<div class="report-data-row"><div class="report-data-name"><strong>'+esc(name)+'</strong><span>'+esc(r.qty)+' шт.</span></div><b>'+money(r.sum)+'</b></div>').join('')+'</div>';
  }
  function gameTime(s,end){
    if(s&&s.gameTimeAtFinish&&end)return s.gameTimeAtFinish;
    const base=s&&(s.gameStartTime||s.gameTime);if(!base||!String(base).includes(':'))return'не задано';
    const p=String(base).split(':').map(Number),start=Date.parse(s.startedAt||''),finish=Date.parse(end||'')||Date.now();
    const elapsed=Number.isNaN(start)?0:Math.max(0,Math.floor((finish-start)/60000)),total=((p[0]||0)*60+(p[1]||0)+elapsed)%1440;
    return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
  }
  function info(label,value){return '<div class="report-info-row"><span>'+esc(label)+'</span><strong>'+esc(value||'—')+'</strong></div>'}
  function installStyles(){
    if($('ticket-report-redesign-style'))return;
    const st=document.createElement('style');st.id='ticket-report-redesign-style';
    st.textContent=[
      '#tab-reports .report-ui,#tab-reports .report-ui *{box-sizing:border-box}',
      '#tab-reports .report-ui{--ink:#182740;--muted:#718098;color:var(--ink)}',
      '#tab-reports .report-glass{background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(245,249,255,.84));border:1px solid rgba(255,255,255,.9);box-shadow:0 14px 38px rgba(30,52,90,.07),inset 0 1px rgba(255,255,255,.9);backdrop-filter:blur(18px);border-radius:22px}',
      '#tab-reports .report-hero{padding:clamp(18px,3vw,28px);margin-bottom:16px;background:linear-gradient(125deg,#fbfcff,#eef5ff 55%,#f1fbf7);border:1px solid rgba(155,179,213,.3);border-radius:26px;box-shadow:0 18px 50px rgba(43,69,110,.08)}',
      '#tab-reports .report-hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}',
      '#tab-reports .report-eyebrow{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;font-weight:850;color:#6982a9;margin-bottom:8px}',
      '#tab-reports .report-hero h2{font-size:clamp(1.35rem,3vw,2rem);line-height:1.14;letter-spacing:-.045em;margin:0 0 8px;color:#15233c}',
      '#tab-reports .report-hero p{max-width:760px;color:#60708a;line-height:1.5;margin:0}',
      '#tab-reports .report-shift-pill{padding:9px 12px;border:1px solid #d7e5f5;background:rgba(255,255,255,.75);border-radius:999px;color:#42638c;font-size:.78rem;font-weight:800;white-space:nowrap}',
      '#tab-reports .report-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}',
      '#tab-reports .report-action{border:1px solid rgba(160,178,205,.42);background:rgba(255,255,255,.82);color:#314563;border-radius:12px;padding:10px 13px;font-weight:750;cursor:pointer;transition:transform .15s,box-shadow .15s}',
      '#tab-reports .report-action:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(36,69,120,.09)}',
      '#tab-reports .report-action.primary{background:#233d64;color:#fff;border-color:#233d64}',
      '#tab-reports .report-action.success{background:#147d5a;color:#fff;border-color:#147d5a}',
      '#tab-reports .report-action:disabled{opacity:.45;cursor:not-allowed;transform:none}',
      '#tab-reports .report-pending{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;margin-bottom:16px;background:linear-gradient(120deg,#fff8e7,#fffdf7);border:1px solid #f2dfae;border-radius:18px;color:#6a5423}',
      '#tab-reports .report-pending[hidden],#tab-reports .report-manual[hidden]{display:none!important}',
      '#tab-reports .report-pending strong{display:block;margin-bottom:3px;color:#60491b}',
      '#tab-reports .report-grid{display:grid;grid-template-columns:minmax(245px,.85fr) minmax(0,2fr);gap:16px;align-items:start}',
      '#tab-reports .report-sidebar,#tab-reports .report-main{min-width:0;display:flex;flex-direction:column;gap:14px}',
      '#tab-reports .report-panel{padding:18px}',
      '#tab-reports .report-panel-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 14px;font-size:.95rem;font-weight:850;color:#23334e}',
      '#tab-reports .report-subtitle{font-size:.72rem;color:#8290a4;font-weight:800;text-transform:uppercase;letter-spacing:.07em}',
      '#tab-reports .report-history{display:flex;flex-direction:column;gap:8px;max-height:480px;overflow:auto}',
      '#tab-reports .report-history-item{width:100%;text-align:left;padding:12px;border:1px solid rgba(159,178,205,.3);background:rgba(255,255,255,.72);border-radius:15px;color:#263651;cursor:pointer}',
      '#tab-reports .report-history-item:hover,#tab-reports .report-history-item.is-selected{border-color:#88aee3;background:#f1f7ff}',
      '#tab-reports .report-history-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px}',
      '#tab-reports .report-history-title{font-weight:850;font-size:.88rem;overflow-wrap:anywhere}',
      '#tab-reports .report-history-meta{font-size:.76rem;color:#77859b;line-height:1.45}',
      '#tab-reports .report-tag{display:inline-flex;padding:4px 7px;border-radius:999px;background:#e8f1ff;color:#456a9b;font-size:.66rem;font-weight:850;white-space:nowrap}',
      '#tab-reports .report-tag.pending{background:#fff0ce;color:#8a6319}',
      '#tab-reports .report-empty{padding:17px 12px;text-align:center;color:#8b96a8;font-size:.87rem;border:1px dashed #cbd6e5;border-radius:14px}',
      '#tab-reports .report-info-list{display:flex;flex-direction:column;gap:10px}',
      '#tab-reports .report-info-row{display:flex;justify-content:space-between;gap:12px;font-size:.84rem;line-height:1.4}',
      '#tab-reports .report-info-row span{color:#7b879a}',
      '#tab-reports .report-info-row strong{text-align:right;overflow-wrap:anywhere;color:#2b3c58}',
      '#tab-reports .report-main-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:3px}',
      '#tab-reports .report-main-heading h3{font-size:1.25rem;letter-spacing:-.025em;margin:4px 0 0;color:#192b46}',
      '#tab-reports .report-main-heading small{color:#79889f}',
      '#tab-reports .report-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}',
      '#tab-reports .report-metric{padding:15px;border-radius:18px;border:1px solid rgba(159,178,205,.25);background:linear-gradient(150deg,rgba(255,255,255,.97),rgba(247,250,255,.87));box-shadow:0 8px 24px rgba(37,60,100,.045);min-width:0}',
      '#tab-reports .report-metric-label{font-size:.75rem;color:#77869d;font-weight:750;margin-bottom:10px}',
      '#tab-reports .report-metric-value{font-size:clamp(1.05rem,2vw,1.5rem);font-weight:900;letter-spacing:-.04em;font-variant-numeric:tabular-nums;color:#203651;overflow-wrap:anywhere}',
      '#tab-reports .report-metric-value.money{font-size:clamp(.95rem,1.7vw,1.35rem)}',
      '#tab-reports .report-metric-hint{font-size:.71rem;color:#99a3b3;margin-top:6px}',
      '#tab-reports .report-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}',
      '#tab-reports .report-data-list{display:flex;flex-direction:column}',
      '#tab-reports .report-data-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid rgba(160,178,205,.2)}',
      '#tab-reports .report-data-row:last-child{border-bottom:0}',
      '#tab-reports .report-data-name{display:flex;flex-direction:column;gap:3px;min-width:0}',
      '#tab-reports .report-data-name strong{font-size:.86rem;overflow-wrap:anywhere}',
      '#tab-reports .report-data-name span{font-size:.75rem;color:#7f8ca1}',
      '#tab-reports .report-data-row>b{font-size:.82rem;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}',
      '#tab-reports .report-muted-note{font-size:.78rem;line-height:1.45;color:#7b879b;padding:10px 12px;background:rgba(237,243,251,.62);border-radius:12px;margin-top:10px}',
      '#tab-reports .report-field{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '#tab-reports .report-field label{font-size:.8rem;font-weight:800;color:#52617a}',
      '#tab-reports .report-field input,#tab-reports .report-field select,#tab-reports .report-field textarea{width:100%;min-width:0;background:rgba(255,255,255,.9);border:1px solid #dbe3ef;border-radius:11px;padding:10px 11px;color:#253653;font:inherit;outline:none}',
      '#tab-reports .report-field input:focus,#tab-reports .report-field select:focus,#tab-reports .report-field textarea:focus{border-color:#84aee7;box-shadow:0 0 0 3px rgba(109,160,230,.13)}',
      '#tab-reports .report-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}',
      '#tab-reports #ticketReportPaper{width:min(100%,640px);margin:4px auto 18px;background:#fff;color:#111827;padding:22px;border:1px solid #e1e7f0;border-radius:18px;box-shadow:0 12px 30px rgba(30,50,80,.06);font-size:.88rem;line-height:1.38}',
      '#tab-reports #ticketReportPaper .rp-center{text-align:center}',
      '#tab-reports #ticketReportPaper .rp-line{border-top:1px dashed #9ca3af;margin:7px 0}',
      '#tab-reports #ticketReportPaper .rp-transport{font-weight:850;text-align:center;font-size:.82rem;line-height:1.25;margin:7px 0}',
      '#tab-reports #ticketReportPaper .rp-row{display:flex;justify-content:space-between;gap:8px;margin:4px 0}',
      '#tab-reports #ticketReportPaper .rp-sign{margin-top:12px}',
      '#tab-reports #ticketReportPaper .rp-small{font-size:.74rem}',
      '@media(max-width:1050px){#tab-reports .report-grid{grid-template-columns:1fr}#tab-reports .report-history{max-height:280px}#tab-reports .report-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@media(max-width:620px){#tab-reports .report-hero-top{flex-direction:column}#tab-reports .report-detail-grid,#tab-reports .report-form-grid{grid-template-columns:1fr}#tab-reports .report-panel{padding:14px}#tab-reports .report-actions .report-action{flex:1 1 auto}}',
      '@media print{@page{size:58mm auto;margin:0}body.print-ticket-report *{visibility:hidden!important}body.print-ticket-report #ticketReportPaper,body.print-ticket-report #ticketReportPaper *{visibility:visible!important}body.print-ticket-report #ticketReportPaper{position:absolute!important;left:0!important;top:0!important;width:48mm!important;max-width:48mm!important;margin:0!important;padding:1mm!important;border:0!important;border-radius:0!important;box-shadow:none!important;font:10px/1.15 Courier New,monospace!important;background:#fff!important;color:#000!important}body.print-ticket-report #ticketReportPaper .rp-transport{font-size:9px!important}body.print-ticket-report #ticketReportPaper .rp-line{margin:4px 0!important}body.print-ticket-report #ticketReportPaper .rp-sign{margin-top:7px!important}}'
    ].join('\n');
    document.head.appendChild(st);
  }
  function installUI(){
    const tab=$('tab-reports');if(!tab)return false;installStyles();tab.innerHTML='';
    root=document.createElement('div');root.className='report-ui';
    root.innerHTML=[
      '<div class="report-hero"><div class="report-hero-top"><div><div class="report-eyebrow">Transport operations / reporting</div><h2>Общий Z-отчёт кассовой смены</h2><p>Один общий отчёт по билетам, возвратам и выручке только за открытую кассовую смену. Старые продажи в новый отчёт не попадают.</p></div><div class="report-shift-pill" id="reportShiftStatus">Проверка смены…</div></div><div class="report-actions"><button type="button" class="report-action primary" data-action="print">🖨️ Печать отчёта</button><button type="button" class="report-action" data-action="refresh">↻ Обновить</button><button type="button" class="report-action" data-action="manual">✍️ Создать отчёт вручную</button></div></div>',
      '<div class="report-pending" id="reportPendingNotice" hidden><div><strong>Сохранён завершённый отчёт</strong><span id="reportPendingText">Он ждёт печати.</span></div><button type="button" class="report-action success" data-action="print-pending">Распечатать смену</button></div>',
      '<div class="report-grid"><aside class="report-sidebar">',
      '<section class="report-glass report-panel" style="display:none"><div class="report-panel-title"><span>Общий Z-отчёт</span><span class="report-subtitle" id="reportArchiveCount">0 отчётов</span></div><div class="report-history" id="reportHistory"></div></section>',
      '<section class="report-glass report-panel"><div class="report-panel-title">Реквизиты смены</div><div class="report-info-list" id="reportShiftInfo"></div><div class="report-muted-note" id="reportScopeNote">Отчёт создаётся по завершении водительской смены.</div></section>',
      '<section class="report-glass report-panel"><div class="report-panel-title">Подписи и примечание</div><div class="report-form-grid"><div class="report-field"><label for="reportConductorSurname">Фамилия кондуктора</label><input id="reportConductorSurname" autocomplete="off" placeholder="Фамилия"></div><div class="report-field"><label for="reportDriverSurname">Фамилия водителя</label><input id="reportDriverSurname" autocomplete="off" placeholder="Фамилия"></div><div class="report-field" style="grid-column:1/-1"><label for="reportMessage">Сообщение / примечание</label><textarea id="reportMessage" rows="2" placeholder="Необязательное примечание"></textarea></div></div><div style="display:flex;justify-content:flex-end;margin-top:10px"><button type="button" class="report-action" data-action="save-details">Сохранить реквизиты</button></div></section>',
      '</aside><main class="report-main">',
      '<div class="report-main-heading"><div><small id="reportKicker">СВОДКА ПРОДАЖ</small><h3 id="reportHeading">Общий Z-отчёт</h3></div><button type="button" class="report-action" data-action="select-current" id="reportCurrentButton" style="display:none">Текущая смена</button></div>',
      '<div class="report-metrics"><div class="report-metric"><div class="report-metric-label">Продано билетов</div><div class="report-metric-value" id="reportMetricTickets">0</div><div class="report-metric-hint" id="reportMetricTicketHint">Без аннулированных</div></div><div class="report-metric"><div class="report-metric-label">Выручка от билетов</div><div class="report-metric-value money" id="reportMetricTicketRevenue">0,00 BYN</div><div class="report-metric-hint">После возвратов</div></div><div class="report-metric"><div class="report-metric-label">Продано товаров</div><div class="report-metric-value" id="reportMetricProducts">0</div><div class="report-metric-hint" id="reportMetricProductHint">Дополнительные продажи</div></div><div class="report-metric"><div class="report-metric-label">Итого за смену</div><div class="report-metric-value money" id="reportMetricTotal">0,00 BYN</div><div class="report-metric-hint">Билеты + товары − возвраты</div></div></div>',
      '<div id="reportWarnings"></div><div class="report-detail-grid"><section class="report-glass report-panel"><div class="report-panel-title">Билеты по остановкам</div><div id="reportStopsBreakdown"></div></section><section class="report-glass report-panel"><div class="report-panel-title">Категории билетов</div><div id="reportTypesBreakdown"></div></section><section class="report-glass report-panel"><div class="report-panel-title">Способы оплаты</div><div id="reportPaymentsBreakdown"></div><div class="report-muted-note" id="reportPaymentNote"></div></section><section class="report-glass report-panel"><div class="report-panel-title">Дополнительные продажи</div><div id="reportGoodsBreakdown"></div></section></div>',
      '<section class="report-glass report-panel"><div class="report-panel-title">Маршрут и отметки времени</div><div id="reportTimeline"></div></section><section id="ticketReportPaper"></section></main></div>',
      '<section class="report-glass report-panel report-manual" id="reportManualEditor" hidden><div class="report-panel-title">Ручное создание / восстановление отчёта</div><p class="report-muted-note">Используй это только если автоматический отчёт не сохранился. Ручное создание не меняет историю реальных продаж.</p><div class="report-form-grid">',
      '<div class="report-field"><label for="manualReportDate">Дата и время смены</label><input id="manualReportDate" type="datetime-local"></div><div class="report-field"><label for="manualReportTransport">Вид транспорта</label><select id="manualReportTransport"><option value="bus">Автобус</option><option value="trolley">Троллейбус</option><option value="tram">Трамвай</option><option value="minibus">Маршрутное такси</option><option value="train">Железная дорога</option><option value="uzd">Узкоколейная ЖД</option></select></div>',
      '<div class="report-field"><label for="manualReportVehicleNo">Номер борта</label><input id="manualReportVehicleNo" placeholder="Например, 7042"></div><div class="report-field"><label for="manualReportModel">Модель</label><input id="manualReportModel" placeholder="МАЗ-103.065"></div><div class="report-field"><label for="manualReportRoute">Маршрут</label><input id="manualReportRoute" placeholder="Номер и название маршрута"></div><div class="report-field"><label for="manualReportGameTime">Игровое время окончания</label><input id="manualReportGameTime" type="time" value="12:00"></div>',
      '<div class="report-field"><label for="manualReportTicketCount">Количество билетов</label><input id="manualReportTicketCount" type="number" min="0" value="0"></div><div class="report-field"><label for="manualReportTicketRevenue">Выручка билетов (BYN)</label><input id="manualReportTicketRevenue" type="number" min="0" step="0.01" value="0"></div><div class="report-field"><label for="manualReportGoodsRevenue">Выручка товаров (BYN)</label><input id="manualReportGoodsRevenue" type="number" min="0" step="0.01" value="0"></div><div class="report-field"><label for="manualReportChange">Сдача (BYN)</label><input id="manualReportChange" type="number" min="0" step="0.01" value="0"></div><div class="report-field"><label for="manualReportConductor">Фамилия кондуктора</label><input id="manualReportConductor"></div><div class="report-field"><label for="manualReportDriver">Фамилия водителя</label><input id="manualReportDriver"></div>',
      '<div class="report-field" style="grid-column:1/-1"><label for="manualReportStops">Продажи по остановкам: количество; название; сумма BYN</label><textarea id="manualReportStops" rows="4" placeholder="7; Железнодорожный вокзал; 12.60"></textarea></div><div class="report-field" style="grid-column:1/-1"><label for="manualReportGoods">Товары: количество; товар; сумма BYN</label><textarea id="manualReportGoods" rows="3" placeholder="4; Вода; 7.60"></textarea></div><div class="report-field" style="grid-column:1/-1"><label for="manualReportMessage">Сообщение / примечание</label><textarea id="manualReportMessage" rows="2"></textarea></div></div><div class="report-actions"><button type="button" class="report-action success" data-action="save-manual">💾 Сохранить отчёт</button><button type="button" class="report-action" data-action="cancel-manual">Отмена</button></div></section>'
    ].join('');
    root.addEventListener('click',onClick);
    tab.appendChild(root);
    return true;
  }
  function orderedArchives(){return archives().slice().sort((a,b)=>(Date.parse(b.finishedAt||b.startedAt||0)||0)-(Date.parse(a.finishedAt||a.startedAt||0)||0))}
  function activeShift(){
    if(localStorage.getItem('conductor_shift_active')!=='true')return null;
    const id=localStorage.getItem('conductor_current_shift_id');if(!id)return null;
    return {reportId:String(id),cashShiftId:String(id),startedAt:localStorage.getItem('conductor_shift_started_at')||new Date().toISOString(),active:true,transport:'bus',routeName:'Общая кассовая смена',vehicleNumber:'',vehicleNo:'',stops:[],gameStartTime:''};
  }
  function initialSelect(){if(activeShift()){selectedArchiveId='';return}const all=orderedArchives(),a=all[0];selectedArchiveId=a?String(a.id):''}
  function txt(id,value){const e=$(id);if(e)e.textContent=value==null?'':String(value)}
  function history(ctx){
    const host=$('reportHistory'),list=orderedArchives();txt('reportArchiveCount',list.length+' отчёт(ов)');
    let html='',live=activeShift();
    if(live){const v=vehicle(live,null);html+='<button type="button" class="report-history-item '+(!selectedArchiveId?'is-selected':'')+'" data-action="select-current"><div class="report-history-top"><span class="report-history-title">Текущая смена</span><span class="report-tag">ИДЁТ</span></div><div class="report-history-meta">'+esc(v.routeName)+'<br>'+esc(v.type+' №'+v.vehicleNo)+'<br>Начало: '+esc(date(live.startedAt))+'</div></button>'}
    html+=list.map(a=>{
      const v=vehicle(a.driverShift,a),selected=selectedArchiveId&&String(a.id)===String(selectedArchiveId);
      return '<button type="button" class="report-history-item '+(selected?'is-selected':'')+'" data-action="select-archive" data-id="'+esc(a.id)+'"><div class="report-history-top"><span class="report-history-title">'+esc(v.routeName||'Водительская смена')+'</span><span class="report-tag '+(!a.printedAt?'pending':'')+'">'+(a.printedAt?'Напечатан':'Ждёт печати')+'</span></div><div class="report-history-meta">'+esc(v.type+' №'+v.vehicleNo)+'<br>'+esc(date(a.startedAt))+' — '+esc(time(a.finishedAt))+'<br>'+esc((a.tickets||[]).length+' записей'+(a.reportVersion<2&&!a.manual?' · старый формат':''))+'</div></button>';
    }).join('');
    host.innerHTML=html||'<div class="report-empty">Завершённые смены появятся здесь после первого рейса.</div>';
  }
  function timeline(s,a,v){
    const stops=Array.isArray(s.stops)?s.stops:[];
    let html='<div class="report-info-list">'+info('Транспорт',v.type+' №'+v.vehicleNo)+info('Модель',v.model)+info('Маршрут',v.routeName)+info('Начало',date(a?a.startedAt:s.startedAt))+info('Окончание',date(a?a.finishedAt:s.finishedAt||new Date().toISOString()))+info('Игровое время начала',s.gameStartTime||'не задано')+info('Игровое время окончания',(a&&a.gameTimeAtFinish)||s.gameTimeAtFinish||gameTime(s,a?a.finishedAt:s.finishedAt))+info('Остановок в графике',stops.length||'—')+'</div>';
    if(stops.length)html+='<div class="report-data-list" style="margin-top:12px">'+stops.map((x,i)=>'<div class="report-data-row"><div class="report-data-name"><strong>'+esc((i+1)+'. '+x.name)+'</strong><span>План: '+esc(x.planned||'—')+' · Факт: '+esc(x.departureActual||x.actual||'—')+'</span></div><b>'+esc(x.delay==null?'—':(Number(x.delay)>0?'+':'')+x.delay+' мин')+'</b></div>').join('')+'</div>';
    return html;
  }
  function printPaper(ctx,stats,v){
    const s=ctx.shift||{},a=ctx.archive,starts=a?a.startedAt:s.startedAt,ends=a?a.finishedAt:(s.finishedAt||new Date().toISOString()),printed=new Date();
    const st=Array.from(stats.byStop.entries()).sort((x,y)=>y[1].sum-x[1].sum),types=Array.from(stats.byType.entries()).sort((x,y)=>y[1].sum-x[1].sum),goods=Array.from(stats.goods.entries()).sort((x,y)=>y[1].sum-x[1].sum);
    const line=(label,value)=>'<div class="rp-row"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>';
    let html='<div class="rp-center"><b>ОБЩИЙ Z-ОТЧЁТ</b></div><div class="rp-transport">'+esc(v.type+' №'+v.vehicleNo+' · '+v.model+' · '+v.routeName)+'</div><div class="rp-line"></div><div>Начало: '+esc(date(starts))+'</div><div>Окончание: '+esc(date(ends))+'</div><div>Игровое время: '+esc((a&&a.gameTimeAtFinish)||s.gameTimeAtFinish||gameTime(s,ends))+'</div><div>Время печати: '+esc(printed.toLocaleString('ru-RU'))+'</div><div class="rp-line"></div><b>БИЛЕТЫ</b><div>Продано: '+esc(stats.ticketCount)+' шт.</div>';
    html+=st.length?st.map(([name,r])=>'<div>'+esc(r.qty)+' × '+esc(name)+' — '+esc(money(r.sum))+'</div>').join(''):'<div>Продаж нет</div>';
    html+='<div class="rp-line"></div><b>КАТЕГОРИИ</b>'+(types.length?types.map(([name,r])=>'<div>'+esc(r.qty)+' × '+esc(name)+'</div>').join(''):'<div>Нет данных</div>');
    html+='<div class="rp-line"></div><b>ТОВАРЫ</b><div>Количество: '+esc(stats.goodsCount)+' шт.</div>'+(goods.length?goods.map(([name,r])=>'<div>'+esc(r.qty)+' × '+esc(name)+' — '+esc(money(r.sum))+'</div>').join(''):'<div>Нет продаж товаров</div>');
    html+='<div class="rp-line"></div><b>ФИНАНСЫ</b>'+line('Билеты до возвратов',money(stats.grossTicketRevenue))+line('Возвраты','− '+money(stats.refundTotal))+line('Билеты после возвратов',money(stats.netTicketRevenue))+line('Товары',money(stats.goodsRevenue))+line('ИТОГО',money(stats.totalRevenue))+line('Сдача пассажирам',money(stats.change))+line('Наличные',money(stats.payments.cash))+line('Карта',money(stats.payments.card))+line('QR / электронно',money(stats.payments.qr))+line('Аннулировано',stats.cancelledCount+' шт.');
    const note=($('reportMessage')&&$('reportMessage').value.trim())||(a&&a.reportMessage)||s.reportMessage;
    const conductor=($('reportConductorSurname')&&$('reportConductorSurname').value.trim())||(a&&a.conductorSurname)||s.conductorSurname||'________________';
    const driver=($('reportDriverSurname')&&$('reportDriverSurname').value.trim())||(a&&a.driverSurname)||s.driverSurname||'________________';
    if(note)html+='<div class="rp-line"></div><b>ПРИМЕЧАНИЕ</b><div>'+esc(note)+'</div>';
    html+='<div class="rp-line"></div><div class="rp-sign">Кондуктор: '+esc(conductor)+'<br>Подпись: __________________</div><div class="rp-sign">Водитель: '+esc(driver)+'<br>Подпись: __________________</div><div class="rp-line"></div><div class="rp-center rp-small">Отчёт сформирован терминалом «Тикет»</div>';
    if(ctx.legacyWarning)html+='<div class="rp-line"></div><div>АРХИВ СТАРОГО ФОРМАТА</div>';
    return html;
  }
  function context(){
    const liveShift=activeShift();
    if(liveShift){selectedArchiveId='';return {archive:null,shift:liveShift,data:liveData(liveShift),live:true}}
    const all=archives(),a=selectedArchiveId?all.find(x=>String(x.id)===String(selectedArchiveId)):null;
    if(a)return {archive:a,shift:a.driverShift||{},data:archiveData(a),live:false};
    if(!selectedArchiveId&&all.length){initialSelect();const chosen=all.find(x=>String(x.id)===String(selectedArchiveId));if(chosen)return {archive:chosen,shift:chosen.driverShift||{},data:archiveData(chosen),live:false}}
    return {archive:null,shift:{},data:{tickets:[],buffet:[]},live:false};
  }
  function render(){
    if(!root)return;
    const ctx=context(),data=ctx.data||{tickets:[],buffet:[]},stats=summarize(data),v=vehicle(ctx.shift,ctx.archive),active=!!(ctx.live&&ctx.shift&&ctx.shift.active);
    txt('reportShiftStatus',active?'● ВОДИТЕЛЬСКАЯ СМЕНА ИДЁТ':(ctx.archive?'СМЕНА ЗАВЕРШЕНА':'НЕТ АКТИВНОЙ СМЕНЫ'));
    txt('reportHeading',ctx.archive?(v.routeName||'Завершённая смена'):(active?v.routeName:'Нет выбранной смены'));
    txt('reportKicker',ctx.archive?'АРХИВНЫЙ ОТЧЁТ · '+date(ctx.archive.startedAt):(active?'ТЕКУЩАЯ СМЕНА · ПРОМЕЖУТОЧНАЯ СВОДКА':'СВОДКА ПРОДАЖ'));
    const currentBtn=$('reportCurrentButton');if(currentBtn){currentBtn.disabled=!active;currentBtn.textContent=active?'Текущая смена выбрана':'Текущая смена недоступна'}
    txt('reportMetricTickets',stats.ticketCount);txt('reportMetricTicketHint',stats.cancelledCount+' аннулировано / возвращено');txt('reportMetricTicketRevenue',money(stats.netTicketRevenue));txt('reportMetricProducts',stats.goodsCount);txt('reportMetricProductHint',money(stats.goodsRevenue));txt('reportMetricTotal',money(stats.totalRevenue));
    $('reportStopsBreakdown').innerHTML=fmtRows(stats.byStop,'Билеты в этой смене ещё не продавались');
    $('reportTypesBreakdown').innerHTML=fmtRows(stats.byType,'Нет проданных билетов');
    $('reportPaymentsBreakdown').innerHTML='<div class="report-data-list">'+[['Наличные',stats.payments.cash],['Банковская карта',stats.payments.card],['QR / электронно',stats.payments.qr]].map(x=>'<div class="report-data-row"><div class="report-data-name"><strong>'+x[0]+'</strong><span>Билеты и товары</span></div><b>'+money(x[1])+'</b></div>').join('')+'</div>';
    txt('reportPaymentNote','Сдача пассажирам: '+money(stats.change)+'. Возвраты: '+money(stats.refundTotal)+'.');
    $('reportGoodsBreakdown').innerHTML=fmtRows(stats.goods,'За смену товары не продавались');
    $('reportTimeline').innerHTML=timeline(ctx.shift||{},ctx.archive,v);
    $('ticketReportPaper').innerHTML=printPaper(ctx,stats,v);
    if(ctx.legacyWarning)$('reportWarnings').innerHTML='<div class="report-pending" style="display:block"><strong>Архив старого формата</strong><div>'+esc(ctx.legacyWarning)+'</div><div style="margin-top:8px"><button type="button" class="report-action" data-action="manual">Создать отчёт вручную</button></div></div>';
    else if(!active&&!ctx.archive)$('reportWarnings').innerHTML='<div class="report-empty">Начни водительскую смену во вкладке «Рабочая смена». После завершения здесь появится отдельный отчёт по проданным билетам и товарам.</div>';
    else if(active&&!stats.ticketCount&&!stats.goodsCount)$('reportWarnings').innerHTML='<div class="report-muted-note">Продаж пока нет. Новые билеты будут автоматически привязаны к этой водительской смене.</div>';
    else $('reportWarnings').innerHTML='';
    const pending=orderedArchives().find(x=>!x.printedAt),notice=$('reportPendingNotice');
    if(notice){notice.hidden=!pending;if(pending){txt('reportPendingText',vehicle(pending.driverShift,pending).routeName+' · '+date(pending.finishedAt||pending.startedAt)+' · сохранён в архиве.');notice.dataset.pendingId=String(pending.id)}else notice.dataset.pendingId=''}
    const all=orderedArchives();let historyHtml='';if(active)historyHtml='<button type="button" class="report-history-item '+(!selectedArchiveId?'is-selected':'')+'" data-action="select-current"><div class="report-history-top"><span class="report-history-title">Текущая смена</span><span class="report-tag">ИДЁТ</span></div><div class="report-history-meta">'+esc(v.routeName)+'<br>'+esc(v.type+' №'+v.vehicleNo)+'<br>Начало: '+esc(date(ctx.shift.startedAt))+'</div></button>';
    historyHtml+=all.map(a=>{const av=vehicle(a.driverShift,a);return '<button type="button" class="report-history-item '+(selectedArchiveId===String(a.id)?'is-selected':'')+'" data-action="select-archive" data-id="'+esc(a.id)+'"><div class="report-history-top"><span class="report-history-title">'+esc(av.routeName||'Водительская смена')+'</span><span class="report-tag '+(!a.printedAt?'pending':'')+'">'+(a.printedAt?'Напечатан':'Ждёт печати')+'</span></div><div class="report-history-meta">'+esc(av.type+' №'+av.vehicleNo)+'<br>'+esc(date(a.startedAt))+' — '+esc(time(a.finishedAt))+'<br>'+esc((a.tickets||[]).length+' записей'+(a.reportVersion<2&&!a.manual?' · старый формат':''))+'</div></button>'}).join('');
    txt('reportArchiveCount',all.length+' отчёт(ов)');$('reportHistory').innerHTML=historyHtml||'<div class="report-empty">Завершённые смены появятся здесь после первого рейса.</div>';
    const infoHost=$('reportShiftInfo');infoHost.innerHTML='<div class="report-info-list">'+info('Транспорт',v.type+' №'+v.vehicleNo)+info('Модель',v.model)+info('Маршрут',v.routeName)+info('Начало',date(ctx.archive?ctx.archive.startedAt:ctx.shift.startedAt))+info('Окончание',date(ctx.archive?ctx.archive.finishedAt:ctx.shift.finishedAt))+info('Игровое время окончания',(ctx.archive&&ctx.archive.gameTimeAtFinish)||ctx.shift.gameTimeAtFinish||gameTime(ctx.shift,ctx.archive?ctx.archive.finishedAt:ctx.shift.finishedAt))+'</div>';
    const detailShift=ctx.archive?(ctx.archive.driverShift||{}):(ctx.shift||{});
    const conductorField=$('reportConductorSurname'),driverField=$('reportDriverSurname'),messageField=$('reportMessage');
    if(conductorField&&document.activeElement!==conductorField)conductorField.value=(ctx.archive&&ctx.archive.conductorSurname)||detailShift.conductorSurname||'';
    if(driverField&&document.activeElement!==driverField)driverField.value=(ctx.archive&&ctx.archive.driverSurname)||detailShift.driverSurname||'';
    if(messageField&&document.activeElement!==messageField)messageField.value=(ctx.archive&&ctx.archive.reportMessage)||detailShift.reportMessage||'';
    txt('reportScopeNote',ctx.archive&&ctx.archive.reportVersion<2?'Это архив прежней версии. Продажи по общему маршруту не объединяются с новым отчётом.':active?'Сейчас учитываются записи, связанные с ID именно этой водительской смены.':'Отчёт сохранён отдельно и не меняется при начале следующей смены.');
    const e=$('reportManualEditor');if(e&&e.dataset.keepOpen!=='1')e.hidden=true;
    const d=ctx.archive?ctx.archive.driverShift||{}:ctx.shift||{};
    if($('reportConductorSurname')&&document.activeElement!==$('reportConductorSurname'))$('reportConductorSurname').value=(ctx.archive&&ctx.archive.conductorSurname)||d.conductorSurname||'';
    if($('reportDriverSurname')&&document.activeElement!==$('reportDriverSurname'))$('reportDriverSurname').value=(ctx.archive&&ctx.archive.driverSurname)||d.driverSurname||'';
    if($('reportMessage')&&document.activeElement!==$('reportMessage'))$('reportMessage').value=(ctx.archive&&ctx.archive.reportMessage)||d.reportMessage||'';
  }
  function requestRender(){if(renderQueued)return;renderQueued=true;Promise.resolve().then(()=>{renderQueued=false;render()})}
  function openManual(){
    const e=$('reportManualEditor'),ctx=context(),s=ctx.shift||{},a=ctx.archive,stats=summarize(ctx.data||{tickets:[],buffet:[]}),v=vehicle(s,a);
    const put=(id,val)=>{if($(id))$(id).value=val==null?'':String(val)};
    const d=a&&a.startedAt||s.startedAt||new Date().toISOString(),dt=new Date(d);
    put('manualReportDate',!Number.isNaN(dt.getTime())?new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16):'');
    put('manualReportTransport',(a&&a.vehicle&&a.vehicle.type)||s.transport||'bus');put('manualReportVehicleNo',v.vehicleNo==='—'?'':v.vehicleNo);put('manualReportModel',v.model==='—'?'':v.model);put('manualReportRoute',v.routeName==='—'?'':v.routeName);
    put('manualReportGameTime',(a&&a.gameTimeAtFinish)||s.gameTimeAtFinish||gameTime(s,s.finishedAt)||'12:00');
    put('manualReportTicketCount',stats.ticketCount);put('manualReportTicketRevenue',stats.netTicketRevenue.toFixed(2));put('manualReportGoodsRevenue',stats.goodsRevenue.toFixed(2));put('manualReportChange',stats.change.toFixed(2));
    put('manualReportConductor',(a&&a.conductorSurname)||s.conductorSurname||'');put('manualReportDriver',(a&&a.driverSurname)||s.driverSurname||'');put('manualReportMessage',(a&&a.reportMessage)||s.reportMessage||'');
    put('manualReportStops',Array.from(stats.byStop.entries()).map(([n,r])=>r.qty+'; '+n+'; '+r.sum.toFixed(2)).join('\n'));
    put('manualReportGoods',Array.from(stats.goods.entries()).map(([n,r])=>r.qty+'; '+n+'; '+r.sum.toFixed(2)).join('\n'));
    e.hidden=false;e.dataset.keepOpen='1';e.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function saveManual(){
    const val=id=>$(id)?$(id).value.trim():'',num=id=>Math.max(0,Number(val(id).replace(',','.'))||0);
    function parseRows(id){return val(id).split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{const p=line.split(';').map(x=>x.trim());if(p.length<3)throw Error('Проверь строку: '+line);return{qty:Math.max(0,Math.floor(Number(p[0])||0)),name:p.slice(1,-1).join(';')||'Не указано',sum:Math.max(0,Number(p[p.length-1].replace(',','.'))||0)}})}
    let stops,goods;try{stops=parseRows('manualReportStops');goods=parseRows('manualReportGoods')}catch(e){alert(e.message);return}
    const now=new Date(),dt=val('manualReportDate')?new Date(val('manualReportDate')):now,iso=Number.isNaN(dt.getTime())?now.toISOString():dt.toISOString();
    const id=selectedArchiveId||('manual_driver_report_'+Date.now()),old=archives().find(a=>String(a.id)===String(id));
    const count=num('manualReportTicketCount'),ticketRev=num('manualReportTicketRevenue');
    const ticketRows=stops.length?stops.map((r,i)=>({id:'manual_ticket_'+Date.now()+'_'+i,num:'manual-'+i,quantity:r.qty,qty:r.qty,total:r.sum,price:r.qty?r.sum/r.qty:0,to:r.name,passengerType:'full',paymentMethod:'cash',status:'issued',manualReport:true,issuedAt:iso})):(count||ticketRev?[{id:'manual_ticket_'+Date.now(),num:'manual',quantity:count||1,qty:count||1,total:ticketRev,price:count?ticketRev/count:ticketRev,to:'Не указана',passengerType:'full',paymentMethod:'cash',status:'issued',manualReport:true,issuedAt:iso}]:[]);
    const buffet=goods.length?goods.map((r,i)=>({id:'manual_goods_'+Date.now()+'_'+i,quantity:r.qty,name:r.name,total:r.sum,paymentMethod:'cash',manualReport:true,time:iso})):(num('manualReportGoodsRevenue')?[{id:'manual_goods_'+Date.now(),quantity:1,name:'Товары (итого)',total:num('manualReportGoodsRevenue'),paymentMethod:'cash',manualReport:true,time:iso}]:[]);
    const tr=val('manualReportTransport')||'bus',ds={active:false,reportId:id,startedAt:iso,finishedAt:iso,gameStartTime:val('manualReportGameTime')||'не задано',gameTimeAtFinish:val('manualReportGameTime')||'не задано',transport:tr,vehicleNumber:val('manualReportVehicleNo')||'—',vehicle:val('manualReportModel')||'—',routeName:val('manualReportRoute')||'—',conductorSurname:val('manualReportConductor'),driverSurname:val('manualReportDriver'),reportMessage:val('manualReportMessage')};
    const report={id,reportId:id,reportVersion:2,reportType:'manual',manual:true,startedAt:iso,finishedAt:iso,gameStartTime:ds.gameStartTime,gameTimeAtFinish:ds.gameTimeAtFinish,vehicle:{type:tr,vehicleNo:ds.vehicleNumber,model:ds.vehicle,routeName:ds.routeName},driverShift:ds,tickets:ticketRows,buffet,tripId:null,conductorSurname:ds.conductorSurname,driverSurname:ds.driverSurname,reportMessage:ds.reportMessage,printedAt:old&&old.printedAt||null};
    const all=archives(),i=all.findIndex(a=>String(a.id)===String(id));if(i>=0)all[i]=report;else all.push(report);saveArchives(all);selectedArchiveId=id;$('reportManualEditor').hidden=true;$('reportManualEditor').dataset.keepOpen='';render();alert('Отчёт сохранён в архиве водительских смен.');
  }
  function saveDetails(){
    const ctx=context(),con=$('reportConductorSurname').value.trim(),drv=$('reportDriverSurname').value.trim(),msg=$('reportMessage').value.trim();
    if(ctx.archive){const list=archives(),i=list.findIndex(a=>String(a.id)===String(ctx.archive.id));if(i>=0){list[i].conductorSurname=con;list[i].driverSurname=drv;list[i].reportMessage=msg;list[i].driverShift=Object.assign({},list[i].driverShift||{},{conductorSurname:con,driverSurname:drv,reportMessage:msg});saveArchives(list)}}
    else if(ctx.shift&&ctx.shift.reportId){ctx.shift.conductorSurname=con;ctx.shift.driverSurname=drv;ctx.shift.reportMessage=msg;storeShift(ctx.shift)}
    else{alert('Начни водительскую смену или выбери архивный отчёт.');return}
    render();
  }
  function markPrinted(id){if(!id)return;const list=archives(),i=list.findIndex(a=>String(a.id)===String(id));if(i<0)return;list[i].printedAt=new Date().toISOString();saveArchives(list);render()}
  function printReport(idOverride){
    if(idOverride)selectedArchiveId=String(idOverride);render();const ctx=context();
    if(!ctx.archive&&!(ctx.shift&&ctx.shift.active)){alert('Нет сохранённого отчёта для печати.');return}
    const archiveId=ctx.archive?String(ctx.archive.id):'';document.body.classList.add('print-ticket-report');
    const cleanup=()=>document.body.classList.remove('print-ticket-report');
    const after=()=>{window.removeEventListener('afterprint',after);cleanup();if(archiveId)markPrinted(archiveId)};
    window.addEventListener('afterprint',after);window.print();setTimeout(cleanup,5000);
  }
  function refresh(){const s=shift();if(s&&s.active){ensureMetadata(s,false);tagRows(s)}render()}
  function onClick(e){
    const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;
    if(a==='print')printReport();else if(a==='print-pending')printReport($('reportPendingNotice').dataset.pendingId||'');
    else if(a==='refresh')refresh();else if(a==='manual')openManual();
    else if(a==='cancel-manual'){$('reportManualEditor').hidden=true;$('reportManualEditor').dataset.keepOpen=''}
    else if(a==='save-manual')saveManual();else if(a==='save-details')saveDetails();
    else if(a==='select-current'){selectedArchiveId='';$('reportManualEditor').hidden=true;render()}
    else if(a==='select-archive'){selectedArchiveId=String(b.dataset.id||'');$('reportManualEditor').hidden=true;render()}
  }
  function wrap(name,factory){const original=window[name];if(typeof original!=='function'||original.__ticketReportWrapped)return;const fn=factory(original);fn.__ticketReportWrapped=true;window[name]=fn}
  wrap('startDriverShift',original=>function(){
    const result=original.apply(this,arguments);
    try{const s=ensureMetadata(shift(),true);if(s&&s.active){s.tripId=String(read(TRIP_KEY,null)||s.tripId||('trip_'+Date.now()));s.cashShiftId=localStorage.getItem('conductor_current_shift_id')||null;s.reportMessage='';storeShift(s);selectedArchiveId=''}refresh()}catch(e){console.error('Не удалось подготовить отчёт смены:',e)}
    return result;
  });
  wrap('finishDriverShift',original=>function(){
    const before=shift();if(before&&before.active){ensureMetadata(before,false);tagRows(before)}
    const result=original.apply(this,arguments);
    try{const ended=shift()||before;if(ended){ensureMetadata(ended,false);ended.active=false;ended.finishedAt=ended.finishedAt||new Date().toISOString();ended.gameTimeAtFinish=ended.gameTimeAtFinish||gameTime(ended,ended.finishedAt);tagRows(ended);const all=archives(),id=String(ended.reportId),idx=all.findIndex(a=>String(a.id)===id);const d=liveData(ended),v=vehicle(ended,null),old=idx>=0?all[idx]:null;
      const report=Object.assign({},old||{},{id,reportId:id,reportVersion:2,reportType:'driverShift',tripId:tripId(ended),cashShiftId:ended.cashShiftId||localStorage.getItem('conductor_current_shift_id')||null,startedAt:ended.startedAt||new Date().toISOString(),finishedAt:ended.finishedAt,gameStartTime:ended.gameStartTime||'не задано',gameTimeAtFinish:ended.gameTimeAtFinish,vehicle:Object.assign({},v,{routeId:ended.routeId||null}),tickets:d.tickets,buffet:d.buffet,driverShift:ended,conductorSurname:$('reportConductorSurname')? $('reportConductorSurname').value.trim():(ended.conductorSurname||''),driverSurname:$('reportDriverSurname')? $('reportDriverSurname').value.trim():(ended.driverSurname||''),reportMessage:$('reportMessage')? $('reportMessage').value.trim():(ended.reportMessage||''),printedAt:old&&old.printedAt||null});
      if(idx>=0)all[idx]=report;else all.push(report);saveArchives(all);storeShift(ended);selectedArchiveId=id;render();
    }}catch(e){console.error('Не удалось сохранить отчёт завершённой водительской смены:',e)}
    return result;
  });
  wrap('processTicketSale',original=>function(){
    const before=new Set(tickets().map(ticketKey)),result=original.apply(this,arguments);
    try{const s=shift();if(s&&s.reportId){const rows=tickets(),now=new Date().toISOString();rows.forEach(t=>{if(before.has(ticketKey(t))&&String(t.driverShiftReportId||'')!==String(s.reportId))return;if(!t.issuedAt)t.issuedAt=now;if(!t.routeId&&s.routeId)t.routeId=s.routeId;if(!t.reportTripId&&tripId(s))t.reportTripId=String(tripId(s))});localStorage.setItem(TICKETS_KEY,JSON.stringify(rows));try{if(typeof state!=='undefined')state.tickets=rows}catch(_){}tagRows(s)}requestRender()}catch(e){console.error('Не удалось привязать билет к водительской смене:',e)}
    return result;
  });
  wrap('completeBuffetPayment',original=>function(){
    const before=new Set(sales().map(saleKey)),result=original.apply(this,arguments);
    try{const s=shift();if(s&&s.reportId){const rows=sales();rows.forEach(v=>{if(!before.has(saleKey(v))&&!v.time&&!v.createdAt)v.time=new Date().toISOString();if(!before.has(saleKey(v))&&!v.reportTripId&&tripId(s))v.reportTripId=String(tripId(s))});localStorage.setItem(BUFFET_KEY,JSON.stringify(rows));tagRows(s)}requestRender()}catch(e){console.error('Не удалось привязать товар к водительской смене:',e)}
    return result;
  });
  wrap('switchTab',original=>function(tabId){
    const result=original.apply(this,arguments);
    if(tabId==='reports'||tabId==='tab-reports'){if(!activeShift()&&!selectedArchiveId)initialSelect();refresh()}
    return result;
  });
  function boot(){
    if(!installUI())return;
    if(activeShift())selectedArchiveId='';else initialSelect();
    render();
    window.TicketReports={refresh,print:printReport,openManual,cancelManual:()=>{$('reportManualEditor').hidden=true;$('reportManualEditor').dataset.keepOpen=''},saveManual,selectArchive:id=>{selectedArchiveId=String(id||'');render()},setMode:refresh,markPrinted};
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
    window.addEventListener('load',refresh,{once:true});
    window.addEventListener('afterprint',()=>{if(document.body.classList.contains('print-ticket-report'))document.body.classList.remove('print-ticket-report')});
    setInterval(()=>{if(activeShift()&&$('tab-reports')&&$('tab-reports').classList.contains('active'))requestRender()},3000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();