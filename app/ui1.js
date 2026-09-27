
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
