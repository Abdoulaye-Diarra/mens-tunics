
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
