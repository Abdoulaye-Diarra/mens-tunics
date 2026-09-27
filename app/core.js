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
