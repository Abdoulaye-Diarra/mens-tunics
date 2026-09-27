
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
    $('#main').innerHTML = gate === 'signin' ? signInView() : roleChoiceView();
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
