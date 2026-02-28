// ══════════════════════════════════════════════════════════════════════════════
// ServiceBridge Auth Guard v1.1
// Drop-in authentication module for all ServiceBridge pages.
//
// Supports TWO auth modes:
//   1. Supabase Auth (JWT) — from email/password login (preferred)
//   2. Legacy sb_rep sessionStorage — from PIN login (backward-compat)
//
// The guard checks for a Supabase session first. If none exists, it falls
// back to the sb_rep key in sessionStorage. If neither exists, redirect
// to login.html.
//
// USAGE: Include this <script> in the <head> of every protected page,
// right after the Supabase JS SDK import. Then call:
//   const { currentUser } = await SB_AUTH.init({ requiredRole: 'any' });
//
// ══════════════════════════════════════════════════════════════════════════════

const SB_AUTH = (function() {
  const SB_URL = 'https://jbkgwtohwsbaorhvuuqb.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impia2d3dG9od3NiYW9yaHZ1dXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NjkwNDIsImV4cCI6MjA4NzU0NTA0Mn0.GRXOYbIuVDxU9-FEBYmyd1QmytVUrMIAxbnOSfepzuU';

  let _supabase = null;
  let _session = null;
  let _currentUser = null;
  let _authMode = null; // 'supabase' or 'legacy'

  function getSupabase() {
    if (!_supabase) {
      if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        _supabase = window.supabase.createClient(SB_URL, SB_KEY);
      } else {
        throw new Error('Supabase JS SDK not loaded. Add the <script> tag before auth-guard.');
      }
    }
    return _supabase;
  }

  function makeInitials(name) {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function normalizeRole(raw) {
    if (!raw) return 'Sales';
    const r = raw.trim().toLowerCase();
    if (r === 'admin' || r === 'administrator') return 'Admin';
    if (r === 'manager' || r === 's2s manager' || r === 'gsm') return 'Manager';
    return 'Sales';
  }

  function redirect(url) {
    const current = window.location.pathname.split('/').pop();
    if (current !== url) {
      window.location.replace(url || 'login.html');
    }
  }

  // Authenticated fetch wrapper — attaches JWT if available, anon key otherwise
  async function sbFetch(path, options = {}) {
    let token = SB_KEY;
    if (_authMode === 'supabase' && _session) {
      token = _session.access_token;
    } else {
      try {
        const sb = getSupabase();
        const { data: { session } } = await sb.auth.getSession();
        if (session) token = session.access_token;
      } catch(e) {}
    }
    const url = path.startsWith('http') ? path : `${SB_URL}${path}`;
    const headers = {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    return fetch(url, { ...options, headers });
  }

  async function init(opts = {}) {
    const { requiredRole = 'any', onReady = null } = opts;
    const sb = getSupabase();

    // ══════════════════════════════════════════════════════════
    // AUTH PATH 1: Check for valid Supabase Auth session (JWT)
    // ══════════════════════════════════════════════════════════
    let session = null;
    try {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      session = data.session;
    } catch (e) {
      console.warn('[SB_AUTH] Session check failed:', e.message);
      session = null;
    }

    if (session && session.user) {
      _session = session;
      _authMode = 'supabase';

      // Fetch user profile from user_profiles by auth_id
      let profile = null;
      try {
        const res = await fetch(`${SB_URL}/rest/v1/user_profiles?auth_id=eq.${session.user.id}&select=*&limit=1`, {
          headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + session.access_token }
        });
        const rows = await res.json();
        if (rows && rows.length > 0) profile = rows[0];
      } catch (e) {
        console.warn('[SB_AUTH] Profile fetch failed:', e.message);
      }

      // Fallback: match by email
      if (!profile) {
        try {
          const email = session.user.email;
          if (email) {
            const res = await fetch(`${SB_URL}/rest/v1/user_profiles?email=ilike.${encodeURIComponent(email)}&select=*&limit=1`, {
              headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + session.access_token }
            });
            const rows = await res.json();
            if (rows && rows.length > 0) {
              profile = rows[0];
              // Link auth_id for future lookups
              fetch(`${SB_URL}/rest/v1/user_profiles?id=eq.${profile.id}`, {
                method: 'PATCH',
                headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify({ auth_id: session.user.id })
              }).catch(() => {});
            }
          }
        } catch (e) {
          console.warn('[SB_AUTH] Email fallback failed:', e.message);
        }
      }

      // Fallback: match by name
      if (!profile) {
        try {
          const meta = session.user.user_metadata || {};
          const fullName = meta.full_name || meta.name || '';
          if (fullName) {
            const res = await fetch(`${SB_URL}/rest/v1/user_profiles?name=ilike.${encodeURIComponent(fullName)}&select=*&limit=1`, {
              headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + session.access_token }
            });
            const rows = await res.json();
            if (rows && rows.length > 0) profile = rows[0];
          }
        } catch (e) {}
      }

      // Build currentUser from Supabase session + profile
      const email = session.user.email || '';
      const meta = session.user.user_metadata || {};
      const name = profile?.name || meta.full_name || meta.name || email.split('@')[0] || 'User';
      const role = normalizeRole(profile?.role || meta.role);

      _currentUser = {
        id: session.user.id,
        email: email,
        name: name,
        first: name.split(' ')[0],
        role: role,
        initials: makeInitials(name),
        profile_id: profile?.id || null,
        phone: profile?.phone || meta.phone || '',
        title: profile?.title || '',
        avatar_color: profile?.avatar_color || null,
      };

      // Also sync to sb_rep for any legacy code that reads it
      sessionStorage.setItem('sb_rep', JSON.stringify({
        name: _currentUser.name,
        initials: _currentUser.initials,
        role: _currentUser.role,
        title: _currentUser.title,
        email: _currentUser.email,
      }));

    } else {

      // ══════════════════════════════════════════════════════════
      // AUTH PATH 2: Fallback to legacy sb_rep sessionStorage
      // ══════════════════════════════════════════════════════════
      const sbRep = sessionStorage.getItem('sb_rep');
      if (sbRep) {
        try {
          const rep = JSON.parse(sbRep);
          if (rep && rep.name) {
            _authMode = 'legacy';
            _session = null;
            _currentUser = {
              id: null,
              email: rep.email || '',
              name: rep.name,
              first: rep.name.split(' ')[0],
              role: normalizeRole(rep.role),
              initials: rep.initials || makeInitials(rep.name),
              profile_id: null,
              phone: '',
              title: rep.title || '',
              avatar_color: null,
            };
            console.info('[SB_AUTH] Using legacy session for:', rep.name);
          }
        } catch(e) {
          console.warn('[SB_AUTH] Could not parse sb_rep:', e.message);
        }
      }

      // ══════════════════════════════════════════════════════════
      // NO AUTH AT ALL → redirect to login
      // ══════════════════════════════════════════════════════════
      if (!_currentUser) {
        sessionStorage.removeItem('sb_session');
        sessionStorage.removeItem('sb_rep');
        redirect('login.html');
        return new Promise(() => {});
      }
    }

    // ── Role-based access check ──
    if (requiredRole !== 'any') {
      const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
      const normalizedAllowed = allowed.map(r => normalizeRole(r));
      if (!normalizedAllowed.includes(_currentUser.role)) {
        redirect('app.html');
        return new Promise(() => {});
      }
    }

    // ── Expose globally for page code ──
    window.currentUser = _currentUser;
    window.sbSession = _session;
    window.sbFetch = sbFetch;
    window.SB_URL = SB_URL;
    window.SB_KEY = SB_KEY;

    // ── Sign-out function ──
    window.signOut = async function() {
      sessionStorage.removeItem('sb_session');
      sessionStorage.removeItem('sb_rep');
      if (_authMode === 'supabase') {
        try { await sb.auth.signOut(); } catch(e) {}
      }
      redirect('login.html');
    };

    // ── Auth state listener (Supabase mode only) ──
    if (_authMode === 'supabase') {
      sb.auth.onAuthStateChange((event, newSession) => {
        if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          if (!newSession) {
            redirect('login.html');
          } else {
            _session = newSession;
          }
        }
      });
    }

    // ── Callback ──
    if (onReady && typeof onReady === 'function') {
      onReady(_currentUser, _session);
    }

    return { currentUser: _currentUser, session: _session, sbFetch, supabase: sb };
  }

  // Public helper: get auth headers for raw fetch calls
  function getHeaders(extra = {}) {
    return {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + (_session ? _session.access_token : SB_KEY),
      'Content-Type': 'application/json',
      ...extra
    };
  }

  return {
    init,
    sbFetch,
    getHeaders,
    getSupabase,
    get currentUser() { return _currentUser; },
    get session() { return _session; },
    get authMode() { return _authMode; }
  };
})();
