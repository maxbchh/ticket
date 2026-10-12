/* Local buffet inventory and safe visual customization; does not replace existing terminal functions. */
(function () {
  'use strict';
  var PRODUCTS_KEY = 'ticket_excursion_buffet_products_v1';
  var SALES_KEY = 'ticket_excursion_buffet_sales_v1';
  var CART_KEY = 'ticket_excursion_buffet_cart_v1';
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
  function chooseThemeColor(key, color) {
    var theme = Object.assign({}, defaults, read(THEME_KEY, {}));
    theme[key] = color;
    setTheme(theme);
    document.querySelectorAll('[data-theme-key="' + key + '"]').forEach(function (b) {
      b.classList.toggle('is-picked', b.getAttribute('data-color') === color);
      b.setAttribute('aria-pressed', b.getAttribute('data-color') === color ? 'true' : 'false');
    });
  }
  function renderTheme() {
    var theme = Object.assign({}, defaults, read(THEME_KEY, {}));
    setTheme(theme);
  }
  function products() { return read(PRODUCTS_KEY, []); }
  function sales() { return read(SALES_KEY, []); }
  function cart() { return read(CART_KEY, []); }
  function cartItems() { var list=products(), basket=cart(); return basket.map(function (entry) { var p=list.find(function (x) { return x.id===entry.productId; }); return p ? {productId:p.id,name:p.name,price:Number(p.price),quantity:Math.max(1,Math.floor(Number(entry.quantity)||1)),stock:Number(p.stock)||0} : null; }).filter(Boolean); }
  function cartTotal(items) { return Math.round(items.reduce(function (sum, item) { return sum+item.price*item.quantity; },0)*100)/100; }
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
      (items.length ? '<div class="table-responsive"><table><thead><tr><th>Товар</th><th>Цена</th><th>Остаток</th><th>Количество</th><th>Покупка</th><th></th></tr></thead><tbody>' +
        items.map(function (p) { return '<tr><td>' + escapeHtml(p.name) + '</td><td>' + money(p.price) + '</td><td>' + Number(p.stock || 0) + '</td><td><input type="number" min="1" max="' + Number(p.stock||0) + '" step="1" value="1" aria-label="Количество ' + escapeHtml(p.name) + '" data-buffet-qty="' + escapeHtml(p.id) + '" style="width:78px" ' + (Number(p.stock)<1?'disabled':'') + '></td><td><button class="btn btn-cyan" type="button" data-buffet-add-cart="' + escapeHtml(p.id) + '" ' + (Number(p.stock) < 1 ? 'disabled' : '') + '>＋ В покупку</button></td><td><button class="btn btn-outline" type="button" data-buffet-delete="' + escapeHtml(p.id) + '">Удалить</button></td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p style="color:var(--text-secondary)">Товаров пока нет. Добавь первый товар выше.</p>') +
      '</div><div class="card"><div class="card-title">🛒 Текущая покупка</div>' +
      (cartItems().length ? '<div class="table-responsive"><table><thead><tr><th>Товар</th><th>Цена</th><th>Количество</th><th>Сумма</th><th></th></tr></thead><tbody>' +
        cartItems().map(function (item) { return '<tr><td>' + escapeHtml(item.name) + '</td><td>' + money(item.price) + '</td><td>' + item.quantity + '</td><td>' + money(item.price*item.quantity) + '</td><td><button class="btn btn-outline" type="button" data-buffet-remove-cart="' + escapeHtml(item.productId) + '">Убрать</button></td></tr>'; }).join('') +
        '</tbody></table></div><div class="cash-register-total" style="margin:12px 0">Итого: ' + money(cartTotal(cartItems())) + '</div><div class="ops-actions"><button class="btn btn-green" type="button" id="buffetCheckout">💳 Перейти к оплате</button><button class="btn btn-outline" type="button" id="buffetClearCart">Очистить покупку</button></div>' :
        '<p style="color:var(--text-secondary)">Выбери товары выше и нажми «В покупку».</p>') + '</div><div class="card"><div class="card-title">🧾 Продажи буфета</div><div class="feature-grid"><div class="feature-stat">Продано позиций<b>' + history.reduce(function (n, s) { return n + Number(s.quantity || 1); }, 0) + '</b></div><div class="feature-stat">Выручка буфета<b>' + money(total) + '</b></div></div>' +
      (history.length ? '<div class="table-responsive" style="margin-top:12px"><table><thead><tr><th>Время</th><th>Товар</th><th>Количество</th><th>Сумма</th></tr></thead><tbody>' + history.slice().reverse().slice(0,100).map(function (s) { return '<tr><td>' + escapeHtml(s.time) + '</td><td>' + escapeHtml(s.name) + '</td><td>' + Number(s.quantity || 1) + '</td><td>' + money(s.total) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p style="color:var(--text-secondary);margin-top:10px">Продаж пока нет.</p>') +
      '<div class="ops-actions" style="margin-top:12px"><button class="btn btn-outline" type="button" id="buffetClearSales">Очистить историю продаж</button></div></div>';
    el('buffetAdd').onclick = function () {
      var name = el('buffetName').value.trim(), price = Number(el('buffetPrice').value), stock = Number(el('buffetStock').value);
      if (!name || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) { alert('Укажи название, цену больше нуля и целый остаток от 0.'); return; }
      var list = products(); list.push({ id: 'buffet_' + Date.now() + '_' + Math.random().toString(36).slice(2,7), name: name, price: Math.round(price * 100) / 100, stock: stock, createdAt: new Date().toISOString() });
      saveProducts(list);
    };
    host.querySelectorAll('[data-buffet-add-cart]').forEach(function (button) {
      button.onclick = function () {
        var id=button.getAttribute('data-buffet-add-cart'), p=products().find(function (x) { return x.id===id; });
        var input=host.querySelector('[data-buffet-qty="' + id + '"]'), qty=Math.floor(Number(input && input.value || 1));
        if(!p || qty<1 || qty>Number(p.stock||0)){alert('Проверь количество: оно должно быть от 1 до остатка товара.');return;}
        var basket=cart(), existing=basket.find(function (x) { return x.productId===id; });
        var already=existing?Number(existing.quantity)||0:0;
        if(already+qty>Number(p.stock||0)){alert('В покупке уже есть этот товар. Превышен доступный остаток.');return;}
        if(existing)existing.quantity=already+qty;else basket.push({productId:id,quantity:qty});
        localStorage.setItem(CART_KEY,JSON.stringify(basket));renderBuffet();
      };
    });
    host.querySelectorAll('[data-buffet-remove-cart]').forEach(function (button) {
      button.onclick=function(){localStorage.setItem(CART_KEY,JSON.stringify(cart().filter(function(x){return x.productId!==button.getAttribute('data-buffet-remove-cart');})));renderBuffet();};
    });
    var checkout=el('buffetCheckout');
    if(checkout)checkout.onclick=function(){
      var items=cartItems();
      if(!items.length)return;
      if(!window.openBuffetCashRegister){alert('Касса ещё загружается. Обнови страницу и попробуй снова.');return;}
      window.openBuffetCashRegister(cartTotal(items),items);
    };
    var clearCart=el('buffetClearCart');
    if(clearCart)clearCart.onclick=function(){if(confirm('Очистить текущую покупку?')){localStorage.setItem(CART_KEY,'[]');renderBuffet();}};
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
  window.completeBuffetPayment = function (items, method, total) {
    var list=products(), basketSales=sales();
    items.forEach(function (item) {
      var p=list.find(function (x) { return x.id===item.productId; });
      if(!p || Number(p.stock)<Number(item.quantity)) throw new Error('Недостаточный остаток товара: '+item.name);
    });
    var now=new Date().toLocaleString('ru-RU');
    items.forEach(function (item) {
      var p=list.find(function (x) { return x.id===item.productId; });
      p.stock=Number(p.stock)-Number(item.quantity);
      basketSales.push({id:'sale_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),time:now,productId:p.id,name:p.name,quantity:Number(item.quantity),total:Math.round(Number(item.price)*Number(item.quantity)*100)/100,paymentMethod:method});
    });
    localStorage.setItem(PRODUCTS_KEY,JSON.stringify(list));
    localStorage.setItem(SALES_KEY,JSON.stringify(basketSales));
    localStorage.setItem(CART_KEY,'[]');
    if(typeof window.addOperation==='function') {
      window.addOperation('Продажа буфета',items.map(function(x){return x.name+' × '+x.quantity;}).join(', '),Number(total),'Мини-буфет · '+(method==='card'?'Карта':'Наличные'));
    } else {
      var ops=read('conductor_operations',[]);ops.push({time:now,type:'Продажа буфета',ticket:items.map(function(x){return x.name+' × '+x.quantity;}).join(', '),amount:Number(total),conductor:read('conductor_name','Кондуктор'),details:'Мини-буфет · '+(method==='card'?'Карта':'Наличные')});localStorage.setItem('conductor_operations',JSON.stringify(ops));
    }
    renderBuffet();
  };
  function mountDesign() {
    var host = el('designApp');
    if (!host) return;
    var palette = [
      ['Белый','#ffffff'],['Слоновая кость','#fff4df'],['Песочный','#dfc7a0'],['Жёлтый','#ffd43b'],
      ['Оранжевый','#ff922b'],['Коралловый','#ff6b6b'],['Красный','#e03131'],['Розовый','#f06595'],
      ['Фуксия','#c2255c'],['Сиреневый','#b197fc'],['Фиолетовый','#7950f2'],['Индиго','#4c6ef5'],
      ['Синий','#228be6'],['Голубой','#74c0fc'],['Бирюзовый','#20c997'],['Мятный','#96f2d7'],
      ['Зелёный','#40c057'],['Лаймовый','#a9e34b'],['Оливковый','#808000'],['Коричневый','#8d5524'],
      ['Серый','#adb5bd'],['Графитовый','#495057'],['Тёмно-синий','#182848'],['Чёрный','#212529']
    ];
    function paletteHtml(key, title) {
      return '<div class="form-group"><label>' + title + '</label><div class="ticket-color-palette" role="group" aria-label="' + title + '">' +
        palette.map(function (p) { return '<button type="button" class="ticket-color-swatch" data-theme-key="' + key + '" data-color="' + p[1] + '" title="' + p[0] + '" aria-label="' + p[0] + '" style="--swatch:' + p[1] + '"></button>'; }).join('') +
        '</div></div>';
    }
    host.innerHTML = '<style>.ticket-color-palette{display:grid;grid-template-columns:repeat(8,minmax(24px,1fr));gap:8px;margin-top:8px}.ticket-color-swatch{height:30px;min-width:24px;border-radius:9px;border:2px solid rgba(100,116,139,.35);background:var(--swatch);cursor:pointer;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);transition:transform .12s,border-color .12s,box-shadow .12s}.ticket-color-swatch:hover{transform:scale(1.12);border-color:#111827;box-shadow:0 2px 8px #0002}.ticket-color-swatch.is-picked{outline:3px solid var(--accent-cyan);outline-offset:2px}.ticket-color-swatch[aria-label="Белый"]{border-color:#adb5bd}@media(max-width:520px){.ticket-color-palette{grid-template-columns:repeat(6,minmax(24px,1fr))}}</style>' +
      '<div class="card"><div class="card-title">🎨 Настройка оформления</div><p style="color:var(--text-secondary);margin-bottom:14px">Просто наведи курсор на цвет, чтобы увидеть его название, и нажми на понравившийся квадратик. Цвет применяется сразу — вводить коды не нужно.</p>' +
      paletteHtml('background','Фон сайта') + paletteHtml('accent','Основной цвет кнопок') + paletteHtml('hover','Цвет кнопок при наведении') + paletteHtml('card','Фон карточек') +
      '<div class="ops-actions" style="margin-top:14px"><button class="btn btn-outline" type="button" id="themeReset">Вернуть исходный дизайн</button></div></div>';
    host.querySelectorAll('[data-theme-key]').forEach(function (button) {
      button.addEventListener('click', function () {
        chooseThemeColor(button.getAttribute('data-theme-key'), button.getAttribute('data-color'));
      });
    });
    el('themeReset').onclick = function () { setTheme(defaults); };
    var current = Object.assign({}, defaults, read(THEME_KEY, {}));
    ['background','accent','hover','card'].forEach(function (key) {
      host.querySelectorAll('[data-theme-key="' + key + '"]').forEach(function (b) {
        var picked = b.getAttribute('data-color') === current[key];
        b.classList.toggle('is-picked', picked);
        b.setAttribute('aria-pressed', picked ? 'true' : 'false');
      });
    });
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
