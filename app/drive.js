
/* =====================================================================
   Stockage partagé dans TON Google Drive (remplace la synchronisation
   "db" de la version claude.ai). Une seule personne (toi) se connecte
   avec un compte Google ; l'admin et le tailleur utilisent ce même
   compte sur leurs téléphones respectifs — le "rôle" (admin/tailleur)
   est un simple choix fait une fois sur chaque appareil, pas un compte
   séparé. Toutes les données vivent dans UN fichier JSON de ton Drive,
   que tu peux ouvrir/voir/copier toi-même à tout moment.

   Important (à savoir, pas un défaut caché) : comme il n'y a plus de
   règles serveur façon claude.ai, quiconque se connecte avec ce compte
   Google voit les mêmes données que l'admin. La séparation admin/tailleur
   reste donc un confort d'affichage, pas une barrière de sécurité — comme
   c'était déjà en partie le cas côté "aperçu local".
   ===================================================================== */

/* L'identifiant Google (Client ID) vit dans config.js, un petit fichier à part
   (pas dans ce fichier ni dans bundle.js) : après la configuration Google Cloud
   (voir le guide), il suffit d'éditer config.js directement sur GitHub — sans
   rien réinstaller ni reconstruire. */
const DRIVE_CLIENT_ID = (typeof window !== 'undefined' && window.DRIVE_CLIENT_ID) || 'REPLACE_WITH_YOUR_CLIENT_ID.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FILE_NAME = 'Men’s Tunics — Données.json';
const ROLE_KEY = 'mens-tunics-role-device';
const TOKEN_REFRESH_MARGIN = 5 * 60 * 1000; // on redemande un jeton 5 min avant son expiration
const POLL_MS = 25000;

const drive = {
  tokenClient: null,
  accessToken: null,
  tokenExpiresAt: 0,
  fileId: null,
  signedIn: false,
  needsReconnect: false,
  hold: false,
  busy: false,
  at: 0,
  timer: 0,
  pollTimer: 0,
  gisReady: false
};

/* ---------- sérialisation des données (toutes les collections, y compris le catalogue) ---------- */
const BK_COLS = Object.keys(COLL); // commandes, depenses, paiements, encaissements, modeles
function hhmm(t) { return new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
function dhm(t) { return new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); }
function backupObj() { return { app: 'mens-tunics', version: 2, savedAt: store.savedAt || Date.now(), exportedAt: new Date().toISOString(), data: store.data, settings: store.settings }; }
function validBackup(o) { return !!(o && o.app === 'mens-tunics' && o.data && BK_COLS.every((k) => Array.isArray(o.data[k]))); }
function applyBackup(o) {
  const data = {};
  BK_COLS.forEach((k) => { data[k] = (o.data[k] || []).filter((x) => x && typeof x === 'object' && typeof x.id === 'string'); });
  store.data = data;
  store.settings = { ...clone(DEFAULTS), ...(o.settings && typeof o.settings === 'object' ? o.settings : {}) };
  persistLocal(); ui.drawer = null;
}
/* core.js's persistLocal() appelle fileSaveSoon() (héritage du fichier lié local) ;
   ici on la fait pointer vers la sauvegarde Google Drive à la place. */
function fileSaveSoon() { driveSaveSoon(); }
function choiceBox({ title, text, a, b }) {
  formSpec = { choice: { a: a.fn, b: b.fn } };
  $('#modal').innerHTML = `<div class="modal-wrap"><div class="scrim"></div><div class="modal confirm" role="alertdialog" aria-modal="true"><h2>${esc(title)}</h2><p>${text}</p><div class="r"><button class="btn" data-act="choice-b">${esc(b.label)}</button><button class="btn primary" data-act="choice-a">${esc(a.label)}</button></div></div></div>`;
  const p = $('.btn.primary', $('#modal')); if (p) p.focus();
}

function gapiHeaders() { return { Authorization: 'Bearer ' + drive.accessToken }; }

function loadGis() {
  return new Promise((resolve) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) { resolve(true); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

function scheduleTokenRefresh() {
  clearTimeout(drive._refreshTimer);
  const delay = Math.max(10000, drive.tokenExpiresAt - Date.now() - TOKEN_REFRESH_MARGIN);
  drive._refreshTimer = setTimeout(() => requestToken(''), delay);
}

function requestToken(prompt) {
  return new Promise((resolve) => {
    if (!drive.tokenClient) { resolve(false); return; }
    drive.tokenClient.callback = (resp) => {
      if (resp && resp.access_token) {
        drive.accessToken = resp.access_token;
        drive.tokenExpiresAt = Date.now() + (Number(resp.expires_in) || 3500) * 1000;
        drive.signedIn = true; drive.needsReconnect = false;
        scheduleTokenRefresh();
        resolve(true);
      } else {
        if (prompt === 'consent') { drive.needsReconnect = true; }
        else { drive.needsReconnect = true; drive.signedIn = false; }
        resolve(false);
      }
    };
    try { drive.tokenClient.requestAccessToken({ prompt }); } catch (e) { resolve(false); }
  });
}

async function initDriveAuth() {
  const ok = await loadGis();
  if (!ok || !window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    drive.gisReady = false; scheduleRender(); return;
  }
  drive.gisReady = true;
  drive.tokenClient = google.accounts.oauth2.initTokenClient({ client_id: DRIVE_CLIENT_ID, scope: DRIVE_SCOPE, callback: () => {} });
  scheduleRender();
}

async function signInGoogle() {
  const got = await requestToken('consent');
  if (got) { await afterSignIn(); } else { scheduleRender(); }
}
async function reconnectGoogle() {
  const got = await requestToken('consent');
  if (got) { drive.hold = true; await reconcileDrive(false); drive.hold = false; }
  scheduleRender();
}

async function afterSignIn() {
  store.role = loadRole();
  await pickOrCreateDriveFile();
  drive.hold = true; render();
  await reconcileDrive(false);
  drive.hold = false;
  startDrivePolling();
  render();
}

function loadRole() { try { return localStorage.getItem(ROLE_KEY) || ''; } catch (e) { return ''; } }
function chooseRole(r) { try { localStorage.setItem(ROLE_KEY, r); } catch (e) { /* ignore */ } store.role = r; render(); }

/* ---------- fichier Drive : recherche / création ---------- */
async function driveFetch(url, opts) {
  const res = await fetch(url, { ...opts, headers: { ...gapiHeaders(), ...(opts && opts.headers) } });
  if (res.status === 401) { drive.needsReconnect = true; drive.signedIn = false; scheduleRender(); throw new Error('unauthorized'); }
  return res;
}
async function pickOrCreateDriveFile() {
  if (drive.fileId) return drive.fileId;
  try { const cached = localStorage.getItem('mens-tunics-drive-file-id'); if (cached) { drive.fileId = cached; return cached; } } catch (e) { /* ignore */ }
  const q = encodeURIComponent(`name='${DRIVE_FILE_NAME.replace(/'/g, "\\'")}' and trashed=false`);
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {});
  const json = await res.json();
  if (json.files && json.files.length) { drive.fileId = json.files[0].id; }
  else {
    const created = await driveFetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: DRIVE_FILE_NAME })
    });
    const cjson = await created.json();
    drive.fileId = cjson.id;
    await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${drive.fileId}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(backupObj())
    });
  }
  try { localStorage.setItem('mens-tunics-drive-file-id', drive.fileId); } catch (e) { /* ignore */ }
  return drive.fileId;
}

async function readDriveFile() {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${drive.fileId}?alt=media`, {});
  const t = await res.text();
  if (!t.trim()) return null;
  try { const o = JSON.parse(t); return validBackup(o) ? o : 'invalid'; } catch (e) { return 'invalid'; }
}
async function writeDriveFile() {
  if (!drive.signedIn || !drive.fileId) return;
  if (drive.busy) { driveSaveSoon(); return; }
  drive.busy = true;
  try {
    await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${drive.fileId}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(backupObj())
    });
    drive.at = Date.now(); scheduleRender();
  } catch (e) { /* la prochaine sync retentera */ }
  drive.busy = false;
}
function driveSaveSoon() { if (!drive.signedIn) return; clearTimeout(drive.timer); drive.timer = setTimeout(writeDriveFile, 700); }

/* Même logique de réconciliation que le fichier local lié (link.js) : on ne perd
   jamais silencieusement des données plus récentes, on demande à choisir en cas de doute. */
async function reconcileDrive(force) {
  if (!drive.signedIn || !drive.fileId) return;
  let o; try { o = await readDriveFile(); } catch (e) { return; }
  if (o === 'invalid' || !o) { await writeDriveFile(); store.ready = true; render(); return; }
  const mine = store.savedAt || 0;
  const same = JSON.stringify(o.data) === JSON.stringify(store.data);
  if (same) { store.data = o.data; store.settings = { ...clone(DEFAULTS), ...(o.settings || {}) }; store.savedAt = Number(o.savedAt) || mine; store.ready = true; render(); return; }
  const fileTs = Number(o.savedAt) || 0;
  if (!force && fileTs <= mine && mine > 0) { store.ready = true; await writeDriveFile(); render(); return; }
  if (mine === 0) { applyBackup(o); store.ready = true; render(); return; }
  store.ready = true; render();
  choiceBox({
    title: 'Quelles données garder ?',
    text: `Le fichier Google Drive contient <b>${o.data.commandes.length}</b> commande(s), <b>${o.data.depenses.length}</b> dépense(s)${fileTs ? ` (enregistré le ${esc(dhm(fileTs))})` : ''}. ` +
      `Cet appareil contient d’autres données${mine ? ` (modifiées le ${esc(dhm(mine))})` : ''}. <b>Le choix que vous ne prenez pas sera remplacé.</b>`,
    a: { label: 'Charger depuis Drive', fn: () => { applyBackup(o); toast('Données de Google Drive chargées'); render(); } },
    b: { label: 'Garder cet appareil', fn: () => { writeDriveFile().then(() => { toast('Google Drive mis à jour'); render(); }); } }
  });
}

function startDrivePolling() {
  clearInterval(drive.pollTimer);
  drive.pollTimer = setInterval(() => { if (!drive.busy && !drive.hold) reconcileDrive(false); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && drive.signedIn && !drive.hold) reconcileDrive(false); });
  window.addEventListener('focus', () => { if (drive.signedIn && !drive.hold) reconcileDrive(false); });
}

function signOutGoogle() {
  clearInterval(drive.pollTimer); clearTimeout(drive._refreshTimer);
  if (drive.accessToken && window.google) { try { google.accounts.oauth2.revoke(drive.accessToken, () => {}); } catch (e) { /* ignore */ } }
  drive.signedIn = false; drive.accessToken = null; drive.fileId = null;
  try { localStorage.removeItem('mens-tunics-drive-file-id'); } catch (e) { /* ignore */ }
  store.ready = false; render();
}

/* ---------- écrans de connexion / choix du rôle ---------- */
function signInView() {
  if (!drive.gisReady) return `<div class="skel" aria-busy="true"><i style="height:52px;width:40%"></i><i></i><i style="height:120px"></i></div>`;
  return `<div class="gate">
    <div class="gate-card">
      <div class="logo" style="width:52px;height:52px;margin:0 auto 14px"><img src="logo.png" alt="" width="52" height="52"></div>
      <h2>Men’s Tunics</h2>
      <p class="muted">Connecte-toi avec le compte Google qui garde tes données (commandes, mesures, dépenses) dans ton Drive.</p>
      <button class="btn primary lg" data-act="google-signin">${icon('user')} Se connecter avec Google</button>
      ${drive.needsReconnect ? `<p class="muted" style="margin-top:10px">La connexion a échoué ou a été refusée. Réessaie.</p>` : ''}
    </div>
  </div>`;
}
function roleChoiceView() {
  return `<div class="gate">
    <div class="gate-card">
      <h2>Qui es-tu sur cet appareil ?</h2>
      <p class="muted">Ce choix reste sur ce téléphone ; tu peux le changer plus tard depuis Paramètres.</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">
        <button class="btn primary lg" data-act="role-choice" data-role="admin">Administrateur / Administratrice</button>
        <button class="btn lg" data-act="role-choice" data-role="tailleur">Tailleur</button>
      </div>
    </div>
  </div>`;
}
function reconnectBanner() {
  if (!drive.needsReconnect) return '';
  return `<div class="banner"><span>${icon('alert')}La connexion à Google Drive a été perdue. Vos saisies restent sur cet appareil en attendant.</span><button class="btn sm" data-act="google-reconnect">Reconnecter</button></div>`;
}
