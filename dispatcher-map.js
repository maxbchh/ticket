/* Interactive OpenStreetMap constructor + dispatch centre for Ticket */
(() => {
  'use strict';
  const STORE = 'ticket_dispatcher_routes_v1';
  const DELETED_STORE = 'ticket_dispatcher_deleted_route_ids';
  const TVER = [56.8587, 35.9176];
  const $ = id => document.getElementById(id);
  let editMap = null, dispatchMap = null, editMarkers = [], editLine = null;
  let dispatchMarkers = [], dispatchLine = null, busMarker = null, playbackTimer = null, playbackFrame = null, playbackIndex = 0, playbackStartedAt = 0, playbackDuration = 0, playbackPath = [], playbackFrom = 0, playbackTo = 1, playbackPaused = false;
  let editRouteId = '', addingStops = true, leafletPromise = null, editRouteRenderToken = 0, dispatchRouteRenderToken = 0;
  let routes = loadRoutes();

  function loadRoutes() {
    try { const v = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(v) ? v : []; }
    catch (_) { return []; }
  }
  function persist() {
    const active = routes.find(r => r.id === editRouteId);
    if (active) active.updatedAt = new Date().toISOString();
    localStorage.setItem(STORE, JSON.stringify(routes));
    if (typeof window.syncConductorData === 'function') {
      clearTimeout(persist.syncTimer);
      persist.syncTimer = setTimeout(() => { try { window.syncConductorData(); } catch (e) { console.warn(e); } }, 900);
    }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function id() { return 'maproute_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }
  function currentEditRoute() { return routes.find(r => r.id === editRouteId) || null; }
  function notify(message) {
    const e = $('dispatcherNotice');
    if (e) { e.textContent = message; e.style.display = 'block'; clearTimeout(notify.timer); notify.timer = setTimeout(() => { e.style.display = 'none'; }, 3200); }
  }
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.crossOrigin = '';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.crossOrigin = '';
      script.onload = () => window.L ? resolve() : reject(new Error('Библиотека карты не загрузилась'));
      script.onerror = () => reject(new Error('Не удалось загрузить карту. Проверьте подключение к интернету.'));
      document.head.appendChild(script);
    });
    return leafletPromise;
  }
  function mapError(id, error) {
    const el = $(id);
    if (el) el.innerHTML = '<div class="dmap-error">Не удалось загрузить интерактивную карту.<br>' + esc(error && error.message || 'Проверьте интернет-соединение.') + '<br><button class="btn btn-outline" type="button" onclick="TicketDispatcher.retryMaps()">Повторить</button></div>';
  }
  function baseMap(elId) {
    const map = L.map(elId, { zoomControl: true, preferCanvas: true }).setView(TVER, 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(map);
    return map;
  }
  function initEditMap() {
    if (editMap || !$('dispatcherEditMap')) return;
    loadLeaflet().then(() => {
      if (editMap) return;
      editMap = baseMap('dispatcherEditMap');
      editMap.on('click', e => {
        if (!addingStops) { notify('Включите режим добавления остановок, чтобы ставить остановки на карте.'); return; }
        let r = currentEditRoute();
        if (!r) { notify('Сначала создайте новый маршрут или выберите сохранённый.'); return; }
        const nameInput = $('dispatcherNewStopName');
        const name = (nameInput && nameInput.value.trim()) || ('Остановка ' + (r.stops.length + 1));
        r.stops.push({ id: id(), name, lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)), travelMinutes: null });
        if (nameInput) nameInput.value = '';
        persist(); renderEditPanel(); drawEditRoute(); renderDispatchRouteOptions();
        notify('Остановка добавлена. Название и расписание можно изменить в списке.');
      });
      drawEditRoute();
    }).catch(e => mapError('dispatcherEditMap', e));
  }
  function initDispatchMap() {
    if (dispatchMap || !$('dispatcherLiveMap')) return;
    loadLeaflet().then(() => {
      if (dispatchMap) return;
      dispatchMap = baseMap('dispatcherLiveMap');
      renderDispatchMap();
    }).catch(e => mapError('dispatcherLiveMap', e));
  }
  function removeLayers(map, markers, line) {
    markers.forEach(m => { try { map.removeLayer(m); } catch (_) {} });
    markers.length = 0;
    if (line) { try { map.removeLayer(line); } catch (_) {} }
    return null;
  }
  function roadGeometry(points) {
    if (!Array.isArray(points) || points.length < 2) return Promise.resolve(null);
    const coords = points.map(p => Number(p[1]) + ',' + Number(p[0])).join(';');
    const url = 'https://router.project-osrm.org/route/v1/driving/' + coords + '?overview=full&geometries=geojson&steps=false';
    return fetch(url, { mode: 'cors' }).then(r => { if (!r.ok) throw new Error('routing unavailable'); return r.json(); })
      .then(data => data && data.code === 'Ok' && data.routes && data.routes[0] ? data.routes[0].geometry.coordinates.map(p => [p[1], p[0]]) : null);
  }
  function drawEditRoute() {
    if (!editMap || !$('dispatcherEditMap')) return;
    editLine = removeLayers(editMap, editMarkers, editLine);
    const routeToken = ++editRouteRenderToken;
    const r = currentEditRoute();
    if (!r) return;
    const points = [];
    r.stops.forEach((s, i) => {
      const marker = L.marker([s.lat, s.lng], { draggable: true }).addTo(editMap);
      marker.bindTooltip((i + 1) + '. ' + s.name, { direction: 'top' });
      marker.bindPopup('<strong>' + (i + 1) + '. ' + esc(s.name) + '</strong><br><small>Перетащите маркер, чтобы уточнить место.</small>');
      marker.on('dragend', e => {
        const p = e.target.getLatLng(); s.lat = Number(p.lat.toFixed(6)); s.lng = Number(p.lng.toFixed(6));
        persist(); drawEditRoute(); renderEditPanel();
      });
      editMarkers.push(marker); points.push([s.lat, s.lng]);
    });
    if (points.length > 1) {
      const style = { color: '#1677ff', weight: 5, opacity: .85 };
      editLine = L.polyline(points, style).addTo(editMap);
      roadGeometry(points).then(road => {
        if (!road || routeToken !== editRouteRenderToken || !editMap) return;
        if (editLine) editMap.removeLayer(editLine);
        editLine = L.polyline(road, style).addTo(editMap);
      }).catch(() => {});
    }
    if (points.length) editMap.fitBounds(L.latLngBounds(points).pad(.18), { maxZoom: 15 });
    setTimeout(() => editMap && editMap.invalidateSize(), 80);
  }
  function averageTravelMinutes(r) {
    const values = (r && r.stops ? r.stops.slice(0, -1) : []).map(s => Number(s.travelMinutes)).filter(n => Number.isFinite(n) && n > 0);
    return values.length ? values.reduce((a,b) => a+b, 0) / values.length : 1.5;
  }
  function renderEditPanel() {
    const r = currentEditRoute();
    const title = $('dispatcherEditTitle');
    const name = $('dispatcherRouteName');
    if (title) title.textContent = r ? 'Редактирование: ' + r.name : 'Новый маршрут';
    if (name && r && name.value !== r.name) name.value = r.name;
    const list = $('dispatcherStopRows');
    if (!list) return;
    if (!r) { list.innerHTML = '<tr><td colspan="5" class="dmap-muted">Создайте маршрут, затем нажимайте на карту, чтобы добавлять остановки.</td></tr>'; return; }
    if (!r.stops.length) { list.innerHTML = '<tr><td colspan="5" class="dmap-muted">На карте пока нет остановок. Нажмите на нужные места.</td></tr>'; return; }
    list.innerHTML = r.stops.map((s, i) => '<tr><td><span class="dmap-order">' + (i + 1) + '</span></td><td><input aria-label="Название остановки ' + (i + 1) + '" value="' + esc(s.name) + '" data-stop-name="' + esc(s.id) + '"></td><td>' + (i < r.stops.length - 1 ? '<label class="dmap-muted" style="display:block;margin-bottom:3px">Минут до «' + esc(r.stops[i+1].name) + '»</label><input type="number" min="0.1" max="60" step="0.1" placeholder="Напр. 2" aria-label="Время от ' + esc(s.name) + ' до ' + esc(r.stops[i+1].name) + '" value="' + (Number(s.travelMinutes) > 0 ? esc(s.travelMinutes) : '') + '" data-stop-time="' + esc(s.id) + '">' : '<span class="dmap-muted">Конечная</span>') + '</td><td><button class="btn btn-outline dmap-small-btn" type="button" data-up="' + esc(s.id) + '" title="Выше">↑</button> <button class="btn btn-outline dmap-small-btn" type="button" data-down="' + esc(s.id) + '" title="Ниже">↓</button> <button class="btn btn-red dmap-small-btn" type="button" data-delete="' + esc(s.id) + '" title="Удалить остановку">×</button></td></tr>').join('');
    const avg = $('dispatcherAverageTime');
    if (avg) avg.textContent = 'Среднее время между остановками: ' + averageTravelMinutes(r).toFixed(2).replace('.', ',') + ' мин';
    list.querySelectorAll('[data-stop-name]').forEach(el => el.addEventListener('change', () => changeStop(el.dataset.stopName, 'name', el.value)));
    list.querySelectorAll('[data-stop-time]').forEach(el => el.addEventListener('change', () => { const v = Number(el.value); if (!Number.isFinite(v) || v <= 0 || v > 60) { notify('Укажи время от 0,1 до 60 минут.'); renderEditPanel(); return; } changeStop(el.dataset.stopTime, 'travelMinutes', v); }));
    list.querySelectorAll('[data-delete]').forEach(el => el.addEventListener('click', () => { if (!confirm('Удалить эту остановку?')) return; const rr = currentEditRoute(); rr.stops = rr.stops.filter(s => s.id !== el.dataset.delete); persist(); renderEditPanel(); drawEditRoute(); renderDispatchRouteOptions(); }));
    list.querySelectorAll('[data-up]').forEach(el => el.addEventListener('click', () => reorderStop(el.dataset.up, -1)));
    list.querySelectorAll('[data-down]').forEach(el => el.addEventListener('click', () => reorderStop(el.dataset.down, 1)));
  }
  function changeStop(stopId, field, value) {
    const r = currentEditRoute(); if (!r) return;
    const s = r.stops.find(x => x.id === stopId); if (!s) return;
    s[field] = field === 'name' ? (value.trim() || s.name) : value;
    persist(); renderEditPanel(); drawEditRoute(); renderDispatchRouteOptions();
  }
  function reorderStop(stopId, delta) {
    const r = currentEditRoute(); if (!r) return;
    const i = r.stops.findIndex(s => s.id === stopId), j = i + delta;
    if (i < 0 || j < 0 || j >= r.stops.length) return;
    [r.stops[i], r.stops[j]] = [r.stops[j], r.stops[i]];
    persist(); renderEditPanel(); drawEditRoute(); renderDispatchRouteOptions();
  }
  function renderRouteList() {
    const el = $('dispatcherSavedRoutes'); if (!el) return;
    if (!routes.length) { el.innerHTML = '<p class="dmap-muted">Пока нет сохранённых маршрутов.</p>'; return; }
    el.innerHTML = routes.map(r => '<div class="dmap-route-item ' + (r.id === editRouteId ? 'selected' : '') + '"><button type="button" class="dmap-route-select" data-edit-route="' + esc(r.id) + '"><strong>' + esc(r.name) + '</strong><span>' + r.stops.length + ' остановок</span></button><button type="button" class="btn btn-outline dmap-small-btn" data-rename-route="' + esc(r.id) + '" title="Переименовать">✎</button><button type="button" class="btn btn-red dmap-small-btn" data-remove-route="' + esc(r.id) + '" title="Удалить">×</button></div>').join('');
    el.querySelectorAll('[data-edit-route]').forEach(b => b.addEventListener('click', () => selectEditRoute(b.dataset.editRoute)));
    el.querySelectorAll('[data-rename-route]').forEach(b => b.addEventListener('click', () => { const r = routes.find(x => x.id === b.dataset.renameRoute); if (!r) return; const n = prompt('Новое название маршрута:', r.name); if (n && n.trim()) { r.name = n.trim(); persist(); renderRouteList(); renderDispatchRouteOptions(); renderEditPanel(); } }));
    el.querySelectorAll('[data-remove-route]').forEach(b => b.addEventListener('click', () => { const r = routes.find(x => x.id === b.dataset.removeRoute); if (!r || !confirm('Удалить маршрут «' + r.name + '»?')) return; let deleted = []; try { deleted = JSON.parse(localStorage.getItem(DELETED_STORE) || '[]'); } catch (_) {} if (!deleted.includes(String(r.id))) deleted.push(String(r.id)); localStorage.setItem(DELETED_STORE, JSON.stringify(deleted)); routes = routes.filter(x => x.id !== r.id); if (editRouteId === r.id) editRouteId = ''; persist(); renderRouteList(); renderEditPanel(); drawEditRoute(); renderDispatchRouteOptions(); renderDispatchMap(); }));
  }
  function selectEditRoute(routeId) {
    editRouteId = routeId;
    const r = currentEditRoute();
    if (r && $('dispatcherRouteName')) $('dispatcherRouteName').value = r.name;
    renderRouteList(); renderEditPanel(); drawEditRoute();
  }
  function startNewRoute() {
    stopPlayback();
    const name = ($('dispatcherRouteName') && $('dispatcherRouteName').value.trim()) || 'Новый маршрут';
    const r = { id: id(), name, stops: [], updatedAt: new Date().toISOString() };
    routes.push(r); editRouteId = r.id; persist();
    renderRouteList(); renderEditPanel(); drawEditRoute(); renderDispatchRouteOptions();
    notify('Маршрут создан. Добавляйте остановки щелчками по карте.');
  }
  function saveRoute() {
    const r = currentEditRoute(); if (!r) return notify('Сначала создайте маршрут.');
    const name = ($('dispatcherRouteName') && $('dispatcherRouteName').value.trim()) || r.name;
    r.name = name; r.updatedAt = new Date().toISOString();
    persist(); renderRouteList(); renderDispatchRouteOptions(); renderEditPanel();
    notify('Маршрут «' + name + '» сохранён.');
  }
  function toggleAddStops() {
    addingStops = !addingStops;
    const b = $('dispatcherAddStops');
    if (b) { b.textContent = addingStops ? '📍 Добавление остановок: включено' : '📍 Добавление остановок: выключено'; b.classList.toggle('btn-cyan', addingStops); b.classList.toggle('btn-outline', !addingStops); }
  }
  function renderDispatchRouteOptions() {
    ['dispatcherRunRoute','dispatcherRoutePreviewSelect'].forEach(id => {
      const el = $(id); if (!el) return;
      const old = el.value;
      el.innerHTML = '<option value="">— Выберите маршрут —</option>' + routes.map(r => '<option value="' + esc(r.id) + '">' + esc(r.name) + ' (' + r.stops.length + ')</option>').join('');
      if (routes.some(r => r.id === old)) el.value = old;
    });
    renderDispatchMap();
  }
  function chosenDispatchRoute() {
    const s = $('dispatcherRunRoute'); return routes.find(r => r.id === (s && s.value)) || null;
  }
  function renderDispatchMap() {
    if (!dispatchMap) return;
    dispatchMarkers = removeLayers(dispatchMap, dispatchMarkers, dispatchLine);
    const routeToken = ++dispatchRouteRenderToken;
    if (busMarker) { dispatchMap.removeLayer(busMarker); busMarker = null; }
    const r = chosenDispatchRoute();
    const status = $('dispatcherVehicleStatus');
    if (!r) { if (status) status.textContent = 'Выберите маршрут для просмотра'; return; }
    const pts = [];
    r.stops.forEach((s, i) => {
      const marker = L.circleMarker([s.lat, s.lng], { radius: 8, color: '#fff', weight: 2, fillColor: '#1677ff', fillOpacity: 1 }).addTo(dispatchMap);
      marker.bindTooltip((i + 1) + '. ' + s.name, { direction: 'top' });
      marker.bindPopup('<strong>' + (i + 1) + '. ' + esc(s.name) + '</strong><br>Прибытие: ' + esc(s.arrival || '—') + '<br>Отправление: ' + esc(s.departure || '—'));
      dispatchMarkers.push(marker); pts.push([s.lat, s.lng]);
    });
    if (pts.length > 1) {
      const style = { color: '#16a56b', weight: 5, opacity: .9, dashArray: '10 7' };
      dispatchLine = L.polyline(pts, style).addTo(dispatchMap);
      roadGeometry(pts).then(road => {
        if (!road || routeToken !== dispatchRouteRenderToken || !dispatchMap) return;
        if (dispatchLine) dispatchMap.removeLayer(dispatchLine);
        dispatchLine = L.polyline(road, style).addTo(dispatchMap);
      }).catch(() => {});
    }
    if (pts.length) dispatchMap.fitBounds(L.latLngBounds(pts).pad(.18), { maxZoom: 15 });
    if (status) status.textContent = r.name + ' · ' + r.stops.length + ' остановок · учебный режим';
    renderDispatchSchedule();
    setTimeout(() => dispatchMap && dispatchMap.invalidateSize(), 80);
  }
  function renderDispatchSchedule() {
    const r = chosenDispatchRoute(), el = $('dispatcherScheduleRows');
    if (!el) return;
    if (!r || !r.stops.length) { el.innerHTML = '<tr><td colspan="4" class="dmap-muted">Нет остановок для отображения.</td></tr>'; return; }
    const avg = averageTravelMinutes(r);
    el.innerHTML = r.stops.map((s, i) => '<tr class="' + (i === playbackIndex ? 'dmap-current-stop' : '') + '"><td>' + (i + 1) + '</td><td>' + esc(s.name) + '</td><td>' + (i < r.stops.length - 1 ? esc(Number(s.travelMinutes) > 0 ? s.travelMinutes : '—') + ' мин до следующей' : 'Конечная') + '</td><td>' + (i < r.stops.length - 1 ? esc(avg.toFixed(2).replace('.', ',')) + ' мин (среднее)' : '—') + '</td></tr>').join('');
    const n = $('dispatcherNextStop');
    if (n) n.textContent = r.stops[playbackIndex] ? 'Автобус: ' + r.stops[playbackIndex].name + (r.stops[playbackIndex+1] ? ' → ' + r.stops[playbackIndex+1].name + ' · среднее время в пути ' + avg.toFixed(2).replace('.', ',') + ' мин' : ' · конечная остановка') : 'Маршрут завершён';
  }
  function stopPlayback() {
    if (playbackTimer) clearTimeout(playbackTimer);
    if (playbackFrame) cancelAnimationFrame(playbackFrame);
    playbackTimer = playbackFrame = null; playbackPaused = false;
    const b = $('dispatcherPlayButton');
    if (b) b.textContent = '▶ Запустить учебное движение';
  }
  function legGeometry(a, b) {
    const url = 'https://router.project-osrm.org/route/v1/driving/' + a.lng + ',' + a.lat + ';' + b.lng + ',' + b.lat + '?overview=full&geometries=geojson&steps=false';
    return fetch(url, { mode: 'cors' }).then(r => { if (!r.ok) throw new Error('routing unavailable'); return r.json(); })
      .then(data => data && data.code === 'Ok' && data.routes && data.routes[0] ? data.routes[0].geometry.coordinates.map(p => [p[1], p[0]]) : [[a.lat,a.lng],[b.lat,b.lng]])
      .catch(() => [[a.lat,a.lng],[b.lat,b.lng]]);
  }
  function pointAlongPath(path, progress) {
    if (!path.length) return null;
    if (path.length === 1) return path[0];
    const lengths = []; let total = 0;
    for (let i=1;i<path.length;i++) { const dx=(path[i][1]-path[i-1][1])*Math.cos((path[i][0]+path[i-1][0])*Math.PI/360), dy=path[i][0]-path[i-1][0]; const d=Math.sqrt(dx*dx+dy*dy); lengths.push(d); total+=d; }
    let target=total*Math.max(0,Math.min(1,progress));
    for(let i=0;i<lengths.length;i++){if(target<=lengths[i]||i===lengths.length-1){const t=lengths[i] ? target/lengths[i] : 0;return [path[i][0]+(path[i+1][0]-path[i][0])*t,path[i][1]+(path[i+1][1]-path[i][1])*t];}target-=lengths[i];}
    return path[path.length-1];
  }
  function animateLeg() {
    const elapsed = performance.now() - playbackStartedAt;
    const p = Math.min(1, elapsed / playbackDuration);
    const pos = pointAlongPath(playbackPath, p);
    if (pos && busMarker) busMarker.setLatLng(pos);
    if (p >= 1) {
      playbackIndex = playbackTo;
      renderDispatchSchedule();
      if (playbackIndex >= (chosenDispatchRoute()?.stops.length || 0)-1) {
        stopPlayback();
        const status = $('dispatcherVehicleStatus'); if (status) status.textContent = 'Маршрут завершён · ' + (chosenDispatchRoute()?.name || '');
        return;
      }
      playbackTimer = setTimeout(beginNextLeg, 0);
      return;
    }
    playbackFrame = requestAnimationFrame(animateLeg);
  }
  async function beginNextLeg() {
    const r = chosenDispatchRoute();
    if (!r || playbackIndex >= r.stops.length-1) return stopPlayback();
    playbackFrom = playbackIndex; playbackTo = playbackIndex+1;
    const path = await legGeometry(r.stops[playbackFrom],r.stops[playbackTo]);
    if (!chosenDispatchRoute() || chosenDispatchRoute().id !== r.id) return stopPlayback();
    playbackPath = path;
    playbackDuration = averageTravelMinutes(r) * 60000;
    playbackStartedAt = performance.now();
    const status = $('dispatcherVehicleStatus');
    if (status) status.textContent = 'В пути: ' + r.stops[playbackFrom].name + ' → ' + r.stops[playbackTo].name;
    if (!busMarker) moveBusTo(playbackFrom);
    playbackFrame = requestAnimationFrame(animateLeg);
  }
  function startPlayback() {
    const r = chosenDispatchRoute();
    if (!r || r.stops.length < 2) return notify('Для движения нужен маршрут минимум с двумя остановками.');
    if (playbackPaused && playbackPath.length) {
      playbackPaused = false; playbackStartedAt = performance.now() - (playbackProgress || 0) * playbackDuration;
      playbackFrame = requestAnimationFrame(animateLeg);
      const b=$('dispatcherPlayButton'); if(b)b.textContent='Ⅱ Приостановить движение';
      return;
    }
    stopPlayback(); if (playbackIndex >= r.stops.length-1) playbackIndex=0;
    moveBusTo(playbackIndex); renderDispatchSchedule();
    const status=$('dispatcherVehicleStatus'); if(status)status.textContent='Учебное движение: '+r.name;
    beginNextLeg();
    const b=$('dispatcherPlayButton'); if(b)b.textContent='Ⅱ Приостановить движение';
  }
  let playbackProgress = 0;
  function pausePlayback() {
    if (!playbackFrame) return;
    playbackProgress = Math.min(1,(performance.now()-playbackStartedAt)/playbackDuration);
    cancelAnimationFrame(playbackFrame); playbackFrame=null; playbackPaused=true;
    const b=$('dispatcherPlayButton');if(b)b.textContent='▶ Продолжить движение';
    const status=$('dispatcherVehicleStatus');if(status)status.textContent='Движение приостановлено';
  }
  function nextStop() {
    const r=chosenDispatchRoute();if(!r||!r.stops.length)return notify('Сначала выберите маршрут.');
    stopPlayback();playbackIndex=Math.min(playbackIndex+1,r.stops.length-1);moveBusTo(playbackIndex);renderDispatchSchedule();
  }
  function bindUI() {
    if ($('dispatcherAddStops')) $('dispatcherAddStops').addEventListener('click', toggleAddStops);
    if ($('dispatcherNewRoute')) $('dispatcherNewRoute').addEventListener('click', startNewRoute);
    if ($('dispatcherSaveRoute')) $('dispatcherSaveRoute').addEventListener('click', saveRoute);
    if ($('dispatcherRouteName')) $('dispatcherRouteName').addEventListener('change', saveRoute);
    if ($('dispatcherRunRoute')) $('dispatcherRunRoute').addEventListener('change', () => { stopPlayback(); playbackIndex = 0; renderDispatchMap(); });
    if ($('dispatcherPlayButton')) $('dispatcherPlayButton').addEventListener('click', () => {
      if (playbackFrame) pausePlayback(); else startPlayback();
    });
    if ($('dispatcherNextButton')) $('dispatcherNextButton').addEventListener('click', nextStop);
    if ($('dispatcherStopButton')) $('dispatcherStopButton').addEventListener('click', () => { stopPlayback(); playbackIndex = 0; moveBusTo(0); renderDispatchSchedule(); });
    if ($('dispatcherRoutePreviewSelect')) $('dispatcherRoutePreviewSelect').addEventListener('change', () => { const a = $('dispatcherRunRoute'), b = $('dispatcherRoutePreviewSelect'); if (a && b) a.value = b.value; stopPlayback(); playbackIndex = 0; renderDispatchMap(); });
  }
  function init() {
    if (!$('dispatcherApp')) return;
    bindUI(); renderRouteList(); renderEditPanel(); renderDispatchRouteOptions();
    if (!editRouteId && routes.length) editRouteId = routes[0].id;
    renderRouteList(); renderEditPanel();
  }
  window.TicketDispatcher = {
    retryMaps() {
      leafletPromise = null;
      const a = $('dispatcherEditMap'), b = $('dispatcherLiveMap');
      if (a) a.innerHTML = ''; if (b) b.innerHTML = '';
      editMap = dispatchMap = null; initEditMap(); initDispatchMap();
    },
    show(tabId) {
      if (tabId === 'mapConstructor') initEditMap();
      if (tabId === 'dispatcher') initDispatchMap();
      setTimeout(() => {
        if (tabId === 'mapConstructor' && editMap) { editMap.invalidateSize(); drawEditRoute(); }
        if (tabId === 'dispatcher' && dispatchMap) { dispatchMap.invalidateSize(); renderDispatchMap(); }
      }, 180);
    },
    refresh() { routes = loadRoutes(); renderRouteList(); renderEditPanel(); renderDispatchRouteOptions(); drawEditRoute(); },
    selectEditRoute
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();