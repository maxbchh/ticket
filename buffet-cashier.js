/* Adapts the existing ticket cashier to buffet cart payments without issuing a ticket. */
(function () {
  'use strict';
  var context = null;
  var savedPrice = null;
  var savedQuantity = null;
  var originalOpen = window.openCashRegister;
  var originalClose = window.closeCashRegister;
  var originalConfirm = window.confirmCashPayment;
  var originalSummary = window.updateCashSaleSummary;

  function get(id) { return document.getElementById(id); }
  function money(n) {
    return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('ru-RU', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }) + ' BYN';
  }
  function showBuffetSummary() {
    if (!context) {
      if (typeof originalSummary === 'function') originalSummary();
      return;
    }
    var summary = get('cashSaleSummary');
    if (summary) {
      var heading = summary.querySelector('.sales-design-heading');
      if (heading) heading.textContent = '🛍️ Покупка в мини-буфете';
      ['cashSaleRoute', 'cashSaleStations', 'cashSaleCategory', 'cashSaleUnit', 'cashSaleQty'].forEach(function (id) {
        var node = get(id);
        var line = node && node.closest('.sales-design-line');
        if (line) line.style.display = 'none';
      });
      var total = get('cashSaleTotal');
      if (total) total.textContent = money(context.total);
      var received = Math.max(0, Number(get('cashReceivedInput') && get('cashReceivedInput').value || 0));
      var receivedNode = get('cashSaleReceived');
      var changeNode = get('cashSaleChange');
      if (receivedNode) receivedNode.textContent = money(received);
      if (changeNode) changeNode.textContent = money(Math.max(0, received - context.total));
    }
    var totalLabel = document.querySelector('#cashTicketTotal')?.previousElementSibling;
    if (totalLabel) totalLabel.textContent = 'Стоимость покупки';
    var heading = get('cashRegisterTitle');
    if (heading) heading.textContent = '💵 Касса — оплата буфета';
    var receivedLabel = get('cashReceivedInput')?.previousElementSibling;
    if (receivedLabel && receivedLabel.tagName === 'LABEL') receivedLabel.textContent = 'Получено от покупателя';
    var exact = document.querySelector('#cashRegisterModal [onclick="setCashExact()"]');
    if (exact) exact.textContent = 'Точная сумма';
    document.querySelectorAll('#cashRegisterModal [onclick="confirmCashPayment()"]').forEach(function (button) {
      button.textContent = '✅ Оплатить покупку';
    });
  }

  window.updateCashSaleSummary = function () {
    if (context) { showBuffetSummary(); return; }
    if (typeof originalSummary === 'function') originalSummary();
  };

  window.openBuffetCashRegister = function (total, items) {
    var amount = Math.round(Number(total) * 100) / 100;
    if (!Array.isArray(items) || !items.length || !Number.isFinite(amount) || amount <= 0) {
      alert('В покупке нет товаров или сумма некорректна.');
      return;
    }
    // The main terminal state and localStorage can briefly differ after shift wrappers/cloud sync.
    // Treat the shift as open if either authoritative indicator says it is open.
    var shiftIsOpen = (typeof state !== 'undefined' && state && state.shiftActive === true) ||
      localStorage.getItem('conductor_shift_active') === 'true';
    if (!shiftIsOpen) {
      alert('Сначала откройте кассовую смену во вкладке «Журнал & Z-Отчёт».');
      return;
    }
    var price = get('ticketPrice');
    var quantity = get('ticketQuantity');
    savedPrice = price ? price.value : null;
    savedQuantity = quantity ? quantity.value : null;
    context = { total: amount, items: items.map(function (x) {
      return { productId: x.productId, name: x.name, price: Number(x.price), quantity: Number(x.quantity), stock: Number(x.stock) };
    }) };
    if (price) price.value = amount.toFixed(2);
    if (quantity) quantity.value = '1';
    if (typeof originalOpen === 'function') originalOpen();
    showBuffetSummary();
    if (typeof window.updateCashRegister === 'function') window.updateCashRegister();
    showBuffetSummary();
  };

  window.confirmCashPayment = function () {
    if (!context) return typeof originalConfirm === 'function' ? originalConfirm() : undefined;
    // Shift was validated before opening the shared cashier. Do not re-check here:
    // other app scripts can temporarily desynchronize state.shiftActive from the open-shift badge.
    var received = Math.max(0, Number(get('cashReceivedInput') && get('cashReceivedInput').value || 0));
    var method = window.__cashPaymentMethod === 'card' ? 'card' : 'cash';
    if (method === 'card') received = context.total;
    if (method === 'cash' && received < context.total) {
      alert('Недостаточно денег для оплаты покупки.');
      return;
    }
    if (typeof window.completeBuffetPayment !== 'function') {
      alert('Не удалось сохранить продажу буфета. Товары не списаны.');
      return;
    }
    try {
      window.completeBuffetPayment(context.items, method, context.total);
      window.closeCashRegister();
    } catch (error) {
      alert(error && error.message ? error.message : 'Не удалось оформить продажу. Проверь остатки товаров.');
    }
  };

  window.closeCashRegister = function () {
    if (typeof originalClose === 'function') originalClose();
    if (!context) return;
    context = null;
    var price = get('ticketPrice');
    var quantity = get('ticketQuantity');
    if (price && savedPrice !== null) {
      price.value = savedPrice;
      price.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (quantity && savedQuantity !== null) {
      quantity.value = savedQuantity;
      quantity.dispatchEvent(new Event('input', { bubbles: true }));
    }
    savedPrice = null;
    savedQuantity = null;
    var heading = get('cashRegisterTitle');
    if (heading) heading.textContent = '💵 Касса — оформление оплаты';
    var totalLabel = document.querySelector('#cashTicketTotal')?.previousElementSibling;
    if (totalLabel) totalLabel.textContent = 'Общая стоимость билетов';
    var receivedLabel = get('cashReceivedInput')?.previousElementSibling;
    if (receivedLabel && receivedLabel.tagName === 'LABEL') receivedLabel.textContent = 'Получено от пассажира';
    var exact = document.querySelector('#cashRegisterModal [onclick="setCashExact()"]');
    if (exact) exact.textContent = 'Сумма билета';
    document.querySelectorAll('#cashRegisterModal [onclick="confirmCashPayment()"]').forEach(function (button) {
      button.textContent = button.classList.contains('btn-green') ? '✅ Оплатить и выпустить' : '✅ Оплатил и выпустить';
    });
    ['cashSaleRoute', 'cashSaleStations', 'cashSaleCategory', 'cashSaleUnit', 'cashSaleQty'].forEach(function (id) {
      var node = get(id);
      var line = node && node.closest('.sales-design-line');
      if (line) line.style.display = '';
    });
    if (typeof originalSummary === 'function') originalSummary();
    window.__cashPaymentMethod = 'cash';
  };
})();