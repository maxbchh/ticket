/* QR universal-ticket issuance, purchase history and non-blocking notifications. */
(function () {
  'use strict';
  var PRICE = 1.79;
  var QR_PAYLOAD = 'TICKET:UNIVERSAL:1.79';
  var QUEUE_KEY = 'conductor_qr_pending_queue';
  var scanner = null;
  var lastScanPayload = '';
  var lastScanAt = 0;
  var draining = false;

  function $(id) { return document.getElementById(id); }
  function safeArray(value) { return Array.isArray(value) ? value : []; }
  function money(value) {
    return (Math.round((Number(value) || 0) * 100) / 100).toLocaleString('ru-RU', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }) + ' BYN';
  }
  function toast(title, message, kind) {
    var host = $('ticketToastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ticketToastHost';
      host.style.cssText = 'position:fixed;top:14px;right:14px;z-index:30000;width:min(360px,calc(100vw - 28px));display:flex;flex-direction:column;gap:8px;pointer-events:none';
      document.body.appendChild(host);
    }
    var item = document.createElement('div');
    var accent = kind === 'error' ? '#dc2626' : kind === 'warning' ? '#d97706' : '#16a34a';
    item.style.cssText = 'background:rgba(255,255,255,.97);border:1px solid rgba(148,163,184,.35);border-left:4px solid ' + accent + ';border-radius:14px;padding:12px 14px;box-shadow:0 12px 32px rgba(15,23,42,.18);color:#172033;backdrop-filter:blur(16px);font-size:14px;animation:ticketToastIn .18s ease-out';
    var heading = document.createElement('div');
    heading.style.cssText = 'font-weight:800;margin-bottom:3px';
    heading.textContent = title;
    var body = document.createElement('div');
    body.style.cssText = 'font-size:13px;line-height:1.4;color:#475569';
    body.textContent = message || '';
    item.appendChild(heading);
    item.appendChild(body);
    host.appendChild(item);
    window.setTimeout(function () {
      item.style.opacity = '0';
      item.style.transform = 'translateY(-4px)';
      item.style.transition = 'opacity .2s,transform .2s';
      window.setTimeout(function () { item.remove(); }, 250);
    }, 4500);
  }
  function addToastStyles() {
    if ($('ticketToastStyles')) return;
    var style = document.createElement('style');
    style.id = 'ticketToastStyles';
    style.textContent = '@keyframes ticketToastIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}#purchaseHistoryList .purchase-card{margin-top:10px;padding:14px;border:1px solid var(--border-color);border-radius:14px;background:var(--bg-input)}#purchaseHistoryList .purchase-header{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;margin-bottom:8px}#purchaseHistoryList .purchase-ticket{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px solid rgba(148,163,184,.22);padding-top:10px;margin-top:10px}#purchaseHistoryList .purchase-muted{font-size:.82rem;color:var(--text-secondary);margin-top:4px}#purchaseHistoryList .purchase-refunded{color:var(--accent-red);font-weight:800}#purchaseHistoryList .purchase-active{color:var(--accent-green);font-weight:800}';
    document.head.appendChild(style);
  }
  function queueRead() {
    try { return safeArray(JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')); }
    catch (_) { return []; }
  }
  function queueWrite(items) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    var counter = $('universalQrQueueCount');
    if (counter) counter.textContent = String(items.length);
  }
  function refreshQueueCount() {
    var counter = $('universalQrQueueCount');
    if (counter) counter.textContent = String(queueRead().length);
  }
  function persistState() {
    localStorage.setItem('conductor_tickets', JSON.stringify(safeArray(state.tickets)));
    localStorage.setItem('conductor_last_num', String(Number(state.lastTicketNum) || 1001));
    localStorage.setItem('conductor_operations', JSON.stringify(safeArray(state.operations)));
    if (typeof window.syncConductorData === 'function') window.syncConductorData();
    else if (typeof window.ticketCloudSave === 'function') window.ticketCloudSave();
  }
  function renderAfterChange() {
    if (typeof window.updateShiftStats === 'function') window.updateShiftStats();
    if (typeof window.renderOperations === 'function') window.renderOperations();
    if (typeof window.searchTickets === 'function') window.searchTickets();
    renderPurchaseHistory();
  }
  function shiftIsOpen() {
    return !!(typeof state !== 'undefined' && state && state.shiftActive);
  }
  function cashModalOpen() {
    var modal = $('cashRegisterModal');
    return !!(modal && !modal.hidden && modal.classList.contains('open'));
  }
  function createUniversalTicket() {
    if (!shiftIsOpen()) {
      toast('Смена закрыта', 'QR-талон не выдан. Сначала открой кассовую смену.', 'error');
      return false;
    }
    if (typeof state.tickets === 'undefined' || !Array.isArray(state.tickets)) state.tickets = [];
    var now = new Date();
    var num = Number(state.lastTicketNum) || 1001;
    var purchaseId = 'qr_' + now.getTime() + '_' + Math.random().toString(36).slice(2, 7);
    var ticket = {
      num: num,
      id: 'ticket_' + purchaseId,
      time: now.toLocaleTimeString('ru-RU'),
      route: 'Универсальный талон',
      routeId: null,
      from: 'Универсальный',
      to: 'Универсальный',
      price: PRICE,
      status: 'active',
      conductor: state.conductorName || 'Кондуктор',
      passenger: 'full',
      note: 'Автоматический универсальный талон по QR',
      paymentMethod: 'QR-автомат',
      paymentStatus: 'Оплачено в учёте',
      purchaseId: purchaseId,
      purchasedAt: now.toISOString(),
      issuedAt: now.toISOString(),
      shiftId: state.currentShiftId || localStorage.getItem('conductor_current_shift_id') || null,
      tripId: null
    };
    state.tickets.push(ticket);
    state.lastTicketNum = num + 1;
    persistState();
    if (typeof window.addOperation === 'function') {
      window.addOperation('Продажа QR', ticket.num, PRICE, 'Универсальный талон — автоматическая регистрация оплаты');
    } else {
      state.operations = safeArray(state.operations);
      state.operations.push({
        time: now.toLocaleString('ru-RU'), type: 'Продажа QR', ticket: ticket.num,
        amount: PRICE, conductor: state.conductorName || 'Кондуктор',
        details: 'Универсальный талон — автоматическая регистрация оплаты'
      });
      persistState();
    }
    renderAfterChange();
    toast('Оплата талона прошла успешно', 'Универсальный талон №' + ticket.num + ' — ' + money(PRICE) + '. Он добавлен в историю смены.', 'success');
    return true;
  }
  function acceptQrPayload(decodedText) {
    var payload = String(decodedText || '').trim();
    var now = Date.now();
    if (payload === lastScanPayload && now - lastScanAt < 3000) return;
    lastScanPayload = payload;
    lastScanAt = now;
    if (payload !== QR_PAYLOAD) {
      toast('Это не QR-талон «Тикет»', 'Отсканируй QR-код универсального талона из вкладки «QR-талон».', 'warning');
      return;
    }
    if (!shiftIsOpen()) {
      toast('Смена закрыта', 'Открой смену перед выдачей универсального талона.', 'error');
      return;
    }
    if (cashModalOpen() || window.__cashPaymentBusy) {
      var q = queueRead();
      q.push({ id: 'queued_' + now + '_' + Math.random().toString(36).slice(2, 7), queuedAt: new Date().toISOString() });
      queueWrite(q);
      toast('QR-талон поставлен в очередь', 'Текущая оплата не изменена. Талон оформится после успешного завершения чека.', 'warning');
      return;
    }
    createUniversalTicket();
  }
  function loadScript(src, test) {
    return new Promise(function (resolve, reject) {
      if (test()) { resolve(); return; }
      var existing = document.querySelector('script[data-qr-library="' + src + '"]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.qrLibrary = src;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Не удалось загрузить библиотеку QR')); };
      document.head.appendChild(script);
    });
  }
  window.showUniversalQrCode = async function () {
    var panel = $('universalQrCodePanel');
    var holder = $('universalQrCode');
    if (!panel || !holder) return;
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'none') return;
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', function () { return typeof window.QRCode === 'function'; });
      holder.innerHTML = '';
      new window.QRCode(holder, { text: QR_PAYLOAD, width: 220, height: 220, correctLevel: window.QRCode.CorrectLevel.M });
    } catch (_) {
      toast('Не удалось создать QR-код', 'Проверь подключение к интернету и попробуй ещё раз.', 'error');
    }
  };
  window.startUniversalQrScanner = async function () {
    if (!shiftIsOpen()) {
      toast('Смена закрыта', 'Открой кассовую смену перед сканированием.', 'error');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Камера недоступна', 'Открой сайт по HTTPS и разреши доступ к камере.', 'error');
      return;
    }
    var scanBox = $('universalQrScanner');
    var startButton = $('startUniversalQrScan');
    var stopButton = $('stopUniversalQrScan');
    if (!scanBox) return;
    try {
      await loadScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js', function () { return typeof window.Html5Qrcode === 'function'; });
      if (scanner) await window.stopUniversalQrScanner();
      scanBox.innerHTML = '';
      scanner = new window.Html5Qrcode('universalQrScanner');
      if (startButton) startButton.disabled = true;
      if (stopButton) stopButton.disabled = false;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 },
        async function (decodedText) {
          await window.stopUniversalQrScanner();
          acceptQrPayload(decodedText);
        },
        function () {}
      );
      toast('Камера включена', 'Наведи её на QR-код универсального талона.', 'success');
    } catch (error) {
      if (startButton) startButton.disabled = false;
      if (stopButton) stopButton.disabled = true;
      toast('Не удалось запустить камеру', (error && error.message) || 'Проверь разрешения камеры и HTTPS.', 'error');
    }
  };
  window.stopUniversalQrScanner = async function () {
    var startButton = $('startUniversalQrScan');
    var stopButton = $('stopUniversalQrScan');
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
        await scanner.clear();
      } catch (_) {}
      scanner = null;
    }
    if (startButton) startButton.disabled = false;
    if (stopButton) stopButton.disabled = true;
  };
  function drainQueue() {
    if (draining || cashModalOpen() || window.__cashPaymentBusy) return;
    var q = queueRead();
    if (!q.length) { refreshQueueCount(); return; }
    if (!shiftIsOpen()) {
      toast('QR-талон ожидает открытия смены', 'Очередь сохранена на этом устройстве.', 'warning');
      refreshQueueCount();
      return;
    }
    draining = true;
    var item = q.shift();
    queueWrite(q);
    window.setTimeout(function () {
      createUniversalTicket();
      draining = false;
      if (queueRead().length) window.setTimeout(drainQueue, 500);
    }, 180);
  }
  window.drainUniversalQrQueue = drainQueue;

  window.renderPurchaseHistory = function () {
    var box = $('purchaseHistoryList');
    if (!box || typeof state === 'undefined') return;
    var tickets = safeArray(state.tickets).slice();
    if (!tickets.length) {
      box.innerHTML = '<p style="color:var(--text-secondary)">Покупок пока нет.</p>';
      return;
    }
    var groups = new Map();
    tickets.forEach(function (ticket) {
      var key = ticket.purchaseId ? String(ticket.purchaseId) : 'ticket_' + String(ticket.num);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(ticket);
    });
    var purchases = Array.from(groups.entries()).map(function (entry) {
      var items = entry[1].slice().sort(function (a, b) { return Number(a.num || 0) - Number(b.num || 0); });
      var latest = items.reduce(function (best, t) {
        var candidate = Date.parse(t.purchasedAt || t.issuedAt || '') || Number(t.num || 0);
        return candidate > best.value ? { value: candidate, ticket: t } : best;
      }, { value: 0, ticket: items[items.length - 1] }).ticket;
      return { id: entry[0], tickets: items, latest: latest, sort: Date.parse(latest.purchasedAt || latest.issuedAt || '') || Number(latest.num || 0) };
    }).sort(function (a, b) { return b.sort - a.sort; });
    box.innerHTML = '';
    purchases.forEach(function (purchase) {
      var all = purchase.tickets;
      var active = all.filter(function (t) { return t.status !== 'cancelled'; });
      var refunded = all.filter(function (t) { return t.status === 'cancelled'; });
      var originalTotal = all.reduce(function (sum, t) { return sum + Number(t.price || 0); }, 0);
      var activeTotal = active.reduce(function (sum, t) { return sum + Number(t.price || 0); }, 0);
      var returnedTotal = refunded.reduce(function (sum, t) { return sum + Number(t.refund || t.price || 0); }, 0);
      var card = document.createElement('div');
      card.className = 'purchase-card';
      var header = document.createElement('div');
      header.className = 'purchase-header';
      var left = document.createElement('div');
      var title = document.createElement('strong');
      title.textContent = 'Покупка ' + (purchase.id.indexOf('ticket_') === 0 ? '№' + String(all[0].num) : '#' + purchase.id.slice(-8));
      left.appendChild(title);
      var meta = document.createElement('div');
      meta.className = 'purchase-muted';
      meta.textContent = (purchase.latest.purchasedAt || purchase.latest.issuedAt ? new Date(purchase.latest.purchasedAt || purchase.latest.issuedAt).toLocaleString('ru-RU') : (purchase.latest.time || 'Время неизвестно')) + ' · ' + all.length + ' билет(ов)';
      left.appendChild(meta);
      var right = document.createElement('div');
      right.style.cssText = 'text-align:right';
      var total = document.createElement('strong');
      total.textContent = 'К оплате: ' + money(originalTotal);
      right.appendChild(total);
      var status = document.createElement('div');
      status.className = refunded.length ? 'purchase-muted purchase-refunded' : 'purchase-muted purchase-active';
      status.textContent = refunded.length ? (active.length ? 'Частичный возврат: ' : 'Возвращено: ') + money(returnedTotal) : 'Оплата зарегистрирована';
      right.appendChild(status);
      if (activeTotal > 0 && refunded.length) {
        var remaining = document.createElement('div');
        remaining.className = 'purchase-muted';
        remaining.textContent = 'Осталось оплачено: ' + money(activeTotal);
        right.appendChild(remaining);
      }
      header.appendChild(left);
      header.appendChild(right);
      card.appendChild(header);
      all.forEach(function (ticket) {
        var row = document.createElement('div');
        row.className = 'purchase-ticket';
        var details = document.createElement('div');
        var name = document.createElement('strong');
        name.textContent = 'Билет №' + ticket.num + ' · ' + (ticket.route || 'Без маршрута');
        details.appendChild(name);
        var route = document.createElement('div');
        route.className = 'purchase-muted';
        route.textContent = (ticket.from || '—') + ' → ' + (ticket.to || '—') + ' · ' + money(ticket.price || 0) + (ticket.paymentMethod ? ' · ' + ticket.paymentMethod : '');
        details.appendChild(route);
        var action = document.createElement('div');
        if (ticket.status === 'cancelled') {
          var refundedLabel = document.createElement('span');
          refundedLabel.className = 'purchase-refunded';
          refundedLabel.textContent = 'Возврат ' + money(ticket.refund || ticket.price || 0);
          action.appendChild(refundedLabel);
        } else {
          var button = document.createElement('button');
          button.className = 'btn btn-red mini-btn';
          button.type = 'button';
          button.textContent = '↩ Вернуть билет';
          button.addEventListener('click', function () {
            if (typeof window.cancelTicket === 'function') window.cancelTicket(Number(ticket.num));
            window.renderPurchaseHistory();
          });
          action.appendChild(button);
        }
        row.appendChild(details);
        row.appendChild(action);
        card.appendChild(row);
      });
      box.appendChild(card);
    });
  };

  function decorateTicketShiftHistory() {
    var body = $('ticketHistoryBody');
    if (!body) return;
    var tickets = safeArray(state.tickets).slice().reverse();
    Array.from(body.rows).forEach(function (row, index) {
      var ticket = tickets[index];
      if (!ticket) return;
      while (row.cells.length > 5) row.deleteCell(-1);
      var statusCell = row.insertCell(-1);
      statusCell.textContent = ticket.status === 'cancelled' ? 'Возвращён' : 'Действителен';
      var actionCell = row.insertCell(-1);
      if (ticket.status === 'cancelled') {
        actionCell.textContent = '—';
      } else {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-red mini-btn';
        button.textContent = 'Возврат';
        button.addEventListener('click', function () { window.cancelTicket(Number(ticket.num)); });
        actionCell.appendChild(button);
      }
    });
  }
  var oldUpdateShiftStats = window.updateShiftStats;
  if (typeof oldUpdateShiftStats === 'function') {
    window.updateShiftStats = function () {
      oldUpdateShiftStats();
      var tickets = safeArray(state.tickets);
      var active = tickets.filter(function (t) { return t.status !== 'cancelled'; });
      var count = $('totalShiftTickets');
      var revenue = $('totalShiftRevenue');
      if (count) count.textContent = String(active.length);
      if (revenue) revenue.textContent = money(active.reduce(function (sum, t) { return sum + Number(t.price || 0); }, 0));
      decorateTicketShiftHistory();
      renderPurchaseHistory();
    };
  }
  var oldCancelTicket = window.cancelTicket;
  if (typeof oldCancelTicket === 'function') {
    window.cancelTicket = function (num) {
      oldCancelTicket(num);
      renderPurchaseHistory();
    };
  }
  var oldConfirmCashPayment = window.confirmCashPayment;
  if (typeof oldConfirmCashPayment === 'function') {
    window.confirmCashPayment = function () {
      var before = new Set(safeArray(state.tickets).map(function (t) { return String(t.num); }));
      var purchaseId = 'purchase_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      var method = window.__cashPaymentMethod === 'card' ? 'Карта' : 'Наличные';
      window.__cashPaymentBusy = true;
      oldConfirmCashPayment();
      var added = safeArray(state.tickets).filter(function (t) { return !before.has(String(t.num)); });
      if (added.length) {
        var timestamp = new Date().toISOString();
        added.forEach(function (ticket) {
          ticket.purchaseId = purchaseId;
          ticket.paymentMethod = method;
          ticket.paymentStatus = 'Оплачено';
          ticket.purchasedAt = timestamp;
        });
        persistState();
        renderPurchaseHistory();
        toast('Оплата прошла успешно', 'Покупка ' + purchaseId.slice(-8) + ': ' + added.length + ' билет(ов). Данные сохранены в истории.', 'success');
        window.__cashPaymentBusy = false;
        window.setTimeout(drainQueue, 250);
      } else {
        window.__cashPaymentBusy = false;
      }
    };
  }
  document.addEventListener('DOMContentLoaded', function () {
    addToastStyles();
    refreshQueueCount();
    renderPurchaseHistory();
  });
  window.addEventListener('load', function () {
    addToastStyles();
    refreshQueueCount();
    renderPurchaseHistory();
  });
})();