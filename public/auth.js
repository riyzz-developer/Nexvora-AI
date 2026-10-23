(() => {
  'use strict';
  const config = window.NEXVORA_CONFIG || {};
  const configured = config.SUPABASE_URL && config.SUPABASE_ANON_KEY &&
    !config.SUPABASE_URL.includes('YOUR_PROJECT_ID') &&
    !config.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
  const topRight = document.querySelector('.top-right');
  if (!topRight) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'tool-chip'; button.style.fontSize = '11px';
  button.textContent = 'Login Google'; button.setAttribute('aria-label','Login dengan Google');
  topRight.prepend(button);
  if (!configured || !window.supabase?.createClient) {
    button.title = 'Atur URL dan anon key Supabase di public/config.js';
    button.addEventListener('click', () => alert('Supabase belum dikonfigurasi. Isi SUPABASE_URL dan SUPABASE_ANON_KEY di public/config.js, lalu atur Google Provider di Supabase.'));
    return;
  }
  const client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  let user = null;
  let saveTimer = null;
  const localKey = 'nexvora.ai.conversations.v1';
  const safeJson = (s) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } };
  function localConversations() { return safeJson(localStorage.getItem(localKey) || '[]'); }
  function updateButton() {
    button.textContent = user ? (user.user_metadata?.full_name || user.email || 'Akun').slice(0,22) : 'Login Google';
    button.title = user ? 'Klik untuk logout' : 'Masuk dengan Google';
    button.setAttribute('aria-label', user ? 'Logout akun' : 'Login dengan Google');
  }
  async function login() {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { access_type: 'offline', prompt: 'consent' } }
    });
    if (error) alert('Login gagal: ' + error.message);
  }
  async function loadCloud() {
    if (!user) return;
    const { data, error } = await client.from('nexvora_conversations')
      .select('conversation_id,title,model,messages,updated_at').eq('user_id', user.id)
      .order('updated_at', { ascending: false }).limit(100);
    if (error) { console.error('Supabase load:', error.message); return; }
    const local = localConversations();
    const map = new Map();
    // Data lokal diprioritaskan untuk ID yang sama; data cloud lain ikut dimuat.
    for (const row of (data || [])) map.set(row.conversation_id, {
      id: row.conversation_id, title: row.title || 'Chat baru', model: row.model || 'openai/gpt-oss-20b',
      messages: Array.isArray(row.messages) ? row.messages : [], createdAt: row.updated_at, updatedAt: row.updated_at
    });
    for (const conv of local) map.set(conv.id, conv);
    const merged = [...map.values()].sort((a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)).slice(0,100);
    localStorage.setItem(localKey, JSON.stringify(merged));
    // Refresh tampilan melalui event kecil yang didengarkan UI utama.
    window.dispatchEvent(new CustomEvent('nexvora:cloud-loaded', { detail: { conversations: merged } }));
    await save(merged);
  }
  async function save(conversations) {
    if (!user || !Array.isArray(conversations)) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const rows = conversations.slice(0,100).map(c => ({
        user_id: user.id, conversation_id: String(c.id), title: String(c.title || 'Chat baru').slice(0,200),
        model: String(c.model || '').slice(0,100), messages: Array.isArray(c.messages) ? c.messages : [],
        updated_at: c.updatedAt || new Date().toISOString()
      }));
      if (!rows.length) return;
      const { error } = await client.from('nexvora_conversations').upsert(rows, { onConflict: 'user_id,conversation_id' });
      if (error) console.error('Supabase save:', error.message);
    }, 700);
  }
  button.addEventListener('click', async () => {
    if (!user) return login();
    if (confirm('Logout dari Nexvora AI?')) {
      const { error } = await client.auth.signOut();
      if (error) alert('Logout gagal: ' + error.message);
    }
  });
  client.auth.onAuthStateChange((_event, session) => {
    user = session?.user || null; updateButton();
    if (user) setTimeout(loadCloud, 0);
  });
  client.auth.getSession().then(({ data, error }) => {
    if (error) console.error(error.message);
    user = data.session?.user || null; updateButton(); if (user) loadCloud();
  });
  window.NexvoraCloud = { save, getUser: () => user };
  window.addEventListener('nexvora:cloud-loaded', (event) => {
    // Beritahu UI utama agar riwayat cloud langsung muncul tanpa reload.
    const history = document.getElementById('historyList');
    if (history) history.dispatchEvent(new CustomEvent('nexvora:refresh-history'));
  });
})();
