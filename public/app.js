/* ══════════════════════════════════════════════
   Transit AI — app.js
   Full-stack JavaScript Client calling Node.js Express APIs
   ══════════════════════════════════════════════ */

// ═══════════════════════════════════════════════
// 1. APP DATA — constants that never change
// ═══════════════════════════════════════════════

const FARES = {
  'General':        20,
  'Ladies':         18,
  'Senior Citizen': 15
};

const TOTAL_SEATS = 52;

const STOPS = [
  'Gandhipuram', 'Coimbatore Jn', 'Ukkadam',
  'Peelamedu', 'Eachanari', 'Madhampatti',
  'Alandurai', 'Negamam', 'Kinathukadavu',
  'Sultanpet', 'Vettaikaranpudur', 'Pollachi'
];

const FLEET = [
  { route: 'Route 21C', busId: 'TN37-AB-1234', driver: 'Murugan R.',  from: 'Gandhipuram', to: 'Pollachi',      stops: ['Gandhipuram','Ukkadam','Kinathukadavu','Pollachi'] },
  { route: 'Route 5',   busId: 'TN38-CD-5678', driver: 'Rajan S.',    from: 'Ukkadam',     to: 'Alandurai',     stops: ['Ukkadam','Madhampatti','Alandurai'] },
  { route: 'Route 47A', busId: 'TN37-EF-9012', driver: 'Selvam K.',   from: 'Peelamedu',   to: 'Negamam',       stops: ['Peelamedu','Eachanari','Kinathukadavu','Negamam'] },
  { route: 'Route 12B', busId: 'TN38-GH-3456', driver: 'Pandian M.',  from: 'Coimbatore Jn', to: 'Sultanpet',     stops: ['Coimbatore Jn','Eachanari','Sultanpet'] },
  { route: 'Route 70',  busId: 'TN37-IJ-7890', driver: 'Vikram A.',   from: 'Pollachi',    to: 'Vettaikaranpudur', stops: ['Pollachi','Kinathukadavu','Vettaikaranpudur'] },
  { route: 'Route 9',   busId: 'TN38-KL-2345', driver: 'Suresh P.',   from: 'Gandhipuram', to: 'Madhampatti',   stops: ['Gandhipuram','Peelamedu','Coimbatore Jn','Madhampatti'] },
  { route: 'Route 15M', busId: 'TN37-MN-6789', driver: 'Ganesan T.',  from: 'Pollachi',    to: 'Negamam',       stops: ['Pollachi','Vettaikaranpudur','Negamam'] }
];


// ═══════════════════════════════════════════════
// 2. STATE — synchronised with backend server
// ═══════════════════════════════════════════════

let state = {
  currentUser: null,  // the logged-in user details
  tickets:     [],    // booked tickets
  scanHistory: [],    // scanned tickets
  scanCounts:  { valid: 0, invalid: 0, used: 0 },
  alerts:      [],    // active arrival alerts
  busData:     [],    // live bus coordinate details
  qty:         1,     // booking seat count
  theme:       'light',
  liveTimer:   null,
  lowBandwidth: false,
  bytesSaved:   0,
  skippedPolls: 0,
  mapHover:     null,
  mapLayerHeatmap: true,
  mapLayerGrid: true,
  mapLayerPackets: true
};

// Converts API responses safely. A static file server (for example VS Code
// Live Server) cannot run this application's Node API, so show an actionable
// message rather than the unhelpful "Unexpected end of JSON input" error.
async function readApiResponse(response) {
  const body = await response.text();
  let data = null;

  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    throw new Error('The server returned an invalid response. Open the app with "npm run dev" locally, or deploy it as a Render Web Service.');
  }

  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  if (!data) {
    throw new Error('The server returned an empty response. Use the Node server, not VS Code Live Server.');
  }
  return data;
}


// ═══════════════════════════════════════════════
// 3. PERSISTENCE FALLBACKS & PREFERENCES
// ═══════════════════════════════════════════════

function saveData() {
  try {
    localStorage.setItem('sb_theme', state.theme);
    localStorage.setItem('sb_low_bandwidth', state.lowBandwidth ? 'true' : 'false');
    if (state.currentUser) {
      localStorage.setItem('sb_session', state.currentUser.id);
    } else {
      localStorage.removeItem('sb_session');
    }
  } catch (e) {
    console.warn('Could not save theme/session:', e);
  }
}

// ═══════════════════════════════════════════════
// 4. APP START — fetches full-stack state
// ═══════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function () {
  state.theme = localStorage.getItem('sb_theme') || 'light';
  applyTheme(state.theme);
  startClock();

  const sessionId = localStorage.getItem('sb_session');
  if (sessionId) {
    // Resume session from Node.js backend API
    fetch('/api/state/' + sessionId)
      .then(res => {
        if (!res.ok) throw new Error();
        return readApiResponse(res);
      })
      .then(data => {
        state.currentUser = data.user;
        state.tickets     = data.tickets;
        state.alerts      = data.alerts;
        state.scanHistory = data.scanHistory;
        state.scanCounts  = data.scanCounts;
        state.busData     = data.busData;

        openApp();
      })
      .catch(() => {
        localStorage.removeItem('sb_session');
        show('auth-screen');
        hide('main-app');
        hide('ai-fab');
        hide('ai-panel');
      });
  } else {
    // Public view: pull live bus metrics for display
    fetch('/api/buses')
      .then(readApiResponse)
      .then(data => {
        state.busData = data.busData;
      })
      .catch(() => {
        buildBusData();
      })
      .finally(() => {
        show('auth-screen');
        hide('main-app');
        hide('ai-fab');
        hide('ai-panel');
      });
  }
});


// ═══════════════════════════════════════════════
// 5. AUTH — Login, Signup, Logout
// ═══════════════════════════════════════════════

function showTab(tab) {
  if (tab === 'login') {
    show('login-form');
    hide('signup-form');
    document.getElementById('tab-login').classList.add('active');
    document.getElementById('tab-signup').classList.remove('active');
  } else {
    hide('login-form');
    show('su-form'); // Wait, let's check su-form vs signup-form in HTML
    show('signup-form');
    document.getElementById('tab-login').classList.remove('active');
    document.getElementById('tab-signup').classList.add('active');
  }
}

function doLogin() {
  const id = val('login-id').trim();
  const pw = val('login-pw').trim();

  if (!id || !pw) return toast('Please fill in all fields', 'error');

  fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, pw })
  })
  .then(async res => {
    if (!res.ok) {
      return readApiResponse(res);
    }
    return readApiResponse(res);
  })
  .then(data => {
    state.currentUser = data.user;
    localStorage.setItem('sb_session', data.user.id);
    return fetch('/api/state/' + data.user.id);
  })
  .then(readApiResponse)
  .then(data => {
    state.tickets     = data.tickets;
    state.alerts      = data.alerts;
    state.scanHistory = data.scanHistory;
    state.scanCounts  = data.scanCounts;
    state.busData     = data.busData;

    openApp();
    toast('Logged in successfully!', 'success');
  })
  .catch(err => {
    toast(err.message, 'error');
  });
}

function doSignup() {
  const name  = val('su-name').trim();
  const phone = val('su-phone').trim();
  const email = val('su-email').trim();
  const pw    = val('su-pw').trim();
  const pw2   = val('su-pw2').trim();
  const home  = val('su-home');

  if (!name || !phone || !email || !pw) return toast('Please fill in all fields', 'error');
  if (name.length < 2)                  return toast('Name is too short', 'error');
  if (!/^\d{10}$/.test(phone))          return toast('Phone must be exactly 10 digits', 'error');
  if (!/\S+@\S+\.\S+/.test(email))      return toast('Please enter a valid email address', 'error');
  if (pw.length < 6)                    return toast('Password must be at least 6 characters', 'error');
  if (pw !== pw2)                       return toast('Passwords do not match', 'error');

  fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, email, pw, home })
  })
  .then(async res => {
    if (!res.ok) {
      return readApiResponse(res);
    }
    return readApiResponse(res);
  })
  .then(data => {
    state.currentUser = data.user;
    localStorage.setItem('sb_session', data.user.id);
    return fetch('/api/state/' + data.user.id);
  })
  .then(readApiResponse)
  .then(data => {
    state.tickets     = data.tickets;
    state.alerts      = data.alerts;
    state.scanHistory = data.scanHistory;
    state.scanCounts  = data.scanCounts;
    state.busData     = data.busData;

    openApp();
    toast('Account created! Welcome, ' + name.split(' ')[0] + '! 🎉', 'success');
  })
  .catch(err => {
    toast(err.message, 'error');
  });
}

function doLogout() {
  clearInterval(state.liveTimer);
  state.currentUser = null;
  localStorage.removeItem('sb_session');
  closeMenu();
  hide('main-app');
  show('auth-screen');
  hide('ai-fab');
  hide('ai-panel');
  aiChatOpen = false;
  toast('Logged out successfully', 'info');
}

function openApp() {
  hide('auth-screen');
  show('main-app');
  updateUserUI();
  setTodayDate();
  initSeatTypeClicks();
  calcFare();

  // Restore Low-Bandwidth state
  const lbPref = localStorage.getItem('sb_low_bandwidth');
  if (lbPref === 'true') {
    state.lowBandwidth = true;
  } else {
    state.lowBandwidth = false;
  }

  startLiveUpdates();
  showPage('about');

  if (state.currentUser.home) {
    setVal('track-stop', state.currentUser.home);
    setVal('alert-stop', state.currentUser.home);
  }

  updateSeatBar();
  updateEcoMetricsUI();
  show('ai-fab');
}

function updateUserUI() {
  const u = state.currentUser;
  if (!u) return;

  const initials = u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  setTxt('user-av', initials);
  setTxt('user-nm', u.name.split(' ')[0]);
  setTxt('menu-name', u.name);
  setTxt('menu-email', u.email || u.phone);

  const adminTab = document.getElementById('nav-admin');
  if (adminTab) adminTab.style.display = u.role === 'admin' ? 'flex' : 'none';
}

function toggleMenu() {
  const menu = document.getElementById('user-menu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// Ensure toggleMenu is globally accessible (inline onclick is used in html)
window.toggleMenu = toggleMenu;

function closeMenu() {
  hide('user-menu');
}

document.addEventListener('click', function (e) {
  if (!e.target.closest('.user-pill') && !e.target.closest('.user-menu')) {
    closeMenu();
  }
});


// ═══════════════════════════════════════════════
// 6. NAVIGATION — switching pages
// ═══════════════════════════════════════════════

function showPage(name) {
  document.querySelectorAll('.page').forEach(function (p) {
    p.classList.remove('active');
  });

  document.querySelectorAll('.nav-btn').forEach(function (b) {
    b.classList.remove('active');
  });

  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');

  const btn = document.getElementById('nav-' + name);
  if (btn) btn.classList.add('active');



  if (name === 'track')     { renderBusCards(); drawMap(); renderAlertList(); updateEcoMetricsUI(); }
  if (name === 'scan')      { renderScanHistory(); renderCondSeats(); }
  if (name === 'mytickets') { renderMyTickets(); }
  if (name === 'admin')     { renderAdminPage(); }
  if (name === 'book')      { updateSeatBar(); calcFare(); }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Make navigation functions global
window.showPage = showPage;
window.showTab = showTab;
window.doLogin = doLogin;
window.doSignup = doSignup;
window.doLogout = doLogout;
window.swapStops = swapStops;
window.changeQty = changeQty;
window.bookTicket = bookTicket;
window.saveTicket = saveTicket;
window.resetBook = resetBook;
window.validateTicket = validateTicket;
window.simulateScan = simulateScan;
window.clearScanHistory = clearScanHistory;
window.renderCondSeats = renderCondSeats;
window.cancelTicket = cancelTicket;
window.exportCSV = exportCSV;
window.confirmClear = confirmClear;
window.closeConfirm = closeConfirm;
window.addAlert = addAlert;
window.removeAlert = removeAlert;
window.refreshBuses = refreshBuses;
window.toggleTheme = toggleTheme;
window.toggleLowBandwidth = toggleLowBandwidth;


// ═══════════════════════════════════════════════
// 7. CLOCK — live local time clock
// ═══════════════════════════════════════════════

function startClock() {
  const el = document.getElementById('clock');
  if (!el) return;

  function tick() {
    el.textContent = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
  tick();
  setInterval(tick, 1000);
}


// ═══════════════════════════════════════════════
// 8. THEME TOGGLE — light/dark custom attributes
// ═══════════════════════════════════════════════

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  applyTheme(state.theme);
  saveData();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}


// ═══════════════════════════════════════════════
// 9. LIVE BUS TELEMETRY SIMULATOR & FETCHER
// ═══════════════════════════════════════════════

function buildBusData() {
  state.busData = FLEET.map(function (bus) {
    const filled = Math.floor(Math.random() * 25) + 10;
    return {
      route:       bus.route,
      busId:       bus.busId,
      driver:      bus.driver,
      from:        bus.from,
      to:          bus.to,
      stops:       bus.stops,
      filled:      filled,
      free:        TOTAL_SEATS - filled,
      total:       TOTAL_SEATS,
      status:      'moving',
      nearStop:    bus.stops[0],
      etaMin:      Math.floor(Math.random() * 12) + 3,
      seatMap:     makeSeatMap(filled)
    };
  });
}

function makeSeatMap(filledCount) {
  const seats = Array(TOTAL_SEATS).fill('free');
  for (let i = 0; i < 4; i++) seats[i] = 'ladies';
  let count = 0;
  for (let i = 4; i < TOTAL_SEATS; i++) {
    if (count >= filledCount) break;
    seats[i] = 'occupied';
    count++;
  }
  return seats;
}

function startLiveUpdates() {
  updateBuses();
  if (state.liveTimer) clearInterval(state.liveTimer);
  const interval = state.lowBandwidth ? 30000 : 8000;
  state.liveTimer = setInterval(updateBuses, interval);
}

// Synchronises with Node.js Express Server
function updateBuses() {
  if (!state.currentUser) return;

  fetch('/api/buses')
    .then(readApiResponse)
    .then(data => {
      state.busData = data.busData;
      setTxt('refresh-time', new Date().toLocaleTimeString('en-IN'));
      checkAlerts();

      if (state.lowBandwidth) {
        state.bytesSaved += 14.3; // Roughly 14.3 KB saved compared to full realtime 8s polling
        updateEcoMetricsUI();
      }

      const trackPage = document.getElementById('page-track');
      if (trackPage && trackPage.classList.contains('active')) {
        renderBusCards();
        drawMap();
      }

      const scanPage = document.getElementById('page-scan');
      if (scanPage && scanPage.classList.contains('active')) {
        renderCondSeats();
      }

      const bookPage = document.getElementById('page-book');
      if (bookPage && bookPage.classList.contains('active')) {
        updateSeatBar();
      }
    })
    .catch(err => console.error('Error synchronising live telemetry:', err));
}

function refreshBuses() {
  fetch('/api/buses/refresh', { method: 'POST' })
    .then(readApiResponse)
    .then(data => {
      state.busData = data.busData;
      toast('Live bus data synchronised with server!', 'info');
      updateBuses();
    })
    .catch(() => {
      toast('Could not refresh bus data from server', 'error');
    });
}


// ═══════════════════════════════════════════════
// 10. TRACK PAGE — render bus cards and maps
// ═══════════════════════════════════════════════

function renderBusCards() {
  const grid = document.getElementById('bus-grid');
  if (!grid) return;

  const stopFilter = val('track-stop');
  const destFilter = val('track-dest');

  let buses = state.busData;
  if (stopFilter) buses = buses.filter(b => b.stops.includes(stopFilter));
  if (destFilter) buses = buses.filter(b => b.stops.includes(destFilter));

  if (!buses.length) {
    grid.innerHTML = `
      <div class="card" style="grid-column:1/-1;text-align:center;padding:3rem">
        <div style="font-size:40px;margin-bottom:12px">🚌</div>
        <h4>No buses found for this stop</h4>
        <p style="color:#888;margin-top:6px">Try a different stop or check All stops</p>
      </div>`;
    return;
  }

  grid.innerHTML = buses.map(function (bus) {
    const pct       = Math.round((bus.filled / bus.total) * 100);
    const fillClass = pct >= 90 ? 'fill-red' : pct >= 70 ? 'fill-amber' : 'fill-green';
    const cardClass = pct >= 90 ? 'full'     : pct >= 70 ? 'crowded'   : '';
    const statusDot = bus.status === 'moving' ? 'moving' : 'stopped';
    const speedText = bus.speed > 0 ? `⚡ ${bus.speed} km/h` : '🛑 Stopped';
    const seatMsg   = pct >= 90
      ? '🔴 Bus is Full — wait for next'
      : pct >= 70
        ? `🟡 Only <strong>${bus.free}</strong> seats left — hurry!`
        : `🟢 <strong>${bus.free}</strong> seats available`;

    const amenitiesHTML = (bus.amenities || [])
      .map(am => `<span class="bc-amenity-badge">${am}</span>`)
      .join('');

    return `
      <div class="bus-card ${cardClass}" onclick="quickBook('${bus.route}','${bus.from}','${bus.to}')">
        <div class="bc-top">
          <div>
            <div class="bc-route" style="display:flex; align-items:center; gap:6px;">
              ${bus.route}
              <span class="bc-speed-pill">${speedText}</span>
            </div>
            <div class="bc-id">${bus.busId} • <span style="font-size:10px; font-weight:700; color:var(--blue);">${bus.type || "Express"}</span></div>
          </div>
          <div class="status-dot ${statusDot}"></div>
        </div>

        <div class="bc-stops">${bus.from} → ${bus.to}</div>
        
        <div style="font-size: 11px; color: var(--muted); margin: -4px 0 10px; font-weight: 600; display:flex; gap:12px; flex-wrap:wrap;">
          <span>📏 ${bus.distance || "15 km"}</span>
          <span>⏱️ ${bus.duration || "45 mins"}</span>
          <span>⭐ ${bus.driverRating || "4.5"} (${bus.driver})</span>
        </div>

        <div class="bc-gps" style="margin-bottom:10px">
          <div class="gps-dot"></div>
          <div>
            <div class="bc-loc">Near ${bus.nearStop}</div>
            <div class="bc-eta">ETA to next stop: ~${bus.etaMin} min</div>
          </div>
        </div>

        <div class="bc-amenity-list">
          ${amenitiesHTML}
        </div>

        <div class="bc-seats-label" style="margin-top:8px">
          <span>💺 Seats Available</span>
          <span style="color:${pct>=90?'#DC2626':pct>=70?'#D97706':'#16A34A'};font-weight:700">
            ${bus.filled}/${bus.total} filled
          </span>
        </div>
        <div class="bar-track">
          <div class="bar-fill ${fillClass}" style="width:${pct}%"></div>
        </div>

        <div class="bc-footer" style="margin-top:10px">
          <span style="font-size:12px">${seatMsg}</span>
          <button class="bc-book" onclick="event.stopPropagation();quickBook('${bus.route}','${bus.from}','${bus.to}')">
            🎫 Book
          </button>
        </div>
      </div>`;
  }).join('');
}

function quickBook(route, from, to) {
  setVal('b-from', from);
  setVal('b-to', to);
  setVal('b-route', route);
  showPage('book');
  updateSeatBar();
  toast('Route pre-filled: ' + route, 'info');
}

// Make quickBook globally accessible
window.quickBook = quickBook;

function drawMap() {
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;

  // Bind mouse move once
  if (!canvas.dataset.listenerBound) {
    canvas.addEventListener('mousemove', function (e) {
      if (state.lowBandwidth) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
      const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

      const W = canvas.width;
      const cols = 4;
      const rowHeight = 65;
      const stopPos = STOPS.map(function (stop, i) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        return {
          name: stop,
          x: 50 + col * ((W - 100) / (cols - 1)),
          y: 40 + row * rowHeight
        };
      });

      let found = null;

      // Check buses first
      state.busData.forEach(function (bus, i) {
        const stopIndex = STOPS.indexOf(bus.nearStop);
        if (stopIndex >= 0) {
          const sp = stopPos[stopIndex];
          const offsetX = Math.sin(i * 1.2) * 14;
          const offsetY = -28;
          const busX = sp.x + offsetX;
          const busY = sp.y + offsetY;
          const dist = Math.hypot(mouseX - busX, mouseY - (busY - 5));
          if (dist < 20) {
            found = { type: 'bus', info: bus, x: busX, y: busY };
          }
        }
      });

      // Check stops
      if (!found) {
        stopPos.forEach(function (sp) {
          const dist = Math.hypot(mouseX - sp.x, mouseY - sp.y);
          if (dist < 18) {
            found = { type: 'stop', info: sp, x: sp.x, y: sp.y };
          }
        });
      }

      state.mapHover = found;
    });

    canvas.addEventListener('mouseleave', function () {
      state.mapHover = null;
    });

    canvas.addEventListener('click', function () {
      if (state.mapHover && state.mapHover.type === 'stop') {
        const stopSelect = document.getElementById('track-stop');
        if (stopSelect) {
          stopSelect.value = state.mapHover.info.name;
          stopSelect.dispatchEvent(new Event('change'));
          toast('Selected station: ' + state.mapHover.info.name, 'success');
        }
      }
    });

    canvas.dataset.listenerBound = 'true';
  }

  // Start animation loop if not running
  if (!mapAnimationId) {
    runMapAnimation();
  }
}

let mapAnimationId = null;
function runMapAnimation() {
  const canvas = document.getElementById('map-canvas');
  if (!canvas) {
    mapAnimationId = null;
    return;
  }
  if (state.lowBandwidth) {
    drawMapBody(); // draw once
    mapAnimationId = null;
    return;
  }
  drawMapBody();
  mapAnimationId = requestAnimationFrame(runMapAnimation);
}

function drawMapBody() {
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;

  canvas.width  = canvas.offsetWidth || 800;
  canvas.height = 240;
  const ctx  = canvas.getContext('2d');
  const W    = canvas.width;
  const H    = canvas.height;
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';

  if (state.lowBandwidth) {
    // Render a lightweight eco mode placeholder to completely suspend heavy frame loop drawings and animation paint cycles
    ctx.fillStyle = dark ? '#111827' : '#F9FAFB';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    ctx.fillStyle = '#10B981';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📶 ECO-TRANSIT & LOW BANDWIDTH MODE ACTIVE', W / 2, H / 2 - 25);

    ctx.fillStyle = dark ? '#9CA3AF' : '#4B5563';
    ctx.font = '11px sans-serif';
    ctx.fillText('Canvas Render and Position Polling is suspended to conserve battery, CPU cycles,', W / 2, H / 2 + 5);
    ctx.fillText('and valuable mobile data. Text status and ETAs are fully synchronized above.', W / 2, H / 2 + 25);

    // Render a neat progress bar showing saved bytes
    ctx.fillStyle = '#10B981';
    ctx.fillRect(W / 2 - 100, H / 2 + 45, Math.min(200, state.bytesSaved * 2), 6);
    ctx.strokeStyle = dark ? '#374151' : '#E5E7EB';
    ctx.strokeRect(W / 2 - 100, H / 2 + 45, 200, 6);
    
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#10B981';
    ctx.fillText(`${state.bytesSaved.toFixed(1)} KB Conserved`, W / 2, H / 2 + 65);
    return;
  }

  // Draw enhanced tech background grid
  ctx.fillStyle = dark ? '#111622' : '#F5F7FB';
  ctx.fillRect(0, 0, W, H);

  // Grid Lines
  if (state.mapLayerGrid !== false) {
    ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 30;
    for (let x = 0; x < W; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  // Radar beam sweep animation
  const radarAngle = (Date.now() / 2500) % (Math.PI * 2);
  const rx = W - 60;
  const ry = 40;
  ctx.strokeStyle = dark ? 'rgba(59, 107, 145, 0.15)' : 'rgba(59, 107, 145, 0.08)';
  ctx.beginPath();
  ctx.arc(rx, ry, 25, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(rx + Math.cos(radarAngle) * 25, ry + Math.sin(radarAngle) * 25);
  ctx.stroke();

  // Compass Rose / Coordinates
  ctx.fillStyle = dark ? '#4E5A6A' : '#94A3B8';
  ctx.font = '9px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('N 11°00\'58" | E 76°57\'55" (Coimbatore-Pollachi Rural Grid)', W - 15, H - 15);

  const cols = 4;
  const rowHeight = 65;
  const stopPos = STOPS.map(function (stop, i) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return {
      name: stop,
      x: 50 + col * ((W - 100) / (cols - 1)),
      y: 40 + row * rowHeight
    };
  });

  // ==========================================
  // REALISTIC GIS MAP LAYERS
  // ==========================================

  // 1. Terrain / Land Mass Base
  ctx.save();
  ctx.fillStyle = dark ? '#0B0F19' : '#EBF0F3';
  ctx.fillRect(0, 0, W, H);

  // 2. Mountain Ranges (Western Ghats & Anaimalai Foothills)
  // Western Ghats (Left side / West)
  const mountainGradient = ctx.createLinearGradient(0, 0, 180, 0);
  mountainGradient.addColorStop(0, dark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.06)');
  mountainGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = mountainGradient;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(60, 40, 120, 20, 140, 80);
  ctx.bezierCurveTo(160, 130, 80, 180, 120, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // Anaimalai Foothills (Bottom South edge, near Pollachi/Vettaikaranpudur)
  const hillsGradient = ctx.createLinearGradient(0, H, 0, H - 100);
  hillsGradient.addColorStop(0, dark ? 'rgba(5, 150, 105, 0.06)' : 'rgba(5, 150, 105, 0.04)');
  hillsGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = hillsGradient;
  ctx.beginPath();
  ctx.moveTo(300, H);
  ctx.bezierCurveTo(450, H - 50, 600, H - 40, W, H - 30);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // Mountain Peaks (Elegant outline details)
  ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  // Draw some elevation ridges
  ctx.moveTo(0, 30); ctx.lineTo(40, 55); ctx.lineTo(80, 45); ctx.lineTo(110, 85);
  ctx.moveTo(0, 110); ctx.lineTo(60, 140); ctx.lineTo(100, 125); ctx.lineTo(130, 165);
  ctx.stroke();
  ctx.restore();

  // 3. Water Bodies (Noyyal River & Local Lakes)
  ctx.save();
  // Noyyal River path winding organically between the station hubs
  ctx.beginPath();
  ctx.moveTo(0, 110);
  ctx.bezierCurveTo(120, 115, 180, 135, 280, 125); // Madhampatti area
  ctx.bezierCurveTo(380, 115, 420, 65, 516, 60);    // Ukkadam area
  ctx.bezierCurveTo(600, 55, 680, 85, W, 70);      // Flowing east
  ctx.strokeStyle = dark ? '#1E3A8A' : '#93C5FD';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Glowing inner current stream
  ctx.strokeStyle = dark ? '#3B82F6' : '#E0F2FE';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Valankulam Lake near Ukkadam
  ctx.fillStyle = dark ? 'rgba(30, 58, 138, 0.6)' : 'rgba(147, 197, 253, 0.6)';
  ctx.strokeStyle = dark ? '#2563EB' : '#60A5FA';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(450, 65, 18, 11, Math.PI / 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Singanallur Lake near Peelamedu
  ctx.beginPath();
  ctx.ellipse(680, 68, 24, 13, -Math.PI / 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 4. Cartographic Landscape Labels (Sophisticated layout text)
  ctx.save();
  ctx.fillStyle = dark ? '#334155' : '#94A3B8';
  ctx.font = 'italic bold 8px Inter, sans-serif';
  ctx.letterSpacing = '1.5px';
  ctx.fillText('WESTERN GHATS RANGE', 20, 145);
  ctx.fillText('ANAIMALAI FOOTHILLS', 380, H - 12);
  ctx.fillText('NOYYAL RIVER', 150, 105);
  ctx.fillText('VALANKULAM RESERVOIR', 440, 85);
  ctx.fillText('COCONUT BELT', 470, 140);
  ctx.restore();

  // 5. Realistic Road Network (Double-bordered Highways)
  // Let's define the actual physical road connections matching Coimbatore-Pollachi
  const ROADS = [
    { name: 'Siruvani Road', path: [6, 5, 2] },             // Alandurai -> Madhampatti -> Ukkadam
    { name: 'NH 83 Highway', path: [1, 2, 4, 8, 11] },       // Coimbatore Jn -> Ukkadam -> Eachanari -> Kinathukadavu -> Pollachi
    { name: 'Avinashi Road', path: [0, 3] },                // Gandhipuram -> Peelamedu
    { name: 'Sultanpet State Link', path: [4, 9, 11] },     // Eachanari -> Sultanpet -> Pollachi
    { name: 'Vettaikaranpudur Rd', path: [11, 10] },        // Pollachi -> Vettaikaranpudur
    { name: 'Negamam Handloom Rd', path: [11, 7, 3] },      // Pollachi -> Negamam -> Peelamedu
    { name: 'Sathy Road', path: [0, 1] }                    // Gandhipuram -> Coimbatore Jn
  ];

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Road Casing (Thick outer borders)
  ctx.strokeStyle = dark ? '#1E293B' : '#CBD5E1';
  ctx.lineWidth = 6;
  ROADS.forEach(function (road) {
    ctx.beginPath();
    road.path.forEach(function (idx, step) {
      const p = stopPos[idx];
      if (step === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  });

  // Road Fills (Lighter cores)
  ctx.strokeStyle = dark ? '#2D3748' : '#FFFFFF';
  ctx.lineWidth = 3;
  ROADS.forEach(function (road) {
    ctx.beginPath();
    road.path.forEach(function (idx, step) {
      const p = stopPos[idx];
      if (step === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  });

  // Highway dashed centerlines for extra realism!
  ctx.strokeStyle = dark ? '#475569' : '#E2E8F0';
  ctx.lineWidth = 0.75;
  ctx.setLineDash([3, 5]);
  ROADS.forEach(function (road) {
    ctx.beginPath();
    road.path.forEach(function (idx, step) {
      const p = stopPos[idx];
      if (step === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.restore();

  // 6. Glowing Congestion Heatmap Overlaid Exactly on the Roads
  if (state.mapLayerHeatmap !== false) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    
    ROADS.forEach(function (road, rIdx) {
      ctx.beginPath();
      road.path.forEach(function (idx, step) {
        const p = stopPos[idx];
        if (step === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      
      // Select translucent neon glow based on congestion grading
      if (rIdx % 3 === 0) {
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.16)'; // Green (Fluid)
      } else if (rIdx % 3 === 1) {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.22)'; // Yellow (Slow)
      } else {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.22)';  // Red (Heavy Congestion)
      }
      ctx.stroke();
    });
    ctx.restore();
  }

  // 7. Pulsing Telemetry Packets (Sliding glowing pings along the active road lanes)
  if (state.mapLayerPackets !== false) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = dark ? '#60A5FA' : '#3B82F6';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([4, 35]);
    ctx.lineDashOffset = -(Date.now() / 35) % 39;
    
    ROADS.forEach(function (road) {
      ctx.beginPath();
      road.path.forEach(function (idx, step) {
        const p = stopPos[idx];
        if (step === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    });
    
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 8. Nautical Compass Rose & Interactive Grid Scales
  ctx.save();
  // Drawing scale bar
  ctx.fillStyle = dark ? '#94A3B8' : '#475569';
  ctx.strokeStyle = dark ? '#334155' : '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.beginPath();
  ctx.moveTo(35, H - 25);
  ctx.lineTo(35, H - 20);
  ctx.lineTo(95, H - 20);
  ctx.lineTo(95, H - 25);
  ctx.stroke();
  ctx.fillText('0', 32, H - 28);
  ctx.fillText('5 km', 56, H - 28);
  ctx.fillText('10 km', 87, H - 28);

  // Drawing Compass Rose (top right)
  const cx = W - 40;
  const cy = 40;
  ctx.strokeStyle = dark ? '#334155' : '#94A3B8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy); ctx.lineTo(cx + 18, cy);
  ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy + 18);
  ctx.stroke();
  // Red north needle
  ctx.fillStyle = '#EF4444';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 13);
  ctx.lineTo(cx - 3, cy);
  ctx.lineTo(cx + 3, cy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = dark ? '#94A3B8' : '#475569';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy - 17);
  ctx.restore();

  const activeStop = val('track-stop');

  // Draw stop nodes (Beautiful station circles)
  stopPos.forEach(function (sp) {
    const isActive  = sp.name === activeStop;
    const isHovered = state.mapHover && state.mapHover.type === 'stop' && state.mapHover.info.name === sp.name;
    const hasAlert  = state.alerts.some(a => a.stop === sp.name);

    // Pulse/Ripple wave for active or hovered stop
    if (isActive || isHovered) {
      const pulseRadius = (isActive ? 18 : 14) + Math.sin(Date.now() / 200) * 4;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, pulseRadius, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? 'rgba(59, 107, 145, 0.15)' : 'rgba(78, 137, 117, 0.15)';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(sp.x, sp.y, isActive ? 9 : 6, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? '#3B6B91' : hasAlert ? '#C68B45' : (dark ? '#223044' : '#FFFFFF');
    ctx.fill();

    ctx.strokeStyle = isActive ? '#2C5373' : (dark ? '#3E4D63' : '#B8C6D6');
    ctx.lineWidth = isActive ? 3 : 2;
    ctx.stroke();

    // Node Name Tag
    ctx.fillStyle = isActive ? (dark ? '#FFFFFF' : '#1E2638') : (dark ? '#A2B0C2' : '#5F6F81');
    ctx.font = isActive ? 'bold 11px Inter, sans-serif' : '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sp.name, sp.x, sp.y + 22);
  });

  // Draw buses (Sleek vector capsules with drop shadows & route codes)
  state.busData.forEach(function (bus, i) {
    const stopIndex = STOPS.indexOf(bus.nearStop);
    if (stopIndex < 0) return;
    const sp = stopPos[stopIndex];

    const offsetX = Math.sin(i * 1.2) * 14;
    // Animate bus height float
    const floatY = Math.sin(Date.now() / 350 + i * 2) * 2;
    const offsetY = -28 + floatY;

    const pct = bus.filled / bus.total;
    const color = pct >= 0.9 ? '#EF4444' : pct >= 0.7 ? '#F59E0B' : '#10B981';

    const busX = sp.x + offsetX;
    const busY = sp.y + offsetY;

    const isBusHovered = state.mapHover && state.mapHover.type === 'bus' && state.mapHover.info.busId === bus.busId;

    if (isBusHovered) {
      ctx.beginPath();
      ctx.arc(busX, busY - 5, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(59, 107, 145, 0.12)';
      ctx.fill();
    }

    // Render a high-fidelity vector capsule for each vehicle instead of raw floating emojis!
    ctx.save();
    // Shadow for depth
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    
    // Draw capsule background
    const capW = 54;
    const capH = 18;
    const capX = busX - capW / 2;
    const capY = busY - 14;
    
    ctx.fillStyle = dark ? '#1E293B' : '#FFFFFF';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(capX, capY, capW, capH, 5);
    ctx.fill();
    ctx.stroke();
    ctx.shadowColor = 'transparent'; // Reset shadow
    
    // Tiny colored indicator dot
    ctx.beginPath();
    ctx.arc(capX + 8, capY + capH / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    
    // Text label (Route + vacant seats count)
    ctx.fillStyle = dark ? '#E2E8F0' : '#1E293B';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(bus.route.replace('Route ', ''), capX + 16, capY + 12);
    
    // Mini Seats Indicator
    ctx.fillStyle = color;
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(bus.free, capX + capW - 6, capY + 12);
    
    // Let's add a small anchor line to the station circle!
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(busX, capY + capH);
    ctx.lineTo(busX, sp.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  });

  // Render Hover Tooltip Box if available
  if (state.mapHover) {
    const mh = state.mapHover;
    const boxW = 190;
    const boxH = mh.type === 'bus' ? 95 : 75;
    
    // Position tooltip nicely avoiding boundaries
    let tx = mh.x + 15;
    let ty = mh.y - boxH - 10;
    if (tx + boxW > W) tx = mh.x - boxW - 15;
    if (ty < 5) ty = mh.y + 15;

    // Draw Tooltip Container with modern styling
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = dark ? 'rgba(22, 29, 38, 0.96)' : 'rgba(255, 255, 255, 0.98)';
    ctx.strokeStyle = dark ? '#242F3E' : '#DDE3EC';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.roundRect(tx, ty, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Write Tooltip content
    ctx.textAlign = 'left';
    if (mh.type === 'stop') {
      ctx.fillStyle = dark ? '#FFFFFF' : '#1E2638';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(mh.info.name, tx + 12, ty + 18);

      ctx.fillStyle = '#3B6B91';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('⚡ Active Terminal Node', tx + 12, ty + 34);

      ctx.fillStyle = dark ? '#8D9CAE' : '#5F6F81';
      ctx.font = '10px Inter, sans-serif';
      const incoming = state.busData.filter(b => b.nearStop === mh.info.name).length;
      ctx.fillText(`Incoming fleet count: ${incoming} units`, tx + 12, ty + 49);
      ctx.fillText('💡 Click station to inspect', tx + 12, ty + 64);

    } else if (mh.type === 'bus') {
      ctx.fillStyle = dark ? '#FFFFFF' : '#1E2638';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(`${mh.info.route} (${mh.info.busId.split('-')[2]})`, tx + 12, ty + 18);

      ctx.fillStyle = dark ? '#8D9CAE' : '#5F6F81';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`Driver: ${mh.info.driver}`, tx + 12, ty + 33);
      ctx.fillText(`En route to: ${mh.info.nearStop}`, tx + 12, ty + 47);

      // Seats indicator
      const percentFilled = Math.round((mh.info.filled / mh.info.total) * 100);
      ctx.fillText(`Capacity: ${mh.info.filled}/${mh.info.total} seats (${percentFilled}% loaded)`, tx + 12, ty + 61);

      // Status Badge
      ctx.fillStyle = mh.info.free > 15 ? '#4E8975' : '#C25953';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(mh.info.free > 15 ? '🟢 HIGH ACCESSIBILITY SEATS' : '🔴 HEAVILY CONGESTED', tx + 12, ty + 76);
    }
  }

  // Draw Legend in the bottom left corner
  ctx.fillStyle = dark ? 'rgba(22, 29, 38, 0.7)' : 'rgba(255, 255, 255, 0.7)';
  ctx.beginPath();
  ctx.roundRect(10, 10, 210, 24, 4);
  ctx.fill();

  ctx.font      = '10px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = dark ? '#E3E8EE' : '#1E2638';
  ctx.fillText('🟢 Free seats · 🟡 Crowded · 🔴 Full', 16, 26);

  // Live Inspector Panel Updates
  updateMapInspector();
}


// ═══════════════════════════════════════════════
// 11. ALERTS — bus arrival alert notifications
// ═══════════════════════════════════════════════

function addAlert() {
  const stop  = val('alert-stop');
  const route = val('alert-route');

  if (!stop) return toast('Please select a stop to watch', 'error');

  fetch('/api/alerts/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stop, route, userId: state.currentUser.id })
  })
  .then(async res => {
    if (!res.ok) {
      return readApiResponse(res);
    }
    return readApiResponse(res);
  })
  .then(data => {
    state.alerts = data.alerts;
    renderAlertList();
    drawMap();
    toast('Alert set for ' + stop + '! 🔔', 'success');
  })
  .catch(err => {
    toast(err.message, 'warning');
  });
}

function removeAlert(id) {
  fetch('/api/alerts/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, userId: state.currentUser.id })
  })
  .then(readApiResponse)
  .then(data => {
    state.alerts = data.alerts;
    renderAlertList();
    drawMap();
    toast('Alert removed', 'info');
  })
  .catch(() => {
    toast('Failed to remove alert', 'error');
  });
}

function renderAlertList() {
  const el = document.getElementById('alert-list');
  if (!el) return;

  if (!state.alerts.length) { el.innerHTML = ''; return; }

  el.innerHTML = state.alerts.map(function (a) {
    return `
      <div class="alert-item">
        🔔 Watching <strong>${a.stop}</strong>${a.route ? ' for ' + a.route : ' (any route)'}
        <button onclick="removeAlert(${a.id})">✕</button>
      </div>`;
  }).join('');
}

function checkAlerts() {
  state.alerts.forEach(function (alert) {
    const bus = state.busData.find(b =>
      b.nearStop === alert.stop &&
      b.etaMin <= 5 &&
      (!alert.route || b.route === alert.route) &&
      b.free > 0
    );
    if (bus) {
      toast(`🔔 ${bus.route} approaching ${alert.stop} in ~${bus.etaMin} min! ${bus.free} seats free`, 'warning');
    }
  });
}


// ═══════════════════════════════════════════════
// 12. BOOK PAGE — fare, seats, digital ticket
// ═══════════════════════════════════════════════

function setTodayDate() {
  const dateInput = document.getElementById('b-date');
  if (dateInput) dateInput.valueAsDate = new Date();
}

function getSelectedSeat() {
  const radio = document.querySelector('input[name="stype"]:checked');
  return radio ? radio.value : 'General';
}

function setSeatActive(radio) {
  document.querySelectorAll('.seat-type-btn').forEach(function (label) {
    label.classList.remove('active');
  });
  if (radio.parentElement) radio.parentElement.classList.add('active');
}

function initSeatTypeClicks() {
  document.querySelectorAll('.seat-type-btn').forEach(function (label) {
    label.addEventListener('click', function () {
      document.querySelectorAll('.seat-type-btn').forEach(l => l.classList.remove('active'));
      label.classList.add('active');
      setTimeout(calcFare, 50);
    });
  });
}

function changeQty(delta) {
  state.qty = Math.max(1, Math.min(10, state.qty + delta));
  setTxt('qty-val', state.qty);
  calcFare();
}

function calcFare() {
  const seat  = getSelectedSeat();
  const base  = FARES[seat] || 20;
  const total = base * state.qty;
  setTxt('f-base',  '₹' + base);
  setTxt('f-qty',   '× ' + state.qty);
  setTxt('f-total', '₹' + total);
}

function swapStops() {
  const from = document.getElementById('b-from');
  const to   = document.getElementById('b-to');
  if (!from || !to) return;
  const temp = from.value;
  from.value = to.value;
  to.value   = temp;
  updateSeatBar();
  calcFare();
}

function updateSeatBar() {
  const route = val('b-route');
  const bus   = state.busData.find(b => b.route === route);

  const fill = document.getElementById('seat-fill');
  const text = document.getElementById('seat-text');
  if (!fill || !text || !bus) return;

  const pct = Math.round((bus.filled / bus.total) * 100);
  fill.style.width = pct + '%';

  fill.className = 'seat-fill-bar ' + (pct >= 90 ? 'fill-red' : pct >= 70 ? 'fill-amber' : 'fill-green');

  if (pct >= 90) {
    text.textContent = `🔴 Full — only ${bus.free} seats left!`;
    text.style.color = '#DC2626';
  } else if (pct >= 70) {
    text.textContent = `🟡 Crowded — ${bus.free} of ${bus.total} seats free`;
    text.style.color = '#D97706';
  } else {
    text.textContent = `🟢 ${bus.free} of ${bus.total} seats available`;
    text.style.color = '#16A34A';
  }

  // Refresh physical seat selection grid
  renderSeatGrid();
}

function bookTicket() {
  if (!state.currentUser) return toast('Please log in first', 'error');

  const from  = val('b-from');
  const to    = val('b-to');
  const route = val('b-route');
  const date  = val('b-date');
  const seat  = getSelectedSeat();
  const qty   = state.qty;

  if (!from || !to || !route || !date) return toast('Please fill all fields', 'error');
  if (from === to) return toast('From and To cannot be the same stop!', 'error');

  if (new Date(date) < new Date(new Date().toDateString())) {
    return toast('Travel date cannot be in the past', 'error');
  }

  const payload = {
    from, to, route, date, seat, qty,
    passengerId: state.currentUser.id,
    passengerName: state.currentUser.name,
    selectedSeats: state.selectedSeats && state.selectedSeats.length > 0 
      ? state.selectedSeats.map(s => 'Seat #' + s) 
      : null
  };

  fetch('/api/tickets/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(async res => {
    if (!res.ok) {
      return readApiResponse(res);
    }
    return readApiResponse(res);
  })
  .then(data => {
    state.tickets.push(data.ticket);
    state.busData = data.busData;

    // Reset local selection state
    state.selectedSeats = [];
    renderSeatGrid();

    fillTicketUI(data.ticket);
    makeQR(data.ticket);

    show('ticket-preview');
    hide('empty-ticket');
    toast(`Ticket ${data.ticket.id} booked! Have a safe journey 🎉`, 'success');

    const btn = document.getElementById('book-btn');
    if (btn) {
      btn.textContent = '✅ Ticket Generated!';
      btn.disabled = true;
      setTimeout(function () {
        btn.innerHTML = '🎫 Generate Ticket';
        btn.disabled  = false;
      }, 2500);
    }
    setTxt('footer-count', state.tickets.length);
  })
  .catch(err => {
    toast(err.message, 'error');
  });
}

function fillTicketUI(t) {
  setTxt('tk-from',  t.from);
  setTxt('tk-to',    t.to);
  setTxt('tk-id',    t.id);
  setTxt('tk-name',  t.passengerName);
  setTxt('tk-route', t.route);
  setTxt('tk-date',  formatDate(t.date));
  setTxt('tk-seat',  t.selectedSeats || t.seat);
  setTxt('tk-qty',   t.qty + (t.qty > 1 ? ' seats' : ' seat'));
  setTxt('tk-fare',  '₹' + t.fare);
  setTxt('tk-time',  t.bookedAtStr);
  setTxt('tk-qr-id', t.id);
}

function makeQR(ticket) {
  const box = document.getElementById('qr-box');
  if (!box) return;
  box.innerHTML = '';

  const data = JSON.stringify({
    id:    ticket.id,
    name:  ticket.passengerName,
    from:  ticket.from,
    to:    ticket.to,
    route: ticket.route,
    date:  ticket.date
  });

  try {
    new QRCode(box, {
      text:         data,
      width:        130,
      height:       130,
      colorDark:    '#1D4ED8',
      colorLight:   '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  } catch (e) {
    box.innerHTML = '<div style="width:130px;height:130px;background:#EFF6FF;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;text-align:center;color:#2563EB;padding:10px">QR: ' + ticket.id + '</div>';
  }
}

function saveTicket() {
  const t = [...state.tickets].reverse().find(x => x.passengerId === state.currentUser?.id);
  if (!t) return toast('No ticket to save', 'error');

  const text =
    `SMARTBUS DIGITAL TICKET\n` +
    `${'='.repeat(30)}\n` +
    `Ticket ID  : ${t.id}\n` +
    `Passenger  : ${t.passengerName}\n` +
    `From       : ${t.from}\n` +
    `To         : ${t.to}\n` +
    `Route      : ${t.route}\n` +
    `Date       : ${formatDate(t.date)}\n` +
    `Seat Type  : ${t.seat}\n` +
    `Seats      : ${t.qty}\n` +
    `Fare Paid  : Rs.${t.fare}\n` +
    `Status     : ${t.status.toUpperCase()}\n` +
    `Booked At  : ${t.bookedAtStr}\n` +
    `${'='.repeat(30)}\n` +
    `Show QR code to conductor at bus entry`;

  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = t.id + '.txt';
  link.click();
  URL.revokeObjectURL(url);
  toast('Ticket saved!', 'success');
}

function resetBook() {
  setTodayDate();
  state.qty = 1;
  setTxt('qty-val', '1');

  const radios = document.querySelectorAll('input[name="stype"]');
  if (radios[0]) radios[0].checked = true;
  document.querySelectorAll('.seat-type-btn').forEach(function (l, i) {
    l.classList.toggle('active', i === 0);
  });

  calcFare();
  hide('ticket-preview');
  show('empty-ticket');
  document.getElementById('qr-box').innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// ═══════════════════════════════════════════════
// 13. MY TICKETS PAGE
// ═══════════════════════════════════════════════

function renderMyTickets() {
  const el = document.getElementById('my-list');
  if (!el) return;

  const mine = state.tickets
    .filter(t => t.passengerId === state.currentUser?.id)
    .reverse();

  if (!mine.length) {
    el.innerHTML = `
      <div class="card empty-card">
        <div>
          <div style="font-size:56px;margin-bottom:12px">🎫</div>
          <h4>No tickets yet</h4>
          <p>Book your first ticket to see it here</p>
          <button class="btn primary" style="margin-top:1rem" onclick="showPage('book')">Book Now</button>
        </div>
      </div>`;
    return;
  }

  el.innerHTML = mine.map(function (t) {
    return `
      <div class="my-ticket-row">
        <div class="mtr-stripe ${t.status}"></div>
        <div class="mtr-body">
          <div class="mtr-id">${t.id}</div>
          <div class="mtr-route">${t.from} → ${t.to}</div>
          <div class="mtr-meta">
            <span>🚌 ${t.route}</span>
            <span>📅 ${formatDate(t.date)}</span>
            <span>💺 ${t.selectedSeats || (t.qty + ' × ' + t.seat)}</span>
          </div>
        </div>
        <div class="mtr-right">
          <span class="badge ${t.status}">${t.status}</span>
          <span class="mtr-fare">₹${t.fare}</span>
        </div>
      </div>`;
  }).join('');
}


// ═══════════════════════════════════════════════
// 14. SCAN PAGE — validate tickets (Conductor mode)
// ═══════════════════════════════════════════════

function validateTicket() {
  const input = document.getElementById('scan-input');
  const id    = (input?.value || '').trim().toUpperCase();

  if (!id) return toast('Please enter a Ticket ID', 'error');

  fetch('/api/scans/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  })
  .then(readApiResponse)
  .then(data => {
    const resultEl = document.getElementById('scan-result');
    if (!resultEl) return;

    let html = '';

    if (data.status === 'invalid') {
      html = `<div class="scan-result-box invalid">
        <span class="r-icon">❌</span>
        <div class="r-title">Ticket Not Found</div>
        <div class="r-info">${data.error}</div>
      </div>`;
    } else if (data.status === 'cancelled') {
      html = `<div class="scan-result-box invalid">
        <span class="r-icon">🚫</span>
        <div class="r-title">Ticket Cancelled</div>
        <div class="r-info">${data.error}</div>
      </div>`;
    } else if (data.status === 'used') {
      html = `<div class="scan-result-box used">
        <span class="r-icon">⚠️</span>
        <div class="r-title">Already Used</div>
        <div class="r-info">${data.ticket.passengerName} already boarded</div>
      </div>`;
    } else {
      // Valid Boarding!
      const tIdx = state.tickets.findIndex(t => t.id === id);
      if (tIdx !== -1) {
        state.tickets[tIdx] = data.ticket;
      } else {
        state.tickets.push(data.ticket);
      }
      state.busData     = data.busData;
      state.scanHistory = data.scanHistory;
      state.scanCounts  = data.scanCounts;

      html = `<div class="scan-result-box valid">
        <span class="r-icon">✅</span>
        <div class="r-title">Passenger Cleared — Board!</div>
        <div class="r-info">${data.ticket.passengerName}<br>${data.ticket.from} → ${data.ticket.to}<br>${data.ticket.route} | ${data.ticket.seat} | ₹${data.ticket.fare}</div>
      </div>`;
    }

    resultEl.innerHTML     = html;
    resultEl.style.display = 'block';
    if (input) input.value = '';

    renderScanHistory();
    renderCondSeats();
    updateScanCounts();
  })
  .catch(() => {
    toast('Scanner connection error', 'error');
  });
}

function simulateScan() {
  const valid = state.tickets.filter(t => t.status === 'valid');
  if (!valid.length) return toast('No valid tickets to scan on server. Book one first!', 'info');
  const pick = valid[Math.floor(Math.random() * valid.length)];
  document.getElementById('scan-input').value = pick.id;
  toast('Simulating scan for ' + pick.id, 'info');
  setTimeout(validateTicket, 400);
}

function renderScanHistory() {
  const el = document.getElementById('scan-history');
  if (!el) return;

  if (!state.scanHistory.length) {
    el.innerHTML = `<div class="empty-small"><div>📭</div><p>No scans yet</p></div>`;
    return;
  }

  el.innerHTML = state.scanHistory.slice(0, 10).map(function (s) {
    return `
      <div class="scan-entry">
        <div class="scan-dot ${s.status}"></div>
        <div>
          <div class="scan-id">${s.id} — ${s.name}</div>
          <div class="scan-info">${s.from} → ${s.to} · ${s.route} · ${s.time}</div>
        </div>
      </div>`;
  }).join('');
}

function updateScanCounts() {
  setTxt('sc-valid',   state.scanCounts.valid);
  setTxt('sc-invalid', state.scanCounts.invalid);
  setTxt('sc-used',    state.scanCounts.used);
}

function clearScanHistory() {
  fetch('/api/scans/clear', { method: 'POST' })
    .then(readApiResponse)
    .then(data => {
      state.scanHistory = data.scanHistory;
      state.scanCounts  = data.scanCounts;
      renderScanHistory();
      updateScanCounts();
      toast('Scan history cleared', 'info');
    });
}

function renderCondSeats() {
  const route = val('cond-route');
  const bus   = state.busData.find(b => b.route === route) || state.busData[0];
  const el    = document.getElementById('cond-seats');
  if (!el || !bus) return;

  const pct = Math.round((bus.filled / bus.total) * 100);

  let seatHTML = '';
  let seatCounter = 1;
  const rows = 13;

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < 5; col++) {
      if (col === 2) {
        seatHTML += `<div class="cond-seat-cell corridor"></div>`;
      } else {
        const sNum = seatCounter;
        seatCounter++;
        
        const seatStatus = bus.seatMap && bus.seatMap[sNum - 1] ? bus.seatMap[sNum - 1] : 'free';
        let cls = 'free';
        let icon = sNum;
        let tooltip = `Seat ${sNum} (Available)`;

        if (seatStatus === 'occupied') {
          cls = 'occupied';
          icon = '👤';
          tooltip = `Seat ${sNum} (Occupied)`;
        } else if (seatStatus === 'ladies') {
          cls = 'ladies';
          icon = '👩';
          tooltip = `Seat ${sNum} (Ladies Reserved)`;
        }

        seatHTML += `
          <div class="cond-seat-cell ${cls}" title="${tooltip}">
            <span class="cond-seat-num">${icon}</span>
          </div>`;
      }
    }
  }

  el.innerHTML = `
    <div class="bus-cabin-frame">
      <div class="bus-cabin-front">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:16px;">🛞</span>
          <span>COCKPIT / DRIVER</span>
        </div>
        <div style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.1); color:rgba(255,255,255,0.8); border:1px solid rgba(255,255,255,0.15)">
          🚪 MAIN GATEWAY
        </div>
      </div>
      
      <div class="cond-seat-bus-grid">
        ${seatHTML}
      </div>
      
      <div class="bus-cabin-rear">
        REAR PASSENGER EXIT ZONE
      </div>
    </div>

    <div class="cond-seat-legend-box">
      <span class="legend-item"><span class="legend-dot free"></span> Free (${bus.free})</span>
      <span class="legend-item"><span class="legend-dot occupied"></span> Occupied (${bus.filled})</span>
      <span class="legend-item"><span class="legend-dot ladies"></span> Ladies (4)</span>
    </div>

    <div class="cond-stats-grid">
      <div class="cond-stat-item fill">
        <div class="lbl">Boarded</div>
        <div class="num text-red">${bus.filled}</div>
        <div class="sub">Active riders</div>
      </div>
      <div class="cond-stat-item empty">
        <div class="lbl">Available</div>
        <div class="num text-green">${bus.free}</div>
        <div class="sub">Vacant seats</div>
      </div>
      <div class="cond-stat-item occupancy">
        <div class="lbl">Occupancy</div>
        <div class="num text-blue">${pct}%</div>
        <div class="sub">Load factor</div>
      </div>
    </div>
    
    <div class="cond-progress-wrapper">
      <div class="cond-progress-track">
        <div class="cond-progress-fill ${pct >= 90 ? 'red' : pct >= 70 ? 'amber' : 'green'}" style="width: ${pct}%"></div>
      </div>
    </div>`;
}


// ═══════════════════════════════════════════════
// 15. ADMIN PAGE
// ═══════════════════════════════════════════════

function renderAdminPage() {
  if (state.currentUser?.role !== 'admin') {
    showPage('track');
    toast('Admin access only', 'error');
    return;
  }

  const revenue = state.tickets
    .filter(t => t.status !== 'cancelled')
    .reduce((sum, t) => sum + t.fare, 0);

  setTxt('s-total',   state.tickets.length);
  setTxt('s-users',   10); // Simulated passenger traffic statistics
  setTxt('s-buses',   state.busData.length);
  setTxt('s-rev',     revenue);

  renderFleetTable();
  renderAdminTable();
  setTxt('footer-count', state.tickets.length);
}

function renderFleetTable() {
  const tbody = document.getElementById('fleet-body');
  if (!tbody) return;

  tbody.innerHTML = state.busData.map(function (bus) {
    const pct   = Math.round((bus.filled / bus.total) * 100);
    const color = pct >= 90 ? '#DC2626' : pct >= 70 ? '#D97706' : '#16A34A';
    return `
      <tr>
        <td><strong>${bus.route}</strong></td>
        <td style="font-family:monospace">${bus.busId}</td>
        <td>${bus.driver}</td>
        <td>📌 ${bus.nearStop}</td>
        <td>⏱ ~${bus.etaMin} min</td>
        <td>${bus.total}</td>
        <td style="color:#DC2626;font-weight:700">${bus.filled}</td>
        <td style="color:#16A34A;font-weight:700">${bus.free}</td>
        <td>
          <div class="occ-bar">
            <div class="occ-fill" style="width:${pct}%;background:${color};height:100%;border-radius:50px"></div>
          </div>
          <span style="font-size:12px;font-weight:700;color:${color};margin-left:6px">${pct}%</span>
        </td>
      </tr>`;
  }).join('');
}

function renderAdminTable() {
  const statusFilter = val('af-status');
  const searchText   = (val('af-search') || '').toLowerCase();
  const tbody        = document.getElementById('admin-body');
  if (!tbody) return;

  let list = state.tickets.filter(function (t) {
    if (statusFilter && t.status !== statusFilter) return false;
    if (searchText && !t.passengerName.toLowerCase().includes(searchText) && !t.id.toLowerCase().includes(searchText)) return false;
    return true;
  }).reverse();

  setTxt('footer-count', state.tickets.length);

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No tickets found</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(function (t) {
    return `
      <tr>
        <td style="font-family:monospace;font-weight:700;color:#2563EB">${t.id}</td>
        <td>${escHtml(t.passengerName)}</td>
        <td>${escHtml(t.from)} → ${escHtml(t.to)}</td>
        <td>${escHtml(t.route)}</td>
        <td>${formatDate(t.date)}</td>
        <td>${t.qty}</td>
        <td style="font-weight:700">₹${t.fare}</td>
        <td><span class="badge ${t.status}">${t.status}</span></td>
        <td>
          <div class="tbl-act">
            ${t.status === 'valid'
              ? `<button class="act-btn red" onclick="cancelTicket('${t.id}')">✕ Cancel</button>`
              : '—'}
          </div>
        </td>
      </tr>`;
  }).join('');
}

function cancelTicket(id) {
  const ticket = state.tickets.find(t => t.id === id);
  if (!ticket) return;

  confirmDialog(
    'Cancel this ticket?',
    `Ticket ${id} will be marked cancelled on the server and the passenger cannot board.`,
    function () {
      fetch('/api/tickets/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      .then(readApiResponse)
      .then(data => {
        ticket.status = 'cancelled';
        state.busData = data.busData;
        renderAdminTable();
        toast('Ticket ' + id + ' cancelled on server', 'info');
      })
      .catch(() => {
        toast('Failed to cancel ticket on server', 'error');
      });
    }
  );
}

function exportCSV() {
  if (!state.tickets.length) return toast('No tickets to export', 'error');

  const headers = ['Ticket ID','Passenger','From','To','Route','Date','Seat','Qty','Fare','Status','Booked At'];
  const rows    = state.tickets.map(function (t) {
    return [t.id, t.passengerName, t.from, t.to, t.route, formatDate(t.date), t.seat, t.qty, t.fare, t.status, t.bookedAtStr]
      .map(v => '"' + String(v || '').replace(/"/g, '""') + '"')
      .join(',');
  });

  const csv  = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = 'transit_ai_tickets_' + new Date().toISOString().slice(0, 10) + '.csv';
  link.click();
  URL.revokeObjectURL(url);
  toast('Exported ' + state.tickets.length + ' tickets as CSV ✅', 'success');
}

function confirmClear() {
  confirmDialog(
    'Delete ALL tickets?',
    'This will permanently delete all ticket records on the Express backend server.',
    function () {
      fetch('/api/admin/clear-tickets', { method: 'POST' })
        .then(readApiResponse)
        .then(data => {
          state.tickets = data.tickets;
          renderAdminPage();
          toast('All tickets deleted from server', 'info');
        })
        .catch(() => {
          toast('Failed to clear tickets from server', 'error');
        });
    }
  );
}


// ═══════════════════════════════════════════════
// 16. CONFIRM DIALOG
// ═══════════════════════════════════════════════

let confirmCallback = null;

function confirmDialog(title, message, onConfirm) {
  confirmCallback = onConfirm;
  setTxt('confirm-title', title);
  setTxt('confirm-msg',   message);
  show('confirm-overlay');

  document.getElementById('confirm-ok').onclick = function () {
    closeConfirm();
    if (confirmCallback) confirmCallback();
  };
}

function closeConfirm() {
  hide('confirm-overlay');
  confirmCallback = null;
}


// ═══════════════════════════════════════════════
// 17. TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════

function toast(message, type) {
  type = type || 'info';
  const box  = document.getElementById('toast-box');
  if (!box) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const el    = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span>' + (icons[type] || 'ℹ️') + '</span><span>' + message + '</span>';
  box.appendChild(el);

  setTimeout(function () {
    el.classList.add('out');
    setTimeout(function () { el.remove(); }, 350);
  }, 4000);
}


// ═══════════════════════════════════════════════
// 18. HELPER UTILITIES — small reusable functions
// ═══════════════════════════════════════════════

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function setTxt(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function show(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = '';
}

function hide(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  } catch (e) {
    return dateStr;
  }
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeMenu();
    closeConfirm();
  }
});

window.addEventListener('resize', function () {
  const trackPage = document.getElementById('page-track');
  if (trackPage && trackPage.classList.contains('active')) {
    drawMap();
  }
});

// ══ INTERACTIVE BUS SEAT MAP RENDERING ══
function renderSeatGrid() {
  const grid = document.getElementById('interactive-seat-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const route = val('b-route');
  const bus = state.busData.find(b => b.route === route);
  if (!bus || !bus.seatMap) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 10px; color: var(--muted);">No bus data available</div>';
    return;
  }

  const rows = 13;
  let seatCounter = 1;

  if (!state.selectedSeats) {
    state.selectedSeats = [];
  }

  // Sanitize selection to make sure chosen seats are actually free
  state.selectedSeats = state.selectedSeats.filter(sNum => {
    const status = bus.seatMap[sNum - 1];
    return status === 'free' || status === 'ladies';
  });

  updateSelectedSeatsIndicator();

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < 5; col++) {
      if (col === 2) {
        // Corridor
        const cell = document.createElement('div');
        cell.className = 'seat-cell corridor';
        grid.appendChild(cell);
      } else {
        const sNum = seatCounter;
        seatCounter++;

        const cell = document.createElement('div');
        cell.className = 'seat-cell';
        
        const seatStatus = bus.seatMap[sNum - 1] || 'free';
        cell.setAttribute('data-seat', sNum);

        if (seatStatus === 'occupied') {
          cell.classList.add('occupied');
          cell.textContent = '❌';
        } else if (seatStatus === 'ladies') {
          cell.classList.add('ladies');
          cell.textContent = sNum;
          cell.title = "Reserved for Ladies";
        } else {
          cell.textContent = sNum;
        }

        if (state.selectedSeats.includes(sNum)) {
          cell.classList.add('selected');
        }

        cell.onclick = function() {
          if (seatStatus === 'occupied') {
            toast('This seat is already occupied!', 'error');
            return;
          }

          const maxQty = state.qty || 1;
          const idx = state.selectedSeats.indexOf(sNum);

          if (idx > -1) {
            state.selectedSeats.splice(idx, 1);
            cell.classList.remove('selected');
          } else {
            if (state.selectedSeats.length >= maxQty) {
              if (maxQty === 1) {
                const oldNum = state.selectedSeats[0];
                state.selectedSeats = [sNum];
                const oldCell = grid.querySelector(`.seat-cell[data-seat="${oldNum}"]`);
                if (oldCell) oldCell.classList.remove('selected');
                cell.classList.add('selected');
              } else {
                toast(`You can select up to ${maxQty} seat(s). Increase pass count above if traveling with more people!`, 'error');
                return;
              }
            } else {
              state.selectedSeats.push(sNum);
              cell.classList.add('selected');
            }
          }
          updateSelectedSeatsIndicator();
        };

        grid.appendChild(cell);
      }
    }
  }
}

function updateSelectedSeatsIndicator() {
  const info = document.getElementById('selected-seats-info');
  const badge = document.getElementById('selected-seat-badge');
  if (!info) return;

  if (state.selectedSeats && state.selectedSeats.length > 0) {
    info.textContent = `Chosen Seat(s): ${state.selectedSeats.map(s => '#' + s).join(', ')}`;
    info.style.color = '#16A34A';
    if (badge) {
      badge.style.display = 'inline-block';
      badge.textContent = `${state.selectedSeats.length} CHOSEN`;
      badge.className = 'badge valid';
    }
  } else {
    info.textContent = 'Selected Seats: Auto-Assigned';
    info.style.color = '#3B82F6';
    if (badge) {
      badge.style.display = 'none';
    }
  }
}

// ══ ECO / LOW BANDWIDTH CONTROLS ══
function toggleLowBandwidth(checked) {
  state.lowBandwidth = checked;
  saveData();
  
  // Re-start updates with new interval
  startLiveUpdates();
  
  if (checked) {
    toast('Low-Bandwidth Mode Activated! Saved data meters are running. 📶', 'success');
  } else {
    toast('Realtime Telemetry Restored (Full Speed). ⚡', 'info');
  }

  updateEcoMetricsUI();
  drawMap();
}

function updateEcoMetricsUI() {
  const toggle = document.getElementById('low-bandwidth-toggle');
  const badge = document.getElementById('low-bandwidth-status-badge');
  const netFootprint = document.getElementById('eco-net-footprint');
  const syncInterval = document.getElementById('eco-sync-interval');
  const savedBytes = document.getElementById('eco-saved-bytes');
  const mapStatus = document.getElementById('eco-map-status');

  if (toggle) toggle.checked = state.lowBandwidth;
  if (badge) {
    badge.textContent = state.lowBandwidth ? 'ACTIVE' : 'OFF';
    badge.style.color = state.lowBandwidth ? '#10B981' : 'var(--muted)';
  }

  if (state.lowBandwidth) {
    if (netFootprint) {
      netFootprint.textContent = 'Eco (Compressed)';
      netFootprint.style.color = '#10B981';
    }
    if (syncInterval) {
      syncInterval.textContent = 'Eco Mode (30s)';
    }
    if (mapStatus) {
      mapStatus.textContent = 'Suspended (Text Only)';
      mapStatus.style.color = 'var(--muted)';
    }
  } else {
    if (netFootprint) {
      netFootprint.textContent = 'Standard (Full Payload)';
      netFootprint.style.color = 'var(--blue)';
    }
    if (syncInterval) {
      syncInterval.textContent = 'Realtime (8s)';
    }
    if (mapStatus) {
      mapStatus.textContent = 'Active Render';
      mapStatus.style.color = 'var(--blue)';
    }
  }

  if (savedBytes) {
    savedBytes.textContent = `${state.bytesSaved.toFixed(1)} KB Saved`;
  }
}

// ══ INTERACTIVE MAP LAYERS & DYNAMIC INSPECTOR ══
function toggleMapVisualOption(option) {
  const checkbox = document.getElementById('map-layer-' + option);
  if (!checkbox) return;
  
  if (option === 'heatmap') {
    state.mapLayerHeatmap = checkbox.checked;
  } else if (option === 'grid') {
    state.mapLayerGrid = checkbox.checked;
  } else if (option === 'packets') {
    state.mapLayerPackets = checkbox.checked;
  }
  
  // Re-render map immediately
  drawMap();
}

function updateMapInspector() {
  const defaultBox = document.getElementById('map-inspector-default');
  const contentBox = document.getElementById('map-inspector-content');
  if (!defaultBox || !contentBox) return;

  const mh = state.mapHover;
  if (!mh) {
    defaultBox.style.display = 'block';
    contentBox.style.display = 'none';
    return;
  }

  defaultBox.style.display = 'none';
  contentBox.style.display = 'block';

  if (mh.type === 'stop') {
    const incoming = state.busData.filter(b => b.nearStop === mh.info.name).length;
    contentBox.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:6px;">
        <span style="font-size:18px;">🚉</span>
        <strong style="font-size:13px; color:var(--text);">${mh.info.name}</strong>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; color:var(--text); font-size:12px;">
        <div><span style="color:var(--muted);">Category:</span> <strong class="green-text" style="color:#10B981">Active Hub</strong></div>
        <div><span style="color:var(--muted);">Incoming Fleet:</span> <strong>${incoming} vehicles</strong></div>
        <div><span style="color:var(--muted);">Link Status:</span> <span class="green-text" style="font-weight:700; color:#10B981">🟢 Fluid Flow</span></div>
        <div style="margin-top:6px; font-size:11px; color:#3B6B91; background:rgba(59,107,145,0.08); padding:4px 8px; border-radius:4px; font-weight:600; text-align:center;">
          🎯 Click station node to lock route updates
        </div>
      </div>
    `;
  } else if (mh.type === 'bus') {
    const pct = Math.round((mh.info.filled / mh.info.total) * 100);
    const badgeColor = mh.info.free > 15 ? '#10B981' : '#EF4444';
    const badgeBg = mh.info.free > 15 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)';
    const badgeText = mh.info.free > 15 ? 'Fluid Seating' : 'High Density';
    
    contentBox.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:6px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:16px;">🚌</span>
          <strong style="font-size:13px; color:var(--text);">${mh.info.route}</strong>
        </div>
        <span style="font-size:10px; font-weight:700; padding:2px 6px; border-radius:10px; background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeColor}40;">
          ${badgeText}
        </span>
      </div>
      <div style="display:flex; flex-direction:column; gap:4px; color:var(--text); font-size:11.5px;">
        <div><span style="color:var(--muted);">ID:</span> <code style="font-family:monospace; background:var(--gray-100); padding:1px 4px; border-radius:3px;">${mh.info.busId}</code></div>
        <div><span style="color:var(--muted);">Driver:</span> <strong>${mh.info.driver}</strong></div>
        <div><span style="color:var(--muted);">Heading:</span> <strong>${mh.info.nearStop}</strong></div>
        <div><span style="color:var(--muted);">Load:</span> <strong>${mh.info.filled} / ${mh.info.total} seats (${pct}%)</strong></div>
        
        <!-- Live Occupancy Bar -->
        <div style="margin-top:6px; background:var(--gray-200); height:5px; border-radius:3px; overflow:hidden;">
          <div style="background:${badgeColor}; width:${pct}%; height:100%;"></div>
        </div>
      </div>
    `;
  }
}

// Attach to window object for absolute global safety with inline onclick/onchange attributes
window.toggleMapVisualOption = toggleMapVisualOption;
window.updateMapInspector = updateMapInspector;
