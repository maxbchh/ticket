/* Final cash-register fix: the last handler wins over older duplicate handlers. */
(function(){
  function hide(){
    const m=document.getElementById('cashRegisterModal');
    if(!m)return;
    m.classList.remove('open');
    m.hidden=true;
    m.setAttribute('aria-hidden','true');
    m.style.setProperty('display','none','important');
  }

  window.confirmCashPayment=function(){
    const price=Math.max(0,Number(document.getElementById('ticketPrice')?.value||0));
    const received=Math.max(0,Number(document.getElementById('cashReceivedInput')?.value||0));

    if(!window.state?.shiftActive){
      alert("Сначала откройте смену во вкладке «Журнал & Z-Отчёт».");
      return false;
    }
    if(window.__cashPaymentMethod==='cash' && received<price){
      alert('Недостаточно денег для оплаты билета.');
      return false;
    }

    const before=Number(window.state.lastTicketNum);
    try{
      window.processTicketSale();
    }finally{
      // Если билет был создан — закрываем кассу независимо от того,
      // какой из старых обработчиков processTicketSale сейчас активен.
      const after=Number(window.state.lastTicketNum);
      const issued=after!==before || window.state.tickets?.some(t=>Number(t.num)===before);
      if(issued){
        hide();
        window.__cashPaymentMethod=null;
      }
    }
    return true;
  };

  // Дополнительная страховка именно для этой кнопки.
  document.addEventListener('click',function(e){
    const b=e.target?.closest?.('button[onclick*="confirmCashPayment"]');
    if(!b)return;
    setTimeout(function(){
      const m=document.getElementById('cashRegisterModal');
      if(m && window.state?.tickets){
        // Если последний номер уже сдвинулся после нажатия — окно больше не нужно.
        const input=document.getElementById('cashReceivedInput');
        if(input && Number(input.value)>=Number(document.getElementById('ticketPrice')?.value||0)
           && !m.hidden && !m.classList.contains('open')) hide();
      }
    },0);
  },false);
})();