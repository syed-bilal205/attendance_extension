const API =
  "https://api.allorigins.win/raw?url=" +
  encodeURIComponent(
    "https://script.google.com/macros/s/AKfycbxu1zvIA5WME7s4EbxHCN5SZQn-fY3hM8g4gKqDwt5_he-GoAPVdph6P1v72v9YNSAzzw/exec",
  );

let sessionToken = "",
  meAdminId = "",
  meName = "",
  meRole = "";

// Clock
function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
updateClock();
setInterval(updateClock, 1000);

// Screen management
function showScreen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// Alert helpers
function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = "alert show alert-" + type;
}
function hideAlert(id) {
  document.getElementById(id).classList.remove("show");
}

// API helper
async function postAPI(body) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-cache",
    body: JSON.stringify(body),
  });
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Server returned unexpected response");
  }
}

function withAuth(payload) {
  return { ...payload, session_token: sessionToken, admin_id: meAdminId };
}

function initials(name) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join("");
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(mins) {
  if (!mins) return "—";
  const m = Math.round(mins);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
}

// LOGIN
async function doLogin() {
  const admin_id = document.getElementById("inp-adminid").value.trim();
  const password = document.getElementById("inp-password").value.trim();
  hideAlert("login-alert");
  if (!admin_id || !password) {
    showAlert("login-alert", "Please enter your Admin ID and password.", "err");
    return;
  }
  const btn = document.getElementById("btn-login");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Logging in...';
  try {
    const resp = await postAPI({
      action: "authLogin",
      payload: { admin_id, password, user_agent: navigator.userAgent },
    });
    if (resp && resp.ok) {
      sessionToken = resp.session_token || "";
      meAdminId = String(resp.admin_id || "").trim();
      meName = String(resp.name || "").trim();
      meRole = String(resp.role || "").trim();
      document.getElementById("main-avatar").textContent = initials(
        meName || meAdminId,
      );
      document.getElementById("main-name").textContent = meName || meAdminId;
      document.getElementById("main-role").textContent = meRole || "member";
      showScreen("screen-main");
      loadAttendance();
    } else {
      showAlert(
        "login-alert",
        resp?.error || "Login failed. Check your credentials.",
        "err",
      );
    }
  } catch (e) {
    showAlert("login-alert", "Connection error: " + String(e), "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "Login";
  }
}

// Allow Enter key on login
document.addEventListener("keydown", (e) => {
  if (
    e.key === "Enter" &&
    document.getElementById("screen-login").classList.contains("active")
  ) {
    doLogin();
  }
});

// LOAD ATTENDANCE
async function loadAttendance() {
  const badgeArea = document.getElementById("status-badge-area");
  const statsArea = document.getElementById("stats-area");
  badgeArea.innerHTML =
    '<span class="status-badge badge-none">Loading...</span>';
  statsArea.innerHTML = "";
  hideAlert("action-alert");
  document.getElementById("btn-signin").disabled = true;
  document.getElementById("btn-signout").disabled = true;

  try {
    const resp = await postAPI({
      action: "getMyAttendanceToday",
      payload: withAuth({}),
    });
    if (!resp || !resp.ok) {
      badgeArea.innerHTML =
        '<span class="status-badge badge-out">Could not load</span>';
      document.getElementById("btn-signin").disabled = false;
      return;
    }

    const rows = resp.rows || [];
    const active = rows.find(
      (r) =>
        String(r.status_raw || "")
          .trim()
          .toLowerCase() === "active",
    );

    if (!rows.length) {
      badgeArea.innerHTML =
        '<span class="status-badge badge-none">No record today</span>';
      statsArea.innerHTML =
        '<div style="font-family:var(--font-mono);font-size:13px;color:var(--muted);margin-top:8px;">Ready to sign in for today.</div>';
      document.getElementById("btn-signin").disabled = false;
      return;
    }

    if (active) {
      badgeArea.innerHTML =
        '<span class="status-badge badge-active">Signed in</span>';
      statsArea.innerHTML = `
        <div class="stat-grid">
          <div class="stat-item"><div class="stat-label">Since</div><div class="stat-value">${fmtTime(active.signin_at_iso)}</div></div>
          <div class="stat-item"><div class="stat-label">Status</div><div class="stat-value" style="color:var(--accent)">Active</div></div>
        </div>`;
      document.getElementById("btn-signout").disabled = false;
    } else {
      const latest = [...rows].sort(
        (a, b) =>
          (Date.parse(b.signin_at_iso || "") || 0) -
          (Date.parse(a.signin_at_iso || "") || 0),
      )[0];
      badgeArea.innerHTML =
        '<span class="status-badge badge-out">Signed out</span>';
      statsArea.innerHTML = `
        <div class="stat-grid">
          <div class="stat-item"><div class="stat-label">Sign in</div><div class="stat-value">${fmtTime(latest.signin_at_iso)}</div></div>
          <div class="stat-item"><div class="stat-label">Sign out</div><div class="stat-value">${fmtTime(latest.signout_at_iso)}</div></div>
          <div class="stat-item"><div class="stat-label">Duration</div><div class="stat-value">${fmtDuration(latest.duration_minutes)}</div></div>
          <div class="stat-item"><div class="stat-label">Sessions</div><div class="stat-value">${rows.length}</div></div>
        </div>`;
      document.getElementById("btn-signin").disabled = false;
    }
  } catch (e) {
    badgeArea.innerHTML = '<span class="status-badge badge-out">Error</span>';
    showAlert("action-alert", "Failed to load attendance: " + String(e), "err");
    document.getElementById("btn-signin").disabled = false;
  }
}

// SIGN IN
async function doSignIn() {
  const btn = document.getElementById("btn-signin");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Signing in...';
  hideAlert("action-alert");
  try {
    const resp = await postAPI({
      action: "signIn",
      payload: withAuth({ source: "mobile" }),
    });
    if (resp && resp.ok) {
      showAlert("action-alert", "Signed in successfully!", "ok");
      await loadAttendance();
    } else {
      showAlert("action-alert", resp?.error || "Failed to sign in.", "err");
      btn.disabled = false;
    }
  } catch (e) {
    showAlert("action-alert", "Error: " + String(e), "err");
    btn.disabled = false;
  } finally {
    btn.textContent = "Sign In";
  }
}

// SIGN OUT REASON SCREEN
function showReasonScreen() {
  document.getElementById("inp-reason-type").value = "";
  document.getElementById("inp-reason-text").value = "";
  hideAlert("reason-alert");
  showScreen("screen-reason");
}

function hideReasonScreen() {
  showScreen("screen-main");
}

// SIGN OUT
async function doSignOut() {
  const reason_type = document.getElementById("inp-reason-type").value;
  const reason_text = document.getElementById("inp-reason-text").value.trim();
  const btn = document.getElementById("btn-confirm-signout");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Signing out...';
  hideAlert("reason-alert");
  try {
    const resp = await postAPI({
      action: "signOut",
      payload: withAuth({ reason_type, reason_text }),
    });
    if (resp && resp.ok) {
      showScreen("screen-main");
      showAlert("action-alert", "Signed out successfully!", "ok");
      await loadAttendance();
    } else {
      showAlert("reason-alert", resp?.error || "Failed to sign out.", "err");
    }
  } catch (e) {
    showAlert("reason-alert", "Error: " + String(e), "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm sign out";
  }
}

// LOGOUT
function doLogout() {
  sessionToken = "";
  meAdminId = "";
  meName = "";
  meRole = "";
  document.getElementById("inp-password").value = "";
  hideAlert("login-alert");
  showScreen("screen-login");
}
