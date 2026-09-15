/* Shared cloud state for the public ticket terminal. */
(() => {
  const SUPABASE_URL = "https://ubhfigqpsepnpokrbdyo.supabase.co";
  const SUPABASE_KEY = "sb_publishable_yN8W8pvQq8hWsYMO8z1Rzw_6zKQ-8D1";
  const TABLE = "ticket_shared_state";
  const ROW_ID = "main";

  function applyRemoteState(remote) {
    if (!remote || typeof remote !== "object") return;
    if (typeof state !== "undefined") {
      state = { ...state, ...remote };
      if (!Array.isArray(state.routes)) state.routes = [];
      if (!Array.isArray(state.tickets)) state.tickets = [];
      if (typeof state.lastTicketNum !== "number") state.lastTicketNum = 1001;
      if (typeof renderRoutesTable === "function") renderRoutesTable();
      if (typeof onTransportTypeChange === "function") onTransportTypeChange();
      if (typeof updateShiftStats === "function") updateShiftStats();
      if (typeof updatePreview === "function") updatePreview();
      if (typeof changePaperWidth === "function") changePaperWidth();
      const ids = { conductorName: "conductorName", terminalID: "terminalID", orgName: "orgName", ticketFooter: "ticketFooter", paperWidth: "paperWidthSelect" };
      Object.entries(ids).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el && state[key] !== undefined) el.value = state[key];
      });
      const badge = document.getElementById("shiftBadge");
      if (badge) {
        badge.className = state.shiftActive ? "badge badge-active" : "badge badge-closed";
        badge.innerText = state.shiftActive ? "СМЕНА ОТКРЫТА" : "СМЕНА ЗАКРЫТА";
      }
    }
  }

  async function boot() {
    if (!window.supabase || typeof state === "undefined") return;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    window.ticketCloud = client;

    const { data, error } = await client.from(TABLE).select("data").eq("id", ROW_ID).maybeSingle();
    if (!error && data && data.data && Object.keys(data.data).length) applyRemoteState(data.data);

    const originalSetItem = Storage.prototype.setItem;
    const originalClear = Storage.prototype.clear;
    let saving = false;
    let queued = false;

    async function saveCloud() {
      if (saving) { queued = true; return; }
      saving = true;
      try {
        const payload = { ...state };
        const result = await client.from(TABLE).upsert({ id: ROW_ID, data: payload, updated_at: new Date().toISOString() }, { onConflict: "id" });
        if (result.error) console.error("Supabase save error:", result.error);
      } finally {
        saving = false;
        if (queued) { queued = false; saveCloud(); }
      }
    }

    Storage.prototype.setItem = function(key, value) {
      originalSetItem.call(this, key, value);
      if (this === window.localStorage && !window.__ticketCloudLoading) saveCloud();
    };
    Storage.prototype.clear = function() {
      originalClear.call(this);
      if (this === window.localStorage) saveCloud();
    };

    window.addEventListener("beforeunload", () => { saveCloud(); });
    window.ticketCloudSave = saveCloud;
    console.log("☁️ Общая база билетов подключена");
  }

  function loadSdk() {
    if (window.supabase) return boot();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.onload = boot;
    s.onerror = () => console.error("Не удалось загрузить Supabase JS");
    document.head.appendChild(s);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadSdk, { once: true });
  else loadSdk();
})();
