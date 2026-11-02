'use strict';
// Sept générations — interface.
(function () {
  const { Sept, SeptStory } = window;
  const A = Sept.A;
  let S = Sept.load() || Sept.newState();

  // ---------- formats ----------
  const nf = (n, d) => n.toLocaleString('fr-FR', { maximumFractionDigits: d || 0 });
  function fmt(n) { return Math.abs(n) >= 1e6 ? nf(n / 1e6, 2) + ' M' : nf(n); }
  const money = (n) => fmt(n) + ' Md€';
  const pct = (x, d) => nf(x * 100, d === undefined ? 1 : d) + ' %';
  const T = Sept.fmtT;
  const signed = (x) => (x >= 0 ? '+' : '−') + nf(Math.abs(x), 1);

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const cache = {};
  const set = (id, t) => { if (cache[id] !== t) { cache[id] = t; $(id).textContent = t; } };
  const show = (id, on) => { const k = 's' + id; if (cache[k] !== on) { cache[k] = on; $(id).classList.toggle('hide', !on); } };
  const enable = (id, on) => { const k = 'e' + id; if (cache[k] !== on) { cache[k] = on; $(id).disabled = !on; } };
  const after = () => render();
  const bind = (id, fn) => $(id).addEventListener('click', () => { fn(); after(); });

  bind('b-borrow', () => A.borrow(S));
  bind('b-repay', () => A.repay(S));
  bind('b-ind', () => A.buyIndustry(S));
  bind('b-srv', () => A.buyService(S));
  bind('b-fos', () => A.buildFossil(S));
  bind('b-ren', () => A.buildRen(S));
  bind('b-nuc', () => A.buildNuc(S));
  bind('b-fus', () => A.buildFusion(S));
  bind('b-close', () => A.closeFossil(S));
  bind('b-dig', () => A.buyDigue(S));
  bind('b-clim', () => A.buyClim(S));
  bind('b-dac', () => A.buyDac(S));
  $('t-market').addEventListener('change', () => { A.toggleMarket(S); after(); });
  $('i-sob').addEventListener('input', (e) => { A.setSobriety(S, e.target.value / 100); after(); });
  $('i-cp').addEventListener('input', (e) => { A.setCp(S, +e.target.value); after(); });
  $('i-geo').addEventListener('input', (e) => { A.setGeo(S, e.target.value / 100); after(); });
  document.querySelectorAll('#controls button').forEach((b) => b.addEventListener('click', () => {
    const v = +b.dataset.speed;
    if (v === 0) S.paused = !S.paused; else { S.speed = v; S.paused = false; }
    after();
  }));
  document.querySelectorAll('.qty button').forEach((b) => b.addEventListener('click', () => { A.setQty(S, +b.dataset.qty); after(); }));
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && $('modal').classList.contains('hide')) { e.preventDefault(); S.paused = !S.paused; after(); }
  });
  $('research').addEventListener('click', (e) => {
    const el = e.target.closest('.res');
    if (el && A.research(S, el.dataset.id)) after();
  });
  $('b-reset').addEventListener('click', () => {
    if (confirm('Effacer la partie et recommencer en 1950 ?')) { Sept.wipe(); S = Sept.newState(); location.reload(); }
  });

  // ---------- frise ----------
  const tl = $('timeline');
  Sept.GENS.forEach((g, i) => {
    const d = document.createElement('div');
    d.className = 'seg';
    d.innerHTML = '<i></i><span></span>';
    d.querySelector('span').textContent = g.name;
    tl.appendChild(d);
  });

  // ---------- recherche ----------
  let resSig = '';
  const seen = new Set(S.flags.seenRes || []);
  function renderResearch() {
    const vis = Sept.visibleResearch(S);
    const sig = vis.map((p) => p.id).join('|');
    const box = $('research');
    if (sig !== resSig) {
      resSig = sig;
      box.innerHTML = '';
      for (const p of vis) {
        const el = document.createElement('div');
        el.className = 'res' + (seen.has(p.id) ? '' : ' new');
        el.dataset.id = p.id;
        el.innerHTML = '<span class="rc"></span><div><span class="ry"></span><span class="rn"></span></div><div class="rd"></div>';
        el.querySelector('.rc').textContent = money(p.cost);
        el.querySelector('.ry').textContent = p.y;
        el.querySelector('.rn').textContent = p.name;
        el.querySelector('.rd').textContent = p.desc;
        box.appendChild(el);
        seen.add(p.id);
      }
      S.flags.seenRes = [...seen];
    }
    for (const el of box.children) {
      const p = Sept.RESEARCH.find((q) => q.id === el.dataset.id);
      el.classList.toggle('off', S.treasury < p.cost);
    }
    set('v-nores', vis.length ? '' : 'Rien de nouveau pour l’instant. Le monde avance.');
  }

  // ---------- journal ----------
  let logSig = '';
  function renderLog() {
    const sig = S.log.length + (S.log[0] ? S.log[0].msg : '');
    if (sig === logSig) return;
    logSig = sig;
    const box = $('console');
    box.innerHTML = '';
    for (const l of S.log.slice(0, 6)) {
      const p = document.createElement('p');
      p.className = l.kind;
      const y = document.createElement('span');
      y.className = 'y'; y.textContent = l.y;
      p.appendChild(y);
      p.appendChild(document.createTextNode(l.msg));
      box.appendChild(p);
    }
  }

  // ---------- bien-être ----------
  const LABELS = {
    comfort: 'Confort matériel', services: 'Services publics', heat: 'Canicules', floods: 'Inondations',
    pollution: 'Pollution de l’air', shortage: 'Pénuries d’énergie', anger: 'Colère sociale', geo: 'Ciel voilé',
    events: 'Catastrophes récentes', lost: 'Pertes irréversibles',
  };
  function renderBreakdown(d) {
    const ul = $('w-breakdown');
    const items = Object.entries(d.w).filter(([, v]) => Math.abs(v) >= 0.05);
    const sig = items.map(([k, v]) => k + nf(v, 1)).join('|');
    if (cache.bd === sig) return;
    cache.bd = sig;
    ul.innerHTML = '';
    for (const [k, v] of items) {
      const li = document.createElement('li');
      li.innerHTML = '<span></span><span></span>';
      li.children[0].textContent = LABELS[k];
      li.children[1].textContent = signed(v);
      li.children[1].className = v < 0 ? 'neg' : 'pos';
      ul.appendChild(li);
    }
  }
  function renderGenBars(box, upto) {
    const vals = Sept.GENS.map((g, i) => (i <= upto ? Sept.genAvg(S, i) : null));
    const scale = Math.max(30, ...vals.filter((v) => v !== null).map(Math.abs));
    const sig = vals.map((v) => (v === null ? '-' : nf(v, 0))).join('|') + upto;
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.innerHTML = '';
    vals.forEach((v, i) => {
      const el = document.createElement('div');
      el.className = 'gb' + (v !== null && v < 0 ? ' neg' : '') + (i === S.gen && S.phase === 'play' ? ' cur' : '');
      el.title = Sept.GENS[i].name + (v === null ? '' : ' : ' + nf(v, 1));
      el.innerHTML = '<i></i><span></span>';
      el.querySelector('span').textContent = Sept.GENS[i].name;
      const h = v === null ? 0 : Math.max(2, Math.abs(v) / scale * 100);
      el.querySelector('i').style.cssText = `bottom:0;height:${h}%`;
      box.appendChild(el);
    });
  }

  // ---------- graphique ----------
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function drawChart(cv, full) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, pad = { l: 34, r: 8, t: 10, b: 20 };
    ctx.clearRect(0, 0, W, H);
    const h = S.hist;
    const maxT = Math.max(2.5, ...h.map((p) => p.T)) + 0.3;
    const maxE = Math.max(20, ...h.map((p) => p.E));
    const x = (y) => pad.l + (y - Sept.C.START) / (Sept.END - Sept.C.START) * (W - pad.l - pad.r);
    const yT = (t) => H - pad.b - t / maxT * (H - pad.t - pad.b);
    const yE = (e) => H - pad.b - e / maxE * (H - pad.t - pad.b) * 0.6;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = css('--muted');
    ctx.strokeStyle = css('--line');
    // générations
    for (let g = 0; g <= Sept.C.GENS; g++) {
      const gx = x(Sept.C.START + g * Sept.C.GEN_YEARS);
      ctx.beginPath(); ctx.moveTo(gx, pad.t); ctx.lineTo(gx, H - pad.b); ctx.stroke();
      if (g < Sept.C.GENS && full) ctx.fillText(Sept.GENS[g].name, gx + 3, H - 6);
    }
    if (!full) { ctx.fillText('1950', pad.l, H - 6); ctx.fillText('2160', W - pad.r - 28, H - 6); }
    // seuils
    ctx.setLineDash([4, 4]);
    for (const t of [1.5, 2]) {
      ctx.strokeStyle = css('--hot'); ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, yT(t)); ctx.lineTo(W - pad.r, yT(t)); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = css('--hot'); ctx.fillText(t.toLocaleString('fr-FR') + ' °C', 2, yT(t) + 4);
    }
    ctx.strokeStyle = css('--muted');
    ctx.beginPath(); ctx.moveTo(x(2026), pad.t); ctx.lineTo(x(2026), H - pad.b); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = css('--muted'); ctx.fillText('2026', x(2026) + 3, pad.t + 10);
    if (h.length < 2) return;
    // émissions
    ctx.fillStyle = css('--fos'); ctx.globalAlpha = 0.18;
    ctx.beginPath(); ctx.moveTo(x(h[0].y), yE(0));
    for (const p of h) ctx.lineTo(x(p.y), yE(Math.max(0, p.E)));
    ctx.lineTo(x(h[h.length - 1].y), yE(0)); ctx.fill();
    ctx.globalAlpha = 1;
    // température
    ctx.strokeStyle = css('--hot'); ctx.lineWidth = 2.5;
    ctx.beginPath();
    h.forEach((p, i) => (i ? ctx.lineTo(x(p.y), yT(p.T)) : ctx.moveTo(x(p.y), yT(p.T))));
    ctx.stroke(); ctx.lineWidth = 1;
  }

  // ---------- rendu ----------
  let lastChart = 0;
  function render() {
    const d = Sept.derive(S);
    const r = S.research;
    const g = Sept.GENS[S.gen];
    const genEnd = Sept.C.START + (S.gen + 1) * Sept.C.GEN_YEARS;

    const hue = Math.round(205 - Math.max(0, Math.min(1, (S.T - 0.3) / 3.2)) * 185);
    if (cache.hue !== hue) { cache.hue = hue; document.documentElement.style.setProperty('--h', hue); }

    set('v-name', g.name);
    set('v-span', `${g.from}–${genEnd}`);
    set('v-year', String(Math.floor(S.year)));
    [...tl.children].forEach((seg, i) => {
      const f = i < S.gen ? 1 : i > S.gen ? 0 : (S.year - g.from) / Sept.C.GEN_YEARS;
      const w = Math.round(f * 1000) / 10 + '%';
      if (seg.dataset.w !== w) { seg.dataset.w = w; seg.querySelector('i').style.width = w; }
      seg.classList.toggle('cur', i === S.gen);
    });
    document.querySelectorAll('#controls button').forEach((b) => {
      const v = +b.dataset.speed;
      b.classList.toggle('on', v === 0 ? S.paused : !S.paused && S.speed === v);
    });
    document.querySelectorAll('.qty button').forEach((b) => b.classList.toggle('on', +b.dataset.qty === S.qty));

    // bien-être
    set('v-W', nf(d.W, 1));
    const avg = Sept.genAvg(S, S.gen);
    set('v-Wavg', avg === null ? 'moyenne de la vie de ' + g.name + ' : —' : 'moyenne de la vie de ' + g.name + ' : ' + nf(avg, 1));
    renderBreakdown(d);
    renderGenBars($('gen-bars'), S.gen);

    // économie
    set('v-Y', fmt(S.Y));
    set('v-g', signed(d.growth * 100) + ' %/an');
    set('v-tr', money(S.treasury));
    set('v-inc', (d.netIncome >= 0 ? '+' : '−') + money(Math.abs(d.netIncome)) + '/an');
    set('v-debt', money(S.debt) + (S.debt > 0 ? ` (intérêts ${money(d.interest)}/an)` : ''));
    set('b-borrow', 'Emprunter ' + money(Sept.borrowAmount(S)));
    enable('b-repay', S.debt > 0 && S.treasury > 0);
    const q = S.qty;
    set('c-ind', money(Sept.industryCost(S)));
    enable('b-ind', S.treasury >= Sept.industryCost(S));
    set('v-ind', String(S.industry));
    set('c-srv', money(Sept.serviceCost(S)));
    enable('b-srv', S.treasury >= Sept.serviceCost(S));
    show('r-sob', !!r.meadows);
    if (r.meadows) {
      set('v-sob', pct(S.sobriety, 0));
      if (document.activeElement !== $('i-sob')) $('i-sob').value = Math.round(S.sobriety * 100);
    }
    show('r-cp', !!r.carbontax);
    if (r.carbontax) {
      set('v-cp', nf(S.cp) + ' €/t');
      if (document.activeElement !== $('i-cp')) $('i-cp').value = S.cp;
    }

    // énergie
    set('v-Ed', fmt(d.Ed) + ' unités');
    const tot = Math.max(d.Ed, 1);
    const parts = [d.Ruse, d.Nuse, d.Fuse, d.fossilUsed, Math.max(0, d.Ed - d.supply)];
    const surplus = d.capacity - d.supply;
    set('v-cap', fmt(d.capacity) + ' unités' + (surplus > d.Ed * 0.05 ? ` · ${fmt(surplus)} inutilisées` : ''));
    show('lg-fus', S.Fcap > 0);
    $('stack').querySelectorAll('i').forEach((el, i) => {
      const w = Math.round(parts[i] / tot * 1000) / 10 + '%';
      if (el.dataset.w !== w) { el.dataset.w = w; el.style.width = w; }
    });
    set('c-fos', money(Sept.fossilCost(S) * q));
    enable('b-fos', S.treasury >= Sept.fossilCost(S));
    const lastF = S.fossil.length ? Math.max(...S.fossil.map((c) => c.y)) + Sept.C.FOSSIL_LIFE : null;
    set('v-fos', `${d.plants} centrales` + (d.plants ? ` · utilisées à ${pct(d.F > 0 ? d.fossilUsed / d.F : 0, 0)} · la plus récente ferme en ${lastF}` : ''));
    show('b-ren', !!r.pv); show('r-ren', !!r.pv);
    if (r.pv) {
      set('c-ren', money(Sept.renCost(S) * q));
      enable('b-ren', S.treasury >= Sept.renCost(S));
      set('v-ren', `${fmt(S.Rcap)} unités · plafond ${pct(d.maxShareR, 0)} des besoins sans stockage · prix en baisse à chaque installation`);
    }
    show('b-nuc', !!r.nuclear); show('r-nuc', !!r.nuclear);
    if (r.nuclear) {
      set('c-nuc', money(Sept.nucCost(S) * q));
      enable('b-nuc', S.treasury >= Sept.nucCost(S));
      set('v-nuc', `${fmt(S.Ncap)} unités` + (S.Ncap > 0 ? ` · utilisées à ${pct(d.Nuse / S.Ncap, 0)}` : '') + ` · ${S.nQueue.length} en chantier (10 ans)` + (S.waste > 0.5 ? ` · ${fmt(S.waste)} t de déchets à garder` : ''));
    }
    show('b-fus', !!S.flags.fusionReady);
    if (S.flags.fusionReady) { set('c-fus', money(Sept.fusionCost() * q)); enable('b-fus', S.treasury >= Sept.fusionCost()); }
    show('r-fus', !!S.fusionAt);
    if (S.fusionAt) {
      set('v-fus', S.flags.fusionReady ? `${fmt(S.Fcap)} unités de fusion` + (S.Fcap > 0 ? ` · utilisées à ${pct(d.Fuse / S.Fcap, 0)}` : '') + ' · 50 par réacteur, utilisées avant le nucléaire'
        : `fusion : en recherche · premiers réacteurs promis pour ${S.flags.fusionLate ? S.fusionAt : S.fusionAt - 10}`);
    }
    set('c-close', money(Sept.closeCost() * q));
    enable('b-close', d.plants > 0 && S.treasury >= Sept.closeCost());
    $('t-market').checked = S.market;

    renderResearch();

    // climat
    show('c-unknown', !r.keeling);
    show('c-co2', !!r.keeling);
    if (r.keeling) {
      set('v-ppm', nf(d.ppm) + ' ppm');
      set('v-E', nf(d.net, 1) + ' Gt CO₂/an');
      set('v-Esplit', `${nf(d.fossilEm, 1)} · ${nf(d.otherEm, 1)} · ${nf(d.tipEm, 1)}` + (d.removal > 0 ? ` · −${nf(d.removal, 1)} captés` : ''));
    }
    show('c-temp', !!r.models);
    if (r.models) {
      set('v-T', T(S.T));
      set('v-SL', '+' + Math.round(S.SL * 100) + ' cm');
      if (performance.now() - lastChart > 1000) { lastChart = performance.now(); drawChart($('chart'), false); }
    }
    show('c-giec', !!r.giec);
    if (r.giec) {
      set('l-proj', `Si rien ne change, en ${d.proj2100.year}`);
      set('v-proj', T(d.proj2100.T));
      const yrs = (b) => (b <= 0 ? 'dépassé' : nf(b) + ' Gt' + (d.net > 0.5 ? ` (${nf(b / d.net)} ans)` : ''));
      set('v-b15', yrs(d.budget15));
      set('v-b2', yrs(d.budget2));
    }
    const tipsTxt = Object.keys(S.tip).map((k) => ({ coral: 'Récifs coralliens perdus', greenland: 'Groenland : fonte engagée', permafrost: 'Pergélisol : dégel', amazon: 'Amazonie : bascule en savane', wais: 'Antarctique de l’Ouest : effondrement engagé' }[k])).join('|');
    if (cache.tips !== tipsTxt) {
      cache.tips = tipsTxt;
      $('tips').innerHTML = '';
      for (const t of tipsTxt ? tipsTxt.split('|') : []) { const li = document.createElement('li'); li.textContent = t; $('tips').appendChild(li); }
    }

    show('p-act', !!(r.adapt || r.dac || r.geo));
    show('r-adapt', !!r.adapt);
    if (r.adapt) {
      set('c-dig', money(Sept.digueCost(S))); enable('b-dig', S.digues < 0.9 && S.treasury >= Sept.digueCost(S)); set('v-dig', pct(S.digues, 0));
      set('c-clim', money(Sept.climCost(S))); enable('b-clim', S.clim < 5 && S.treasury >= Sept.climCost(S)); set('v-clim', S.clim + ' / 5');
    }
    show('r-dac', !!r.dac);
    if (r.dac) {
      set('c-dac', money(Sept.dacCost(S) * q)); enable('b-dac', S.treasury >= Sept.dacCost(S));
      set('v-dac', `${S.dac} machines · ${nf(d.removal, 1)} Gt/an retirées · entretien ${money(d.dacUpkeep)}/an`);
    }
    show('r-geo', !!r.geo);
    if (r.geo) {
      set('v-geo', `−${nf(S.mask, 2)} °C (cible −${nf(S.geoTarget, 2)} °C)`);
      set('v-geocost', money(d.geoUpkeep) + '/an, pour toujours');
      if (document.activeElement !== $('i-geo')) $('i-geo').value = Math.round(S.geoTarget * 100);
    }

    renderLog();
    modals();
  }

  // ---------- modales ----------
  let modalKey = '';
  function modal(key, html, buttons) {
    if (modalKey === key) return;
    modalKey = key;
    const card = $('modal-card');
    card.innerHTML = html;
    for (const [label, fn] of buttons) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => { fn(); });
      card.appendChild(b);
    }
    $('modal').classList.remove('hide');
  }
  function closeModal() { modalKey = ''; $('modal').classList.add('hide'); render(); }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const paras = (list) => list.map((p) => `<p>${esc(p)}</p>`).join('');

  function modals() {
    if (S.phase === 'intro') {
      modal('intro', `<h3>Sept générations</h3><div class="letter">${paras(SeptStory.INTRO)}</div>`, [['Commencer — Jeanne, 1950', () => {
        A.start(S);
        Sept.log(S, 'Jeanne a vingt-cinq ans. La guerre est finie. Tout est à reconstruire.', 'hist');
        Sept.log(S, 'Le marché construit pour vous la centrale la moins chère quand l’énergie manque. Vous pouvez le désactiver.', 'sys');
        closeModal();
      }]]);
      return;
    }
    if (S.flags.showNow && S.phase === 'play') {
      S.paused = true;
      const n = SeptStory.nowText(S);
      modal('now', `<h3>${esc(n.title)}</h3><div class="letter">${paras(n.paragraphs)}</div>`, [['Continuer', () => {
        S.flags.showNow = false; S.paused = false; closeModal();
      }]]);
      return;
    }
    if (S.phase === 'transition') {
      const L = SeptStory.letter(S, S.gen);
      const g = Sept.GENS[S.gen], n = Sept.GENS[S.gen + 1];
      modal('tr' + S.gen, `<h3>Fin d’une vie</h3><div class="sub">${esc(g.name)}, ${g.from}–${L.year} · bien-être moyen ${nf(Sept.genAvg(S, S.gen), 1)}</div>`
        + `<div class="letter"><p>${esc(L.to)},</p>${paras(L.paragraphs)}<p class="sig">— ${esc(L.from)}, ${L.year}</p></div>`,
      [[`Devenir ${n.name} (${n.from})`, () => { A.nextGen(S); Sept.save(S); closeModal(); }]]);
      return;
    }
    if (S.phase === 'end') {
      const L = SeptStory.finalLetter(S);
      const names = Sept.GENS.slice(0, 6).map((g) => g.name);
      const stats = '<div class="stats">'
        + `<div class="row"><span>Réchauffement en 2160</span><b>${T(S.T)}</b></div>`
        + `<div class="row"><span>Montée des eaux depuis 1950</span><b>+${Math.round((S.SL - 0.07) * 100)} cm</b></div>`
        + `<div class="row"><span>CO₂ émis depuis 1950</span><b>${fmt(S.cum - Sept.C.CUM0)} Gt</b></div>`
        + `<div class="row"><span>Points de bascule franchis</span><b>${Object.keys(S.tip).length} / 5</b></div>`
        + Sept.GENS.map((g, i) => `<div class="row"><span>Bien-être moyen · ${g.name}</span><b>${nf(Sept.genAvg(S, i), 1)}</b></div>`).join('')
        + '</div>';
      modal('end', `<h3>2160</h3><div class="sub">Lettre d’Aube</div>`
        + `<div class="letter"><p>À ${names.slice(0, -1).join(', ')} et ${names[5]},</p>${paras(L.paragraphs)}<p class="sig">— Aube, 2160</p></div>`
        + '<canvas id="end-chart" width="900" height="320"></canvas><div id="end-bars" class="gen-bars"></div>'
        + stats + `<blockquote>${esc(SeptStory.QUOTE)}<br><span class="small">— ${esc(SeptStory.QUOTE_SRC)}</span></blockquote>`,
      [['Recommencer en 1950', () => { Sept.wipe(); location.reload(); }], ['Retour au menu', () => { location.href = '../index.html'; }]]);
      drawChart($('end-chart'), true);
      renderGenBars($('end-bars'), 6);
      return;
    }
    if (modalKey) closeModal();
  }

  // ---------- boucle ----------
  let last = performance.now(), saveAt = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    if (!document.hidden) Sept.tick(S, dt);
    render();
    if (now - saveAt > 5000) { saveAt = now; Sept.save(S); }
  }, 100);
  window.addEventListener('beforeunload', () => Sept.save(S));
  document.addEventListener('visibilitychange', () => { if (document.hidden) Sept.save(S); });
  render();
  window.__S = () => S;
})();
