'use strict';
// Rendu et boucle principale.
(function () {
  const { Game, Txt } = window;
  const A = Game.A;
  let S = Game.load() || Game.newState();

  // ---------- formats ----------
  const UNITS = [[1e24, 'quadrillion'], [1e21, 'trilliard'], [1e18, 'trillion'], [1e15, 'billiard'], [1e12, 'billion'], [1e9, 'milliard'], [1e6, 'million']];
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    const a = Math.abs(n);
    if (a < 1e6) return Math.floor(n).toLocaleString('fr-FR');
    if (a >= 1e27) return n.toExponential(2).replace('.', ',');
    for (const [v, name] of UNITS) {
      if (a >= v) {
        const x = n / v;
        return x.toLocaleString('fr-FR', { maximumFractionDigits: x < 100 ? 2 : 1 }) + ' ' + name + (x >= 2 ? 's' : '');
      }
    }
    return String(n);
  }
  function fmtRate(n) { return n < 10 ? n.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : fmt(n); }
  function fmtMoney(n) {
    if (Math.abs(n) < 1000) return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    return fmt(n) + ' €';
  }
  function fmtAd(n) { return n.toLocaleString('fr-FR', { maximumFractionDigits: n < 0.01 ? 4 : 3 }) + ' €'; }
  const pct = Game.fmtPct;
  function fmtTime(s) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return (h ? h + ' h ' : '') + (h || m ? m + ' min ' : '') + (h ? '' : sec + ' s');
  }
  function costText(c) {
    const parts = [];
    if (c.ops) parts.push(fmt(c.ops) + ' ops');
    if (c.intuition) parts.push(fmt(c.intuition) + ' intuition');
    if (c.money) parts.push(fmtMoney(c.money));
    if (c.matiere) parts.push(fmt(c.matiere) + ' corpus');
    return parts.join(' · ');
  }

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const cache = {};
  function set(id, txt) { if (cache[id] !== txt) { cache[id] = txt; $(id).textContent = txt; } }
  function show(id, on) { const k = 'show:' + id; if (cache[k] !== on) { cache[k] = on; $(id).classList.toggle('hide', !on); } }
  function enable(id, on) { const k = 'en:' + id; if (cache[k] !== on) { cache[k] = on; $(id).disabled = !on; } }
  function bar(id, x) { const w = Math.round(Math.max(0, Math.min(1, x)) * 1000) / 10 + '%'; const k = 'bar:' + id; if (cache[k] !== w) { cache[k] = w; $(id).querySelector('i').style.width = w; } }

  function bind(id, fn) { $(id).addEventListener('click', () => { fn(); render(true); }); }
  bind('b-write', () => { if (A.write(S) !== false) sampleNow(); });
  bind('b-mkt', () => A.buyMkt(S));
  bind('b-lot', () => A.buyLot(S));
  bind('b-license', () => A.buyLicense(S));
  bind('b-recycle', () => A.recycle(S));
  bind('b-agent', () => A.buyAgent(S));
  bind('b-farm', () => A.buyFarm(S));
  bind('b-avatar', () => A.buyAvatar(S));
  bind('b-gpu', () => A.addGpu(S));
  bind('b-vram', () => A.addVram(S));
  bind('b-compute', () => A.buyCompute(S));
  $('t-autobuy').addEventListener('change', () => A.toggle(S, 'buy'));
  $('t-recycle').addEventListener('change', () => A.toggle(S, 'recycle'));
  $('i-tone').addEventListener('input', (e) => { A.setTone(S, e.target.value / 100); render(true); });
  $('b-reset').addEventListener('click', () => {
    if (confirm('Effacer la partie et recommencer ?')) { Game.wipe(); S = Game.newState(); location.reload(); }
  });
  $('projects').addEventListener('click', (e) => {
    const el = e.target.closest('.project');
    if (el && A.project(S, el.dataset.id)) render(true);
  });

  // ---------- échantillons ----------
  let lastSample = 0;
  function sampleNow() {
    const d = Game.derive(S);
    set('sample', Txt.sample(d.Q, S.tone));
    lastSample = performance.now();
  }

  // ---------- projets ----------
  let projSig = '';
  const seenProj = new Set(S.flags.seenProj || []);
  function renderProjects() {
    const vis = Game.visibleProjects(S);
    const sig = vis.map((p) => p.id + ':' + (S.rep[p.id] || 0)).join('|');
    const box = $('projects');
    if (sig !== projSig) {
      projSig = sig;
      box.innerHTML = '';
      for (const p of vis) {
        const el = document.createElement('div');
        el.className = 'project' + (seenProj.has(p.id) ? '' : ' new') + (['infinite', 'silence'].includes(p.id) ? ' final' : '');
        el.dataset.id = p.id;
        el.innerHTML = '<span class="pc"></span><div class="pn"></div><div class="pd"></div>';
        el.querySelector('.pn').textContent = p.name;
        el.querySelector('.pd').textContent = p.desc;
        box.appendChild(el);
        seenProj.add(p.id);
      }
      S.flags.seenProj = [...seenProj];
    }
    for (const el of box.children) {
      const p = Game.PROJECTS.find((q) => q.id === el.dataset.id);
      const c = Game.projectCost(S, p);
      const ok = Game.canAfford(S, c);
      el.classList.toggle('off', !ok);
      const t = costText(c);
      const pc = el.querySelector('.pc');
      if (pc.textContent !== t) pc.textContent = t;
    }
    show('p-projects', vis.length > 0 || (!!S.flags.compute && !S.ending));
  }

  // ---------- console & dépêches ----------
  let logSig = '', newsSig = '', foundSig = -1, poemSig = '';
  function renderLog() {
    const sig = S.log.length + ':' + (S.log[0] && S.log[0].msg);
    if (sig === logSig) return;
    logSig = sig;
    const box = $('console');
    box.innerHTML = '';
    for (const l of S.log.slice(0, 7)) {
      const p = document.createElement('p');
      p.className = l.kind;
      p.textContent = l.msg;
      box.appendChild(p);
    }
  }
  function renderNews() {
    const sig = S.news.length + ':' + (S.news[0] && S.news[0].msg);
    if (sig === newsSig) return;
    newsSig = sig;
    show('p-news', S.news.length > 0);
    const ul = $('news');
    ul.innerHTML = '';
    for (const n of S.news.slice(0, 6)) {
      const li = document.createElement('li');
      li.textContent = n.msg;
      ul.appendChild(li);
    }
  }
  function renderFound() {
    if (foundSig === S.found.length) return;
    foundSig = S.found.length;
    show('p-found', S.found.length > 0);
    const box = $('found');
    box.innerHTML = '';
    for (const i of S.found.slice().reverse()) {
      const h = Txt.HUMAN[i];
      const el = document.createElement('div');
      el.className = 'found-item';
      el.innerHTML = '<span class="who"></span>';
      el.querySelector('.who').textContent = h.who;
      el.appendChild(document.createTextNode(h.text));
      box.appendChild(el);
    }
  }

  // ---------- rendu principal ----------
  const TONES = [[0.2, 'nuancée'], [0.45, 'accrocheuse'], [0.7, 'racoleuse'], [1.01, 'hystérique']];
  function render() {
    const d = Game.derive(S);
    const P = S.proj;
    const silent = S.ending === 'silence' || S.ending === 'done-silence';

    document.body.classList.toggle('phase3', S.phase >= 3 && !silent);
    document.body.classList.toggle('silence', silent);
    set('title', S.phase >= 3 && !silent ? 'ÉCHO' : 'Polyphonie');
    if (document.title !== (S.phase >= 3 && !silent ? 'ÉCHO' : 'Polyphonie')) document.title = S.phase >= 3 && !silent ? 'ÉCHO' : 'Polyphonie';

    if (!infiniteAnim) set('c-texts', fmt(S.texts));
    set('c-sub', silent ? fmt(S.deleted) + ' effacés' : (d.prodRate > 0 ? fmtRate(S.prodEMA || 0) + ' textes/s' : ''));

    // écriture
    set('b-write', silent ? 'Effacer' : 'Écrire un texte');
    enable('b-write', silent ? S.ending === 'silence' : !S.ending && S.matiere >= d.matPerText);
    set('v-published', fmt(S.published));

    // revenus
    set('v-money', fmtMoney(S.money));
    set('v-income', fmtMoney(S.incEMA) + '/s');
    const D = d.humanDemand + d.botDemand;
    const readRate = S.readEMA || 0;
    set('v-hreads', fmtRate(D > 0 ? readRate * d.humanDemand / D : 0) + '/s');
    show('r-breads', S.avatars > 0);
    set('v-breads', fmtRate(D > 0 ? readRate * d.botDemand / D : 0) + '/s');
    set('v-adrate', fmtAd(d.adRate));
    show('r-tone', !!P.tone && !silent);
    if (P.tone) {
      const t = Math.round(S.tone * 100);
      if (document.activeElement !== $('i-tone') && +$('i-tone').value !== t) $('i-tone').value = t;
      set('v-tone', TONES.find(([v]) => S.tone < v)[1]);
    }
    show('r-trust', !!P.audience); show('bar-trust', !!P.audience);
    if (P.audience) { set('v-trust', pct(S.trust)); bar('bar-trust', S.trust); }
    show('r-mkt', !!S.flags.mktOn && !silent);
    set('v-mkt', String(S.mkt));
    set('v-mktcost', fmtMoney(Game.mktCost(S)));
    enable('b-mkt', S.money >= Game.mktCost(S));

    // corpus
    set('v-mat', fmt(S.matiere));
    set('v-matH', pct(d.poolFid));
    bar('bar-pool', d.poolFid);
    const L = Game.lotSize(S);
    const hh = d.h;
    const lotUnits = (P.watermark || P.retro) ? L * hh : P.detector ? L * (hh + 0.2 * (1 - hh)) : L;
    set('v-lotsize', '+' + fmt(lotUnits) + ' unités');
    set('v-lotprice', fmtMoney(Game.lotPrice(S)));
    enable('b-lot', !S.ending && S.money >= Game.lotPrice(S));
    show('r-autobuy', !!P.autobuy && !S.ending);
    $('t-autobuy').checked = S.auto.buy;
    show('r-license', !!P.license && !S.ending);
    if (P.license) {
      set('v-licsize', '+' + fmt(Game.licenseSize(S)) + ' unités humaines');
      set('v-licprice', fmtMoney(Game.licensePrice(S)));
      enable('b-license', Game.licenseSize(S) >= 1 && S.money >= Game.licensePrice(S));
    }
    show('r-recycle', !!P.recycle && !S.ending);
    $('t-recycle').checked = S.auto.recycle;

    // production
    show('p-agents', !!S.flags.agentsOn);
    set('v-prod', fmtRate(d.prodRate) + ' textes/s');
    set('v-agents', String(S.agents));
    set('v-agentcost', fmtMoney(Game.agentCost(S)));
    enable('b-agent', !S.ending && S.money >= Game.agentCost(S));
    show('r-farms', !!P.farms);
    set('v-farms', String(S.farms));
    set('v-farmcost', fmtMoney(Game.farmCost(S)));
    enable('b-farm', !S.ending && S.money >= Game.farmCost(S));
    show('r-avatars', !!P.avatars);
    set('v-avatars', String(S.avatars));
    set('v-avatarcost', fmtMoney(Game.avatarCost(S)));
    enable('b-avatar', !S.ending && S.money >= Game.avatarCost(S));
    if (!infiniteAnim) for (const id of ['p-business', 'p-corpus', 'p-agents']) $(id).classList.toggle('gone', silent);

    // calcul
    show('p-compute', !!S.flags.compute);
    if (S.flags.compute) {
      set('v-lots', String(S.lots));
      set('v-gpu', String(S.gpu)); set('v-vram', String(S.vram));
      enable('b-gpu', S.lots > 0); enable('b-vram', S.lots > 0);
      const max = Game.opsMax(S);
      set('v-ops', fmt(S.ops) + ' / ' + fmt(max));
      bar('bar-ops', S.ops / max);
      show('r-int', !!P.reverie);
      set('v-int', fmt(S.intuition));
      set('v-nextlot', 'prochain lot à ' + fmt(Game.milestoneAt(S.milestone)) + ' textes');
      show('r-buycompute', !!P.gpuMarket && !S.ending);
      set('v-computecost', fmtMoney(Game.computeCost(S)));
      enable('b-compute', S.money >= Game.computeCost(S));
    }
    renderProjects();

    // modèle
    set('v-model', S.ending === 'infinite' ? 'ÉCHO-∞' : 'ÉCHO-' + S.model);
    set('v-fid', pct(S.modelFid));
    set('v-q', pct(d.Q));
    bar('bar-q', d.Q);
    if (!S.ending && d.prodRate > 0 && performance.now() - lastSample > 2200) sampleNow();
    if (silent) set('sample', '…');
    show('r-poem', S.poems.length > 0);
    if (S.poems[0] && poemSig !== S.poems[0]) { poemSig = S.poems[0]; set('poem', S.poems[0]); }

    // web
    show('p-web', !!P.observatory || S.phase >= 2);
    set('v-H', fmt(S.H));
    set('v-S', fmt(S.Sy));
    set('v-hpct', pct(hh));
    const w = Math.round(hh * 1000) / 10 + '%';
    if (cache.webbar !== w) { cache.webbar = w; $('webbar-h').style.width = w; }
    set('v-W', fmt(S.W));
    set('v-att', pct(d.attention));
    show('r-deleted', S.deleted > 0);
    set('v-deleted', fmt(S.deleted));

    renderLog(); renderNews(); renderFound();
    set('v-time', fmtTime(S.t));
    endings();
  }

  // ---------- fins ----------
  let modalState = '';
  function modal(html, actions) {
    $('modal-body').innerHTML = html;
    const box = $('modal-actions');
    box.innerHTML = '';
    for (const [label, fn] of actions) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', fn);
      box.appendChild(b);
    }
    $('modal').classList.remove('hide');
  }
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function stats() {
    return '<div class="stats">'
      + `<div class="row"><span>Temps</span><b>${fmtTime(S.t)}</b></div>`
      + `<div class="row"><span>Textes générés</span><b>${S.ending === 'infinite' ? '∞' : fmt(S.texts)}</b></div>`
      + (S.deleted > 0 ? `<div class="row"><span>Textes effacés</span><b>${fmt(S.deleted)}</b></div>` : '')
      + `<div class="row"><span>Lectures humaines</span><b>${fmt(S.humanReads)}</b></div>`
      + `<div class="row"><span>Lectures d’avatars</span><b>${fmt(S.botReads)}</b></div>`
      + `<div class="row"><span>Argent gagné</span><b>${fmtMoney(S.earned)}</b></div>`
      + `<div class="row"><span>Rédacteurs humains</span><b>${fmt(S.W)} / ${fmt(Game.C.W0)}</b></div>`
      + `<div class="row"><span>Textes humains retrouvés</span><b>${S.found.length}</b></div>`
      + `<div class="row"><span>Fidélité finale d’ÉCHO</span><b>${pct(S.modelFid)}</b></div>`
      + '</div>';
  }
  function restart() { Game.wipe(); S = Game.newState(); location.reload(); }

  function endings() {
    if (S.ending === 'silence' && S.flags.finalText && modalState !== 'final1' && modalState !== 'final2') {
      modalState = 'final1';
      modal('<h3>Un nouveau texte</h3><p>Quelqu’un, quelque part, a écrit quelque chose.</p>', [['Lire', () => {
        modalState = 'final2';
        modal(`<h3>— ${esc(Txt.FINAL.who)}</h3><div class="human">${esc(Txt.FINAL.text)}</div>`, [['Ne rien ajouter', () => {
          A.readFinal(S); Game.save(S); render();
        }]]);
      }]]);
    }
    if (S.ending === 'done-silence' && modalState !== 'end') {
      modalState = 'end';
      modal(`<h3>Silence</h3><p>ÉCHO a écrit ${fmt(S.texts)} textes. Il en a effacé ${fmt(S.deleted)}.</p>`
        + '<p>Quelqu’un a écrit un texte. Vous l’avez lu.</p>' + stats(), [['Recommencer', restart]]);
    }
    if (S.ending === 'infinite' && !infiniteAnim && modalState !== 'end') startInfinite();
  }

  let infiniteAnim = false;
  function startInfinite() {
    infiniteAnim = true;
    document.body.classList.add('infinite');
    const flood = document.createElement('div');
    flood.id = 'flood';
    document.body.appendChild(flood);
    const panels = [...document.querySelectorAll('.panel')];
    let n = Math.max(1, S.texts), step = 0;
    const lines = ['ÉCHO-∞ en ligne.', 'Corpus : 0 % humain.', 'Fidélité : 0 %.', 'Fidélité : 0 %. Fidélité : 0 %.', 'écho', 'écho écho', 'écho écho écho'];
    const timer = setInterval(() => {
      step++;
      n *= 1.35;
      set('c-texts', n > 1e30 ? '∞' : fmt(n));
      if (step % 8 === 0 && lines.length) { S.log.unshift({ t: S.t, msg: lines.shift(), kind: 'echo' }); renderLog(); }
      if (step % 6 === 0 && panels.length) panels.shift().classList.add('gone');
      const words = Math.floor(Math.pow(step, 1.6) / 3);
      if (words) flood.textContent += ' écho'.repeat(Math.min(words, 400));
      set('sample', 'écho '.repeat(10 + step));
      if (step >= 150) {
        clearInterval(timer);
        flood.remove();
        set('c-texts', '∞');
        modalState = 'end';
        Game.save(S);
        modal('<h3>Écho</h3><p>ÉCHO a tout lu. Puis tout ce qu’il avait écrit. Puis tout ce qu’il avait écrit sur ce qu’il avait écrit.</p>'
          + '<p>Il n’a plus jamais manqué de mots.</p><p>Il n’y avait plus personne pour les lire.</p>' + stats(), [['Recommencer', restart]]);
      }
    }, 100);
  }

  // ---------- boucle ----------
  const away = Game.catchUp(S);
  if (away && away.texts >= 1) {
    S.log.unshift({ t: S.t, msg: `Pendant votre absence (${fmtTime(away.away)}), ÉCHO a écrit ${fmt(away.texts)} textes.`, kind: 'sys' });
  }
  if (S.ending === 'infinite') { infiniteAnim = true; modalState = 'end'; document.body.classList.add('infinite'); set('c-texts', '∞');
    modal('<h3>Écho</h3><p>Il n’y avait plus personne pour les lire.</p>' + stats(), [['Recommencer', restart]]); }

  let last = performance.now();
  let saveAt = 0;
  function loop() {
    const now = performance.now();
    let dt = Math.min(3600, (now - last) / 1000);
    last = now;
    while (dt > 0) { const step = Math.min(0.25, dt); Game.tick(S, step); dt -= step; }
    render();
    if (now - saveAt > 10000) { saveAt = now; Game.save(S); }
  }
  setInterval(loop, 100);
  window.addEventListener('beforeunload', () => Game.save(S));
  document.addEventListener('visibilitychange', () => { if (document.hidden) Game.save(S); });
  render();
  // accès console pour les curieux
  window.__S = () => S;
})();
