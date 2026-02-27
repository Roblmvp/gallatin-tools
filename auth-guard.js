// ══════════════════════════════════════════════════════════════════════════════
// ServiceBridge Auth Guard v1.0
// Drop-in authentication module for all ServiceBridge pages.
// Uses Supabase Auth (JWT validation) — replaces legacy PIN/sessionStorage auth.
//
// USAGE: Include this <script> block in the <head> of every protected page,
// right after the Supabase JS SDK import. Then call:
//   const { currentUser, session, sbFetch } = await SB_AUTH.init({ requiredRole: 'any' });
//
// ══════════════════════════════════════════════════════════════════════════════

const SB_AUTH = (function() {
  const SB_URL = 'https://jbkgwtohwsbaorhvuuqb.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impia2d3dG9od3NiYW9yaHZ1dXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NjkwNDIsImV4cCI6MjA4NzU0NTA0Mn0.GRXOYbIuVDxU9-FEBYmyd1QmytVUrMIAxbnOSfepzuU';

  let _supabase = null;
  let _session = null;
  let _currentUser = null;

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

  // Authenticated fetch wrapper — attaches JWT to all Supabase REST calls
  async function sbFetch(path, options = {}) {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      redirect('login.html');
      throw new Error('No active session');
    }
    const url = path.startsWith('http') ? path : `${SB_URL}${path}`;
    const headers = {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + session.access_token,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    return fetch(url, { ...options, headers });
  }

  async function init(opts = {}) {
    const { requiredRole = 'any', onReady = null } = opts;
    const sb = getSupabase();

    // ── 1. Check for valid Supabase Auth session ──
    let session = null;
    try {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      session = data.session;
    } catch (e) {
      console.warn('[SB_AUTH] Session check failed:', e.message);
      session = null;
    }

    // ── 2. No session → redirect to login ──
    if (!session || !session.user) {
      // Clean up any legacy session artifacts
      sessionStorage.removeItem('sb_session');
      sessionStorage.removeItem('sb_rep');
      redirect('login.html');
      // Return a never-resolving promise to prevent page JS from executing
      return new Promise(() => {});
    }

    _session = session;

    // ── 3. Fetch user profile from user_profiles ──
    let profile = null;
    try {
      const res = await fetch(`${SB_URL}/rest/v1/user_profiles?auth_id=eq.${session.user.id}&select=*&limit=1`, {
        headers: {
          'apikey': SB_KEY,
          'Authorization': 'Bearer ' + session.access_token,
        }
      });
      const rows = await res.json();
      if (rows && rows.length > 0) {
        profile = rows[0];
      }
    } catch (e) {
      console.warn('[SB_AUTH] Profile fetch failed:', e.message);
    }

    // ── 4. Fallback: try matching by email if auth_id not linked yet ──
    if (!profile) {
      try {
        const email = session.user.email;
        if (email) {
          const res = await fetch(`${SB_URL}/rest/v1/user_profiles?email=ilike.${encodeURIComponent(email)}&select=*&limit=1`, {
            headers: {
              'apikey': SB_KEY,
              'Authorization': 'Bearer ' + session.access_token,
            }
          });
          const rows = await res.json();
          if (rows && rows.length > 0) {
            profile = rows[0];
            // Link auth_id for future lookups
            fetch(`${SB_URL}/rest/v1/user_profiles?id=eq.${profile.id}`, {
              method: 'PATCH',
              headers: {
                'apikey': SB_KEY,
                'Authorization': 'Bearer ' + session.access_token,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify({ auth_id: session.user.id })
            }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('[SB_AUTH] Email profile fallback failed:', e.message);
      }
    }

    // ── 5. Fallback: try matching by name from user metadata ──
    if (!profile) {
      try {
        const meta = session.user.user_metadata || {};
        const fullName = meta.full_name || meta.name || '';
        if (fullName) {
          const res = await fetch(`${SB_URL}/rest/v1/user_profiles?full_name=ilike.${encodeURIComponent(fullName)}&select=*&limit=1`, {
            headers: {
              'apikey': SB_KEY,
              'Authorization': 'Bearer ' + session.access_token,
            }
          });
          const rows = await res.json();
          if (rows && rows.length > 0) {
            profile = rows[0];
          }
        }
      } catch (e) {}
    }

    // ── 6. Build standardized currentUser ──
    const email = session.user.email || '';
    const meta = session.user.user_metadata || {};
    const name = profile?.full_name || profile?.name || meta.full_name || meta.name || email.split('@')[0] || 'User';
    const role = normalizeRole(profile?.role || meta.role);
    const first = name.split(' ')[0];

    _currentUser = {
      id: session.user.id,
      email: email,
      name: name,
      first: first,
      role: role,
      initials: makeInitials(name),
      profile_id: profile?.id || null,
      phone: profile?.phone || meta.phone || '',
      title: profile?.title || '',
      avatar_color: profile?.avatar_color || null,
    };

    // ── 7. Role-based access check ──
    if (requiredRole !== 'any') {
      const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
      const normalizedAllowed = allowed.map(r => normalizeRole(r));
      if (!normalizedAllowed.includes(_currentUser.role)) {
        // Not authorized for this page → redirect to home
        redirect('app.html');
        return new Promise(() => {});
      }
    }

    // ── 8. Expose globally for legacy page code ──
    window.currentUser = _currentUser;
    window.sbSession = _session;
    window.sbFetch = sbFetch;
    window.SB_URL = SB_URL;
    window.SB_KEY = SB_KEY;

    // ── 9. Set up sign-out function ──
    window.signOut = async function() {
      sessionStorage.removeItem('sb_session');
      sessionStorage.removeItem('sb_rep');
      await sb.auth.signOut();
      redirect('login.html');
    };

    // ── 10. Set up auth state listener for token refresh ──
    sb.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (!newSession) {
          redirect('login.html');
        } else {
          _session = newSession;
        }
      }
    });

    // ── 11. Callback ──
    if (onReady && typeof onReady === 'function') {
      onReady(_currentUser, _session);
    }

    return { currentUser: _currentUser, session: _session, sbFetch, supabase: sb };
  }

  // ── Public helper: get auth headers for raw fetch calls ──
  function getHeaders(extra = {}) {
    return {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + (_session ? _session.access_token : SB_KEY),
      'Content-Type': 'application/json',
      ...extra
    };
  }

  return { init, sbFetch, getHeaders, getSupabase, get currentUser() { return _currentUser; }, get session() { return _session; } };
})();
