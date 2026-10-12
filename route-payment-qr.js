/* Generates the passenger route-purchase QR in the existing QR Codes tab. */
(function () {
  'use strict';
  window.showRoutePaymentQrCode = async function () {
    var panel = document.getElementById('routePaymentQrPanel');
    var holder = document.getElementById('routePaymentQrCode');
    if (!panel || !holder) return;
    var opening = panel.style.display === 'none' || !panel.style.display;
    panel.style.display = opening ? 'block' : 'none';
    if (!opening) return;
    try {
      if (typeof window.QRCode !== 'function') {
        await new Promise(function (resolve, reject) {
          var existing = document.querySelector('script[data-route-qr-library="1"]');
          if (existing) {
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', reject, { once: true });
            return;
          }
          var script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
          script.async = true;
          script.dataset.routeQrLibrary = '1';
          script.onload = resolve;
          script.onerror = function () { reject(new Error('QR library failed')); };
          document.head.appendChild(script);
        });
      }
      if (typeof window.QRCode !== 'function') throw new Error('QR library unavailable');
      holder.innerHTML = '';
      var url = new URL('qr-pay.html', window.location.href);
      url.search = '';
      url.hash = '';
      new window.QRCode(holder, {
        text: url.href,
        width: 220,
        height: 220,
        correctLevel: window.QRCode.CorrectLevel.M
      });
      var hint = panel.querySelector('[data-route-qr-link-hint]');
      if (!hint) {
        hint = document.createElement('p');
        hint.setAttribute('data-route-qr-link-hint', '1');
        hint.style.cssText = 'font-size:.82rem;color:var(--text-secondary);margin-top:10px;overflow-wrap:anywhere';
        holder.parentNode.insertBefore(hint, holder.nextSibling);
      }
      hint.textContent = 'Ссылка для пассажиров: ' + url.href + ' — распечатай этот код. Он открывает страницу выбора остановки назначения и способа оплаты.';
    } catch (_) {
      panel.style.display = 'block';
      holder.textContent = 'Не удалось создать QR-код. Проверь подключение к интернету и попробуй ещё раз.';
    }
  };
})();
