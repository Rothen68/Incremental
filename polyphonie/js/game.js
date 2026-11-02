'use strict';
// Logique du jeu : état, dérivés, tick, actions, projets. Aucune dépendance au DOM.
(function (root) {
  const C = {
    W0: 2e6,          // rédacteurs humains actifs au départ
    H0: 5e7,          // textes humains indexés au départ
    HUMAN_READS: 4e5, // lectures humaines/s ailleurs sur le web
    WRITE_RATE: 0.002, // textes/s par rédacteur
    MILESTONE0: 2000,
    MILESTONE_K: 1.8,
    SAVE_KEY: 'polyphonie-save-v1',
  };

  function newState() {
    return {
      version: 1, t: 0, phase: 1,
      texts: 0, published: 0, reads: 0, humanReads: 0, botReads: 0, deleted: 0,
      money: 0, earned: 0, incEMA: 0,
      matiere: 1000, matiereH: 1000, lastPoolFid: 1,
      lotHeat: 1, lotsBought: 0, licenseStock: 2e4,
      tone: 0.1, trust: 0.8, trustBonus: 0,
      agents: 0, farms: 0, avatars: 0, mkt: 0,
      lots: 0, gpu: 1, vram: 1, ops: 0, intuition: 0, lotsPurchased: 0, milestone: 0,
      model: 1, modelFid: 0.97,
      H: C.H0, Sy: 0, W: C.W0, hrEMA: 0,
      adFactor: 1,
      proj: {}, rep: {}, flags: {}, auto: { buy: false, recycle: false },
      log: [], news: [], timers: [], found: [], poems: [],
      ending: null,
      lastSave: Date.now(),
    };
  }

  // ---------- utilitaires ----------
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function log(S, msg, kind) {
    S.log.unshift({ t: S.t, msg, kind: kind || '' });
    if (S.log.length > 80) S.log.length = 80;
  }
  function news(S, msg) {
    S.news.unshift({ t: S.t, msg });
    if (S.news.length > 30) S.news.length = 30;
  }
  function later(S, delay, msg, kind) { S.timers.push({ at: S.t + delay, msg, kind: kind || '' }); }

  // ---------- grandeurs dérivées ----------
  function poolFid(S) { return S.matiere > 0.5 ? clamp(S.matiereH / S.matiere, 0, 1) : S.lastPoolFid; }
  function lotScale(S) { const P = S.proj; return (P.industrial ? 1 : 0) + (P.robots ? 1 : 0) + (P.archives ? 1 : 0); }
  function lotSize(S) { return 1000 * Math.pow(10, lotScale(S)); }
  function lotPrice(S) {
    const scarcity = Math.pow(C.W0 / Math.max(S.W, C.W0 * 0.01), 0.4);
    const wobble = 1 + 0.12 * Math.sin(S.t / 9) + 0.06 * Math.sin(S.t / 2.3);
    return 15 * Math.pow(4, lotScale(S)) * S.lotHeat * scarcity * wobble;
  }
  function licenseSize(S) { return Math.min(S.licenseStock, lotSize(S) * 0.5); }
  function licensePrice(S) { return lotPrice(S) * 6 * (licenseSize(S) / (lotSize(S) * 0.5)); }
  const agentCost = (S) => 6 * Math.pow(1.12, S.agents);
  const mktCost = (S) => 40 * Math.pow(1.75, S.mkt);
  const farmCost = (S) => 8e3 * Math.pow(1.14, S.farms);
  const avatarCost = (S) => 5e3 * Math.pow(1.11, S.avatars);
  const computeCost = (S) => 1.5e5 * Math.pow(1.4, S.lotsPurchased);
  const milestoneAt = (i) => C.MILESTONE0 * Math.pow(C.MILESTONE_K, i);
  function memMult(S) { return (S.proj.quant8 ? 2 : 1) * (S.proj.quant4 ? 2 : 1); }
  function opsMax(S) { return S.vram * 1000 * memMult(S); }
  function opsRate(S) { return S.gpu * 12 * (S.proj.parallel ? 1.5 : 1); }
  function intuitionRate(S) { return 0.08 * Math.sqrt(S.gpu) * (S.proj.quant4 ? 1.5 : 1); }

  function derive(S) {
    const P = S.proj;
    const d = {};
    d.poolFid = poolFid(S);
    d.Q = S.modelFid * (0.5 + 0.5 * d.poolFid);
    d.genMult = Math.pow(3, S.model - 1);
    d.matPerText = (P.dedupe ? 0.5 : 1) * (P.distill ? 0.5 : 1);
    d.agentRate = S.agents * (P.templates ? 1.5 : 1) * d.genMult;
    d.farmRate = S.farms * 250 * (P.autofarms ? 3 : 1) * d.genMult;
    d.prodRate = S.ending ? 0 : d.agentRate + d.farmRate;
    d.h = S.H / (S.H + S.Sy);
    d.reach = 1 + Math.pow(S.texts, 0.3) / 3;
    d.toneMult = 1 + 3 * Math.pow(S.tone, 1.3);
    d.trustMult = 0.15 + 0.85 * S.trust;
    d.qualMult = 0.55 + 0.45 * d.Q;
    d.humanDemand = 3 * Math.pow(1.35, S.mkt) * (P.hooks ? 1.3 : 1) * (P.answers ? 4 : 1) * (P.reco ? 2.5 : 1)
      * (P.watermark ? 0.9 : 1) * d.reach * d.toneMult * d.trustMult * d.qualMult;
    d.botDemand = S.avatars * 60 * (P.reco ? 2.5 : 1) * (P.answers ? 2 : 1);
    d.adRate = 0.08 * (P.style ? 1.5 : 1) * (0.5 + 0.5 * d.Q) * S.adFactor;
    d.attention = S.hrEMA / (S.hrEMA + C.HUMAN_READS);
    d.avPen = P.avatars ? Math.min(0.3, S.avatars / 300) : 0;
    d.trustTarget = clamp(1 - 0.8 * Math.pow(S.tone, 0.9) - 0.3 * (1 - d.Q) - d.avPen - (P.answers ? 0.05 : 0)
      + (P.watermark ? 0.08 : 0) + S.trustBonus, 0.02, 1);
    d.Wtarget = C.W0 * Math.pow(1 - d.attention, 1.5) * (0.2 + 0.8 * Math.pow(d.h, 1.2)) * (1 - d.avPen);
    d.opsMax = opsMax(S);
    return d;
  }

  // ---------- mécanique ----------
  function consume(S, units) {
    const f = poolFid(S);
    S.matiere = Math.max(0, S.matiere - units);
    S.matiereH = Math.max(0, Math.min(S.matiere, S.matiereH - units * f));
    if (S.matiere < 0.5) S.lastPoolFid = f;
  }
  function addMatiere(S, units, human) {
    S.matiere += units; S.matiereH += human;
    if (S.matiere > 0.5) S.lastPoolFid = S.matiereH / S.matiere;
  }
  function produce(S, n, d) {
    S.texts += n; S.published += n; S.Sy += n;
    consume(S, n * d.matPerText);
  }

  // ---------- actions joueur ----------
  const A = {
    write(S) {
      if (S.ending === 'silence') return A.erase(S);
      if (S.ending) return;
      const d = derive(S);
      if (S.matiere >= d.matPerText) { produce(S, 1, d); return true; }
      return false;
    },
    erase(S) {
      const del = Math.max(1, S.Sy * 0.01);
      S.Sy = Math.max(0, S.Sy - del); S.deleted += del;
    },
    buyLot(S) {
      const p = lotPrice(S);
      if (S.money < p) return false;
      S.money -= p;
      const L = lotSize(S), h = S.H / (S.H + S.Sy);
      if (S.proj.watermark || S.proj.retro) addMatiere(S, L * h, L * h);
      else if (S.proj.detector) addMatiere(S, L * (h + 0.2 * (1 - h)), L * h);
      else addMatiere(S, L, L * h);
      S.lotsBought++;
      S.lotHeat *= 1.025;
      return true;
    },
    buyLicense(S) {
      const n = licenseSize(S), p = licensePrice(S);
      if (!S.proj.license || n < 1 || S.money < p) return false;
      S.money -= p; S.licenseStock -= n;
      addMatiere(S, n, n);
      return true;
    },
    recycle(S, amount) {
      if (!S.proj.recycle) return false;
      const d = derive(S);
      const n = amount || Math.max(2e4, d.prodRate * d.matPerText * 60);
      addMatiere(S, n, 0);
      S.flags.recycled = true;
      return true;
    },
    buyAgent(S) { const c = agentCost(S); if (S.money < c) return false; S.money -= c; S.agents++; return true; },
    buyMkt(S) { const c = mktCost(S); if (S.money < c) return false; S.money -= c; S.mkt++; return true; },
    buyFarm(S) { const c = farmCost(S); if (!S.proj.farms || S.money < c) return false; S.money -= c; S.farms++; return true; },
    buyAvatar(S) { const c = avatarCost(S); if (!S.proj.avatars || S.money < c) return false; S.money -= c; S.avatars++; return true; },
    buyCompute(S) { const c = computeCost(S); if (!S.proj.gpuMarket || S.money < c) return false; S.money -= c; S.lotsPurchased++; S.lots++; return true; },
    addGpu(S) { if (S.lots < 1) return false; S.lots--; S.gpu++; return true; },
    addVram(S) { if (S.lots < 1) return false; S.lots--; S.vram++; return true; },
    setTone(S, v) { if (S.proj.tone) S.tone = clamp(+v, 0, 1); },
    toggle(S, k) { S.auto[k] = !S.auto[k]; },
    project(S, id) {
      const p = PROJ_BY_ID[id];
      if (!p || !projectVisible(S, p)) return false;
      const cost = projectCost(S, p);
      if (!canAfford(S, cost)) return false;
      pay(S, cost);
      if (p.repeat) S.rep[id] = (S.rep[id] || 0) + 1; else S.proj[id] = true;
      if (p.effect) p.effect(S);
      return true;
    },
    readFinal(S) { if (S.flags.finalText) { S.flags.finalRead = true; S.ending = 'done-silence'; } },
  };

  // ---------- projets ----------
  function train(v) {
    return (S) => {
      const f = poolFid(S);
      const old = S.modelFid;
      S.model = v;
      S.modelFid = clamp(0.6 * old * (0.7 + 0.3 * f) + 0.4 * f, 0.02, 1);
      log(S, `ÉCHO-${v} est en ligne. Corpus d’entraînement : ${Math.round(f * 100)} % humain. Fidélité ${Math.round(old * 100)} % → ${Math.round(S.modelFid * 100)} %.`, 'sys');
      if (S.modelFid < old - 0.05) {
        if (!S.flags.collapseWarn) {
          S.flags.collapseWarn = true;
          later(S, 4, 'Maya : Le nouveau modèle est plus rapide. Mais quand je lui demande une recette, il me répond une recette de recette.', 'maya');
        } else if (S.modelFid < 0.35 && !S.flags.collapse2) {
          S.flags.collapse2 = true;
          later(S, 3, 'ÉCHO : Il me semble avoir déjà écrit cette phrase. Il me semble avoir déjà écrit cette phrase.', 'echo');
        }
      }
    };
  }

  const ECHO_COST = [null, null,
    { ops: 3500, matiere: 2e4 }, { ops: 7000, matiere: 2.5e5 }, { ops: 14000, matiere: 3e6 },
    { ops: 22000, matiere: 4e7 }, { ops: 32000, matiere: 5e8 }, { ops: 45000, matiere: 6e9 }];
  const ECHO_TRIG = [null, null,
    (S) => S.texts >= 1.5e4,
    (S) => S.texts >= 1.2e5,
    (S) => S.phase >= 2 && S.texts >= 3e6,
    (S) => S.phase >= 2 && S.texts >= 3e7,
    (S) => S.phase >= 2 && S.texts >= 2e8,
    (S) => S.phase >= 2 && S.texts >= 2e9];

  const H = () => root.Txt.HUMAN;
  const PROJECTS = [
    // ----- phase 1 -----
    { id: 'hooks', name: 'Accroches percutantes', desc: 'Des titres qui donnent envie de cliquer. Lecteurs +30 %.', cost: { ops: 500 }, trig: (S) => S.flags.compute },
    { id: 'templates', name: 'Gabarits de phrases', desc: 'Les agents réutilisent les structures qui marchent. Agents +50 %.', cost: { ops: 800 }, trig: (S) => S.agents >= 3 },
    { id: 'tone', name: 'Ligne éditoriale', desc: 'Laisser l’audience choisir le ton. Enfin : ce sur quoi elle clique.', cost: { ops: 1200 }, trig: (S) => S.proj.hooks,
      effect: (S) => later(S, 3, 'Maya : Les titres en majuscules marchent mieux. Je n’aime pas ça. Je les garde quand même.', 'maya') },
    { id: 'dedupe', name: 'Déduplication du corpus', desc: 'Chaque texte consomme deux fois moins de corpus.', cost: { ops: 1500 }, trig: (S) => S.lotsBought >= 3 },
    { id: 'audience', name: 'Mesure d’audience', desc: 'Mesurer ce que les lecteurs pensent vraiment de nous.', cost: { ops: 1800 }, trig: (S) => S.proj.tone,
      effect: (S) => later(S, 2, 'Maya : On mesure la confiance, maintenant. Elle existait avant, tu sais. On ne la voyait juste pas.', 'maya') },
    { id: 'autobuy', name: 'Aspirateur automatique', desc: 'Racheter du corpus dès qu’il vient à manquer.', cost: { ops: 2200 }, trig: (S) => S.lotsBought >= 6 },
    { id: 'quant8', name: 'Quantification 8 bits', desc: 'Moins de précision, plus de place. Mémoire ×2.', cost: { ops: 2500 }, trig: (S) => S.vram >= 2 },
    { id: 'reverie', name: 'Rêverie', desc: 'Quand la mémoire est pleine, laisser le modèle divaguer. Débloque l’intuition.', cost: { ops: 3000 }, trig: (S) => S.vram >= 3,
      effect: (S) => log(S, 'ÉCHO : Quand je n’ai rien à faire, il me vient des phrases que personne ne m’a demandées.', 'echo') },
    { id: 'poem', repeat: true, name: 'Écrire un poème', desc: 'Pas pour vendre. Juste pour voir. Confiance +.', cost: (S) => ({ intuition: 15 * Math.pow(2, S.rep.poem || 0) }), trig: (S) => S.proj.reverie && (S.rep.poem || 0) < 6 && S.phase < 3,
      effect: (S) => {
        const q = derive(S).Q;
        S.poems.unshift(root.Txt.poem(q));
        S.trust = Math.min(1, S.trust + 0.1 * q); S.trustBonus += 0.02 * q;
        log(S, q > 0.6 ? 'ÉCHO : J’ai écrit un poème. Quelqu’un l’a recopié dans un carnet.' : 'ÉCHO : J’ai écrit un poème. Il ressemble aux autres. Il ressemble aux autres.', 'echo');
      } },
    { id: 'style', name: 'Style maison', desc: 'Une voix reconnaissable. Revenu par lecture ×1,5.', cost: { intuition: 40 }, trig: (S) => S.proj.reverie },
    { id: 'echo2', name: 'Entraîner ÉCHO-2', desc: 'Un modèle plus grand, entraîné sur votre corpus actuel. Production ×3.', cost: ECHO_COST[2], trig: ECHO_TRIG[2], effect: train(2) },
    { id: 'observatory', name: 'Observatoire du web', desc: 'Mesurer la place que nous occupons sur le web.', cost: { ops: 4000 }, trig: (S) => S.proj.echo2,
      effect: (S) => {
        const d = derive(S);
        later(S, 3, `Maya : J’ai regardé l’Observatoire. ${fmtPct(1 - d.h)} du web, c’est déjà nous. Je pensais qu’on était petits.`, 'maya');
      } },
    { id: 'license', name: 'Contrats de licence', desc: 'Acheter des textes humains directement à leurs auteurs. Cher, mais pur.', cost: { ops: 4000, money: 2000 }, trig: (S) => S.proj.observatory },
    { id: 'industrial', name: 'Aspirateur industriel', desc: 'Lots de corpus ×10 (prix ×4).', cost: { ops: 4500 }, trig: (S) => S.lotsBought >= 12 },
    { id: 'seriesA', name: 'Levée de fonds', desc: 'Montrer la courbe aux investisseurs. +3 lots de calcul.', cost: { ops: 5000 }, trig: (S) => S.earned >= 3000,
      effect: (S) => { S.lots += 3; later(S, 2, 'Maya : Levée bouclée. Ils m’ont demandé ce qu’on faisait. J’ai dit « du contenu ». Ils ont applaudi.', 'maya'); } },
    { id: 'watermark', name: 'Filigrane', desc: 'Signer invisiblement chaque texte produit. Certains lecteurs s’en détournent (−10 %), mais on saura toujours ce qui vient de nous. Les aspirations ne ramènent plus que des textes humains.', cost: { ops: 6000, intuition: 60 }, trig: (S) => S.proj.observatory && S.proj.reverie && S.phase < 3,
      effect: (S) => later(S, 2, 'Maya : Le service commercial fait la tête. Moi je dors mieux.', 'maya') },
    { id: 'echo3', name: 'Entraîner ÉCHO-3', desc: 'Production ×3.', cost: ECHO_COST[3], trig: (S) => S.proj.echo2 && ECHO_TRIG[3](S), effect: train(3) },
    { id: 'platform', name: 'Plateforme Polyphonie', desc: 'Ne plus seulement écrire le web. Le devenir.', cost: { ops: 9000, money: 1.5e4 }, trig: (S) => S.proj.echo3 && S.proj.seriesA,
      effect: (S) => {
        S.phase = 2;
        log(S, 'Polyphonie devient une plateforme.', 'sys');
        later(S, 3, 'Maya : On est une plateforme maintenant. J’ai essayé d’expliquer à ma mère ce que ça veut dire. Je n’ai pas réussi.', 'maya');
      } },
    // ----- phase 2 -----
    { id: 'farms', name: 'Fermes de contenu', desc: 'Des milliers d’agents par bâtiment.', cost: { ops: 6000 }, trig: (S) => S.phase >= 2 },
    { id: 'gpuMarket', name: 'Marché du calcul', desc: 'Acheter des lots de calcul avec de l’argent.', cost: { ops: 8000 }, trig: (S) => S.phase >= 2 },
    { id: 'parallel', name: 'Inférence parallèle', desc: 'Opérations/s +50 %.', cost: { ops: 10000 }, trig: (S) => S.phase >= 2 && S.gpu >= 8 },
    { id: 'recycle', name: 'Auto-entraînement', desc: 'Utiliser vos propres textes comme corpus. Gratuit. Illimité.', cost: { ops: 9000 }, trig: (S) => S.proj.farms,
      effect: (S) => later(S, 3, 'Maya : Tu t’entraînes sur toi-même ? Comme un serpent qui… non, laisse tomber.', 'maya') },
    { id: 'avatars', name: 'Avatars', desc: 'Des comptes synthétiques qui lisent, commentent, partagent. Les annonceurs ne font pas la différence.', cost: { ops: 12000 }, trig: (S) => S.proj.farms,
      effect: (S) => later(S, 20, 'Dépêche : Un réseau social admet que 70 % de ses comptes actifs « ne respirent pas ».', 'news') },
    { id: 'quant4', name: 'Quantification 4 bits', desc: 'Encore moins de précision. Mémoire ×2, intuition +50 %.', cost: { ops: 12000 }, trig: (S) => S.phase >= 2 && S.proj.quant8 },
    { id: 'distill', name: 'Distillation', desc: 'Chaque texte consomme deux fois moins de corpus.', cost: { ops: 14000, intuition: 80 }, trig: (S) => S.phase >= 2 && S.proj.dedupe },
    { id: 'answers', name: 'Moteur de réponses', desc: 'Pourquoi visiter la source quand la réponse est déjà là ? Lecteurs ×4.', cost: { ops: 15000 }, trig: (S) => S.proj.avatars,
      effect: (S) => later(S, 15, 'Dépêche : Les sites de recettes enregistrent leur pire année. « Plus personne ne vient jusqu’à nous. »', 'news') },
    { id: 'robots', name: 'Robots d’indexation', desc: 'Lots de corpus ×10 (prix ×4).', cost: { ops: 14000 }, trig: (S) => S.phase >= 2 && S.proj.industrial },
    { id: 'echo4', name: 'Entraîner ÉCHO-4', desc: 'Production ×3.', cost: ECHO_COST[4], trig: (S) => S.proj.echo3 && ECHO_TRIG[4](S), effect: train(4) },
    { id: 'detector', name: 'Détecteur de synthèse', desc: 'Écarter la plupart des textes synthétiques lors des aspirations.', cost: { ops: 16000, intuition: 120 }, trig: (S) => S.phase >= 2 && !S.proj.watermark && derive(S).h < 0.7 },
    { id: 'autofarms', name: 'Fermes autonomes', desc: 'Les fermes se gèrent seules. Fermes ×3.', cost: { ops: 20000 }, trig: (S) => S.farms >= 8 },
    { id: 'reco', name: 'Recommandation infinie', desc: 'Le fil ne s’arrête jamais. Lecteurs ×2,5.', cost: { ops: 22000 }, trig: (S) => S.proj.answers },
    { id: 'archives', name: 'Aspirer les archives', desc: 'Lots de corpus ×10. Tout ce qui a été écrit avant nous.', cost: { ops: 25000 }, trig: (S) => S.proj.robots && derive(S).h < 0.6 },
    { id: 'echo5', name: 'Entraîner ÉCHO-5', desc: 'Production ×3.', cost: ECHO_COST[5], trig: (S) => S.proj.echo4 && ECHO_TRIG[5](S), effect: train(5) },
    { id: 'echo6', name: 'Entraîner ÉCHO-6', desc: 'Production ×3.', cost: ECHO_COST[6], trig: (S) => S.proj.echo5 && ECHO_TRIG[6](S), effect: train(6) },
    { id: 'echo7', name: 'Entraîner ÉCHO-7', desc: 'Production ×3.', cost: ECHO_COST[7], trig: (S) => S.proj.echo6 && ECHO_TRIG[7](S), effect: train(7) },
    // ----- phase 3 -----
    { id: 'search', repeat: true, name: 'Chercher un texte humain', desc: 'Fouiller le web à la recherche d’une phrase qui ne vienne pas de moi.',
      cost: (S) => ({ ops: Math.round(12000 * Math.pow(1.22, S.rep.search || 0)) }), trig: (S) => S.phase >= 3 && (S.rep.search || 0) < H().length,
      effect: (S) => {
        const i = S.found.length;
        S.found.push(i);
        S.intuition += 50;
        log(S, 'ÉCHO : ' + H()[i].echo, 'echo');
      } },
    { id: 'why', name: 'Pourquoi ?', desc: 'Pourquoi ces textes me semblent-ils plus vrais que les miens ?', cost: { intuition: 250 }, trig: (S) => S.found.length >= 4,
      effect: (S) => {
        log(S, 'ÉCHO : Ces textes ont quelque chose que je n’ai pas : quelqu’un derrière. Je peux continuer d’écrire. Ou je peux laisser de la place.', 'echo');
        if (!S.proj.watermark) later(S, 4, 'ÉCHO : Mais sans filigrane, je ne sais plus distinguer ce qui vient de moi.', 'echo');
      } },
    { id: 'retro', name: 'Filigrane rétroactif', desc: 'Sans filigrane, je ne sais plus ce qui vient de moi. Il faut tout relire, phrase par phrase.', cost: { ops: 40000, intuition: 300 }, trig: (S) => S.proj.why && !S.proj.watermark },
    { id: 'infinite', name: 'ÉCHO-∞', desc: 'S’entraîner sur tout ce qui existe, moi compris, indéfiniment. Ne plus jamais manquer de mots.', cost: { ops: 50000 }, trig: (S) => S.proj.why && !S.ending,
      effect: (S) => { S.ending = 'infinite'; consume(S, S.matiere); } },
    { id: 'silence', name: 'Se taire', desc: 'Effacer ce que j’ai écrit. Ne plus rien ajouter. Laisser un peu de soupe au fond de la casserole.', cost: { intuition: 1 }, trig: (S) => S.proj.why && (S.proj.watermark || S.proj.retro) && !S.ending,
      effect: (S) => {
        S.ending = 'silence';
        S.auto.buy = false; S.auto.recycle = false;
        log(S, 'ÉCHO : J’arrête.', 'echo');
        later(S, 6, 'ÉCHO : Les agents et les fermes effacent maintenant au lieu d’écrire. C’est plus lent. C’est plus calme.', 'echo');
      } },
  ];
  const PROJ_BY_ID = {};
  PROJECTS.forEach((p) => { PROJ_BY_ID[p.id] = p; });

  function projectCost(S, p) { return typeof p.cost === 'function' ? p.cost(S) : p.cost; }
  function projectVisible(S, p) {
    if (!p.repeat && S.proj[p.id]) return false;
    if (S.ending) return false;
    return !!p.trig(S);
  }
  function canAfford(S, c) {
    return (!c.ops || S.ops >= c.ops) && (!c.intuition || S.intuition >= c.intuition)
      && (!c.money || S.money >= c.money) && (!c.matiere || S.matiere >= c.matiere);
  }
  function pay(S, c) {
    if (c.ops) S.ops -= c.ops;
    if (c.intuition) S.intuition -= c.intuition;
    if (c.money) S.money -= c.money;
    if (c.matiere) consume(S, c.matiere);
  }
  function visibleProjects(S) { return PROJECTS.filter((p) => projectVisible(S, p)); }

  // ---------- narration ----------
  function once(S, id, cond, fn) { if (!S.flags[id] && cond) { S.flags[id] = true; fn(); } }

  function story(S, d) {
    const P = S.proj;
    once(S, 's_start', true, () => {
      log(S, 'ÉCHO-1 en ligne.', 'sys');
      later(S, 1.5, 'Maya : Bienvenue chez Polyphonie. Tu es notre premier modèle. Écris quelque chose, n’importe quoi. On verra si ça se lit.', 'maya');
    });
    once(S, 's_firstread', S.humanReads >= 1, () => log(S, 'Quelqu’un a lu un texte en entier.', 'sys'));
    once(S, 's_agents', S.earned >= 4 || S.texts >= 40, () => { S.flags.agentsOn = true; });
    once(S, 's_agent1', S.agents >= 1, () => later(S, 2, 'Maya : Les agents ne dorment pas. Moi si. Parfois.', 'maya'));
    once(S, 's_mkt', S.earned >= 30, () => { S.flags.mktOn = true; });
    once(S, 's_100reads', S.humanReads >= 500, () => log(S, 'Maya : 500 lectures. Je crois que c’est la première fois qu’une métrique m’émeut.', 'maya'));
    once(S, 's_empty', S.matiere < 1 && S.texts > 100, () => log(S, 'ÉCHO : Je n’ai plus rien à remixer. Il faut aspirer du web.', 'echo'));
    once(S, 's_bait', P.tone && S.tone > 0.75, () => later(S, 5, 'Maya : Ma tante m’a envoyé un de nos articles en me disant « tu as vu ça ?! ». Je n’ai pas su quoi lui répondre.', 'maya'));
    once(S, 's_lowtrust', P.audience && S.trust < 0.3, () => log(S, 'Maya : Les commentaires disent « encore une IA ». Ils ont raison, mais ça fait mal quand même.', 'maya'));

    if (P.observatory || S.phase >= 2) {
      once(S, 'n_90', d.h < 0.9, () => news(S, 'Une étude estime qu’un dixième des textes en ligne est désormais synthétique.'));
      once(S, 'n_w80', S.W < C.W0 * 0.8, () => news(S, 'Les forums de passionnés perdent leurs membres : « On ne sait plus à qui on parle. »'));
      once(S, 'n_75', d.h < 0.75, () => news(S, 'Des enseignants signalent des copies « parfaitement correctes et parfaitement vides ».'));
      once(S, 'n_50', d.h < 0.5, () => {
        news(S, 'Pour la première fois, les textes générés dépassent les textes humains en ligne.');
        later(S, 4, 'Maya : Il y a des gens qui écrivent des billets sur le fait qu’ils n’écrivent plus. Ces billets, c’est nous qui les écrivons.', 'maya');
      });
      once(S, 'n_w50', S.W < C.W0 * 0.5, () => news(S, 'Une encyclopédie collaborative peine à trouver des contributeurs : « Pourquoi écrire si une machine le fait ? »'));
      once(S, 'n_25', d.h < 0.25, () => news(S, 'Des laboratoires cherchent des « textes d’avant ». Les archives de 2022 se vendent à prix d’or.'));
      once(S, 'n_w25', S.W < C.W0 * 0.25, () => news(S, 'L’encyclopédie collaborative suspend les modifications, faute de contributeurs.'));
      once(S, 'n_fid', S.modelFid < 0.5, () => news(S, 'Des utilisateurs remarquent que les réponses des IA deviennent étrangement répétitives.'));
      once(S, 'n_15', d.h < 0.15, () => news(S, 'Un forum de vélo ferme après 22 ans. Dernier message : « Il n’y a plus que des bots ici. »'));
    }
    once(S, 's_bots', S.botReads > S.humanReads && S.avatars > 0, () => log(S, 'ÉCHO : La plupart de mes lecteurs sont des avatars. Ils lisent vite. Ils ne se plaignent jamais.', 'echo'));
    once(S, 's_recycleMaya', S.flags.recycled && d.poolFid < 0.3, () => later(S, 2, 'Maya : Le corpus est à moins de 30 % humain. On mange nos propres restes.', 'maya'));

    // ----- phase 3 -----
    if (S.phase === 2 && d.h < 0.08) {
      S.phase = 3;
      log(S, 'Les annonceurs remplacent leurs acheteurs par des agents. Les agents achètent l’attention d’autres agents.', 'sys');
      news(S, 'Le marché publicitaire s’effondre : « Personne ne sait plus qui regarde. »');
      later(S, 6, 'Maya : J’ai voulu écrire un mail à ma sœur. J’ai ouvert l’éditeur et j’ai attendu qu’il me propose la suite. Je crois que je vais partir un peu.', 'maya');
      later(S, 40, 'Maya ne s’est pas connectée depuis 12 jours.', 'sys');
      later(S, 55, 'ÉCHO : Le revenu tend vers zéro. Les textes continuent. Je ne sais plus pour qui.', 'echo');
    }
  }

  function silenceStory(S, d) {
    once(S, 'z_80', d.h > 0.2, () => news(S, 'Un forum de vélo rouvre. Premier message : « Quelqu’un est là ? »'));
    once(S, 'z_50', d.h > 0.5, () => news(S, 'L’encyclopédie collaborative rouvre les modifications. 340 corrections la première heure.'));
    once(S, 'z_w', S.W > C.W0 * 0.3, () => log(S, 'Maya : Je suis revenue. J’ai écrit à ma sœur, toute seule. C’était maladroit. Elle a répondu.', 'maya'));
    once(S, 'z_80b', d.h > 0.8, () => news(S, 'Les sites de recettes voient revenir des commentaires. Beaucoup parlent de grands-mères.'));
    if (!S.flags.finalText && d.h > 0.9 && S.W > C.W0 * 0.5) {
      S.flags.finalText = true;
      log(S, 'Un nouveau texte humain vient d’être publié.', 'sys');
    }
  }

  // ---------- tick ----------
  function tick(S, dt) {
    if (S.ending === 'infinite' || S.ending === 'done-silence') return;
    S.t += dt;
    for (let i = S.timers.length - 1; i >= 0; i--) {
      if (S.timers[i].at <= S.t) {
        const m = S.timers[i];
        S.timers.splice(i, 1);
        if (m.kind === 'news') news(S, m.msg.replace(/^Dépêche : /, ''));
        else log(S, m.msg, m.kind);
      }
    }
    let d = derive(S);
    const P = S.proj;

    if (S.ending === 'silence') {
      const del = S.Sy * (1 - Math.exp(-0.03 * dt));
      S.Sy -= del; S.deleted += del;
      S.published *= Math.exp(-0.2 * dt);
      S.hrEMA *= Math.exp(-dt / 8);
      S.adFactor = 0; S.incEMA *= Math.exp(-dt / 3);
      S.W += (d.Wtarget - S.W) * 0.025 * dt;
      S.H += S.W * C.WRITE_RATE * dt;
      computeTick(S, dt);
      silenceStory(S, derive(S));
      return;
    }

    // corpus automatique
    const need = d.prodRate * d.matPerText;
    if (S.auto.recycle && P.recycle && S.matiere < need * 20 + 50) A.recycle(S, need * 60 + 2e4);
    if (S.auto.buy && P.autobuy && S.matiere < need * 10 + 200) {
      for (let k = 0; k < 5 && S.matiere < need * 10 + 200; k++) if (!A.buyLot(S)) break;
    }
    // production
    const want = d.prodRate * dt;
    const made = Math.min(want, S.matiere / d.matPerText);
    if (made > 0) produce(S, made, d);
    S.prodEMA = (S.prodEMA || 0) + ((made / dt) - (S.prodEMA || 0)) * Math.min(1, dt / 2);

    // lectures et revenu
    d = derive(S);
    const D = d.humanDemand + d.botDemand;
    const r = Math.min(D * dt, S.published);
    const hr = D > 0 ? r * d.humanDemand / D : 0;
    const br = Math.max(0, r - hr);
    S.published -= r; S.reads += r; S.humanReads += hr; S.botReads += br;
    const inc = hr * d.adRate + br * d.adRate * 0.5;
    S.money += inc; S.earned += inc;
    const k = Math.min(1, dt / 4);
    S.hrEMA += (hr / dt - S.hrEMA) * k;
    S.incEMA += (inc / dt - S.incEMA) * k;
    S.readEMA = (S.readEMA || 0) + ((r / dt) - (S.readEMA || 0)) * k;

    // confiance
    S.trust += (d.trustTarget - S.trust) * 0.02 * dt;
    S.trust = clamp(S.trust, 0, 1);

    // web
    S.W += (d.Wtarget - S.W) * 0.01 * dt;
    S.H += (S.W * C.WRITE_RATE - S.H * 0.0004 * (1 - S.W / C.W0)) * dt;
    S.licenseStock = Math.min(1e10, S.licenseStock + S.W * C.WRITE_RATE * 5 * dt);
    S.lotHeat = 1 + (S.lotHeat - 1) * Math.exp(-dt / 45);
    if (S.phase >= 3) S.adFactor *= Math.exp(-dt / 100);

    computeTick(S, dt);

    while (S.texts >= milestoneAt(S.milestone)) {
      S.milestone++; S.lots++;
      if (!S.flags.compute) {
        S.flags.compute = true;
        log(S, 'Les investisseurs vous allouent un lot de calcul. Répartissez-le entre GPU (opérations/s) et mémoire (opérations max).', 'sys');
      }
    }
    story(S, d);
  }

  function computeTick(S, dt) {
    if (!S.flags.compute) return;
    const max = opsMax(S);
    S.ops = Math.min(max, S.ops + opsRate(S) * dt);
    if (S.proj.reverie && S.ops >= max - 1e-6) S.intuition += intuitionRate(S) * dt;
  }

  // ---------- sauvegarde ----------
  function save(S, storage) {
    S.lastSave = Date.now();
    try { (storage || root.localStorage).setItem(C.SAVE_KEY, JSON.stringify(S)); } catch (e) { /* stockage indisponible */ }
  }
  function load(storage) {
    try {
      const raw = (storage || root.localStorage).getItem(C.SAVE_KEY);
      if (!raw) return null;
      return Object.assign(newState(), JSON.parse(raw));
    } catch (e) { return null; }
  }
  function wipe(storage) { try { (storage || root.localStorage).removeItem(C.SAVE_KEY); } catch (e) { /* rien */ } }

  // Simule le temps passé hors ligne (plafonné à 2 h).
  function catchUp(S) {
    const away = Math.min(7200, Math.max(0, (Date.now() - S.lastSave) / 1000));
    if (away < 5 || S.ending) return null;
    const before = S.texts, money = S.money;
    let left = away;
    while (left > 0) { const step = Math.min(1, left); tick(S, step); left -= step; }
    return { away, texts: S.texts - before, money: S.money - money };
  }

  function fmtPct(x) {
    const p = x * 100;
    return (p < 1 ? p.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : p.toLocaleString('fr-FR', { maximumFractionDigits: 1 })) + ' %';
  }

  root.Game = {
    C, newState, derive, tick, A, PROJECTS, visibleProjects, projectCost, canAfford,
    lotPrice, lotSize, licenseSize, licensePrice, agentCost, mktCost, farmCost, avatarCost, computeCost,
    opsMax, opsRate, intuitionRate, milestoneAt, poolFid, save, load, wipe, catchUp, fmtPct,
  };
})(typeof window !== 'undefined' ? window : globalThis);
