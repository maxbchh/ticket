/* cash-fix.js — единая страховка автоматического закрытия кассы после успешного выпуска */
(function(){
  function forceClose(){
    const m=document.getElementById('cashRegisterModal');
    if(!m)return;
    if(typeof window.closeCashRegister==='function') window.closeCashRegister();
    m.classList.remove('open');
    m.hidden=true;
    m.setAttribute('aria-hidden','true');
    m.style.setProperty('display','none','important');
  }

  document.addEventListener('click', function(e){
    const btn=e.target && e.target.closest
      ? e.target.closest('button[onclick*="confirmCashPayment"]')
      : null;
    if(!btn)return;

    const before=window.state ? Number(window.state.lastTicketNum) : null;

    // Inline onclick="confirmCashPayment()" выполняется после capture/bubble,
    // поэтому проверяем результат уже после него.
    setTimeout(function(){
      const current=window.state ? Number(window.state.lastTicketNum) : null;
      if(before!==null && current!==before){
        forceClose();
        // Повторная проверка защищает от обработчика, который пытается вернуть окно.
        setTimeout(function(){
          if(window.state && Number(window.state.lastTicketNum)!==before) forceClose();
        },120);
      }
    },0);
  }, true);
})();