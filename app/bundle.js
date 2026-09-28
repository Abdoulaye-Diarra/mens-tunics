(function () {
'use strict';

/* =====================================================================
   Men's Tunics — suivi financier
   Règle absolue : coût engagé ≠ coût payé · vente ≠ encaissement · marge ≠ trésorerie
   ===================================================================== */

const SAMPLE = { commandes: [], depenses: [], paiements: [], encaissements: [], modeles: [] };

/* ---------- utilitaires ---------- */
const $ = (s, el = document) => el.querySelector(s);
const clone = (x) => JSON.parse(JSON.stringify(x));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const pad = (n) => String(n).padStart(2, '0');
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const fmt = (n) => nf.format(Math.round(Math.abs(n) < 0.5 ? 0 : n)).replace('-', '−');
const money = (n) => fmt(n) + ' FCFA';
const signed = (n) => (n > 0.5 ? '+' : n < -0.5 ? '−' : '') + fmt(Math.abs(n));
const pct = (x) => (x == null || !isFinite(x) ? '—' : (x * 100).toFixed(1).replace('.', ',') + ' %');
const fmtK = (v) => { const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',').replace(',0', '') + ' M'; if (a >= 1000) return fmt(v / 1000) + ' k'; return fmt(v); };
/* Photos/vidéo des modèles : stockées directement en base64 (data URI) dans le
   document du modèle lui-même — pas de stockage à part, ça voyage avec le reste
   des données dans le fichier Google Drive. */
const coverPhoto = (m) => (m && Array.isArray(m.photos) && m.photos[0]) ? m.photos[0] : '';
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const curYear = new Date().getFullYear();
const fdate = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${+d} ${MOIS_C[+m - 1]}${+y !== curYear ? ' ' + y : ''}`; };
const lastDay = (y, m) => new Date(y, m, 0).getDate();
const byDate = (a, b) => (a.date || '').localeCompare(b.date || '') || String(a.id).localeCompare(String(b.id));
const daysBetween = (fromISO, toISO) => { if (!fromISO || !toISO) return null; const a = new Date(fromISO + 'T00:00:00'), b = new Date(toISO + 'T00:00:00'); if (isNaN(a) || isNaN(b)) return null; return Math.round((b - a) / 86400000); };

/* ---------- référentiels ---------- */
const NATURES = { direct: 'Coût direct', general: 'Charge générale', remuneration: 'Rémunération collaborateurs' };
const DETTES = { fournisseurs: 'Fournisseurs', tailleurs: 'Tailleurs', collaborateurs: 'Collaborateurs', autres: 'Autres bénéficiaires' };
const STATUTS_CMD = { nouvelle: 'Nouvelle', enCours: 'En confection', pret: 'Prête', livree: 'Livrée', annulee: 'Annulée' };
const STATUTS_CMD_ORDER = ['nouvelle', 'enCours', 'pret', 'livree', 'annulee'];
const DELAI_ALERTE = 2; // jours restants avant livraison à partir desquels l’alerte rouge s’affiche
/* mesures : [clé, libellé FR, libellé EN] */
const MESURES_HAUT = [
  ['cou', 'Cou', 'Neck'], ['epaule', 'Épaule', 'Shoulder'], ['poitrine', 'Poitrine', 'Chest'],
  ['longueurManche', 'Longueur manche', 'Sleeve length'], ['contourManche', 'Contour manche', 'Sleeve width'], ['longueurBoubou', 'Longueur boubou', 'Gown length']
];
const MESURES_BAS = [
  ['longueurPantalon', 'Longueur pantalon', 'Trouser length'], ['cuisse', 'Cuisse', 'Thigh'], ['genou', 'Genou', 'Knee'],
  ['contourPied', 'Contour pied', 'Ankle width'], ['ceinture', 'Ceinture', 'Waist']
];
const emptyMesures = () => ({ haut: {}, bas: {} });
const DEFAULTS = {
  soldeInitial: 0,
  debut: '2026-09-01',
  categories: [
    { nom: 'Tissu', nature: 'direct', dette: 'fournisseurs', key: 'tissu' },
    { nom: 'Confection (Tailleur)', nature: 'direct', dette: 'tailleurs', key: 'tailleur' },
    { nom: 'Livraison', nature: 'direct', dette: 'autres', key: 'livraison' },
    { nom: 'Accessoires & fournitures', nature: 'direct', dette: 'fournisseurs' },
    { nom: 'Charges générales', nature: 'general', dette: 'autres' },
    { nom: 'Rémunération collaborateurs', nature: 'remuneration', dette: 'collaborateurs' }
  ],
  modes: ['Espèces', 'Mobile Money', 'Virement bancaire', 'Chèque', 'Autre'],
  sousCats: ['Tissu principal', 'Doublure', 'Fil / boutons / fermetures', 'Confection', 'Retouche', 'Livraison client', 'Transport achat tissu', 'Loyer / local', 'Électricité / eau', 'Internet / crédit téléphonique', 'Marketing / publicité', 'Emballage', 'Rémunération hebdomadaire']
};
const COLL = { commandes: 'commandes', depenses: 'depenses', paiements: 'paiements', encaissements: 'encaissements', modeles: 'modeles' };

/* ---------- état ---------- */
const store = {
  mode: 'loading', // 'db' | 'local'
  role: 'admin', // 'admin' | 'tailleur' — déterminé au démarrage depuis le niveau de partage (voir boot())
  ready: false,
  db: null,
  downloads: null,
  assets: null,
  data: { commandes: [], depenses: [], paiements: [], encaissements: [], modeles: [] },
  settings: clone(DEFAULTS),
  err: null
};
const ui = {
  view: 'dashboard',
  q: '', depStatut: 'all', depCat: 'all', cmdFilter: 'all', movFilter: 'all',
  year: curYear, month: new Date().getMonth() + 1,
  tblCat: false,
  drawer: null // {type:'cmd'|'dep', id}
};
let V = null; // données dérivées (recalculées à chaque rendu)

const LS_KEY = 'mens-tunics-local-v1';
const LS_BK = 'mens-tunics-last-backup';
function persistLocal() {
  store.savedAt = Date.now();
  try { localStorage.setItem(LS_KEY, JSON.stringify({ data: store.data, settings: store.settings, savedAt: store.savedAt })); store.storageErr = false; }
  catch (e) { store.storageErr = true; }
  fileSaveSoon();
}
function lastBackup() { try { return Number(localStorage.getItem(LS_BK)) || 0; } catch (e) { return 0; } }
function markBackup() { try { localStorage.setItem(LS_BK, String(Date.now())); } catch (e) { /* ignore */ } }
function loadLocal() {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) { const o = JSON.parse(raw); if (o && o.data) return o; } } catch (e) { /* ignore */ }
  return null;
}

/* ---------- accès aux données (db partagée ou local) ---------- */
const strip = (o) => JSON.parse(JSON.stringify(o));
async function put(coll, obj) {
  const clean = strip(obj);
  if (store.mode === 'db') { await store.db.doc(`${coll}/${clean.id}`).set(clean); return; }
  const list = store.data[coll]; const i = list.findIndex((x) => x.id === clean.id);
  if (i >= 0) list[i] = clean; else list.push(clean);
  persistLocal(); scheduleRender();
}
async function del(coll, id) {
  if (store.mode === 'db') { await store.db.doc(`${coll}/${id}`).delete(); return; }
  store.data[coll] = store.data[coll].filter((x) => x.id !== id);
  persistLocal(); scheduleRender();
}
async function saveSettings() {
  if (store.mode === 'db') { await store.db.doc('settings/main').set(clone(store.settings)); return; }
  persistLocal(); scheduleRender();
}
function nextId(prefix, list, width) {
  let max = 0;
  list.forEach((x) => { const m = String(x.id).match(/(\d+)$/); if (m) max = Math.max(max, +m[1]); });
  return `${prefix}-${String(max + 1).padStart(width, '0')}`;
}

/* Une dépense peut être répartie sur plusieurs commandes (ex : 20 000 FCFA de
   broderie couvrant 3 commandes). Format actuel : d.commandes = [{commande, montant}, …].
   Ancien format (une seule commande) : d.commande = 'CMD-001'. Cette fonction
   ramène toujours les deux formats à un tableau, sans jamais modifier les
   documents déjà enregistrés (compatibilité totale avec les données existantes). */
function normCommandes(d) {
  if (Array.isArray(d.commandes) && d.commandes.length) {
    return d.commandes.map((x) => ({ commande: x.commande, montant: Number(x.montant) || 0 })).filter((x) => x.commande);
  }
  if (d.commande) return [{ commande: d.commande, montant: Number(d.engage) || 0 }];
  return [];
}

/* ---------- calculs : tout part des engagements ET des mouvements réels ---------- */
function derive() {
  const D = store.data, S = store.settings;
  const catBy = {}; S.categories.forEach((c) => { catBy[c.nom] = c; });
  const payBy = {}; D.paiements.forEach((p) => { (payBy[p.depenseId] = payBy[p.depenseId] || []).push(p); });
  const encBy = {}; D.encaissements.forEach((e) => { (encBy[e.commande] = encBy[e.commande] || []).push(e); });

  const deps = D.depenses.map((d) => {
    const c = catBy[d.categorie] || null;
    const ps = (payBy[d.id] || []).slice().sort(byDate);
    const engage = Number(d.engage) || 0;
    const paye = sum(ps, (p) => p.montant);
    /* ratio de paiement de la dépense, appliqué à chaque part pour garder
       « coût engagé ≠ coût payé » vrai même quand une dépense est partagée */
    const ratio = engage > 0.5 ? Math.min(paye / engage, 1) : (paye > 0.5 ? 1 : 0);
    const commandes = normCommandes(d).map((x) => ({ commande: x.commande, montant: x.montant, paye: x.montant * ratio, reste: x.montant - x.montant * ratio }));
    return { ...d, engage, cat: c, nature: c ? c.nature : null, dette: c ? c.dette : null, key: c ? c.key || null : null, paye, reste: engage - paye, statut: paye <= 0 ? 'non' : (paye < engage ? 'partiel' : 'total'), paiements: ps, last: ps[ps.length - 1] || null, commandes };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id)));
  const depBy = {}; deps.forEach((d) => { depBy[d.id] = d; });

  const today = todayISO();
  const cmds = D.commandes.map((c) => {
    const parts = [];
    deps.forEach((d) => { d.commandes.forEach((x) => { if (x.commande === c.id) parts.push({ dep: d, montant: x.montant, paye: x.paye, reste: x.reste }); }); });
    const ds = parts.map((p) => ({
      id: p.dep.id, description: p.dep.description, categorie: p.dep.categorie, beneficiaire: p.dep.beneficiaire,
      nature: p.dep.nature, key: p.dep.key, date: p.dep.date,
      engage: p.montant, paye: p.paye, reste: p.reste,
      statut: p.paye <= 0.5 ? 'non' : (p.reste > 0.5 ? 'partiel' : 'total'),
      split: p.dep.commandes.length > 1, totalDep: p.dep.engage
    })).sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id)));
    const dir = ds.filter((d) => d.nature === 'direct');
    const es = (encBy[c.id] || []).slice().sort(byDate);
    const prix = Number(c.prix) || 0;
    const encaisse = sum(es, (e) => e.montant);
    const g = (k) => sum(dir.filter((d) => d.key === k), (d) => d.engage);
    const tissu = g('tissu'), tailleur = g('tailleur'), livraison = g('livraison');
    const engage = sum(dir, (d) => d.engage), paye = sum(dir, (d) => d.paye);
    const statut = STATUTS_CMD[c.statut] ? c.statut : 'nouvelle';
    const livree = statut === 'livree', annulee = statut === 'annulee';
    const dateLivraisonPrevue = c.dateLivraisonPrevue || '';
    const jours = daysBetween(today, dateLivraisonPrevue);
    const urgent = !livree && !annulee && dateLivraisonPrevue && jours != null && jours <= DELAI_ALERTE;
    const retard = urgent && jours < 0;
    return {
      ...c, prix, deps: ds, encs: es, encaisse, resteEnc: prix - encaisse,
      statEnc: encaisse <= 0 ? 'non' : (encaisse < prix ? 'partiel' : 'total'),
      tissu, tailleur, livraison, autres: engage - tissu - tailleur - livraison,
      engage, paye, resteCout: engage - paye, marge: prix - engage, taux: prix > 0 ? (prix - engage) / prix : null, cashNet: encaisse - paye,
      statut, dateLivraisonPrevue, jours, urgent, retard, livree,
      telephone: c.telephone || '', adresse: c.adresse || '', dateMesure: c.dateMesure || '', dateRendezVous: c.dateRendezVous || '',
      modeleIds: Array.isArray(c.modeleIds) ? c.modeleIds : [], mesures: c.mesures && (c.mesures.haut || c.mesures.bas) ? { haut: c.mesures.haut || {}, bas: c.mesures.bas || {} } : emptyMesures(),
      remarqueTailleur: c.remarqueTailleur || ''
    };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id)));
  const cmdBy = {}; cmds.forEach((c) => { cmdBy[c.id] = c; });
  const livraisons = cmds.filter((c) => c.urgent).sort((a, b) => a.jours - b.jours);

  /* clients : regroupement des commandes par téléphone (identité simple, sans doublon à fusionner) */
  const clientsBy = {};
  cmds.forEach((c) => {
    const key = trim(c.telephone);
    if (!key) return;
    if (!clientsBy[key]) clientsBy[key] = { telephone: key, nom: c.client, adresse: c.adresse, commandes: [], ca: 0, encaisse: 0, engage: 0, resteEnc: 0, _lastDate: '' };
    const cl = clientsBy[key];
    if ((c.date || '') >= cl._lastDate) { cl.nom = c.client; if (c.adresse) cl.adresse = c.adresse; cl._lastDate = c.date || cl._lastDate; }
    cl.commandes.push(c); cl.ca += c.prix; cl.encaisse += c.encaisse; cl.engage += c.engage; cl.resteEnc += c.resteEnc;
  });
  const clients = Object.values(clientsBy).sort((a, b) => (b._lastDate || '').localeCompare(a._lastDate || ''));
  const clientBy = {}; clients.forEach((c) => { clientBy[c.telephone] = c; });

  /* catalogue des modèles (nom, description, photo, 4 gammes de prix) */
  const modeles = D.modeles.map((m) => ({ ...m, usage: cmds.filter((c) => c.modeleIds.includes(m.id)).length })).sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
  const modeleBy = {}; modeles.forEach((m) => { modeleBy[m.id] = m; });

  const engNat = (n) => sum(deps.filter((d) => d.nature === n), (d) => d.engage);
  const payNat = (n) => sum(deps.filter((d) => d.nature === n), (d) => d.paye);
  const engKey = (k) => sum(deps.filter((d) => d.key === k), (d) => d.engage);
  const payKey = (k) => sum(deps.filter((d) => d.key === k), (d) => d.paye);
  const T = {};
  T.CA = sum(cmds, (c) => c.prix);
  T.direct = engNat('direct'); T.remun = engNat('remuneration');
  /* frais de transfert Mobile Money : prélevés par l'opérateur, ils réduisent
     réellement la caisse (côté trésorerie) et sont une charge générale de
     plus (côté résultat) — jamais un coût direct d'une commande précise. */
  T.chargesGenDep = engNat('general'); T.chargesGenDepP = payNat('general');
  T.fraisPai = sum(D.paiements, (p) => Number(p.frais) || 0);
  T.fraisEnc = sum(D.encaissements, (e) => Number(e.frais) || 0);
  T.fraisMM = T.fraisPai + T.fraisEnc;
  T.general = T.chargesGenDep + T.fraisMM; T.generalP = T.chargesGenDepP + T.fraisMM;
  T.totalEngage = T.direct + T.general + T.remun;
  T.engageAll = sum(deps, (d) => d.engage);
  T.tissuE = engKey('tissu'); T.tailleurE = engKey('tailleur'); T.livraisonE = engKey('livraison');
  T.autresE = T.direct - T.tissuE - T.tailleurE - T.livraisonE;
  T.directP = payNat('direct'); T.remunP = payNat('remuneration');
  T.tissuP = payKey('tissu'); T.tailleurP = payKey('tailleur'); T.livraisonP = payKey('livraison');
  T.autresP = T.directP - T.tissuP - T.tailleurP - T.livraisonP;
  T.marge = T.CA - T.direct; T.taux = T.CA > 0 ? T.marge / T.CA : null;
  T.resultat = T.marge - T.general - T.remun;
  T.enc = sum(D.encaissements, (e) => e.montant) - T.fraisEnc;
  T.dec = sum(D.paiements, (p) => p.montant) + T.fraisPai;
  T.flux = T.enc - T.dec;
  T.init = Number(S.soldeInitial) || 0;
  T.solde = T.init + T.flux;
  T.payeDeps = sum(deps, (d) => d.paye);
  T.dette = {}; Object.keys(DETTES).forEach((k) => { T.dette[k] = sum(deps.filter((d) => d.dette === k), (d) => d.reste); });
  T.detteTotal = Object.values(T.dette).reduce((a, b) => a + b, 0);
  T.detteAll = sum(deps, (d) => d.reste);
  T.creances = sum(cmds, (c) => c.resteEnc);
  T.decHors = T.dec - T.payeDeps;
  T.encHors = T.enc - sum(cmds, (c) => c.encaisse);
  T.pont = T.resultat - (T.flux + T.creances - T.detteAll); // 0 quand tout est cohérent

  /* alertes (mêmes contrôles que la version Excel) */
  const alerts = [];
  deps.forEach((d) => {
    if (!d.date) alerts.push({ t: 'dep', id: d.id, m: 'Date d’engagement manquante' });
    if (!d.cat) alerts.push({ t: 'dep', id: d.id, m: d.categorie ? `Catégorie inconnue « ${d.categorie} »` : 'Catégorie manquante' });
    d.commandes.forEach((x) => { if (!cmdBy[x.commande]) alerts.push({ t: 'dep', id: d.id, m: `Commande inconnue ${x.commande}` }); });
    if (d.nature === 'direct' && !d.commandes.length) alerts.push({ t: 'dep', id: d.id, m: 'Coût direct sans commande associée' });
    if (d.paye > d.engage + 0.5) alerts.push({ t: 'dep', id: d.id, m: 'Total payé supérieur au montant engagé' });
    if (d.commandes.length > 1 && Math.abs(sum(d.commandes, (x) => x.montant) - d.engage) > 0.5) alerts.push({ t: 'dep', id: d.id, m: 'La répartition entre commandes ne correspond pas au montant engagé' });
  });
  D.paiements.forEach((p) => {
    if (!p.date) alerts.push({ t: 'pai', id: p.id, m: 'Date de paiement manquante' });
    if (!depBy[p.depenseId]) alerts.push({ t: 'pai', id: p.id, m: 'Paiement non rattaché à une dépense' });
  });
  D.encaissements.forEach((e) => {
    if (!e.date) alerts.push({ t: 'enc', id: e.id, m: 'Date d’encaissement manquante' });
    if (!cmdBy[e.commande]) alerts.push({ t: 'enc', id: e.id, m: 'Encaissement non rattaché à une commande' });
  });
  cmds.forEach((c) => {
    if (!c.date) alerts.push({ t: 'cmd', id: c.id, m: 'Date de commande manquante' });
    if (c.prix <= 0) alerts.push({ t: 'cmd', id: c.id, m: 'Prix de vente manquant' });
    if (c.encaisse > c.prix + 0.5) alerts.push({ t: 'cmd', id: c.id, m: 'Encaissé supérieur au prix de vente' });
    if (c.marge < 0) alerts.push({ t: 'cmd', id: c.id, m: 'Marge négative : les coûts dépassent le prix de vente' });
  });

  /* mouvements de trésorerie avec solde courant */
  const movs = [];
  D.encaissements.forEach((e) => { const c = cmdBy[e.commande]; const frais = Number(e.frais) || 0; movs.push({ kind: 'in', coll: 'encaissements', id: e.id, date: e.date || '', montant: (Number(e.montant) || 0) - frais, brut: Number(e.montant) || 0, frais, mode: e.mode || '', ref: e.ref || '', title: c ? c.client : 'Commande inconnue', sub: c ? `${c.id}${c.description ? ' · ' + c.description : ''}` : (e.commande || '—') }); });
  D.paiements.forEach((p) => { const d = depBy[p.depenseId]; const frais = Number(p.frais) || 0; movs.push({ kind: 'out', coll: 'paiements', id: p.id, date: p.date || '', montant: (Number(p.montant) || 0) + frais, brut: Number(p.montant) || 0, frais, mode: p.mode || '', ref: p.ref || '', title: d ? d.beneficiaire : 'Dépense inconnue', sub: d ? `${d.id} · ${d.description || d.categorie}` : (p.depenseId || '—') }); });
  movs.sort(byDate);
  let run = T.init; movs.forEach((m) => { run += m.kind === 'in' ? m.montant : -m.montant; m.solde = run; });

  return { deps, depBy, cmds, cmdBy, T, alerts, livraisons, movs: movs.reverse(), catBy, clients, clientBy, modeles, modeleBy };
}

/* agrégats d'un mois (mêmes formules que le classeur Excel) */
function monthAgg(year, m) {
  const D = store.data, { deps, depBy, cmds, T } = V;
  const start = `${year}-${pad(m)}-01`, end = `${year}-${pad(m)}-${pad(lastDay(year, m))}`;
  const inM = (d) => d && d >= start && d <= end;
  const upTo = (d) => d && d <= end;
  const before = (d) => d && d < start;
  const r = {};
  r.start = start; r.end = end;
  const fraisEnc = (fn) => sum(D.encaissements.filter(fn), (e) => Number(e.frais) || 0);
  const fraisPai = (fn) => sum(D.paiements.filter(fn), (p) => Number(p.frais) || 0);
  r.ca = sum(cmds.filter((c) => inM(c.date)), (c) => c.prix);
  r.direct = sum(deps.filter((d) => d.nature === 'direct' && inM(d.date)), (d) => d.engage);
  r.fraisMM = fraisEnc((e) => inM(e.date)) + fraisPai((p) => inM(p.date));
  r.general = sum(deps.filter((d) => d.nature === 'general' && inM(d.date)), (d) => d.engage) + r.fraisMM;
  r.remun = sum(deps.filter((d) => d.nature === 'remuneration' && inM(d.date)), (d) => d.engage);
  r.marge = r.ca - r.direct; r.taux = r.ca > 0 ? r.marge / r.ca : null;
  r.total = r.direct + r.general + r.remun;
  r.resultat = r.marge - r.general - r.remun;
  r.enc = sum(D.encaissements.filter((e) => inM(e.date)), (e) => e.montant) - fraisEnc((e) => inM(e.date));
  r.dec = sum(D.paiements.filter((p) => inM(p.date)), (p) => p.montant) + fraisPai((p) => inM(p.date));
  r.flux = r.enc - r.dec;
  r.open = T.init + (sum(D.encaissements.filter((e) => before(e.date)), (e) => e.montant) - fraisEnc((e) => before(e.date)))
    - (sum(D.paiements.filter((p) => before(p.date)), (p) => p.montant) + fraisPai((p) => before(p.date)));
  r.close = r.open + r.flux;
  r.dette = {};
  Object.keys(DETTES).forEach((k) => {
    r.dette[k] = sum(deps.filter((d) => d.dette === k && upTo(d.date)), (d) => d.engage)
      - sum(D.paiements.filter((p) => upTo(p.date) && depBy[p.depenseId] && depBy[p.depenseId].dette === k), (p) => p.montant);
  });
  r.detteTotal = Object.values(r.dette).reduce((a, b) => a + b, 0);
  r.creances = sum(cmds.filter((c) => upTo(c.date)), (c) => c.prix) - sum(D.encaissements.filter((e) => upTo(e.date)), (e) => e.montant);
  return r;
}

/* ---------- rendu différé ---------- */
let raf = 0;
function scheduleRender() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => render()); }

/* =====================================================================
   Export .xlsx sans bibliothèque externe (fichier zip « stocké » + XML)
   Fonctionne hors ligne. Une ligne d’en-tête colorée, montants au format 1 234.
   ===================================================================== */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function zipStore(files) {
  const enc = new TextEncoder(); const parts = []; const cds = []; let off = 0;
  files.forEach((f) => {
    const nm = enc.encode(f.name); const crc = crc32(f.data); const sz = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true);
    lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nm, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true);
    ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    cds.push(new Uint8Array(ch.buffer), nm);
    off += 30 + nm.length + sz;
  });
  const cdSize = cds.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  const all = [...parts, ...cds, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0)); let o = 0;
  all.forEach((p) => { out.set(p, o); o += p.length; });
  return out;
}

function xmlEsc(v) { return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function colName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

/* sheets : [{ name, rows: [objets], wch: [largeurs] }] → Uint8Array (.xlsx) */
function makeXlsx(sheets) {
  const enc = new TextEncoder(); const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const sheetXml = (sh) => {
    const keys = []; sh.rows.forEach((r) => Object.keys(r).forEach((k) => { if (!keys.includes(k)) keys.push(k); }));
    const cell = (ref, v, s) => (typeof v === 'number' && isFinite(v)) ? `<c r="${ref}" s="2"><v>${v}</v></c>` : `<c r="${ref}"${s ? ` s="${s}"` : ''} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v == null ? '' : v)}</t></is></c>`;
    let x = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>`;
    if (sh.wch) x += '<cols>' + sh.wch.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
    x += '<sheetData><row r="1" ht="30" customHeight="1">' + keys.map((k, i) => cell(colName(i) + '1', k, 1)).join('') + '</row>';
    sh.rows.forEach((r, ri) => { x += `<row r="${ri + 2}">` + keys.map((k, i) => cell(colName(i) + (ri + 2), r[k], 0)).join('') + '</row>'; });
    return x + '</sheetData></worksheet>';
  };
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2B2F6B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const files = [
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name.replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', text: styles },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) }))
  ];
  return zipStore(files.map((f) => ({ name: f.name, data: enc.encode(f.text) })));
}

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
/* Clé Picker : uniquement nécessaire si un tailleur rejoint l'atelier avec SON
   PROPRE compte Google (voir « Rejoindre un atelier existant » plus bas) et
   vit elle aussi dans config.js. Si tout le monde partage un seul compte
   Google, cette clé peut rester telle quelle — elle ne sert jamais. */
const DRIVE_PICKER_API_KEY = (typeof window !== 'undefined' && window.DRIVE_PICKER_API_KEY) || '';
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
  needsFileChoice: false,
  pickerBusy: false,
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
  /* '' (et non 'consent') : Google ne réaffiche l'écran d'autorisation que la
     toute première fois (ou si l'accès a été révoqué) ; les connexions
     suivantes ne demandent plus qu'un tap pour choisir le compte. */
  const got = await requestToken('');
  if (got) { await afterSignIn(); } else { scheduleRender(); }
}
async function reconnectGoogle() {
  const got = await requestToken('');
  if (got) { drive.hold = true; await reconcileDrive(false); drive.hold = false; }
  scheduleRender();
}

async function afterSignIn() {
  store.role = loadRole();
  await resolveDriveFile();
  drive.hold = true; render();
  if (drive.fileId) {
    await reconcileDrive(false);
    startDrivePolling();
  }
  drive.hold = false;
  render();
}

/* Après une sélection réussie via le sélecteur Google Drive (voir plus bas) :
   même suite que juste après la connexion, mais sans re-résoudre le fichier. */
async function afterFileResolved() {
  drive.hold = true; render();
  await reconcileDrive(false);
  startDrivePolling();
  drive.hold = false;
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
function rememberDriveFile(id) {
  drive.fileId = id;
  try { localStorage.setItem('mens-tunics-drive-file-id', id); } catch (e) { /* ignore */ }
}

/* Cherche, SANS jamais créer, un fichier déjà créé par l'app sous CE compte
   Google (drive.file ne laisse voir que ça). Renvoie son id, ou null si ce
   compte n'a encore aucune donnée Men's Tunics. */
async function findDriveFileByName() {
  const q = encodeURIComponent(`name='${DRIVE_FILE_NAME.replace(/'/g, "\\'")}' and trashed=false`);
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {});
  const json = await res.json();
  return (json.files && json.files.length) ? json.files[0].id : null;
}

async function createDriveFile() {
  const created = await driveFetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: DRIVE_FILE_NAME })
  });
  const cjson = await created.json();
  rememberDriveFile(cjson.id);
  await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${drive.fileId}?uploadType=media`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(backupObj())
  });
  return drive.fileId;
}

/* Point d'entrée après connexion : réutilise le fichier déjà connu sur CET
   APPAREIL, sinon cherche un fichier existant sous ce compte. Si rien n'est
   trouvé, on ne crée JAMAIS de fichier en silence (ça isolerait un tailleur
   qui rejoint un atelier existant avec son propre compte) : on affiche un
   choix explicite (voir fileChoiceView) — la création reste un clic conscient. */
async function resolveDriveFile() {
  if (drive.fileId) return drive.fileId;
  try { const cached = localStorage.getItem('mens-tunics-drive-file-id'); if (cached) { drive.fileId = cached; return cached; } } catch (e) { /* ignore */ }
  const found = await findDriveFileByName();
  if (found) { rememberDriveFile(found); return found; }
  drive.needsFileChoice = true;
  return null;
}

async function chooseCreateDriveFile() {
  drive.needsFileChoice = false;
  drive.hold = true; render();
  await createDriveFile();
  drive.hold = false;
  await afterFileResolved();
}

/* ---------- sélecteur Google Drive (rejoindre un atelier existant avec son propre compte) ---------- */
function loadPickerLib() {
  return new Promise((resolve) => {
    if (window.google && window.google.picker) { resolve(true); return; }
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.async = true; s.defer = true;
    s.onload = () => { try { gapi.load('picker', () => resolve(true)); } catch (e) { resolve(false); } };
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

async function chooseJoinExistingAtelier() {
  if (!DRIVE_PICKER_API_KEY) {
    toast("La clé du sélecteur Google Drive n'est pas configurée (voir le guide, config.js).");
    return;
  }
  drive.pickerBusy = true; render();
  const ok = await loadPickerLib();
  drive.pickerBusy = false; render();
  if (!ok) { toast("Impossible d'ouvrir le sélecteur Google Drive."); return; }
  /* Pas de filtre par type de fichier : le fichier créé via l'API Drive n'a
     pas toujours le type MIME "application/json" enregistré côté Google
     selon la façon dont il a été créé, et un filtre trop strict risquerait
     de le rendre invisible dans le sélecteur. Le nom du fichier suffit à
     le reconnaître ("Men's Tunics — Données.json"), et l'onglet "Partagés
     avec moi" du sélecteur (inclus par défaut) le retrouve de toute façon. */
  const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
    .setIncludeFolders(false)
    .setSelectFolderEnabled(false);
  const picker = new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(drive.accessToken)
    .setDeveloperKey(DRIVE_PICKER_API_KEY)
    .setTitle("Choisis le fichier de données partagé par l'atelier")
    .setCallback(async (data) => {
      if (data && data.action === google.picker.Action.PICKED && data.docs && data.docs[0]) {
        drive.needsFileChoice = false;
        rememberDriveFile(data.docs[0].id);
        await afterFileResolved();
      }
    })
    .build();
  picker.setVisible(true);
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
  drive.signedIn = false; drive.accessToken = null; drive.fileId = null; drive.needsFileChoice = false;
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
function fileChoiceView() {
  return `<div class="gate">
    <div class="gate-card">
      <h2>Aucune donnée trouvée sous ce compte</h2>
      <p class="muted">Ce compte Google n'a encore aucune donnée Men's Tunics. Est-ce la toute première fois que l'atelier utilise l'application, ou rejoins-tu un atelier déjà en place avec ton propre compte Google ?</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">
        <button class="btn primary lg" data-act="drive-create">Première utilisation : créer les données de l'atelier</button>
        <button class="btn lg" data-act="drive-join" ${drive.pickerBusy ? 'disabled' : ''}>${drive.pickerBusy ? 'Ouverture…' : "Rejoindre un atelier existant (fichier déjà partagé avec moi)"}</button>
      </div>
      <p class="muted" style="margin-top:14px;font-size:12.5px">Pour rejoindre un atelier existant, le gérant doit d'abord avoir partagé le fichier de données avec ton adresse Gmail depuis son Google Drive (clic droit sur le fichier → Partager).</p>
    </div>
  </div>`;
}
function reconnectBanner() {
  if (!drive.needsReconnect) return '';
  return `<div class="banner"><span>${icon('alert')}La connexion à Google Drive a été perdue. Vos saisies restent sur cet appareil en attendant.</span><button class="btn sm" data-act="google-reconnect">Reconnecter</button></div>`;
}

/* =====================================================================
   Composants
   ===================================================================== */
const icon = (n, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const NAV = [
  ['dashboard', 'Tableau de bord', 'Accueil', 'dash'],
  ['commandes', 'Commandes', 'Commandes', 'bag'],
  ['clients', 'Clients', 'Clients', 'user'],
  ['depenses', 'Dépenses', 'Dépenses', 'receipt'],
  ['tresorerie', 'Trésorerie', 'Trésorerie', 'wallet'],
  ['rapport', 'Rapport mensuel', 'Rapport', 'cal'],
  ['parametres', 'Paramètres', 'Réglages', 'sliders'],
  ['tailleur', 'Mes commandes', 'Commandes', 'tunic']
];
const TAB_KEYS = ['dashboard', 'commandes', 'clients', 'depenses', 'tresorerie'];
const TAB_KEYS_TAILLEUR = ['tailleur'];
const STAT = {
  non: { t: 'Non payé', c: 'crit', i: 'circle' },
  partiel: { t: 'Partiellement payé', c: 'warn', i: 'half' },
  total: { t: 'Payé intégralement', c: 'good', i: 'done' }
};
const STAT_ENC = {
  non: { t: 'Non encaissé', c: 'crit', i: 'circle' },
  partiel: { t: 'Partiellement encaissé', c: 'warn', i: 'half' },
  total: { t: 'Encaissé intégralement', c: 'good', i: 'done' }
};
const pill = (s, map = STAT) => `<span class="pill ${map[s].c}">${icon(map[s].i)}${map[s].t}</span>`;
const tip = (...lines) => `data-tip="${esc(lines.join('\n'))}"`;
const ratio = (a, b) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
const val = (n) => `${fmt(n)}<small>FCFA</small>`;

function pageHead(title, sub, actions = '') {
  return `<div class="head"><div><h1>${esc(title)}</h1><p>${sub}</p></div><div class="actions">${actions}</div></div>`;
}
const btnNew = (act, label, extra = '', primary = false) => `<button class="btn ${primary ? 'primary' : ''}" data-act="${act}" ${extra}>${icon('plus', 'sm')}${label}</button>`;

function emptyBlock(title, text, btn = '') {
  return `<div class="empty"><b>${title}</b>${text}${btn ? `<div style="margin-top:12px">${btn}</div>` : ''}</div>`;
}

function banners() {
  const ex = ['commandes', 'depenses', 'paiements', 'encaissements'].reduce((n, k) => n + store.data[k].filter((x) => x.ex).length, 0);
  let h = '';
  if (ex > 0) h += `<div class="banner info"><span>${icon('info')}Vous voyez des données d’exemple (tissu, tailleur, frère, cousin…). Elles illustrent chaque cas de votre cahier des charges.</span><button class="btn sm" data-act="clear-examples">Supprimer les exemples</button></div>`;
  if (store.storageErr) h += `<div class="banner warn"><span>${icon('alert')}Ce navigateur refuse d’enregistrer vos saisies : elles seront perdues à la fermeture. Téléchargez une sauvegarde régulièrement.</span><button class="btn sm" data-act="backup">Sauvegarder</button></div>`;
  h += reconnectBanner();
  return h;
}

/* =====================================================================
   Tableau de bord
   ===================================================================== */
function tile(o) {
  return `<div class="tile ${o.cls || ''}" style="--k:${o.k}"><div class="lab"><i></i>${o.lab}</div><div class="val ${o.neg ? 'neg' : ''}">${val(o.v)}</div><div class="note">${o.note}</div></div>`;
}

function viewDashboard() {
  const T = V.T;
  const tiles = [
    tile({ lab: 'Gagné', k: 'var(--s-eng)', v: T.resultat, neg: T.resultat < 0, note: `Résultat estimé sur les coûts engagés · marge brute ${fmt(T.marge)}` }),
    tile({ lab: 'À payer', k: 'var(--s-rest)', v: T.detteAll, note: `Engagé ${fmt(T.engageAll)} − payé ${fmt(T.payeDeps)}` }),
    tile({ lab: 'Payé', k: 'var(--s-paid)', v: T.dec, note: `${T.engageAll > 0 ? pct(T.payeDeps / T.engageAll) : '—'} des coûts engagés` }),
    tile({ lab: 'Encaissé', k: 'var(--s-in)', v: T.enc, note: `${T.CA > 0 ? pct(T.enc / T.CA) : '—'} des ventes (${fmt(T.CA)})` }),
    tile({ lab: 'En caisse', k: 'var(--cash-ink)', cls: 'cash', v: T.solde, neg: false, note: `Encaissé − payé${T.init ? ' + solde initial' : ''} : l’argent réellement disponible` })
  ].join('');
  const actions = btnNew('new:cmd', 'Commande') + btnNew('new:dep', 'Dépense') + btnNew('new:pai', 'Payer') + btnNew('new:enc', 'Encaisser', '', true);
  return pageHead('Tableau de bord', 'Cumul depuis le début du suivi · montants en FCFA', actions)
    + banners()
    + cardLivraisons()
    + `<section class="tiles" aria-label="Les cinq chiffres à ne jamais confondre">${tiles}</section>`
    + `<section class="g2 mt">${cardActivite()}${cardCaisse()}</section>`
    + cardPont()
    + `<section class="g21 mt">${cardCategories()}${cardDettes()}</section>`
    + `<section class="g2 mt">${cardAPayer()}${cardAEncaisser()}</section>`
    + cardAlertes();
}

function statutSelClass(s) { return { nouvelle: 'ink', enCours: 'warn', pret: 'good', livree: 'good', annulee: 'crit' }[s] || 'ink'; }
function statutSelect(c) {
  return `<select class="statut-sel ${statutSelClass(c.statut)}" data-act="set-statut" data-id="${esc(c.id)}" aria-label="Statut de la commande ${esc(c.id)}">${STATUTS_CMD_ORDER.map((k) => `<option value="${k}" ${k === c.statut ? 'selected' : ''}>${esc(STATUTS_CMD[k])}</option>`).join('')}</select>`;
}
function livraisonLabel(c) {
  if (c.livree) return { t: 'Livrée', c: 'good' };
  if (c.statut === 'annulee') return { t: 'Annulée', c: '' };
  if (!c.dateLivraisonPrevue) return null;
  if (c.jours < 0) return { t: `En retard de ${Math.abs(c.jours)} j`, c: 'crit' };
  if (c.jours === 0) return { t: 'Livraison aujourd’hui', c: 'crit' };
  if (c.jours <= DELAI_ALERTE) return { t: `Dans ${c.jours} j`, c: 'crit' };
  return { t: `Dans ${c.jours} j`, c: '' };
}
function cardLivraisons() {
  const list = V.livraisons;
  if (!list.length) return '';
  const rows = list.map((c) => {
    const lab = livraisonLabel(c);
    return `<div class="lrow" data-act="open:cmd" data-id="${esc(c.id)}" style="cursor:pointer"><div><b>${esc(c.client)}</b><span class="s">${esc(c.id)} · ${esc(c.description || '—')} · prévue le ${fdate(c.dateLivraisonPrevue)}</span></div><div class="amt" style="color:var(--crit-ink)">${esc(lab.t)}</div></div>`;
  }).join('');
  return `<div class="card crit-card"><div class="card-h"><div><h3>${icon('alert')}Livraisons urgentes (${list.length})</h3><p>Échéance dans ${DELAI_ALERTE} jour(s) ou moins, ou déjà dépassée</p></div></div><div class="list">${rows}</div></div>`;
}

function cardActivite() {
  const T = V.T;
  const total = Math.max(T.CA, T.totalEngage);
  const segs = [['Coûts directs', T.direct, 'var(--r1)'], ['Charges générales', T.general, 'var(--r2)'], ['Collaborateurs', T.remun, 'var(--r3)']];
  if (T.resultat > 0) segs.push(['Résultat estimé', T.resultat, 'var(--res)']);
  const bar = total > 0
    ? `<div class="stack" role="img" aria-label="Répartition du chiffre d’affaires">${segs.filter((s) => s[1] > 0).map((s) => `<i ${tip(s[0], money(s[1]), pct(s[1] / total) + ' du total')} style="flex:${s[1]};background:${s[2]}"></i>`).join('')}</div>`
      + `<div class="legend">${segs.map((s) => `<span style="--k:${s[2]}"><i></i>${s[0]}</span>`).join('')}</div>`
      + (T.totalEngage > T.CA ? `<p class="muted" style="margin-top:10px;font-size:12.5px">Les coûts dépassent les ventes de <b>${money(T.totalEngage - T.CA)}</b>.</p>` : '')
    : emptyBlock('Pas encore de vente', 'Ajoutez une commande pour voir où va votre chiffre d’affaires.');
  return `<div class="card"><div class="card-h"><div><h3>Ce que j’ai gagné</h3><p>Activité · calculée sur les coûts engagés, payés ou non</p></div></div>${bar}
  <dl class="kv">
    <div><dt>Chiffre d’affaires (ventes)</dt><dd>${fmt(T.CA)}</dd></div>
    <div><dt>Coûts directs engagés</dt><dd>− ${fmt(T.direct)}</dd></div>
    <div><dt>Marge brute</dt><dd>${signed(T.marge)} <span class="muted" style="font-weight:500">· ${pct(T.taux)}</span></dd></div>
    <div><dt>Charges générales engagées</dt><dd>− ${fmt(T.general)}</dd></div>
    <div><dt>Collaborateurs engagés</dt><dd>− ${fmt(T.remun)}</dd></div>
    <div class="tot"><dt>Résultat estimé</dt><dd class="${T.resultat < 0 ? 'neg' : ''}">${signed(T.resultat)}</dd></div>
  </dl></div>`;
}

function cardCaisse() {
  const T = V.T;
  const mx = Math.max(T.enc, T.dec, 1);
  return `<div class="card"><div class="card-h"><div><h3>Ce que j’ai en caisse</h3><p>Trésorerie · uniquement l’argent réellement reçu ou versé</p></div></div>
  <div class="hbars">
    <div class="hbar" style="--k:var(--s-in)"><div class="n"><i></i>Encaissé</div><div class="t"><i ${tip('Encaissé', money(T.enc))} style="width:${ratio(T.enc, mx)}%"></i></div><div class="v">${fmt(T.enc)}</div></div>
    <div class="hbar" style="--k:var(--s-paid)"><div class="n"><i></i>Payé</div><div class="t"><i ${tip('Payé (décaissé)', money(T.dec))} style="width:${ratio(T.dec, mx)}%"></i></div><div class="v">${fmt(T.dec)}</div></div>
  </div>
  <dl class="kv">
    <div><dt>Solde de trésorerie initial</dt><dd>${fmt(T.init)}</dd></div>
    <div><dt>Flux net (encaissé − payé)</dt><dd>${signed(T.flux)}</dd></div>
    <div class="tot"><dt>Solde de trésorerie actuel</dt><dd class="${T.solde < 0 ? 'neg' : ''}">${signed(T.solde).replace(/^\+/, '')}</dd></div>
    <div class="tiny"><dt>Ventes pas encore encaissées</dt><dd>${fmt(T.creances)}</dd></div>
    <div class="tiny"><dt>Coûts pas encore payés</dt><dd>${fmt(T.detteAll)}</dd></div>
  </dl></div>`;
}

function cardPont() {
  const T = V.T;
  const ok = Math.abs(T.pont) < 1;
  const verdict = ok
    ? `<span class="pill good">${icon('done')}Les deux réalités concordent</span>`
    : `<span class="pill warn">${icon('alert')}Écart de ${fmt(Math.abs(T.pont))} à expliquer</span>`;
  const bx = (l, v, s, c = '') => `<div class="bx ${c}"><small>${l}</small><b>${v}</b><span>${s}</span></div>`;
  return `<div class="card mt"><div class="card-h"><div><h3>Du résultat à la caisse</h3><p>Pourquoi ce que j’ai gagné n’est pas ce que j’ai en poche — et comment passer de l’un à l’autre</p></div>${verdict}</div>
  <div class="bridge">
    ${bx('Flux net de trésorerie', signed(T.flux), 'encaissé − payé')}
    <div class="op" aria-hidden="true">+</div>
    ${bx('Ventes à encaisser', fmt(T.creances), 'clients qui n’ont pas fini de payer')}
    <div class="op" aria-hidden="true">−</div>
    ${bx('Coûts à payer', fmt(T.detteAll), 'dettes envers fournisseurs, tailleurs…')}
    <div class="op" aria-hidden="true">=</div>
    ${bx('Résultat estimé', signed(T.resultat), 'ce que j’ai gagné', 'res')}
  </div></div>`;
}

function catRows() {
  const T = V.T;
  const rows = [['Tissus', T.tissuE, T.tissuP], ['Tailleurs', T.tailleurE, T.tailleurP], ['Livraisons', T.livraisonE, T.livraisonP]];
  if (Math.abs(T.autresE) > 0.5 || Math.abs(T.autresP) > 0.5) rows.push(['Autres coûts directs', T.autresE, T.autresP]);
  rows.push(['Charges générales', T.chargesGenDep, T.chargesGenDepP]);
  if (T.fraisMM > 0.5) rows.push(['Frais Mobile Money', T.fraisMM, T.fraisMM]);
  rows.push(['Collaborateurs', T.remun, T.remunP]);
  return rows;
}

function cardCategories() {
  const rows = catRows();
  const mx = Math.max(...rows.map((r) => r[1]), 1);
  const tot = rows.reduce((a, r) => [a[0] + r[1], a[1] + r[2]], [0, 0]);
  let body;
  if (ui.tblCat) {
    body = `<div class="tblwrap"><table class="t"><thead><tr><th>Catégorie</th><th>Engagé</th><th>Payé</th><th>Reste à payer</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td>${fmt(r[1])}</td><td>${fmt(r[2])}</td><td>${fmt(r[1] - r[2])}</td></tr>`).join('')}<tr class="b"><td>Total</td><td>${fmt(tot[0])}</td><td>${fmt(tot[1])}</td><td>${fmt(tot[0] - tot[1])}</td></tr></tbody></table></div>`;
  } else {
    body = `<div class="legend" style="margin:0 0 16px"><span style="--k:var(--s-paid)"><i></i>Payé</span><span style="--k:var(--s-rest)"><i></i>Reste à payer</span><span class="muted">· la barre entière = coût engagé</span></div><div class="cbars">${rows.map((r) => {
      const [nm, e, p] = r; const reste = e - p; const paidPart = Math.max(0, Math.min(p, e));
      return `<div class="cb"><div class="nm">${nm}</div><div class="plot"><div class="wrap"><div class="trk" style="width:${ratio(e, mx)}%">`
        + (paidPart > 0 ? `<i class="paid" ${tip(nm + ' · payé', money(p))} style="flex:${paidPart}"></i>` : '')
        + (reste > 0.5 ? `<i class="rest" ${tip(nm + ' · reste à payer', money(reste))} style="flex:${reste}"></i>` : '')
        + (e <= 0 ? '<i class="mbar" style="flex:1;height:16px;background:var(--line)"></i>' : '')
        + `</div></div><div class="val">${fmt(e)}</div></div><div class="sb">Payé ${fmt(p)} · Reste ${fmt(reste)}</div></div>`;
    }).join('')}</div>`;
  }
  return `<div class="card"><div class="card-h"><div><h3>Engagé, payé, reste à payer</h3><p>Par type de coût · le montant à droite est le coût engagé</p></div><button class="btn sm" data-act="tbl-cat">${ui.tblCat ? 'Voir le graphique' : 'Voir le tableau'}</button></div>${body}</div>`;
}

function cardDettes() {
  const T = V.T;
  const mx = Math.max(...Object.values(T.dette), 1);
  const rows = Object.keys(DETTES).map((k) => `<div class="hbar" style="--k:var(--s-rest);grid-template-columns:120px minmax(0,1fr) 84px"><div class="n">${DETTES[k]}</div><div class="t"><i ${tip('Dette · ' + DETTES[k], money(T.dette[k]))} style="width:${ratio(T.dette[k], mx)}%"></i></div><div class="v">${fmt(T.dette[k])}</div></div>`).join('');
  return `<div class="card"><div class="card-h"><div><h3>Ce que je dois encore</h3><p>Restes à payer par type de bénéficiaire</p></div></div>
  <div class="hbars" style="margin-top:6px">${rows}</div>
  <dl class="kv"><div class="tot"><dt>Total restant à payer</dt><dd>${fmt(T.detteTotal)}</dd></div></dl></div>`;
}

function cardAPayer() {
  const list = V.deps.filter((d) => d.reste > 0.5).sort((a, b) => (a.date || '').localeCompare(b.date || '')).slice(0, 6);
  const rows = list.map((d) => `<div class="lrow" data-act="open:dep" data-id="${esc(d.id)}" style="cursor:pointer"><div><b>${esc(d.beneficiaire || '—')}</b><span class="s">${esc(d.description || d.categorie)} · engagé ${fmt(d.engage)}</span></div><div class="amt">${fmt(d.reste)}</div><button class="btn sm" data-act="new:pai" data-dep="${esc(d.id)}">Payer</button></div>`).join('');
  return `<div class="card"><div class="card-h"><div><h3>À payer</h3><p>Les plus anciens engagements non soldés</p></div><button class="btn sm ghost" data-act="nav" data-v="depenses">Tout voir</button></div>${rows ? `<div class="list">${rows}</div>` : emptyBlock('Aucune dette en cours', 'Tous les coûts engagés sont soldés.')}</div>`;
}
function cardAEncaisser() {
  const list = V.cmds.filter((c) => c.resteEnc > 0.5).sort((a, b) => (a.date || '').localeCompare(b.date || '')).slice(0, 6);
  const rows = list.map((c) => `<div class="lrow" data-act="open:cmd" data-id="${esc(c.id)}" style="cursor:pointer"><div><b>${esc(c.client)}</b><span class="s">${esc(c.id)} · ${esc(c.description || '')} · vendu ${fmt(c.prix)}</span></div><div class="amt">${fmt(c.resteEnc)}</div><button class="btn sm" data-act="new:enc" data-cmd="${esc(c.id)}">Encaisser</button></div>`).join('');
  return `<div class="card"><div class="card-h"><div><h3>À encaisser</h3><p>Ventes que les clients n’ont pas encore fini de payer</p></div><button class="btn sm ghost" data-act="nav" data-v="commandes">Tout voir</button></div>${rows ? `<div class="list">${rows}</div>` : emptyBlock('Rien à encaisser', 'Toutes les commandes sont soldées.')}</div>`;
}

function alertOpen(a) {
  return a.t === 'dep' || a.t === 'cmd' ? `data-act="open:${a.t}" data-id="${esc(a.id)}"` : `data-act="edit:${a.t}" data-id="${esc(a.id)}"`;
}
function cardAlertes() {
  const al = V.alerts;
  if (!al.length) return '';
  const label = { dep: 'Dépense', cmd: 'Commande', pai: 'Paiement', enc: 'Encaissement' };
  return `<div class="card mt"><div class="card-h"><div><h3>À vérifier (${al.length})</h3><p>Lignes incomplètes ou incohérentes : elles faussent les totaux tant qu’elles ne sont pas corrigées</p></div></div>
  ${al.slice(0, 8).map((a) => `<div class="alert">${icon('alert')}<div><b>${label[a.t]} ${esc(a.id)}</b><span class="muted">${esc(a.m)}</span></div><button class="btn sm" style="margin-left:auto" ${alertOpen(a)}>Ouvrir</button></div>`).join('')}
  ${al.length > 8 ? `<p class="muted" style="margin-top:8px">… et ${al.length - 8} autre(s).</p>` : ''}</div>`;
}

/* =====================================================================
   Commandes
   ===================================================================== */
function viewCommandes() {
  const q = ui.q.trim().toLowerCase();
  const list = V.cmds.filter((c) => (ui.cmdFilter === 'all' || (ui.cmdFilter === 'open' ? c.resteEnc > 0.5 : c.resteEnc <= 0.5)) && (!q || `${c.id} ${c.client} ${c.description}`.toLowerCase().includes(q)));
  const nOpen = V.cmds.filter((c) => c.resteEnc > 0.5).length;
  const chip = (v, l, n) => `<button class="chip" data-act="setf" data-k="cmdFilter" data-v="${v}" aria-pressed="${ui.cmdFilter === v}">${l} <small>${n}</small></button>`;
  const cards = list.map((c) => {
    const mg = c.marge >= 0 ? `<span class="delta up">${icon('up', 'sm')}${signed(c.marge)}</span>` : `<span class="delta down">${icon('down', 'sm')}${signed(c.marge)}</span>`;
    const lab = livraisonLabel(c);
    return `<article class="cmd" data-act="open:cmd" data-id="${esc(c.id)}" tabindex="0" role="button" aria-label="Commande ${esc(c.id)}, ${esc(c.client)}">
      <header><span><span class="mono">${esc(c.id)}</span> · ${fdate(c.date)}</span>${pill(c.statEnc, STAT_ENC)}</header>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${statutSelect(c)}${lab ? `<span class="pill ${lab.c || 'ink'}">${lab.c === 'crit' ? icon('alert', 'sm') : ''}${esc(lab.t)}</span>` : ''}</div>
      <div><h4>${esc(c.client)}</h4><p class="muted">${esc(c.description || '—')}</p></div>
      <div class="price">${fmt(c.prix)}<small>FCFA · prix de vente</small></div>
      <div>
        <div class="ml"><span>Encaissé</span><span><b>${fmt(c.encaisse)}</b> / ${fmt(c.prix)}</span></div>
        <span class="mbar"><i class="inc" style="width:${ratio(c.encaisse, c.prix)}%"></i></span>
      </div>
      <div>
        <div class="ml"><span>Coût engagé <b>${fmt(c.engage)}</b></span><span>payé <b>${fmt(c.paye)}</b></span></div>
        <span class="mbar"><i class="paid" style="width:${ratio(c.paye, c.engage)}%"></i></span>
      </div>
      <footer><div><span>Marge estimée · ${pct(c.taux)}</span><b>${mg}</b></div><div style="text-align:right"><span>Cash net</span><b class="num">${signed(c.cashNet)}</b></div></footer>
    </article>`;
  }).join('');
  return pageHead('Commandes', 'La marge de chaque commande est calculée sur les coûts <b>engagés</b>, pas sur ce qui est déjà payé.', btnNew('new:cmd', 'Nouvelle commande', '', true))
    + banners()
    + `<div class="toolbar"><div class="field-search">${icon('search', 'sm')}<input id="q" type="search" placeholder="Rechercher un client, un numéro…" value="${esc(ui.q)}" autocomplete="off"></div><div class="chips">${chip('all', 'Toutes', V.cmds.length)}${chip('open', 'À encaisser', nOpen)}${chip('done', 'Soldées', V.cmds.length - nOpen)}</div></div>`
    + (cards ? `<div class="cards">${cards}</div>` : `<div class="card">${emptyBlock('Aucune commande', q ? 'Aucun résultat pour cette recherche.' : 'Créez votre première commande pour suivre sa rentabilité.', q ? '' : btnNew('new:cmd', 'Nouvelle commande', '', true))}</div>`);
}

/* =====================================================================
   Clients (regroupement des commandes par téléphone)
   ===================================================================== */
function viewClients() {
  const q = ui.q.trim().toLowerCase();
  const list = V.clients.filter((cl) => !q || `${cl.nom} ${cl.telephone} ${cl.adresse}`.toLowerCase().includes(q));
  const rows = list.map((cl) => `<article class="cmd" data-act="open:client" data-id="${esc(cl.telephone)}" tabindex="0" role="button" aria-label="Client ${esc(cl.nom)}">
      <header><span>${icon('user', 'sm')}${esc(cl.telephone)}</span><span class="pill ink">${cl.commandes.length} commande${cl.commandes.length > 1 ? 's' : ''}</span></header>
      <div><h4>${esc(cl.nom)}</h4><p class="muted">${esc(cl.adresse || '—')}</p></div>
      <div class="ml"><span>Total vendu</span><b>${fmt(cl.ca)}</b></div>
      <div class="ml"><span>Encaissé</span><b>${fmt(cl.encaisse)}</b></div>
      <footer><div><span>Reste à encaisser</span><b class="num">${fmt(cl.resteEnc)}</b></div><div style="text-align:right"><span>Dernière commande</span><b>${fdate(cl._lastDate)}</b></div></footer>
    </article>`).join('');
  return pageHead('Clients', 'Regroupés par numéro de téléphone : historique de commandes, mesures et modèles pour chacun.')
    + banners()
    + `<div class="toolbar"><div class="field-search">${icon('search', 'sm')}<input id="q" type="search" placeholder="Nom, téléphone, adresse…" value="${esc(ui.q)}" autocomplete="off"></div></div>`
    + (rows ? `<div class="cards">${rows}</div>` : `<div class="card">${emptyBlock('Aucun client', q ? 'Aucun résultat pour cette recherche.' : 'Renseignez le téléphone dans chaque commande pour faire apparaître le client ici.')}</div>`);
}

/* =====================================================================
   Vue Tailleur : uniquement mesures, modèles et rendez-vous — jamais
   les prix, encaissements, coûts ni la trésorerie.
   ===================================================================== */
function viewTailleur() {
  const q = ui.q.trim().toLowerCase();
  const list = V.cmds.filter((c) => c.statut !== 'annulee' && (!q || `${c.id} ${c.client} ${c.telephone} ${c.description}`.toLowerCase().includes(q)));
  const cards = list.map((c) => {
    const lab = livraisonLabel(c);
    const modeles = c.modeleIds.map((mid) => V.modeleBy[mid]).filter(Boolean);
    return `<article class="cmd" data-act="open:cmd" data-id="${esc(c.id)}" tabindex="0" role="button" aria-label="Commande ${esc(c.id)}, ${esc(c.client)}">
      <header><span><span class="mono">${esc(c.id)}</span> · ${fdate(c.date)}</span>${lab ? `<span class="pill ${lab.c || 'ink'}">${lab.c === 'crit' ? icon('alert', 'sm') : ''}${esc(lab.t)}</span>` : ''}</header>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${statutSelect(c)}</div>
      <div><h4>${esc(c.client)}</h4><p class="muted">${esc(c.description || '—')}${c.telephone ? ' · ' + esc(c.telephone) : ''}</p></div>
      ${modeles.length ? `<div class="ml"><span>Modèle(s)</span><b>${modeles.map((m) => esc(m.nom)).join(', ')}</b></div>` : ''}
      <footer><div><span>Rendez-vous</span><b>${c.dateRendezVous ? fdate(c.dateRendezVous) : '—'}</b></div><div style="text-align:right"><span>Livraison prévue</span><b>${c.dateLivraisonPrevue ? fdate(c.dateLivraisonPrevue) : '—'}</b></div></footer>
    </article>`;
  }).join('');
  return pageHead('Mes commandes', 'Mesures, modèles et rendez-vous de chaque commande à confectionner.')
    + `<div class="toolbar"><div class="field-search">${icon('search', 'sm')}<input id="q" type="search" placeholder="Client, numéro…" value="${esc(ui.q)}" autocomplete="off"></div></div>`
    + (cards ? `<div class="cards">${cards}</div>` : `<div class="card">${emptyBlock('Aucune commande', 'Rien à confectionner pour le moment.')}</div>`);
}

/* =====================================================================
   Dépenses (coûts engagés)
   ===================================================================== */
function viewDepenses() {
  const q = ui.q.trim().toLowerCase();
  const cnt = { all: V.deps.length, non: 0, partiel: 0, total: 0 };
  V.deps.forEach((d) => { cnt[d.statut]++; });
  const list = V.deps.filter((d) => (ui.depStatut === 'all' || d.statut === ui.depStatut) && (ui.depCat === 'all' || d.categorie === ui.depCat) && (!q || `${d.id} ${d.description} ${d.beneficiaire} ${d.categorie} ${d.commandes.map((x) => x.commande).join(' ')}`.toLowerCase().includes(q)));
  const chip = (v, l) => `<button class="chip" data-act="setf" data-k="depStatut" data-v="${v}" aria-pressed="${ui.depStatut === v}">${l} <small>${cnt[v]}</small></button>`;
  const E = sum(list, (d) => d.engage), P = sum(list, (d) => d.paye);
  const cmdTag = (d) => !d.commandes.length ? '' : d.commandes.length === 1 ? ' · ' + esc(d.commandes[0].commande) : ` · ${esc(d.commandes[0].commande)} +${d.commandes.length - 1}`;
  const rows = list.map((d) => `<div class="trow dep" data-act="open:dep" data-id="${esc(d.id)}" tabindex="0" role="button">
      <div class="c-date muted">${fdate(d.date)}</div>
      <div class="c-main"><b>${esc(d.description || d.categorie)}</b><span>${esc(d.beneficiaire || '—')} · ${esc(d.categorie || '—')}${cmdTag(d)}</span></div>
      <div class="c-eng r num"><span class="dl">Engagé</span>${fmt(d.engage)}</div>
      <div class="c-paid"><span class="dl">Payé</span><span class="num">${fmt(d.paye)}</span><span class="mbar" style="width:100%"><i class="paid" style="width:${ratio(d.paye, d.engage)}%"></i></span></div>
      <div class="c-rest r num"><span class="dl">Reste à payer</span><b>${fmt(d.reste)}</b></div>
      <div class="c-stat">${pill(d.statut)}</div>
      <div class="c-act">${d.reste > 0.5 ? `<button class="btn sm" data-act="new:pai" data-dep="${esc(d.id)}">Payer</button>` : ''}</div>
    </div>`).join('');
  const catOpts = `<option value="all">Toutes les catégories</option>` + store.settings.categories.map((c) => `<option ${ui.depCat === c.nom ? 'selected' : ''}>${esc(c.nom)}</option>`).join('');
  return pageHead('Dépenses', 'Chaque ligne est un coût <b>engagé</b>. Le payé, le reste et le statut se calculent à partir des paiements saisis.', btnNew('new:dep', 'Nouvelle dépense', '', true))
    + banners()
    + `<div class="toolbar"><div class="field-search">${icon('search', 'sm')}<input id="q" type="search" placeholder="Bénéficiaire, description, commande…" value="${esc(ui.q)}" autocomplete="off"></div><select id="fcat" aria-label="Catégorie">${catOpts}</select></div>`
    + `<div class="toolbar"><div class="chips">${chip('all', 'Toutes')}${chip('non', 'Non payées')}${chip('partiel', 'Partiellement payées')}${chip('total', 'Payées')}</div></div>`
    + `<div class="legend" style="margin:0 0 12px"><span>Sélection : <b>${list.length}</b> ligne(s)</span><span>Engagé <b class="num">${fmt(E)}</b></span><span>Payé <b class="num">${fmt(P)}</b></span><span>Reste à payer <b class="num">${fmt(E - P)}</b></span></div>`
    + (rows ? `<div class="table"><div class="trow dep th"><div>Date</div><div>Dépense</div><div class="r">Engagé</div><div class="r">Payé</div><div class="r">Reste</div><div>Statut</div><div></div></div>${rows}</div>` : `<div class="card">${emptyBlock('Aucune dépense', q || ui.depStatut !== 'all' ? 'Aucun résultat avec ces filtres.' : 'Enregistrez chaque coût dès qu’il est engagé, même s’il n’est pas encore payé.', btnNew('new:dep', 'Nouvelle dépense', '', true))}</div>`);
}

/* =====================================================================
   Trésorerie (encaissements + décaissements)
   ===================================================================== */
function viewTresorerie() {
  const T = V.T;
  const list = V.movs.filter((m) => ui.movFilter === 'all' || (ui.movFilter === 'in' ? m.kind === 'in' : m.kind === 'out'));
  const sg = (v, l) => `<button data-act="setf" data-k="movFilter" data-v="${v}" aria-pressed="${ui.movFilter === v}">${l}</button>`;
  const rows = list.map((m) => `<div class="trow mov" data-act="edit:${m.coll === 'paiements' ? 'pai' : 'enc'}" data-id="${esc(m.id)}" tabindex="0" role="button">
      <div class="mvi ${m.kind}">${icon(m.kind === 'in' ? 'in' : 'out', 'sm')}</div>
      <div class="c-main"><b>${esc(m.title)}</b><span>${fdate(m.date)} · ${esc(m.sub)}${m.mode ? ' · ' + esc(m.mode) : ''}${m.ref ? ' · ' + esc(m.ref) : ''}${m.frais > 0.5 ? ' · frais ' + fmt(m.frais) : ''}</span></div>
      <div class="c-amt r num"><b>${m.kind === 'in' ? '+' : '−'}${fmt(m.montant)}</b></div>
      <div class="c-bal r num muted">${fmt(m.solde)}</div>
    </div>`).join('');
  const t3 = [
    tile({ lab: 'Encaissé', k: 'var(--s-in)', v: T.enc, note: 'Argent reçu des clients, net des frais Mobile Money' }),
    tile({ lab: 'Payé', k: 'var(--s-paid)', v: T.dec, note: 'Argent réellement sorti, frais Mobile Money compris' }),
    tile({ lab: 'En caisse', k: 'var(--cash-ink)', cls: 'cash', v: T.solde, note: `Solde initial ${fmt(T.init)} + encaissé − payé` })
  ].join('');
  return pageHead('Trésorerie', 'Seuls les mouvements <b>réellement effectués</b> comptent ici : jamais les coûts engagés ni les ventes non encaissées.', btnNew('new:enc', 'Encaisser') + btnNew('new:pai', 'Payer', '', true))
    + banners()
    + `<section class="tiles t3">${t3}</section>`
    + (T.fraisMM > 0.5 ? `<div class="legend" style="margin:12px 0 0"><span class="muted">Frais de transfert Mobile Money cumulés (déjà déduits ci-dessus) : <b class="num">${fmt(T.fraisMM)}</b></span></div>` : '')
    + `<div class="toolbar mt"><div class="seg" role="group" aria-label="Type de mouvement">${sg('all', 'Tout')}${sg('in', 'Encaissements')}${sg('out', 'Décaissements')}</div></div>`
    + (rows ? `<div class="table"><div class="trow mov th"><div></div><div>Mouvement</div><div class="r">Montant</div><div class="r">Solde après</div></div>${rows}<div class="trow mov tf"><div></div><div class="c-main"><b>Solde initial</b></div><div></div><div class="c-bal r num">${fmt(T.init)}</div></div></div>` : `<div class="card">${emptyBlock('Aucun mouvement', 'Les encaissements et les paiements apparaîtront ici avec le solde après chaque opération.')}</div>`);
}

/* =====================================================================
   Rapport mensuel : 3 niveaux
   ===================================================================== */
function niceScale(min, max) {
  if (max <= 0 && min >= 0) return [0, 4000, 1000];
  const raw = (max - min) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step, step];
}
function barPath(x, y0, y1, w, r) {
  const h = Math.abs(y0 - y1); if (h < 0.5) return '';
  const rr = Math.min(r, h, w / 2);
  return y1 < y0
    ? `M${x},${y0}V${y1 + rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 + rr}V${y0}Z`
    : `M${x},${y0}V${y1 - rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 - rr}V${y0}Z`;
}
function monthChart(rows) {
  const W = 760, H = 280, pl = 54, pr = 8, pt = 12, pb = 30;
  const vals = rows.flatMap((r) => [r.resultat, r.flux]);
  const [lo, hi, step] = niceScale(Math.min(0, ...vals), Math.max(0, ...vals));
  const y = (v) => pt + ((hi - v) / (hi - lo)) * (H - pt - pb);
  const bw = (W - pl - pr) / 12, w = 14;
  let g = '';
  const n = Math.round((hi - lo) / step);
  for (let i = 0; i <= n; i++) {
    const v = lo + i * step;
    g += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${fmtK(v)}</text>`;
  }
  rows.forEach((r, i) => {
    const cx = pl + bw * (i + 0.5);
    if (i + 1 === ui.month) g += `<rect class="band" x="${pl + bw * i + 2}" y="${pt}" width="${bw - 4}" height="${H - pt - pb}" rx="8"/>`;
  });
  g += `<line class="axis" x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}"/>`;
  rows.forEach((r, i) => {
    const cx = pl + bw * (i + 0.5);
    g += `<path d="${barPath(cx - w - 1, y(0), y(r.resultat), w, 4)}" fill="var(--s-eng)"/>`;
    g += `<path d="${barPath(cx + 1, y(0), y(r.flux), w, 4)}" fill="var(--s-in)"/>`;
    g += `<text x="${cx}" y="${H - 10}" text-anchor="middle" ${i + 1 === ui.month ? 'style="fill:var(--ink);font-weight:700"' : ''}>${MOIS_C[i].replace('.', '')}</text>`;
    g += `<rect x="${pl + bw * i}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent" style="cursor:pointer" data-act="month-set" data-m="${i + 1}" ${tip(MOIS[i][0].toUpperCase() + MOIS[i].slice(1) + ' ' + ui.year, 'Résultat estimé : ' + signed(r.resultat) + ' FCFA', 'Flux de trésorerie : ' + signed(r.flux) + ' FCFA')}/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Résultat estimé et flux net de trésorerie, mois par mois">${g}</svg>`;
}

function viewRapport() {
  const A = monthAgg(ui.year, ui.month);
  const rows = Array.from({ length: 12 }, (_, i) => monthAgg(ui.year, i + 1));
  const name = `${MOIS[ui.month - 1]} ${ui.year}`;
  const nav = `<div class="mnav"><button class="icon-btn" data-act="month" data-d="-1" aria-label="Mois précédent">${icon('chev-l')}</button><b>${name}</b><button class="icon-btn" data-act="month" data-d="1" aria-label="Mois suivant">${icon('chev-r')}</button></div>`;
  const ln = (l, v, cls = '') => `<div class="${cls}"><dt>${l}</dt><dd>${v}</dd></div>`;
  const level = (tag, title, sub, body) => `<div class="card lvl"><span class="tag">${tag}</span><div class="card-h" style="margin-bottom:0"><div><h3>${title}</h3><p>${sub}</p></div></div><dl class="kv">${body}</dl></div>`;
  const l1 = level('Niveau 1', 'Activité / rentabilité', 'Base : les coûts engagés du mois',
    ln('Chiffre d’affaires', fmt(A.ca))
    + ln('Coûts directs engagés', '− ' + fmt(A.direct))
    + ln('Marge brute', `${signed(A.marge)} <span class="muted" style="font-weight:500">· ${pct(A.taux)}</span>`)
    + ln('Charges générales engagées', '− ' + fmt(A.general))
    + ln('Collaborateurs engagés', '− ' + fmt(A.remun))
    + ln('Total coûts engagés', fmt(A.total), 'tiny')
    + ln('Résultat estimé', signed(A.resultat), 'tot'));
  const l2 = level('Niveau 2', 'Trésorerie', 'Base : l’argent réellement reçu ou versé',
    ln('Solde d’ouverture', fmt(A.open))
    + ln('Encaissements', '+ ' + fmt(A.enc))
    + ln('Décaissements', '− ' + fmt(A.dec))
    + ln('Flux net', signed(A.flux))
    + ln('Solde de clôture', signed(A.close).replace(/^\+/, ''), 'tot'));
  const l3 = level('Niveau 3', 'Engagements financiers', 'Restes à payer à la fin du mois',
    ln('Dettes fournisseurs', fmt(A.dette.fournisseurs))
    + ln('Dettes envers les tailleurs', fmt(A.dette.tailleurs))
    + ln('Dettes envers les collaborateurs', fmt(A.dette.collaborateurs))
    + ln('Autres dettes', fmt(A.dette.autres))
    + ln('Total restant à payer', fmt(A.detteTotal), 'tot')
    + ln('Ventes pas encore encaissées', fmt(A.creances), 'tiny'));
  const phrase = `En ${MOIS[ui.month - 1]}, l’activité a dégagé <b>${signed(A.resultat)} FCFA</b> de résultat estimé, alors que l’argent en caisse a varié de <b>${signed(A.flux)} FCFA</b>.`;

  const cols = rows.map((r, i) => `<th class="${i + 1 === ui.month ? 'sel' : ''}">${MOIS_C[i].replace('.', '')}</th>`).join('');
  const trow = (l, f, cls = '') => `<tr class="${cls}"><td>${l}</td>${rows.map((r, i) => `<td class="${i + 1 === ui.month ? 'sel' : ''}">${fmt(f(r))}</td>`).join('')}<td>${fmt(f(rows[11], true))}</td></tr>`;
  const yr = (k) => rows.reduce((s, r) => s + r[k], 0);
  const trowFlow = (l, k, cls = '') => `<tr class="${cls}"><td>${l}</td>${rows.map((r, i) => `<td class="${i + 1 === ui.month ? 'sel' : ''}">${fmt(r[k])}</td>`).join('')}<td><b>${fmt(yr(k))}</b></td></tr>`;
  const trowStock = (l, k, cls = '') => `<tr class="${cls}"><td>${l}</td>${rows.map((r, i) => `<td class="${i + 1 === ui.month ? 'sel' : ''}">${fmt(r[k])}</td>`).join('')}<td>${fmt(rows[11][k])}</td></tr>`;
  const table = `<div class="tblwrap"><table class="t"><thead><tr><th>Ligne</th>${cols}<th>Année</th></tr></thead><tbody>
    ${trowFlow('Chiffre d’affaires', 'ca')}${trowFlow('Coûts directs engagés', 'direct')}${trowFlow('Marge brute', 'marge', 'b')}${trowFlow('Charges générales', 'general')}${trowFlow('Collaborateurs', 'remun')}${trowFlow('Résultat estimé', 'resultat', 'b')}
    ${trowFlow('Encaissements', 'enc')}${trowFlow('Décaissements', 'dec')}${trowFlow('Flux net', 'flux', 'b')}${trowStock('Solde de clôture', 'close', 'b')}${trowStock('Total restant à payer', 'detteTotal', 'b')}
  </tbody></table></div>`;

  return pageHead('Rapport mensuel', 'Trois niveaux à ne jamais mélanger : activité, trésorerie, engagements.', nav)
    + banners()
    + `<div class="banner info" style="margin-bottom:16px"><span>${icon('info')}<span style="display:block;font-weight:600">${phrase}</span></span></div>`
    + `<section class="g3">${l1}${l2}${l3}</section>`
    + `<section class="card mt"><div class="card-h"><div><h3>Résultat estimé et flux de trésorerie, ${ui.year}</h3><p>Le résultat suit les engagements, la trésorerie suit l’argent réel : les deux barres d’un mois sont rarement égales. Cliquez un mois pour l’afficher.</p></div></div>
      <div class="legend" style="margin:0 0 6px"><span style="--k:var(--s-eng)"><i></i>Résultat estimé</span><span style="--k:var(--s-in)"><i></i>Flux net de trésorerie</span></div>
      <div class="chartbox">${monthChart(rows)}</div></section>`
    + `<section class="card mt"><div class="card-h"><div><h3>Historique de l’année ${ui.year}</h3><p>Mêmes lignes que le rapport, mois par mois (montants en FCFA)</p></div></div>${table}</section>`;
}

/* =====================================================================
   Paramètres
   ===================================================================== */
function catRow(c, i) {
  return `<div class="catrow" data-old="${esc(c ? c.nom : '')}" data-key="${esc(c && c.key ? c.key : '')}">
    <input name="nom" aria-label="Nom de la catégorie" value="${esc(c ? c.nom : '')}" placeholder="Nom de la catégorie">
    <select name="nature" aria-label="Nature">${Object.keys(NATURES).map((k) => `<option value="${k}" ${c && c.nature === k ? 'selected' : ''}>${NATURES[k]}</option>`).join('')}</select>
    <select name="dette" aria-label="Type de dette">${Object.keys(DETTES).map((k) => `<option value="${k}" ${c && c.dette === k ? 'selected' : ''}>${DETTES[k]}</option>`).join('')}</select>
    <button type="button" class="icon-btn" data-act="cat-del" aria-label="Retirer la catégorie" ${c && c.key ? 'disabled title="Catégorie utilisée par le tableau de bord"' : ''}>${icon('trash')}</button>
  </div>`;
}
function viewParametres() {
  const S = store.settings;
  const hasEx = ['commandes', 'depenses', 'paiements', 'encaissements'].some((k) => store.data[k].some((x) => x.ex));
  return pageHead('Paramètres', 'Trésorerie de départ, catégories, modes de paiement et export.')
    + banners()
    + `<div class="g2">
      <div class="card"><div class="card-h"><div><h3>Trésorerie de départ</h3><p>L’argent réellement disponible (caisse, Mobile Money, banque) au début du suivi</p></div></div>
        <form id="set-solde" class="fields1"><label class="fld" for="s-solde"><span>Solde initial (FCFA)</span><input id="s-solde" name="solde" type="number" inputmode="numeric" step="1" value="${esc(S.soldeInitial)}"></label>
        <div style="margin-top:12px"><button class="btn primary" type="submit">Enregistrer</button></div></form></div>
      <div class="card"><div class="card-h"><div><h3>Modes de paiement</h3><p>Un mode par ligne</p></div></div>
        <form id="set-modes"><label class="fld" for="s-modes"><span>Liste</span><textarea id="s-modes" name="modes" rows="5">${esc(S.modes.join('\n'))}</textarea></label>
        <div style="margin-top:12px"><button class="btn primary" type="submit">Enregistrer</button></div></form></div>
    </div>
    <div class="card mt"><div class="card-h"><div><h3>Catégories de dépenses</h3><p>La <b>nature</b> décide où le coût va dans le résultat ; le <b>type de dette</b> décide dans quel bloc « Ce que je dois » il apparaît. Les trois premières catégories alimentent les lignes Tissus, Tailleurs et Livraisons du tableau de bord.</p></div></div>
      <form id="set-cats"><div id="cat-rows">${S.categories.map(catRow).join('')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn" type="button" data-act="cat-add">${icon('plus', 'sm')}Ajouter une catégorie</button><button class="btn primary" type="submit">Enregistrer les catégories</button></div></form></div>
    <div class="card mt"><div class="card-h"><div><h3>Catalogue de modèles</h3><p>Nom, description, photos, vidéo et jusqu’à 4 gammes de prix — proposés au choix sur chaque commande.</p></div><button class="btn sm" data-act="new:modele">${icon('plus', 'sm')}Ajouter un modèle</button></div>
      ${V.modeles.length ? `<div class="list">${V.modeles.map((m) => { const n = (m.photos || []).length; return `<div class="lrow" data-act="edit:modele" data-id="${esc(m.id)}" style="cursor:pointer;grid-template-columns:44px minmax(0,1fr) auto">
        <span style="position:relative;width:44px;height:44px;flex:none">${coverPhoto(m) ? `<img src="${esc(coverPhoto(m))}" alt="" style="width:44px;height:44px;border-radius:10px;object-fit:cover;display:block">` : `<span style="width:44px;height:44px;border-radius:10px;background:var(--surface-2);display:block"></span>`}${n > 1 ? `<b style="position:absolute;bottom:-3px;right:-3px;background:var(--accent);color:#fff;font-size:10px;line-height:1;border-radius:8px;padding:2px 4px">+${n - 1}</b>` : ''}</span>
        <div><b>${esc(m.nom)}</b><span class="s">${[m.prix1, m.prix2, m.prix3, m.prix4].filter((x) => x > 0).map(fmt).join(' · ') || 'Sans prix'}${m.usage ? ` · utilisé ${m.usage}×` : ''}${m.video ? ' · avec vidéo' : ''}</span></div>
        <span></span></div>`; }).join('')}</div>` : emptyBlock('Aucun modèle', 'Ajoutez vos modèles pour pouvoir les choisir directement dans les commandes.')}</div>
    <div class="card mt"><div class="card-h"><div><h3>Compte Google &amp; appareil</h3><p>Vos données vivent dans un fichier de votre Google Drive (« ${esc(DRIVE_FILE_NAME)} »), pas chez Claude.</p></div></div>
      <dl class="kv" style="margin-top:0">
        <div><dt>Dernière synchronisation</dt><dd>${drive.at ? hhmm(drive.at) : '—'}</dd></div>
        <div><dt>Rôle sur cet appareil</dt><dd><b>${store.role === 'tailleur' ? 'Tailleur' : 'Administrateur'}</b></dd></div>
      </dl>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button class="btn" data-act="role-change">Changer de rôle sur cet appareil</button>
        <button class="btn danger" data-act="google-signout">Se déconnecter de Google</button>
      </div>
      <p class="muted" style="margin-top:12px;font-size:12.5px">Le rôle (administrateur ou tailleur) est un réglage propre à cet appareil : il ne protège pas les données, il choisit seulement ce qui s’affiche ici. Toute personne connectée avec ce même compte Google voit les mêmes informations.</p></div>
    <div class="card mt"><div class="card-h"><div><h3>Vos données</h3><p>Synchronisées automatiquement dans votre Google Drive ; une copie reste aussi sur cet appareil.</p></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-act="export">${icon('download', 'sm')}Exporter en Excel (.xlsx)</button>
        <button class="btn" data-act="backup">${icon('download', 'sm')}Télécharger une sauvegarde</button>
        <button class="btn" data-act="export-catalogue">${icon('download', 'sm')}Exporter le catalogue (pour le site)</button>
        <button class="btn" data-act="restore">${icon('in', 'sm')}Restaurer une sauvegarde</button><input type="file" id="restore-file" accept=".json,application/json" hidden>
        ${hasEx ? `<button class="btn danger" data-act="clear-examples">${icon('trash', 'sm')}Supprimer les données d’exemple</button>` : ''}
        <button class="btn danger" data-act="reset-local">Tout effacer</button>
      </div>
      <p class="muted" style="margin-top:12px;font-size:12.5px">L’export Excel contient une feuille par onglet (commandes, dépenses, paiements, encaissements) et un résumé ; les montants y sont des valeurs, pas des formules. La sauvegarde (.json) contient toutes vos données et sert à les restaurer ou à les transférer. « Exporter le catalogue » produit le fichier à envoyer pour mettre à jour le site public.</p></div>
    <div class="card mt"><div class="card-h"><div><h3>La règle d’or de Men’s Tunics</h3></div></div>
      <dl class="kv" style="margin-top:0"><div><dt><b>Coût engagé ≠ coût payé</b></dt><dd style="white-space:normal;text-align:right;font-weight:500">Le coût engagé compte pour la rentabilité, le coût payé pour la trésorerie.</dd></div>
      <div><dt><b>Vente ≠ encaissement</b></dt><dd style="white-space:normal;text-align:right;font-weight:500">Une vente est un droit, pas de l’argent en poche.</dd></div>
      <div><dt><b>Marge ≠ trésorerie</b></dt><dd style="white-space:normal;text-align:right;font-weight:500">On peut être rentable et à sec, ou l’inverse.</dd></div></dl></div>`;
}

const VIEWS = { dashboard: viewDashboard, commandes: viewCommandes, clients: viewClients, depenses: viewDepenses, tresorerie: viewTresorerie, rapport: viewRapport, parametres: viewParametres, tailleur: viewTailleur };

/* =====================================================================
   Panneaux latéraux (détail commande / dépense)
   ===================================================================== */
function drawerDep(d) {
  const cmdLines = d.commandes.map((x) => { const c = V.cmdBy[x.commande]; return `<a href="#" data-act="open:cmd" data-id="${esc(x.commande)}" style="color:var(--accent);font-weight:600">${esc(x.commande)}</a>${c ? ' (' + esc(c.client) + ')' : ''} · ${fmt(x.montant)}`; });
  const pays = d.paiements.length
    ? d.paiements.map((p) => `<div class="lrow" data-act="edit:pai" data-id="${esc(p.id)}" style="cursor:pointer;grid-template-columns:minmax(0,1fr) auto"><div><b>${fdate(p.date)} · ${esc(p.mode || '—')}</b><span class="s">${esc(p.ref || p.id)}${p.obs ? ' · ' + esc(p.obs) : ''}</span></div><div class="amt">${fmt(p.montant)}</div></div>`).join('')
    : `<p class="muted">Aucun paiement pour l’instant : 100 % de ce coût reste dû.</p>`;
  return `<header><div><h2>${esc(d.description || d.categorie)}</h2><p><span class="mono">${esc(d.id)}</span> · ${esc(d.beneficiaire || '—')}</p></div><div style="display:flex;gap:4px"><button class="icon-btn" data-act="edit:dep" data-id="${esc(d.id)}" aria-label="Modifier">${icon('edit')}</button><button class="icon-btn" data-act="close-drawer" aria-label="Fermer">${icon('x')}</button></div></header>
  <div class="body">
    <div class="dstats"><div><small>Engagé</small><b>${fmt(d.engage)}</b></div><div><small>Payé</small><b>${fmt(d.paye)}</b></div><div><small>Reste</small><b>${fmt(d.reste)}</b></div></div>
    <div style="display:flex;align-items:center;gap:12px">${pill(d.statut)}<span class="mbar" style="flex:1"><i class="paid" style="width:${ratio(d.paye, d.engage)}%"></i></span></div>
    <div class="callout">Ce coût compte pour <b>${money(d.engage)}</b> dans la rentabilité${d.commandes.length === 1 ? ` de la commande ${esc(d.commandes[0].commande)}` : d.commandes.length > 1 ? `, réparti sur ${d.commandes.length} commandes` : ''}. Seuls <b>${money(d.paye)}</b> sont réellement sortis de la trésorerie ; <b>${money(d.reste)}</b> restent dus${d.beneficiaire ? ' à ' + esc(d.beneficiaire) : ''}.</div>
    <div><h3>Paiements <span style="font-weight:500;text-transform:none;letter-spacing:0">${d.paiements.length} versement(s)</span></h3><div class="list">${pays}</div>
      <div style="margin-top:12px"><button class="btn primary" data-act="new:pai" data-dep="${esc(d.id)}">${icon('plus', 'sm')}Ajouter un paiement</button></div></div>
    <div><h3>Détails</h3><dl class="kv" style="margin-top:0">
      <div><dt>Catégorie</dt><dd>${esc(d.categorie || '—')}${d.sousCat ? ' · ' + esc(d.sousCat) : ''}</dd></div>
      <div><dt>Nature</dt><dd>${d.nature ? NATURES[d.nature] : '—'}</dd></div>
      <div><dt>Commande${d.commandes.length > 1 ? 's associées' : ' associée'}</dt><dd style="white-space:normal;text-align:right;font-weight:500">${cmdLines.length ? cmdLines.join('<br>') : '—'}</dd></div>
      <div><dt>Date d’engagement</dt><dd>${fdate(d.date)}</dd></div>
      <div><dt>Dernier paiement</dt><dd>${d.last ? `${fdate(d.last.date)} · ${esc(d.last.mode || '—')}` : '—'}</dd></div>
      ${d.obs ? `<div><dt>Observations</dt><dd style="white-space:normal;text-align:right;font-weight:500">${esc(d.obs)}</dd></div>` : ''}</dl></div>
  </div>`;
}

function drawerCmd(c) {
  const isAdmin = store.role !== 'tailleur';
  const lab = livraisonLabel(c);
  const modelesBlock = c.modeleIds.length ? `<div><h3>Modèle(s) choisi(s)</h3><div class="list">${c.modeleIds.map((mid) => { const m = V.modeleBy[mid]; return m ? `<div class="lrow" style="grid-template-columns:40px minmax(0,1fr)"><img src="${esc(coverPhoto(m))}" alt="" style="width:40px;height:40px;border-radius:9px;object-fit:cover;background:var(--surface-2)"><div><b>${esc(m.nom)}</b><span class="s">${esc(m.description || '')}</span></div></div>` : ''; }).join('')}</div></div>` : '';
  const mesuresBlock = (Object.keys(c.mesures.haut).length || Object.keys(c.mesures.bas).length) ? `<div><h3>Mesures (cm)</h3><dl class="kv" style="margin-top:0">
      ${MESURES_HAUT.filter(([k]) => c.mesures.haut[k] != null).map(([k, fr, en]) => `<div><dt>${fr} (${en})</dt><dd>${c.mesures.haut[k]}</dd></div>`).join('')}
      ${MESURES_BAS.filter(([k]) => c.mesures.bas[k] != null).map(([k, fr, en]) => `<div><dt>${fr} (${en})</dt><dd>${c.mesures.bas[k]}</dd></div>`).join('')}
    </dl></div>` : '';
  const remarqueBlock = c.remarqueTailleur ? `<div><h3>Remarque pour le tailleur</h3><p style="white-space:normal">${esc(c.remarqueTailleur)}</p></div>` : '';
  const infosBlock = `<div><dl class="kv" style="margin-top:0">
      <div><dt>Téléphone</dt><dd>${c.telephone ? (isAdmin ? `<a href="#" data-act="open:client" data-id="${esc(c.telephone)}" style="color:var(--accent);font-weight:600">${esc(c.telephone)}</a>` : esc(c.telephone)) : '—'}</dd></div>
      ${c.adresse ? `<div><dt>Adresse</dt><dd style="white-space:normal;text-align:right;font-weight:500">${esc(c.adresse)}</dd></div>` : ''}
      <div><dt>Date de prise de mesure</dt><dd>${c.dateMesure ? fdate(c.dateMesure) : '—'}</dd></div>
      <div><dt>Date de rendez-vous</dt><dd>${c.dateRendezVous ? fdate(c.dateRendezVous) : '—'}</dd></div>
      <div><dt>Date de livraison prévue</dt><dd>${c.dateLivraisonPrevue ? fdate(c.dateLivraisonPrevue) : '—'}</dd></div>
    </dl></div>`;
  if (!isAdmin) {
    return `<header><div><h2>${esc(c.client)}</h2><p><span class="mono">${esc(c.id)}</span> · ${fdate(c.date)}${c.description ? ' · ' + esc(c.description) : ''}</p></div><div style="display:flex;gap:4px"><button class="icon-btn" data-act="close-drawer" aria-label="Fermer">${icon('x')}</button></div></header>
    <div class="body">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${statutSelect(c)}${lab ? `<span class="pill ${lab.c || 'ink'}">${lab.c === 'crit' ? icon('alert', 'sm') : ''}${esc(lab.t)}</span>` : ''}</div>
      ${infosBlock}
      ${modelesBlock}
      ${mesuresBlock}
      ${remarqueBlock}
    </div>`;
  }
  const line = (l, e, p) => `<tr><td>${l}</td><td>${fmt(e)}</td><td>${fmt(p)}</td><td>${fmt(e - p)}</td></tr>`;
  const key = (k) => sum(c.deps.filter((d) => d.nature === 'direct' && d.key === k), (d) => d.paye);
  const pTissu = key('tissu'), pTail = key('tailleur'), pLiv = key('livraison');
  const deps = c.deps.length ? c.deps.map((d) => `<div class="lrow" data-act="open:dep" data-id="${esc(d.id)}" style="cursor:pointer;grid-template-columns:minmax(0,1fr) auto auto"><div><b>${esc(d.description || d.categorie)}</b><span class="s">${esc(d.beneficiaire || '—')} · ${esc(d.categorie)}${d.split ? ` · part de ${fmt(d.totalDep)}` : ''}</span></div><div style="text-align:right"><div class="amt">${fmt(d.engage)}</div>${pill(d.statut)}</div><span></span></div>`).join('') : `<p class="muted">Aucun coût rattaché. Ajoutez le tissu, la confection, la livraison…</p>`;
  const encs = c.encs.length ? c.encs.map((e) => `<div class="lrow" data-act="edit:enc" data-id="${esc(e.id)}" style="cursor:pointer;grid-template-columns:minmax(0,1fr) auto"><div><b>${fdate(e.date)} · ${esc(e.mode || '—')}</b><span class="s">${esc(e.ref || e.id)}</span></div><div class="amt">+${fmt(e.montant)}</div></div>`).join('') : `<p class="muted">Aucun encaissement pour l’instant.</p>`;
  return `<header><div><h2>${esc(c.client)}</h2><p><span class="mono">${esc(c.id)}</span> · ${fdate(c.date)}${c.description ? ' · ' + esc(c.description) : ''}</p></div><div style="display:flex;gap:4px"><button class="icon-btn" data-act="edit:cmd" data-id="${esc(c.id)}" aria-label="Modifier">${icon('edit')}</button><button class="icon-btn" data-act="close-drawer" aria-label="Fermer">${icon('x')}</button></div></header>
  <div class="body">
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${pill(c.statEnc, STAT_ENC)}${statutSelect(c)}${lab ? `<span class="pill ${lab.c || 'ink'}">${lab.c === 'crit' ? icon('alert', 'sm') : ''}${esc(lab.t)}</span>` : ''}</div>
    <div class="dstats"><div><small>Prix de vente</small><b>${fmt(c.prix)}</b></div><div><small>Encaissé</small><b>${fmt(c.encaisse)}</b></div><div><small>À encaisser</small><b>${fmt(c.resteEnc)}</b></div></div>
    ${infosBlock}
    ${modelesBlock}
    ${mesuresBlock}
    ${remarqueBlock}
    <div class="callout"><b>Marge estimée : ${signed(c.marge)} FCFA (${pct(c.taux)})</b>, calculée sur <b>${money(c.engage)}</b> de coûts engagés. Seuls <b>${money(c.paye)}</b> ont été payés à ce jour : il reste <b>${money(c.resteCout)}</b> à payer. Cash net de la commande : <b>${signed(c.cashNet)} FCFA</b>.</div>
    <div><h3>Coûts de la commande</h3><div class="tblwrap"><table class="t"><thead><tr><th>Poste</th><th>Engagé</th><th>Payé</th><th>Reste</th></tr></thead><tbody>
      ${line('Tissu', c.tissu, pTissu)}${line('Tailleur', c.tailleur, pTail)}${line('Livraison', c.livraison, pLiv)}${line('Autres coûts directs', c.autres, c.paye - pTissu - pTail - pLiv)}
      <tr class="b"><td>Total</td><td>${fmt(c.engage)}</td><td>${fmt(c.paye)}</td><td>${fmt(c.resteCout)}</td></tr></tbody></table></div></div>
    <div><h3>Dépenses rattachées</h3><div class="list">${deps}</div><div style="margin-top:12px"><button class="btn" data-act="new:dep" data-cmd="${esc(c.id)}">${icon('plus', 'sm')}Ajouter une dépense</button></div></div>
    <div><h3>Encaissements</h3><div class="list">${encs}</div>${c.resteEnc > 0.5 ? `<div style="margin-top:12px"><button class="btn primary" data-act="new:enc" data-cmd="${esc(c.id)}">${icon('plus', 'sm')}Encaisser</button></div>` : ''}</div>
  </div>`;
}

function drawerClient(cl) {
  const rows = cl.commandes.slice().sort(byDate).reverse().map((c) => `<div class="lrow" data-act="open:cmd" data-id="${esc(c.id)}" style="cursor:pointer"><div><b>${esc(c.id)} · ${esc(c.description || '—')}</b><span class="s">${fdate(c.date)} · ${STATUTS_CMD[c.statut]}</span></div><div class="amt">${fmt(c.prix)}</div></div>`).join('');
  return `<header><div><h2>${esc(cl.nom)}</h2><p><span class="mono">${esc(cl.telephone)}</span>${cl.adresse ? ' · ' + esc(cl.adresse) : ''}</p></div><div style="display:flex;gap:4px"><button class="icon-btn" data-act="close-drawer" aria-label="Fermer">${icon('x')}</button></div></header>
  <div class="body">
    <div class="dstats"><div><small>Commandes</small><b>${cl.commandes.length}</b></div><div><small>Total vendu</small><b>${fmt(cl.ca)}</b></div><div><small>Reste à encaisser</small><b>${fmt(cl.resteEnc)}</b></div></div>
    <div><h3>Historique des commandes</h3><div class="list">${rows}</div>
      <div style="margin-top:12px"><button class="btn primary" data-act="new:cmd-for-client" data-tel="${esc(cl.telephone)}" data-nom="${esc(cl.nom)}" data-adr="${esc(cl.adresse || '')}">${icon('plus', 'sm')}Nouvelle commande pour ce client</button></div></div>
  </div>`;
}
function drawerHTML() {
  if (!ui.drawer) return '';
  const item = ui.drawer.type === 'dep' ? V.depBy[ui.drawer.id] : ui.drawer.type === 'client' ? V.clientBy[ui.drawer.id] : V.cmdBy[ui.drawer.id];
  if (!item) return '';
  const body = ui.drawer.type === 'dep' ? drawerDep(item) : ui.drawer.type === 'client' ? drawerClient(item) : drawerCmd(item);
  return `<div class="scrim" data-act="close-drawer"></div><aside class="drawer" role="dialog" aria-modal="true">${body}</aside>`;
}

/* =====================================================================
   Formulaires (fenêtre modale / feuille sur mobile)
   ===================================================================== */
let formSpec = null;
const ID_OK = /^[A-Za-z0-9_.:@+~-]+$/;

function fld(f) {
  const id = 'f-' + f.name, v = f.value == null ? '' : f.value;
  let c;
  if (f.type === 'select') c = `<select id="${id}" name="${f.name}">${f.options.map((o) => `<option value="${esc(o.v)}" ${String(o.v) === String(v) ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`;
  else if (f.type === 'textarea') c = `<textarea id="${id}" name="${f.name}" rows="2">${esc(v)}</textarea>`;
  else if (f.type === 'money') c = `<input id="${id}" name="${f.name}" type="number" inputmode="numeric" min="0" step="1" value="${esc(v)}" placeholder="0">`;
  else c = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${f.list ? `list="${f.list}"` : ''} ${f.readonly ? 'readonly' : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''} autocomplete="off">`;
  return `<label class="fld ${f.span ? 'span2' : ''}" data-f="${f.name}" for="${id}"><span>${f.label}${f.req ? ' *' : ''}</span>${c}${f.hint ? `<em>${f.hint}</em>` : ''}<b class="err" hidden></b></label>`;
}

function openForm(spec) {
  formSpec = spec;
  const dls = (spec.datalists || []).map((d) => `<datalist id="${d.id}">${d.items.map((i) => `<option value="${esc(i)}"></option>`).join('')}</datalist>`).join('');
  const fields = spec.fields.map((f) => (f.section ? `<div class="sect">${f.section}</div>` : f.custom ? f.html : fld(f))).join('');
  $('#modal').innerHTML = `<div class="modal-wrap"><div class="scrim" data-act="close-modal"></div>
    <form class="modal" id="form" novalidate role="dialog" aria-modal="true" aria-labelledby="form-title">
      <header><h2 id="form-title">${esc(spec.title)}</h2><button type="button" class="icon-btn" data-act="close-modal" aria-label="Fermer">${icon('x')}</button></header>
      <div class="fields">${fields}</div>${dls}
      <div class="preview" id="form-preview" aria-live="polite"></div>
      <footer>${spec.onDelete ? `<button type="button" class="btn danger" data-act="form-delete">${icon('trash', 'sm')}Supprimer</button>` : '<span></span>'}<div class="r"><button type="button" class="btn ghost" data-act="close-modal">Annuler</button><button type="submit" class="btn primary">${esc(spec.submitLabel || 'Enregistrer')}</button></div></footer>
    </form></div>`;
  runPreview();
  const first = $('#form input:not([readonly]), #form select');
  if (first) first.focus();
}
const formValues = () => {
  const o = {};
  new FormData($('#form')).forEach((v, k) => {
    const val = typeof v === 'string' ? v : '';
    if (k in o) { if (!Array.isArray(o[k])) o[k] = [o[k]]; o[k].push(val); } else o[k] = val;
  });
  return o;
};
function runPreview() { if (formSpec && formSpec.preview && $('#form-preview')) $('#form-preview').innerHTML = formSpec.preview(formValues()) || ''; }
function closeModal() { formSpec = null; $('#modal').innerHTML = ''; }
function showErrors(errs) {
  document.querySelectorAll('#form .fld').forEach((el) => {
    const m = errs[el.dataset.f]; const b = $('.err', el);
    el.classList.toggle('bad', !!m); b.hidden = !m; b.textContent = m || '';
  });
  const first = $('#form .fld.bad input, #form .fld.bad select'); if (first) first.focus();
}

function confirmBox({ title, text, label = 'Supprimer', onYes }) {
  formSpec = { confirm: onYes };
  $('#modal').innerHTML = `<div class="modal-wrap"><div class="scrim" data-act="close-modal"></div><div class="modal confirm" role="alertdialog" aria-modal="true"><h2>${esc(title)}</h2><p>${text}</p><div class="r"><button class="btn ghost" data-act="close-modal">Annuler</button><button class="btn solid-danger" data-act="confirm-yes">${esc(label)}</button></div></div></div>`;
  const b = $('.btn.solid-danger'); if (b) b.focus();
}

let toastT = 0;
function toast(msg) {
  const el = $('#toast'); el.innerHTML = esc(msg); el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3400);
}
async function guard(fn) {
  try { await fn(); return true; } catch (e) {
    const code = e && e.code;
    toast(code === 'invalid_argument' ? 'Modification refusée : vous n’avez pas le droit de modifier ces données.' : code === 'quota_exceeded' ? 'Limite de stockage atteinte : supprimez des lignes inutiles.' : 'Enregistrement impossible : ' + ((e && e.message) || 'erreur inconnue'));
    return false;
  }
}
const num = (v) => { const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const trim = (v) => String(v || '').trim();
const arr = (v) => v == null ? [] : Array.isArray(v) ? v : [v];

/* ----- commande ----- */
function fieldModeleChoice(c) {
  const chosen = c ? (c.modeleIds || []) : [];
  if (!V.modeles.length) return `<div class="fld span2" data-f="modeleChoice"><span>Modèle(s) choisi(s)</span><p class="muted" style="margin:2px 0 0">Aucun modèle dans le catalogue — ajoutez-en dans Paramètres pour pouvoir les choisir ici.</p><b class="err" hidden></b></div>`;
  const rows = V.modeles.map((m) => `<label class="modele-pick">
    <input type="checkbox" name="modeleChoice" value="${esc(m.id)}" ${chosen.includes(m.id) ? 'checked' : ''}>
    ${coverPhoto(m) ? `<img src="${esc(coverPhoto(m))}" alt="">` : `<span class="ph"></span>`}
    <span class="nm"><b>${esc(m.nom)}</b><small>${[m.prix1, m.prix2, m.prix3, m.prix4].filter((x) => x > 0).map(fmt).join(' · ') || 'Sans prix'}</small></span>
  </label>`).join('');
  return `<div class="fld span2" data-f="modeleChoice"><span>Modèle(s) choisi(s)</span><div class="modele-list">${rows}</div><b class="err" hidden></b></div>`;
}
function mesureFields(prefix, list, c) {
  return list.map(([k, fr, en]) => ({ name: prefix + k, label: `${fr} (${en})`, type: 'money', value: c && c.mesures && c.mesures[prefix === 'm_haut_' ? 'haut' : 'bas'] ? c.mesures[prefix === 'm_haut_' ? 'haut' : 'bas'][k] : null, ph: 'cm' }));
}
function formCmd(id, prefill) {
  const c = id ? store.data.commandes.find((x) => x.id === id) : null;
  const cv = c ? V.cmdBy[c.id] : null;
  openForm({
    title: c ? 'Modifier la commande' : 'Nouvelle commande',
    fields: [
      { name: 'id', label: 'Numéro', value: c ? c.id : nextId('CMD', store.data.commandes, 3), readonly: !!c, req: 1 },
      { name: 'date', label: 'Date de commande', type: 'date', value: c ? c.date : todayISO(), req: 1 },
      { name: 'client', label: 'Client', value: c ? c.client : (prefill && prefill.client) || '', req: 1 },
      { name: 'telephone', label: 'Téléphone', value: c ? c.telephone : (prefill && prefill.telephone) || '', req: 1, ph: '+223 …', hint: 'Sert à retrouver le client et son historique dans « Clients ».' },
      { name: 'adresse', label: 'Adresse (facultatif)', value: c ? c.adresse : (prefill && prefill.adresse) || '' },
      { name: 'description', label: 'Modèle / description', value: c && c.description },
      { name: 'prix', label: 'Prix de vente (FCFA)', type: 'money', value: c && c.prix, req: 1, hint: 'Ce que le client doit payer au total. C’est ce chiffre qui compte comme vente.' },
      { name: 'dateLivraisonPrevue', label: 'Date de livraison prévue', type: 'date', value: c && c.dateLivraisonPrevue, hint: `Une alerte rouge s’affiche automatiquement ${DELAI_ALERTE} jours avant (et en cas de retard).` },
      { name: 'statut', label: 'Statut', type: 'select', value: c ? (STATUTS_CMD[c.statut] ? c.statut : 'nouvelle') : 'nouvelle', options: STATUTS_CMD_ORDER.map((k) => ({ v: k, t: STATUTS_CMD[k] })) },
      { name: 'dateMesure', label: 'Date de prise de mesure', type: 'date', value: c && c.dateMesure },
      { name: 'dateRendezVous', label: 'Date de rendez-vous', type: 'date', value: c && c.dateRendezVous },
      { custom: true, html: fieldModeleChoice(cv) },
      { section: 'Mesures — Haut (Top)' },
      ...mesureFields('m_haut_', MESURES_HAUT, cv),
      { section: 'Mesures — Bas (Bottom)' },
      ...mesureFields('m_bas_', MESURES_BAS, cv),
      { section: 'Pour le tailleur' },
      { name: 'remarqueTailleur', label: 'Remarque / consignes de confection', type: 'textarea', value: c && c.remarqueTailleur, span: 1 }
    ],
    preview(v) {
      if (!v.dateLivraisonPrevue) return '';
      const j = daysBetween(todayISO(), v.dateLivraisonPrevue);
      if (j == null) return '';
      let h = `<div class="kvl"><span>Jours avant la livraison prévue</span><b>${j}</b></div>`;
      if (v.statut !== 'livree' && v.statut !== 'annulee' && j <= DELAI_ALERTE) h += `<div class="warnline">${icon('alert', 'sm')}${j < 0 ? `Livraison en retard de ${Math.abs(j)} jour(s).` : 'Livraison imminente : une alerte rouge s’affichera sur le tableau de bord.'}</div>`;
      return h;
    },
    validate(v) {
      const e = {};
      if (!ID_OK.test(trim(v.id))) e.id = 'Utilisez lettres, chiffres et tirets.';
      else if (!c && store.data.commandes.some((x) => x.id === trim(v.id))) e.id = 'Ce numéro existe déjà.';
      if (!v.date) e.date = 'Indiquez la date.';
      if (!trim(v.client)) e.client = 'Indiquez le client.';
      if (!trim(v.telephone)) e.telephone = 'Indiquez le numéro de téléphone du client.';
      if (!(num(v.prix) > 0)) e.prix = 'Indiquez un prix supérieur à 0.';
      return e;
    },
    async submit(v) {
      const haut = {}; MESURES_HAUT.forEach(([k]) => { if (trim(v['m_haut_' + k]) !== '') haut[k] = num(v['m_haut_' + k]); });
      const bas = {}; MESURES_BAS.forEach(([k]) => { if (trim(v['m_bas_' + k]) !== '') bas[k] = num(v['m_bas_' + k]); });
      return guard(() => put('commandes', {
        ...(c || {}), id: trim(v.id), date: v.date, client: trim(v.client), telephone: trim(v.telephone), adresse: trim(v.adresse),
        description: trim(v.description), prix: num(v.prix), dateLivraisonPrevue: v.dateLivraisonPrevue || '', statut: v.statut || 'nouvelle',
        dateMesure: v.dateMesure || '', dateRendezVous: v.dateRendezVous || '', modeleIds: arr(v.modeleChoice), mesures: { haut, bas }, remarqueTailleur: trim(v.remarqueTailleur)
      }));
    },
    toast: c ? 'Commande modifiée' : 'Commande ajoutée',
    onDelete: c ? () => askDeleteCmd(c.id) : null
  });
}

/* ----- répartition d’une dépense sur une ou plusieurs commandes ----- */
function repRow(i, cmdVal, montant) {
  return `<div class="reprow" data-i="${i}">
    <select name="repCmd" aria-label="Commande">
      <option value="">— Choisir une commande —</option>
      ${V.cmds.map((c) => `<option value="${esc(c.id)}" ${String(c.id) === String(cmdVal) ? 'selected' : ''}>${esc(c.id)} · ${esc(c.client)}</option>`).join('')}
    </select>
    <input name="repMontant" type="number" inputmode="numeric" min="0" step="1" placeholder="Montant (facultatif)" value="${montant === '' || montant == null ? '' : esc(montant)}" aria-label="Montant pour cette commande">
    <button type="button" class="icon-btn" data-act="rep-del" aria-label="Retirer cette commande">${icon('trash')}</button>
  </div>`;
}
function fieldCommandesSplit(rows) {
  const body = rows.length ? rows.map((r, i) => repRow(i, r.commande, r.montant)).join('') : '<p class="muted" style="margin:2px 0 8px">Aucune commande liée pour l’instant.</p>';
  return `<div class="fld span2" data-f="repCmd">
    <span>Commande(s) associée(s)</span>
    <div id="rep-rows">${body}</div>
    <button type="button" class="btn sm" data-act="rep-add" style="align-self:flex-start;margin-top:4px">${icon('plus', 'sm')}Ajouter une commande</button>
    <em>Obligatoire pour un coût direct (tissu, tailleur, livraison…). Une même dépense peut être répartie sur plusieurs commandes : laissez un montant vide pour qu’il se déduise automatiquement du reste.</em>
    <b class="err" hidden></b>
  </div>`;
}
function buildCommandesFromRows(v, engageTotal) {
  const cmds = arr(v.repCmd), montants = arr(v.repMontant);
  const rows = cmds.map((c, i) => ({ commande: trim(c), montant: montants[i] })).filter((r) => r.commande);
  if (!rows.length) return [];
  const withVal = rows.filter((r) => trim(r.montant) !== '');
  const blank = rows.filter((r) => trim(r.montant) === '');
  const usedSum = sum(withVal, (r) => num(r.montant));
  if (blank.length === 1) blank[0].montant = Math.max(0, engageTotal - usedSum);
  else blank.forEach((r) => { r.montant = 0; });
  return rows.map((r) => ({ commande: r.commande, montant: num(r.montant) }));
}

/* ----- dépense ----- */
function formDep(id, presetCmd) {
  const d = id ? store.data.depenses.find((x) => x.id === id) : null;
  const cats = store.settings.categories;
  const benef = [...new Set(store.data.depenses.map((x) => x.beneficiaire).filter(Boolean))];
  const subs = [...new Set([...store.settings.sousCats, ...store.data.depenses.map((x) => x.sousCat).filter(Boolean)])];
  const initRows = d ? normCommandes(d) : (presetCmd ? [{ commande: presetCmd, montant: '' }] : []);
  const fields = [
    { name: 'id', label: 'Numéro', value: d ? d.id : nextId('DEP', store.data.depenses, 3), readonly: !!d, req: 1 },
    { name: 'date', label: 'Date d’engagement', type: 'date', value: d ? d.date : todayISO(), req: 1, hint: 'Le jour où vous vous engagez à payer, même sans rien verser.' },
    { name: 'categorie', label: 'Catégorie', type: 'select', value: d ? d.categorie : cats[0].nom, options: cats.map((c) => ({ v: c.nom, t: c.nom })), req: 1 },
    { name: 'sousCat', label: 'Sous-catégorie', value: d && d.sousCat, list: 'dl-sub' },
    { name: 'description', label: 'Description', value: d && d.description, req: 1, span: 1 },
    { name: 'beneficiaire', label: 'Bénéficiaire', value: d && d.beneficiaire, list: 'dl-ben', req: 1, ph: 'Tailleur, fournisseur, frère…' },
    { name: 'engage', label: 'Montant engagé (FCFA)', type: 'money', value: d && d.engage, req: 1, hint: 'Le coût total, payé ou non.' },
    { custom: true, html: fieldCommandesSplit(initRows) },
    { name: 'obs', label: 'Observations', type: 'textarea', value: d && d.obs, span: 1 }
  ];
  if (!d) {
    fields.push({ section: 'Payé tout de suite ? (facultatif)' });
    fields.push({ name: 'payeNow', label: 'Montant payé maintenant (FCFA)', type: 'money', hint: 'Laissez vide si rien n’est encore payé. Vous pourrez ajouter les paiements plus tard.' });
    fields.push({ name: 'payeMode', label: 'Mode de paiement', type: 'select', value: store.settings.modes[0], options: store.settings.modes.map((m) => ({ v: m, t: m })) });
  }
  openForm({
    title: d ? 'Modifier la dépense' : 'Nouvelle dépense engagée',
    fields,
    datalists: [{ id: 'dl-sub', items: subs }, { id: 'dl-ben', items: benef }],
    preview(v) {
      const eng = num(v.engage), now = num(v.payeNow);
      const dv = d ? V.depBy[d.id] : null;
      const paye = dv ? dv.paye : now;
      const cat = V.catBy[v.categorie];
      const commandes = buildCommandesFromRows(v, eng);
      let h = `<div class="kvl"><span>Coût engagé (rentabilité)</span><b>${fmt(eng)} FCFA</b></div><div class="kvl"><span>Déjà payé (trésorerie)</span><b>${fmt(paye)} FCFA</b></div><div class="kvl"><span>Reste à payer</span><b>${fmt(eng - paye)} FCFA</b></div>`;
      if (commandes.length > 1) {
        h += commandes.map((x) => { const c = V.cmdBy[x.commande]; return `<div class="kvl"><span>· ${esc(x.commande)}${c ? ' (' + esc(c.client) + ')' : ''}</span><b>${fmt(x.montant)} FCFA</b></div>`; }).join('');
        const s = sum(commandes, (x) => x.montant);
        if (Math.abs(s - eng) > 0.5) h += `<div class="warnline">${icon('alert', 'sm')}La répartition (${fmt(s)}) ne correspond pas au montant engagé (${fmt(eng)}).</div>`;
      }
      if (cat && cat.nature === 'direct' && !commandes.length) h += `<div class="warnline">${icon('alert', 'sm')}Coût direct sans commande : il sera compté dans le total, mais pas dans la marge d’une commande.</div>`;
      if (paye > eng && eng > 0) h += `<div class="warnline">${icon('alert', 'sm')}Le montant payé dépasse le montant engagé.</div>`;
      return h;
    },
    validate(v) {
      const e = {};
      if (!ID_OK.test(trim(v.id))) e.id = 'Utilisez lettres, chiffres et tirets.';
      else if (!d && store.data.depenses.some((x) => x.id === trim(v.id))) e.id = 'Ce numéro existe déjà.';
      if (!v.date) e.date = 'Indiquez la date.';
      if (!trim(v.description)) e.description = 'Décrivez la dépense.';
      if (!trim(v.beneficiaire)) e.beneficiaire = 'Indiquez le bénéficiaire.';
      if (!(num(v.engage) > 0)) e.engage = 'Indiquez un montant supérieur à 0.';
      if (!d && num(v.payeNow) > num(v.engage)) e.payeNow = 'Ne peut pas dépasser le montant engagé.';
      const cat = V.catBy[v.categorie];
      const rowsRaw = arr(v.repCmd).map((c, i) => ({ commande: trim(c), montant: arr(v.repMontant)[i] })).filter((r) => r.commande);
      const dup = rowsRaw.map((r) => r.commande).filter((x, i, a) => a.indexOf(x) !== i);
      if (dup.length) e.repCmd = 'La même commande est choisie plusieurs fois.';
      else if (cat && cat.nature === 'direct' && !rowsRaw.length) e.repCmd = 'Obligatoire pour un coût direct (tissu, tailleur, livraison…).';
      return e;
    },
    async submit(v) {
      const commandes = buildCommandesFromRows(v, num(v.engage));
      const payload = { ...(d || {}), id: trim(v.id), date: v.date, categorie: v.categorie, sousCat: trim(v.sousCat), description: trim(v.description), beneficiaire: trim(v.beneficiaire), engage: num(v.engage), obs: trim(v.obs) };
      if (commandes.length === 1) { payload.commande = commandes[0].commande; delete payload.commandes; }
      else if (commandes.length > 1) { payload.commandes = commandes; delete payload.commande; }
      else { payload.commande = ''; delete payload.commandes; }
      const ok = await guard(() => put('depenses', payload));
      if (ok && !d && num(v.payeNow) > 0) {
        return guard(() => put('paiements', { id: nextId('PAI', store.data.paiements, 4), date: v.date, depenseId: trim(v.id), montant: num(v.payeNow), mode: v.payeMode, ref: '', obs: '' }));
      }
      return ok;
    },
    toast: d ? 'Dépense modifiée' : 'Dépense enregistrée',
    onDelete: d ? () => askDeleteDep(d.id) : null
  });
}

/* ----- paiement (décaissement) ----- */
function formPai(opt = {}) {
  const p = opt.id ? store.data.paiements.find((x) => x.id === opt.id) : null;
  if (!V.deps.length) { toast('Ajoutez d’abord une dépense à payer.'); return; }
  const depId = p ? p.depenseId : opt.dep || '';
  const sorted = V.deps.slice().sort((a, b) => (b.reste > 0.5) - (a.reste > 0.5) || (a.date || '').localeCompare(b.date || ''));
  const dep0 = V.depBy[depId] || sorted[0];
  const reste0 = dep0 ? dep0.reste - (p && p.depenseId === dep0.id ? -Number(p.montant) : 0) : 0;
  openForm({
    title: p ? 'Modifier le paiement' : 'Enregistrer un paiement',
    fields: [
      { name: 'depenseId', label: 'Dépense à payer', type: 'select', value: dep0 ? dep0.id : '', span: 1, req: 1, options: sorted.map((d) => ({ v: d.id, t: `${d.id} · ${d.beneficiaire} — ${d.description || d.categorie} (reste ${fmt(d.reste)})` })) },
      { name: 'montant', label: 'Montant payé (FCFA)', type: 'money', value: p ? p.montant : (reste0 > 0 ? reste0 : ''), req: 1 },
      { name: 'date', label: 'Date du paiement', type: 'date', value: p ? p.date : todayISO(), req: 1 },
      { name: 'mode', label: 'Mode de paiement', type: 'select', value: p ? p.mode : store.settings.modes[0], options: store.settings.modes.map((m) => ({ v: m, t: m })) },
      { name: 'frais', label: 'Frais de transfert Mobile Money (FCFA)', type: 'money', value: p && p.frais, hint: 'Si l’envoi vous a coûté des frais en plus du montant payé. Laissez vide sinon.' },
      { name: 'ref', label: 'Référence', value: p && p.ref, ph: 'N° de reçu, code de transaction…' },
      { name: 'obs', label: 'Observations', type: 'textarea', value: p && p.obs, span: 1 }
    ],
    preview(v) {
      const d = V.depBy[v.depenseId]; if (!d) return '';
      const others = d.paye - (p && p.depenseId === d.id ? Number(p.montant) || 0 : 0);
      const m = num(v.montant), after = others + m, reste = d.engage - after;
      const st = after <= 0 ? 'non' : (after < d.engage ? 'partiel' : 'total');
      let h = `<div class="kvl"><span>Coût engagé</span><b>${fmt(d.engage)} FCFA</b></div><div class="kvl"><span>Déjà payé avant ce versement</span><b>${fmt(others)} FCFA</b></div><div class="kvl"><span>Reste à payer après ce versement</span><b>${fmt(reste)} FCFA</b></div><div style="margin-top:8px">${pill(st)}</div>`;
      if (reste < -0.5) h += `<div class="warnline">${icon('alert', 'sm')}Ce versement dépasse le reste à payer de ${fmt(-reste)} FCFA.</div>`;
      return h;
    },
    onChange(e, v) {
      if (e.target.name === 'depenseId') {
        const d = V.depBy[v.depenseId]; const m = $('#f-montant');
        if (d && m && (m.dataset.touched !== '1')) m.value = d.reste > 0 ? d.reste : '';
      }
      if (e.target.name === 'montant') e.target.dataset.touched = '1';
    },
    validate(v) {
      const e = {};
      if (!V.depBy[v.depenseId]) e.depenseId = 'Choisissez la dépense.';
      if (!(num(v.montant) > 0)) e.montant = 'Indiquez un montant supérieur à 0.';
      if (!v.date) e.date = 'Indiquez la date.';
      return e;
    },
    async submit(v) {
      return guard(() => put('paiements', { ...(p || {}), id: p ? p.id : nextId('PAI', store.data.paiements, 4), date: v.date, depenseId: v.depenseId, montant: num(v.montant), mode: v.mode, frais: num(v.frais), ref: trim(v.ref), obs: trim(v.obs) }));
    },
    toast: p ? 'Paiement modifié' : 'Paiement enregistré',
    onDelete: p ? () => askDeleteMov('paiements', p.id) : null
  });
}

/* ----- encaissement ----- */
function formEnc(opt = {}) {
  const e0 = opt.id ? store.data.encaissements.find((x) => x.id === opt.id) : null;
  if (!V.cmds.length) { toast('Ajoutez d’abord une commande.'); return; }
  const sorted = V.cmds.slice().sort((a, b) => (b.resteEnc > 0.5) - (a.resteEnc > 0.5) || (a.date || '').localeCompare(b.date || ''));
  const c0 = V.cmdBy[e0 ? e0.commande : opt.cmd] || sorted[0];
  const reste0 = c0 ? c0.resteEnc + (e0 && e0.commande === c0.id ? Number(e0.montant) || 0 : 0) : 0;
  openForm({
    title: e0 ? 'Modifier l’encaissement' : 'Enregistrer un encaissement',
    fields: [
      { name: 'commande', label: 'Commande', type: 'select', value: c0 ? c0.id : '', span: 1, req: 1, options: sorted.map((c) => ({ v: c.id, t: `${c.id} · ${c.client} (reste ${fmt(c.resteEnc)})` })) },
      { name: 'montant', label: 'Montant reçu (FCFA)', type: 'money', value: e0 ? e0.montant : (reste0 > 0 ? reste0 : ''), req: 1 },
      { name: 'date', label: 'Date de réception', type: 'date', value: e0 ? e0.date : todayISO(), req: 1 },
      { name: 'mode', label: 'Mode de paiement', type: 'select', value: e0 ? e0.mode : store.settings.modes[0], options: store.settings.modes.map((m) => ({ v: m, t: m })) },
      { name: 'frais', label: 'Frais Mobile Money prélevés (FCFA)', type: 'money', value: e0 && e0.frais, hint: 'Si l’opérateur a prélevé des frais avant que l’argent n’arrive dans votre compte. Laissez vide sinon.' },
      { name: 'ref', label: 'Référence', value: e0 && e0.ref, ph: 'Acompte, code de transaction…' },
      { name: 'obs', label: 'Observations', type: 'textarea', value: e0 && e0.obs, span: 1 }
    ],
    preview(v) {
      const c = V.cmdBy[v.commande]; if (!c) return '';
      const others = c.encaisse - (e0 && e0.commande === c.id ? Number(e0.montant) || 0 : 0);
      const m = num(v.montant), after = others + m, reste = c.prix - after;
      const st = after <= 0 ? 'non' : (after < c.prix ? 'partiel' : 'total');
      let h = `<div class="kvl"><span>Prix de vente</span><b>${fmt(c.prix)} FCFA</b></div><div class="kvl"><span>Déjà encaissé avant</span><b>${fmt(others)} FCFA</b></div><div class="kvl"><span>Reste à encaisser après</span><b>${fmt(reste)} FCFA</b></div><div style="margin-top:8px">${pill(st, STAT_ENC)}</div>`;
      if (reste < -0.5) h += `<div class="warnline">${icon('alert', 'sm')}Le total encaissé dépasserait le prix de vente de ${fmt(-reste)} FCFA.</div>`;
      return h;
    },
    onChange(e, v) {
      if (e.target.name === 'commande') {
        const c = V.cmdBy[v.commande]; const m = $('#f-montant');
        if (c && m && m.dataset.touched !== '1') m.value = c.resteEnc > 0 ? c.resteEnc : '';
      }
      if (e.target.name === 'montant') e.target.dataset.touched = '1';
    },
    validate(v) {
      const e = {};
      if (!V.cmdBy[v.commande]) e.commande = 'Choisissez la commande.';
      if (!(num(v.montant) > 0)) e.montant = 'Indiquez un montant supérieur à 0.';
      if (!v.date) e.date = 'Indiquez la date.';
      return e;
    },
    async submit(v) {
      return guard(() => put('encaissements', { ...(e0 || {}), id: e0 ? e0.id : nextId('ENC', store.data.encaissements, 4), date: v.date, commande: v.commande, montant: num(v.montant), mode: v.mode, frais: num(v.frais), ref: trim(v.ref), obs: trim(v.obs) }));
    },
    toast: e0 ? 'Encaissement modifié' : 'Encaissement enregistré',
    onDelete: e0 ? () => askDeleteMov('encaissements', e0.id) : null
  });
}

/* ----- catalogue des modèles : photos (plusieurs) et vidéo, stockées via la capacité "assets" ----- */
function resizeImageToBlob(file, maxDim, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cv.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
      };
      img.onerror = () => resolve(null);
      img.src = String(reader.result);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
let modelePhotosDraft = [];
let modeleVideoDraft = '';
let modeleUploadBusy = false;

const VIDEO_MAX_BYTES = 8 * 1024 * 1024; // au-delà, le fichier Drive grossirait trop à chaque sauvegarde
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
function modelePhotoStripHtml() {
  const thumbs = modelePhotosDraft.map((mid, i) => `
    <div class="modele-thumb"><img src="${esc(mid)}" alt="">
      <button type="button" class="modele-thumb-x" data-act="modele-photo-del" data-idx="${i}" aria-label="Retirer cette photo">${icon('x')}</button>
    </div>`).join('');
  const addTile = `<label class="modele-thumb modele-thumb-add">${modeleUploadBusy ? '<span class="modele-thumb-busy"></span>' : icon('plus')}
      <input type="file" accept="image/*" multiple data-act-input="modele-photo-add" ${modeleUploadBusy ? 'disabled' : ''}></label>`;
  return `<div class="modele-photo-strip" id="modele-photo-strip">${thumbs}${addTile}</div>`;
}
function renderModelePhotoStrip() { const el = $('#modele-photo-strip'); if (el) el.outerHTML = modelePhotoStripHtml(); }
function fieldModelePhotos() {
  return `<div class="fld span2" data-f="photos">
    <span>Photos du modèle</span>
    ${modelePhotoStripHtml()}
    <em>Ajoutez une ou plusieurs photos ; elles sont réduites automatiquement pour rester légères. Facultatif.</em>
    <b class="err" hidden></b>
  </div>`;
}
function modeleVideoBlockHtml() {
  const body = modeleVideoDraft
    ? `<div class="modele-video-wrap"><video src="${esc(modeleVideoDraft)}" controls></video>
        <button type="button" class="modele-thumb-x" data-act="modele-video-del" aria-label="Retirer la vidéo">${icon('x')}</button></div>`
    : modeleUploadBusy ? `<div class="modele-thumb modele-thumb-busy" style="width:120px;height:80px;border-radius:10px"></div>`
    : `<label class="btn sm" style="width:max-content">${icon('plus', 'sm')}Ajouter une vidéo<input type="file" accept="video/*" data-act-input="modele-video-add" hidden></label>`;
  return `<div id="modele-video-block">${body}</div>`;
}
function renderModeleVideoBlock() { const el = $('#modele-video-block'); if (el) el.outerHTML = modeleVideoBlockHtml(); }
function fieldModeleVideo() {
  return `<div class="fld span2" data-f="video">
    <span>Vidéo du modèle</span>
    ${modeleVideoBlockHtml()}
    <em>Facultatif. Une courte vidéo (quelques secondes, moins de 8 Mo) suffit pour rester léger.</em>
    <b class="err" hidden></b>
  </div>`;
}
async function addModelePhotos(fileList) {
  if (!fileList || !fileList.length) return;
  modeleUploadBusy = true; renderModelePhotoStrip();
  for (const file of Array.from(fileList)) {
    try {
      const blob = await resizeImageToBlob(file, 1400, 0.85);
      if (!blob) { toast('Image illisible, ignorée.'); continue; }
      const dataUrl = await blobToDataURL(blob);
      modelePhotosDraft.push(dataUrl);
    } catch (e) { toast('Photo non ajoutée : ' + ((e && e.message) || 'erreur')); }
  }
  modeleUploadBusy = false; renderModelePhotoStrip();
}
function removeModelePhoto(idx) { modelePhotosDraft.splice(idx, 1); renderModelePhotoStrip(); }
async function addModeleVideo(file) {
  if (!file) return;
  if (file.size > VIDEO_MAX_BYTES) { toast('Vidéo trop lourde (max 8 Mo) : compressez-la ou raccourcissez-la avant de réessayer.'); return; }
  modeleUploadBusy = true; renderModeleVideoBlock();
  try {
    modeleVideoDraft = await blobToDataURL(file);
  } catch (e) { toast('Vidéo non ajoutée : ' + ((e && e.message) || 'erreur')); }
  modeleUploadBusy = false; renderModeleVideoBlock();
}
function removeModeleVideo() { modeleVideoDraft = ''; renderModeleVideoBlock(); }
function formModele(id) {
  const m = id ? store.data.modeles.find((x) => x.id === id) : null;
  modelePhotosDraft = m && Array.isArray(m.photos) ? m.photos.slice() : [];
  modeleVideoDraft = m ? (m.video || '') : '';
  modeleUploadBusy = false;
  openForm({
    title: m ? 'Modifier le modèle' : 'Nouveau modèle',
    fields: [
      { name: 'id', label: 'Référence', value: m ? m.id : nextId('MOD', store.data.modeles, 3), readonly: !!m, req: 1 },
      { name: 'nom', label: 'Nom du modèle', value: m && m.nom, req: 1 },
      { name: 'description', label: 'Description', type: 'textarea', value: m && m.description, span: 1 },
      { custom: true, html: fieldModelePhotos() },
      { custom: true, html: fieldModeleVideo() },
      { section: 'Gammes de prix (FCFA)' },
      { name: 'prix1', label: 'Prix 1', type: 'money', value: m && m.prix1 },
      { name: 'prix2', label: 'Prix 2', type: 'money', value: m && m.prix2 },
      { name: 'prix3', label: 'Prix 3', type: 'money', value: m && m.prix3 },
      { name: 'prix4', label: 'Prix 4', type: 'money', value: m && m.prix4 }
    ],
    validate(v) {
      const e = {};
      if (!ID_OK.test(trim(v.id))) e.id = 'Utilisez lettres, chiffres et tirets.';
      else if (!m && store.data.modeles.some((x) => x.id === trim(v.id))) e.id = 'Cette référence existe déjà.';
      if (!trim(v.nom)) e.nom = 'Indiquez un nom.';
      return e;
    },
    async submit(v) {
      return guard(() => put('modeles', { id: trim(v.id), nom: trim(v.nom), description: trim(v.description), photos: modelePhotosDraft.slice(), video: modeleVideoDraft || '', prix1: num(v.prix1), prix2: num(v.prix2), prix3: num(v.prix3), prix4: num(v.prix4) }));
    },
    toast: m ? 'Modèle modifié' : 'Modèle ajouté',
    onDelete: m ? () => askDeleteModele(m.id) : null
  });
}
function askDeleteModele(id) {
  const used = V.cmds.filter((c) => c.modeleIds.includes(id));
  confirmBox({
    title: `Supprimer le modèle ${id} ?`,
    text: used.length ? `Il est choisi sur <b>${used.length} commande(s)</b> : elles resteront inchangées mais ne l’afficheront plus.` : 'Ce modèle n’est utilisé par aucune commande.',
    onYes: async () => { if (await guard(() => del('modeles', id))) { closeModal(); toast('Modèle supprimé'); scheduleRender(); } }
  });
}

/* ----- suppressions ----- */
function askDeleteMov(coll, id) {
  const isP = coll === 'paiements';
  confirmBox({
    title: isP ? 'Supprimer ce paiement ?' : 'Supprimer cet encaissement ?',
    text: isP ? 'Cet argent ne sera plus compté comme sorti de la trésorerie : le reste à payer de la dépense augmentera.' : 'Cet argent ne sera plus compté comme reçu : le reste à encaisser de la commande augmentera.',
    onYes: async () => { if (await guard(() => del(coll, id))) { closeModal(); toast(isP ? 'Paiement supprimé' : 'Encaissement supprimé'); } }
  });
}
function askDeleteDep(id) {
  const ps = store.data.paiements.filter((p) => p.depenseId === id);
  confirmBox({
    title: `Supprimer la dépense ${id} ?`,
    text: ps.length ? `Ses <b>${ps.length} paiement(s)</b> (${money(sum(ps, (p) => p.montant))}) seront aussi supprimés : cet argent sortira de l’historique de trésorerie.` : 'Cette dépense n’a aucun paiement.',
    onYes: async () => {
      const ok = await guard(async () => { for (const p of ps) await del('paiements', p.id); await del('depenses', id); });
      if (ok) { ui.drawer = null; closeModal(); toast('Dépense supprimée'); scheduleRender(); }
    }
  });
}
function askDeleteCmd(id) {
  const encs = store.data.encaissements.filter((e) => e.commande === id);
  const deps = store.data.depenses.filter((d) => normCommandes(d).some((x) => x.commande === id));
  if (encs.length) { closeModal(); toast(`Supprimez d’abord les ${encs.length} encaissement(s) de cette commande.`); return; }
  confirmBox({
    title: `Supprimer la commande ${id} ?`,
    text: deps.length ? `Ses <b>${deps.length} dépense(s)</b> ne seront pas supprimées mais détachées de la commande.` : 'Cette commande n’a ni dépense ni encaissement.',
    onYes: async () => {
      const ok = await guard(async () => {
        for (const d of deps) {
          const rest = normCommandes(d).filter((x) => x.commande !== id);
          const payload = { ...d };
          if (rest.length === 1) { payload.commande = rest[0].commande; delete payload.commandes; }
          else if (rest.length > 1) { payload.commandes = rest; delete payload.commande; }
          else { payload.commande = ''; delete payload.commandes; }
          await put('depenses', payload);
        }
        await del('commandes', id);
      });
      if (ok) { ui.drawer = null; closeModal(); toast('Commande supprimée'); scheduleRender(); }
    }
  });
}
async function clearExamples() {
  confirmBox({
    title: 'Supprimer les données d’exemple ?', label: 'Supprimer les exemples',
    text: 'Toutes les lignes marquées comme exemples (commandes, dépenses, paiements, encaissements) seront effacées. Vos propres saisies sont conservées.',
    onYes: async () => {
      const ok = await guard(async () => {
        for (const k of ['paiements', 'encaissements', 'depenses', 'commandes']) for (const x of store.data[k].filter((y) => y.ex)) await del(k, x.id);
      });
      closeModal(); if (ok) { ui.drawer = null; toast('Exemples supprimés : vous pouvez commencer'); scheduleRender(); }
    }
  });
}

/* =====================================================================
   Export Excel
   ===================================================================== */
function localDownloads() {
  return {
    async save({ filename, data }) {
      const type = /\.json$/i.test(filename) ? 'application/json' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const url = URL.createObjectURL(new Blob([data], { type }));
      const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  };
}
async function exportCatalogue() {
  if (!store.downloads) return;
  try {
    const modeles = store.data.modeles.map((m) => ({
      id: m.id, nom: m.nom, description: m.description || '',
      photos: Array.isArray(m.photos) ? m.photos : [], video: m.video || '',
      prix: [m.prix1, m.prix2, m.prix3, m.prix4].map((x) => Number(x) || 0)
    }));
    const payload = JSON.stringify(modeles, null, 1);
    await store.downloads.save({ filename: `modeles_synced.json`, data: new TextEncoder().encode(payload) });
    toast('Catalogue exporté'); render();
  } catch (e) {
    if (e && e.code === 'declined') return;
    toast('Export impossible pour le moment.');
  }
}
async function saveBackup() {
  if (!store.downloads) return;
  try {
    const payload = JSON.stringify(backupObj(), null, 1);
    await store.downloads.save({ filename: `Mens_Tunics_sauvegarde_${todayISO()}.json`, data: new TextEncoder().encode(payload) });
    markBackup(); toast('Sauvegarde enregistrée'); render();
  } catch (e) {
    if (e && e.code === 'declined') return;
    toast('Sauvegarde impossible pour le moment.');
  }
}
function restoreBackup(file) {
  const rd = new FileReader();
  rd.onerror = () => toast('Impossible de lire ce fichier.');
  rd.onload = () => {
    let o = null; try { o = JSON.parse(String(rd.result)); } catch (e) { /* ignore */ }
    if (!validBackup(o)) { toast('Ce fichier n’est pas une sauvegarde Men’s Tunics.'); return; }
    const n = (k) => o.data[k].filter((x) => x && typeof x === 'object' && typeof x.id === 'string').length;
    confirmBox({
      title: 'Restaurer cette sauvegarde ?', label: 'Restaurer',
      text: `Elle contient <b>${n('commandes')}</b> commande(s), <b>${n('depenses')}</b> dépense(s), <b>${n('paiements')}</b> paiement(s) et <b>${n('encaissements')}</b> encaissement(s). <b>Toutes vos données actuelles seront remplacées.</b>`,
      onYes: () => { applyBackup(o); closeModal(); toast('Sauvegarde restaurée'); render(); }
    });
  };
  rd.readAsText(file);
}

async function exportXlsx() {
  if (!store.downloads) return;
  try {
    const T = V.T; const sheets = [];
    const add = (name, rows, wch) => { sheets.push({ name, rows, wch }); };
    add('RÉSUMÉ', [
      { Ligne: 'Chiffre d’affaires', FCFA: T.CA }, { Ligne: 'Coûts directs engagés', FCFA: T.direct }, { Ligne: 'Marge brute', FCFA: T.marge },
      { Ligne: 'Charges générales engagées (dont frais Mobile Money)', FCFA: T.general }, { Ligne: 'Collaborateurs engagés', FCFA: T.remun }, { Ligne: 'Résultat estimé', FCFA: T.resultat },
      { Ligne: 'Total coûts engagés', FCFA: T.totalEngage }, { Ligne: 'Total payé (décaissements, frais Mobile Money compris)', FCFA: T.dec }, { Ligne: 'Total restant à payer', FCFA: T.detteAll },
      { Ligne: 'Encaissements (nets des frais Mobile Money)', FCFA: T.enc }, { Ligne: 'dont frais de transfert Mobile Money', FCFA: T.fraisMM }, { Ligne: 'Solde de trésorerie', FCFA: T.solde }
    ], [46, 16]);
    add('COMMANDES', V.cmds.map((c) => ({ 'ID commande': c.id, 'Date commande': c.date, Client: c.client, Téléphone: c.telephone, Description: c.description, Statut: STATUTS_CMD[c.statut], 'Date de livraison prévue': c.dateLivraisonPrevue || '', 'Prix de vente (CA)': c.prix, Encaissé: c.encaisse, 'Reste à encaisser': c.resteEnc, 'Tissu engagé': c.tissu, 'Tailleur engagé': c.tailleur, 'Livraison engagée': c.livraison, 'Autres coûts directs': c.autres, 'Total coût engagé': c.engage, 'Marge estimée': c.marge, 'Coût payé': c.paye, 'Reste à payer': c.resteCout, 'Cash net': c.cashNet })), [12, 13, 22, 16, 28, 12, 18, 16, 12, 16, 13, 14, 15, 18, 16, 14, 12, 14, 12]);
    if (V.modeles.length) add('MODÈLES', V.modeles.map((m) => ({ Référence: m.id, Nom: m.nom, Description: m.description || '', 'Prix 1': m.prix1 || 0, 'Prix 2': m.prix2 || 0, 'Prix 3': m.prix3 || 0, 'Prix 4': m.prix4 || 0, 'Utilisé sur': m.usage })), [12, 22, 34, 12, 12, 12, 12, 12]);
    add('DÉPENSES', V.deps.map((d) => ({ 'ID dépense': d.id, "Date d'engagement": d.date, Catégorie: d.categorie, 'Sous-catégorie': d.sousCat || '', Description: d.description, Bénéficiaire: d.beneficiaire, 'Commande(s) associée(s)': d.commandes.map((x) => x.commande).join(', '), 'Montant engagé': d.engage, 'Montant payé': d.paye, 'Reste à payer': d.reste, 'Statut de paiement': STAT[d.statut].t, 'Date dernier paiement': d.last ? d.last.date : '', 'Mode dernier paiement': d.last ? d.last.mode : '', Observations: d.obs || '' })), [11, 15, 26, 24, 34, 22, 18, 14, 13, 13, 20, 18, 18, 30]);
    add('PAIEMENTS', store.data.paiements.slice().sort(byDate).map((p) => { const d = V.depBy[p.depenseId]; return { 'ID paiement': p.id, Date: p.date, 'ID dépense': p.depenseId, Bénéficiaire: d ? d.beneficiaire : '', Catégorie: d ? d.categorie : '', 'Commande(s) associée(s)': d ? d.commandes.map((x) => x.commande).join(', ') : '', 'Montant payé': Number(p.montant) || 0, 'Frais Mobile Money': Number(p.frais) || 0, Mode: p.mode, Référence: p.ref || '', Observations: p.obs || '' }; }), [12, 12, 11, 22, 26, 18, 13, 16, 16, 18, 28]);
    add('ENCAISSEMENTS', store.data.encaissements.slice().sort(byDate).map((e) => { const c = V.cmdBy[e.commande]; return { 'ID encaissement': e.id, Date: e.date, Commande: e.commande, Client: c ? c.client : '', 'Montant encaissé': Number(e.montant) || 0, 'Frais Mobile Money': Number(e.frais) || 0, Mode: e.mode, Référence: e.ref || '', Observations: e.obs || '' }; }), [15, 12, 12, 22, 16, 16, 16, 18, 28]);
    const out = makeXlsx(sheets);
    await store.downloads.save({ filename: `Mens_Tunics_${todayISO()}.xlsx`, data: out });
    toast('Export enregistré');
  } catch (e) {
    if (e && e.code === 'declined') return;
    toast('Export impossible pour le moment.');
  }
}

/* =====================================================================
   Rendu principal
   ===================================================================== */
function navHTML() {
  const cur = ui.view;
  if (store.role === 'tailleur') {
    return `<button data-act="nav" data-v="tailleur" aria-current="page">${icon('tunic')}Mes commandes</button>`;
  }
  const items = NAV.filter(([k]) => k !== 'tailleur').map(([k, l, , ic]) => `<button data-act="nav" data-v="${k}" ${cur === k ? 'aria-current="page"' : ''}>${icon(ic)}${l}${k === 'dashboard' && V && V.alerts.length ? `<span class="badge" aria-label="${V.alerts.length} alertes">${V.alerts.length}</span>` : ''}</button>`).join('');
  return items;
}
function tabsHTML() {
  const keys = store.role === 'tailleur' ? TAB_KEYS_TAILLEUR : TAB_KEYS;
  return keys.map((key) => NAV.find(([k]) => k === key)).filter(Boolean).map(([k, , s, ic]) => `<button data-act="nav" data-v="${k}" ${ui.view === k ? 'aria-current="page"' : ''}>${icon(ic)}<span>${s}</span></button>`).join('');
}
function loadingView() { return `<div class="skel" aria-busy="true" aria-label="Chargement de vos données"><i style="height:52px;width:40%"></i><i></i><i style="height:220px"></i></div>`; }

function gateState() {
  if (!drive.signedIn) return 'signin';
  if (!store.role) return 'role';
  if (drive.needsFileChoice && !drive.fileId) return 'file-choice';
  return null;
}
function render() {
  const ae = document.activeElement;
  const fid = ae && ae.id && !ae.closest('#modal') ? ae.id : null;
  const sel = fid && typeof ae.selectionStart === 'number' ? [ae.selectionStart, ae.selectionEnd] : null;
  const drawerBody = $('#drawer .body'); const dScroll = drawerBody ? drawerBody.scrollTop : 0;
  const gate = gateState();
  if (gate) {
    $('#nav').innerHTML = ''; $('#tabbar').innerHTML = ''; $('#drawer').innerHTML = '';
    const sync = $('#sync'); sync.className = 'sync'; sync.innerHTML = `<i></i>Connexion…`;
    $('#main').innerHTML = gate === 'signin' ? signInView() : gate === 'role' ? roleChoiceView() : fileChoiceView();
    ['rule-box', 'topbar-params', 'fab'].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; });
    return;
  }
  if (store.role === 'tailleur') ui.view = 'tailleur';
  if (store.ready) V = derive();
  $('#nav').innerHTML = navHTML();
  $('#tabbar').innerHTML = tabsHTML();
  const sync = $('#sync'); sync.className = 'sync' + (drive.needsReconnect ? ' local' : '');
  sync.innerHTML = `<i></i>${drive.needsReconnect ? 'Reconnexion nécessaire' : store.ready ? (drive.busy || drive.hold ? 'Synchronisation…' : 'Données synchronisées (Google Drive)') : 'Connexion…'}`;
  $('#main').innerHTML = store.ready ? VIEWS[ui.view]() : loadingView();
  $('#drawer').innerHTML = store.ready ? drawerHTML() : '';
  const nb = $('#drawer .body'); if (nb) nb.scrollTop = dScroll;
  const isTailleur = store.role === 'tailleur';
  const ruleBox = document.getElementById('rule-box'); if (ruleBox) ruleBox.hidden = isTailleur;
  const topbarParams = document.getElementById('topbar-params'); if (topbarParams) topbarParams.hidden = isTailleur;
  const fab = document.getElementById('fab'); if (fab) fab.hidden = isTailleur;
  const brandSub = document.querySelectorAll('.brand small'); brandSub.forEach((el) => { el.textContent = isTailleur ? 'Suivi des commandes' : 'Suivi financier'; });
  if (fid) { const el = document.getElementById(fid); if (el && el !== document.activeElement) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } } }
}

function go(view) { ui.view = store.role === 'tailleur' ? 'tailleur' : view; ui.q = ''; ui.drawer = null; render(); window.scrollTo(0, 0); }

/* =====================================================================
   Événements
   ===================================================================== */
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act; const id = el.dataset.id;
  if (el.tagName === 'A') ev.preventDefault();
  const [verb, arg] = a.split(':');
  switch (verb) {
    case 'nav': go(el.dataset.v); break;
    case 'open': ui.drawer = { type: arg, id }; render(); break;
    case 'close-drawer': ui.drawer = null; render(); break;
    case 'close-modal': closeModal(); break;
    case 'new':
      if (arg === 'cmd') formCmd(); else if (arg === 'cmd-for-client') { ui.drawer = null; render(); formCmd(null, { client: el.dataset.nom, telephone: el.dataset.tel, adresse: el.dataset.adr }); } else if (arg === 'dep') formDep(null, el.dataset.cmd); else if (arg === 'pai') formPai({ dep: el.dataset.dep }); else if (arg === 'enc') formEnc({ cmd: el.dataset.cmd }); else if (arg === 'modele') formModele();
      break;
    case 'edit':
      if (arg === 'cmd') formCmd(id); else if (arg === 'dep') formDep(id); else if (arg === 'pai') formPai({ id }); else if (arg === 'enc') formEnc({ id }); else if (arg === 'modele') formModele(id);
      break;
    case 'form-delete': if (formSpec && formSpec.onDelete) formSpec.onDelete(); break;
    case 'confirm-yes': if (formSpec && formSpec.confirm) formSpec.confirm(); break;
    case 'setf': ui[el.dataset.k] = el.dataset.v; render(); break;
    case 'tbl-cat': ui.tblCat = !ui.tblCat; render(); break;
    case 'month': { let m = ui.month + Number(el.dataset.d), y = ui.year; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } ui.month = m; ui.year = y; render(); break; }
    case 'month-set': ui.month = Number(el.dataset.m); render(); break;
    case 'clear-examples': clearExamples(); break;
    case 'export': exportXlsx(); break;
    case 'backup': saveBackup(); break;
    case 'export-catalogue': exportCatalogue(); break;
    case 'google-signin': signInGoogle(); break;
    case 'google-reconnect': reconnectGoogle(); break;
    case 'role-choice': chooseRole(el.dataset.role); break;
    case 'drive-create': chooseCreateDriveFile(); break;
    case 'drive-join': chooseJoinExistingAtelier(); break;
    case 'role-change': store.role = ''; try { localStorage.removeItem(ROLE_KEY); } catch (e2) { /* ignore */ } render(); break;
    case 'google-signout': confirmBox({ title: 'Se déconnecter ?', label: 'Se déconnecter', text: 'Vous pourrez vous reconnecter avec le même compte Google à tout moment.', onYes: () => { closeModal(); signOutGoogle(); } }); break;
    case 'choice-a': case 'choice-b': { const c = formSpec && formSpec.choice; closeModal(); if (c) (el.dataset.act === 'choice-a' ? c.a : c.b)(); break; }
    case 'restore': { const fi = $('#restore-file'); if (fi) fi.click(); break; }
    case 'reset-local': confirmBox({ title: 'Tout effacer ?', label: 'Tout effacer', text: 'Toutes vos données (sur cet appareil et dans Google Drive) seront effacées. Pensez à télécharger une sauvegarde avant.', onYes: () => { store.data = clone(SAMPLE); store.settings = clone(DEFAULTS); persistLocal(); closeModal(); toast('Données effacées'); render(); } }); break;
    case 'cat-add': $('#cat-rows').insertAdjacentHTML('beforeend', catRow(null)); break;
    case 'cat-del': if (!el.disabled) el.closest('.catrow').remove(); break;
    case 'modele-photo-del': removeModelePhoto(Number(el.dataset.idx)); break;
    case 'modele-video-del': removeModeleVideo(); break;
    case 'rep-add': { const rr = $('#rep-rows'); const empty = $('p', rr); if (empty) empty.remove(); rr.insertAdjacentHTML('beforeend', repRow(Date.now(), '', '')); runPreview(); break; }
    case 'rep-del': { el.closest('.reprow').remove(); const rr = $('#rep-rows'); if (!rr.children.length) rr.innerHTML = '<p class="muted" style="margin:2px 0 8px">Aucune commande liée pour l’instant.</p>'; runPreview(); break; }
    case 'quick': openQuick(); break;
    default: break;
  }
});

function openQuick() {
  $('#modal').innerHTML = `<div class="modal-wrap"><div class="scrim" data-act="close-modal"></div><div class="modal confirm" role="dialog" aria-modal="true"><h2>Que voulez-vous faire ?</h2><div style="display:grid;gap:8px;margin-top:14px">
    <button class="btn primary" style="height:46px" data-act="close-modal" data-then="enc">Encaisser un client</button>
    <button class="btn" style="height:46px" data-act="close-modal" data-then="pai">Payer une dépense</button>
    <button class="btn" style="height:46px" data-act="close-modal" data-then="dep">Ajouter une dépense engagée</button>
    <button class="btn" style="height:46px" data-act="close-modal" data-then="cmd">Nouvelle commande</button></div></div></div>`;
}
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-then]'); if (!el) return;
  const t = el.dataset.then; setTimeout(() => { if (t === 'enc') formEnc(); else if (t === 'pai') formPai(); else if (t === 'dep') formDep(); else if (t === 'cmd') formCmd(); }, 0);
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') { if ($('#modal').innerHTML) closeModal(); else if (ui.drawer) { ui.drawer = null; render(); } return; }
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('[data-act][tabindex]')) { ev.preventDefault(); ev.target.click(); }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'q') { ui.q = ev.target.value; render(); return; }
  if (ev.target.closest('#form')) { if (formSpec && formSpec.onChange) formSpec.onChange(ev, formValues()); runPreview(); }
});
document.addEventListener('change', async (ev) => {
  if (ev.target.id === 'restore-file') { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (f) restoreBackup(f); return; }
  if (ev.target.id === 'fcat') { ui.depCat = ev.target.value; render(); return; }
  if (ev.target.matches && ev.target.matches('input[data-act-input="modele-photo-add"]')) {
    const files = Array.from(ev.target.files || []); ev.target.value = '';
    if (files.length) addModelePhotos(files);
    return;
  }
  if (ev.target.matches && ev.target.matches('input[data-act-input="modele-video-add"]')) {
    const f = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (f) addModeleVideo(f);
    return;
  }
  if (ev.target.classList && ev.target.classList.contains('statut-sel')) {
    const c = store.data.commandes.find((x) => x.id === ev.target.dataset.id);
    if (c) { if (await guard(() => put('commandes', { ...c, statut: ev.target.value }))) toast('Statut mis à jour'); }
    return;
  }
  if (ev.target.closest('#form')) { if (formSpec && formSpec.onChange) formSpec.onChange(ev, formValues()); runPreview(); }
});

document.addEventListener('submit', async (ev) => {
  const f = ev.target; ev.preventDefault();
  const fid = f.getAttribute('id'); /* pas f.id : un champ nommé « id » masquerait la propriété */
  if (fid === 'form' && formSpec) {
    const v = formValues(); const errs = formSpec.validate ? formSpec.validate(v) : {};
    showErrors(errs); if (Object.keys(errs).length) return;
    const btn = $('button[type="submit"]', f); if (btn) btn.disabled = true;
    const ok = await formSpec.submit(v);
    if (ok === false) { if (btn) btn.disabled = false; return; }
    const msg = formSpec.toast; closeModal(); if (msg) toast(msg); scheduleRender();
  } else if (fid === 'set-solde') {
    store.settings.soldeInitial = num($('#s-solde').value);
    if (await guard(saveSettings)) toast('Solde initial enregistré');
  } else if (fid === 'set-modes') {
    const modes = [...new Set($('#s-modes').value.split('\n').map(trim).filter(Boolean))];
    if (!modes.length) { toast('Gardez au moins un mode de paiement.'); return; }
    store.settings.modes = modes;
    if (await guard(saveSettings)) toast('Modes de paiement enregistrés');
  } else if (fid === 'set-cats') {
    const rows = [...document.querySelectorAll('#cat-rows .catrow')].map((r) => ({ old: r.dataset.old, key: r.dataset.key, nom: trim($('[name=nom]', r).value), nature: $('[name=nature]', r).value, dette: $('[name=dette]', r).value }));
    if (rows.some((r) => !r.nom)) { toast('Chaque catégorie doit avoir un nom.'); return; }
    if (new Set(rows.map((r) => r.nom)).size !== rows.length) { toast('Deux catégories portent le même nom.'); return; }
    const oldNames = store.settings.categories.map((c) => c.nom);
    const removed = oldNames.filter((n) => !rows.some((r) => r.old === n));
    const used = removed.filter((n) => store.data.depenses.some((d) => d.categorie === n));
    if (used.length) { toast(`« ${used[0]} » est utilisée par des dépenses : impossible de la retirer.`); return; }
    const renames = rows.filter((r) => r.old && r.old !== r.nom);
    store.settings.categories = rows.map((r) => ({ nom: r.nom, nature: r.nature, dette: r.dette, ...(r.key ? { key: r.key } : {}) }));
    const ok = await guard(async () => {
      for (const r of renames) for (const d of store.data.depenses.filter((x) => x.categorie === r.old)) await put('depenses', { ...d, categorie: r.nom });
      await saveSettings();
    });
    if (ok) { toast('Catégories enregistrées'); render(); }
  }
});

/* infobulle */
const tipEl = () => $('#tip');
document.addEventListener('pointerover', (ev) => {
  const t = ev.target.closest && ev.target.closest('[data-tip]'); if (!t) return;
  const el = tipEl(); el.innerHTML = esc(t.dataset.tip).replace(/\n/g, '<br>'); el.hidden = false; moveTip(ev);
});
document.addEventListener('pointermove', (ev) => { if (!tipEl().hidden) moveTip(ev); });
document.addEventListener('pointerout', (ev) => { const t = ev.target.closest && ev.target.closest('[data-tip]'); if (t && !(ev.relatedTarget && t.contains(ev.relatedTarget))) tipEl().hidden = true; });
function moveTip(ev) {
  const el = tipEl(); const w = el.offsetWidth, h = el.offsetHeight;
  let x = ev.clientX + 14, y = ev.clientY + 16;
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
  if (y + h > window.innerHeight - 8) y = ev.clientY - h - 12;
  el.style.left = Math.max(8, x) + 'px'; el.style.top = Math.max(8, y) + 'px';
}

/* =====================================================================
   Démarrage : connexion Google -> choix du rôle (une fois par appareil)
   -> synchronisation avec le fichier de données dans Google Drive.
   ===================================================================== */
function startLocal() {
  const saved = loadLocal();
  store.mode = 'local';
  store.savedAt = 0;
  if (saved) { store.data = { ...clone(SAMPLE), ...saved.data }; store.settings = { ...clone(DEFAULTS), ...(saved.settings || {}) }; store.savedAt = saved.savedAt || 0; }
  else { store.data = clone(SAMPLE); }
}
async function boot() {
  store.mode = 'local';
  store.downloads = localDownloads();
  startLocal(); // remplie tout de suite depuis ce navigateur, en attendant Google Drive
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* ignore */ }
  render();
  await initDriveAuth();
  // tentative de reconnexion silencieuse (session Google déjà active + consentement déjà donné)
  const silentOk = await requestToken('');
  if (silentOk) { await afterSignIn(); } else { render(); }
}
boot();
})();
