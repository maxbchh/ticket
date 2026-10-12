/* Local buffet inventory and safe visual customization; does not replace existing terminal functions. */
(function () {
  'use strict';
  var PRODUCTS_KEY = 'ticket_excursion_buffet_products_v1';
  var SALES_KEY = 'ticket_excursion_buffet_sales_v1';
  var THEME_KEY = 'ticket_visual_theme_v1';
  var defaults = { background: '#f4f7fb', accent: '#007aff', hover: '#0066d6', card: '#ffffff' };
  function el(id) { return document.getElementById(id); }
  function read(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (_) { return fallback; }
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function money(n) { return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2) + ' BYN'; }
  function setTheme(theme) {
    theme = Object.assign({}, defaults, theme || {});
    var root = document.documentElement;
    root.style.setProperty('--bg-main', theme.background);
    root.style.setProperty('--accent-cyan', theme.accent);
    root.style.setProperty('--accent-cyan-hover', theme.hover);
    root.style.setProperty('--buffet-custom-card', theme.card);
    var old = el('ticket-custom-theme-style');
    if (!old) { old = document.createElement('style'); old.id = 'ticket-custom-theme-style'; document.head.appendChild(old); }
    old.textContent =
      ':root{--accent-cyan:' + theme.accent + ';--accent-cyan-hover:' + theme.hover + ';--bg-main:' + theme.background + ';}' +
      '.btn:hover,.tab-btn:hover,button:hover{filter:brightness(.96);}' +
      '.tab-btn:hover{border-color:' + theme.accent + '!important;color:' + theme.accent + '!important;}' +
      '.btn-cyan:hover{background:' + theme.hover + '!important;}' +
      '.card{background:color-mix(in srgb,' + theme.card + ' 78%,transparent)!important;}';
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    ['themeBackground','themeAccent','themeHover','themeCard'].forEach(function (id, i) {
      var input = el(id), key = ['background','accent','hover','card'][i];
      if (input && input.value !== theme[key]) input.value = theme[key];
    });
  }
  function themeFromInputs() {
    setTheme({
      background: el('themeBackground').value,
      accent: el('themeAccent').value,
      hover: el('themeHover').value,
      card: el('themeCard').value
    });
  }
  function renderTheme() {
    var theme = Object.assign({}, defaults, read(THEME_KEY, {}));
    setTheme(theme);
  }
  function products() { return read(PRODUCTS_KEY, []); }
  function sales() { return read(SALES_KEY, []); }
  function saveProducts(items) { localStorage.setItem(PRODUCTS_KEY, JSON.stringify(items)); renderBuffet(); }
  function renderBuffet() {
    var host = el('buffetApp');
    if (!host) return;
    var items = products(), history = sales();
    var total = history.reduce(function (sum, sale) { return sum + Number(sale.total || 0); }, 0);
    host.innerHTML =
      '<div class="card"><div class="card-title">🛍️ Мини-буфет экскурсионного автобуса</div>' +
      '<p style="color:var(--text-secondary);margin-bottom:14px">Добавляй товары и цены, учитывай остатки и отмечай продажи. Это отдельный учёт буфета — он не меняет обычные билеты и маршруты.</p>' +
      '<div class="form-grid"><div class="form-group"><label for="buffetName">Название товара</label><input id="buffetName" maxlength="80" placeholder="Например, вода"></div>' +
      '<div class="form-group"><label for="buffetPrice">Цена (BYN)</label><input id="buffetPrice" type="number" min="0.01" step="0.01" placeholder="2.50"></div>' +
      '<div class="form-group"><label for="buffetStock">Начальный остаток</label><input id="buffetStock" type="number" min="0" step="1" value="0"></div></div>' +
      '<div class="ops-actions" style="margin-top:12px"><button class="btn btn-cyan" type="button" id="buffetAdd">＋ Добавить товар</button><button class="btn btn-outline" type="button" id="buffetExport">📥 Выгрузить продажи CSV</button></div></div>' +
      '<div class="card"><div class="card-title">📦 Товары и остатки</div>' +
      (items.length ? '<div class="table-responsive"><table><thead><tr><th>Товар</th><th>Цена</th><th>Остаток</th><th>Продать</th><th></th></tr></thead><tbody>' +
        items.map(function (p) { return '<tr><td>' + escapeHtml(p.name) + '</td><td>' + money(p.price) + '</td><td>' + Number(p.stock || 0) + '</td><td><button class="btn btn-cyan" type="button" data-buffet-sell="' + escapeHtml(p.id) + '" ' + (Number(p.stock) < 1 ? 'disabled' : '') + '>Продать 1</button></td><td><button class="btn btn-outline" type="button" data-buffet-delete="' + escapeHtml(p.id) + '">Удалить</button></td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p style="color:var(--text-secondary)">Товаров пока нет. Добавь первый товар выше.</p>') +
      '</div><div class="card"><div class="card-title">🧾 Продажи буфета</div><div class="feature-grid"><div class="feature-stat">Продано позиций<b>' + history.reduce(function (n, s) { return n + Number(s.quantity || 1); }, 0) + '</b></div><div class="feature-stat">Выручка буфета<b>' + money(total) + '</b></div></div>' +
      (history.length ? '<div class="table-responsive" style="margin-top:12px"><table><thead><tr><th>Время</th><th>Товар</th><th>Количество</th><th>Сумма</th></tr></thead><tbody>' + history.slice().reverse().slice(0,100).map(function (s) { return '<tr><td>' + escapeHtml(s.time) + '</td><td>' + escapeHtml(s.name) + '</td><td>' + Number(s.quantity || 1) + '</td><td>' + money(s.total) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p style="color:var(--text-secondary);margin-top:10px">Продаж пока нет.</p>') +
      '<div class="ops-actions" style="margin-top:12px"><button class="btn btn-outline" type="button" id="buffetClearSales">Очистить историю продаж</button></div></div>';
    el('buffetAdd').onclick = function () {
      var name = el('buffetName').value.trim(), price = Number(el('buffetPrice').value), stock = Number(el('buffetStock').value);
      if (!name || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) { alert('Укажи название, цену больше нуля и целый остаток от 0.'); return; }
      var list = products(); list.push({ id: 'buffet_' + Date.now() + '_' + Math.random().toString(36).slice(2,7), name: name, price: Math.round(price * 100) / 100, stock: stock, createdAt: new Date().toISOString() });
      saveProducts(list);
    };
    host.querySelectorAll('[data-buffet-sell]').forEach(function (button) {
      button.onclick = function () {
        var id = button.getAttribute('data-buffet-sell'), list = products(), p = list.find(function (x) { return x.id === id; });
        if (!p || Number(p.stock) < 1) return;
        p.stock = Number(p.stock) - 1; localStorage.setItem(PRODUCTS_KEY, JSON.stringify(list));
        var log = sales(); log.push({ id: 'sale_' + Date.now(), time: new Date().toLocaleString('ru-RU'), productId: p.id, name: p.name, quantity: 1, total: Number(p.price) });
        localStorage.setItem(SALES_KEY, JSON.stringify(log)); renderBuffet();
      };
    });
    host.querySelectorAll('[data-buffet-delete]').forEach(function (button) {
      button.onclick = function () {
        var p = products().find(function (x) { return x.id === button.getAttribute('data-buffet-delete'); });
        if (!p || !confirm('Удалить товар «' + p.name + '»? История продаж останется.')) return;
        saveProducts(products().filter(function (x) { return x.id !== p.id; }));
      };
    });
    el('buffetClearSales').onclick = function () {
      if (confirm('Очистить историю продаж буфета? Остатки товаров не изменятся.')) { localStorage.setItem(SALES_KEY, '[]'); renderBuffet(); }
    };
    el('buffetExport').onclick = function () {
      var rows = [['Время','Товар','Количество','Сумма BYN']].concat(sales().map(function (s) { return [s.time,s.name,s.quantity,s.total]; }));
      var csv = '\ufeff' + rows.map(function (row) { return row.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g,'""') + '"'; }).join(';'); }).join('\r\n');
      var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      var a = document.createElement('a'); a.href = url; a.download = 'prodazhi-bufeta.csv'; a.click(); URL.revokeObjectURL(url);
    };
  }
  function mountDesign() {
    var host = el('designApp');
    if (!host) return;
    host.innerHTML = '<div class="card"><div class="card-title">🎨 Настройка оформления</div><p style="color:var(--text-secondary);margin-bottom:14px">Меняй фон сайта, основной цвет кнопок и цвет при наведении курсора. Настройки сохраняются в этом браузере. Кликабельность существующих элементов и их обработчики не меняются.</p>' +
      '<div class="form-grid"><div class="form-group"><label for="themeBackground">Фон сайта</label><input id="themeBackground" type="color" value="#f4f7fb"></div>' +
      '<div class="form-group"><label for="themeAccent">Основной цвет кнопок</label><input id="themeAccent" type="color" value="#007aff"></div>' +
      '<div class="form-group"><label for="themeHover">Цвет кнопки при наведении</label><input id="themeHover" type="color" value="#0066d6"></div>' +
      '<div class="form-group"><label for="themeCard">Фон карточек</label><input id="themeCard" type="color" value="#ffffff"></div></div>' +
      '<div class="ops-actions" style="margin-top:14px"><button class="btn btn-cyan" type="button" id="themeApply">Применить оформление</button><button class="btn btn-outline" type="button" id="themeReset">Вернуть исходный дизайн</button></div></div>';
    el('themeApply').onclick = themeFromInputs;
    el('themeReset').onclick = function () { setTheme(defaults); };
    ['themeBackground','themeAccent','themeHover','themeCard'].forEach(function (id) { el(id).addEventListener('change', themeFromInputs); });
  }
  function init() {
    mountDesign(); renderBuffet(); renderTheme();
    document.addEventListener('click', function (event) {
      var tab = event.target.closest && event.target.closest('.tab-btn');
      if (tab && (tab.textContent.indexOf('Мини-буфет') >= 0 || tab.textContent.indexOf('Дизайн') >= 0)) {
        setTimeout(function () { renderBuffet(); renderTheme(); }, 0);
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
