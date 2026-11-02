'use strict';
// Sept générations — logique du jeu (aucune dépendance au DOM).
(function (root) {
  const C = {
    START: 1950, GEN_YEARS: 30, GENS: 7,
    SEC_PER_YEAR: 8,
    TCRE: 0.00045,   // °C par Gt de CO2 cumulé
    NONCO2: 0.25,    // °C dus aux autres gaz
    CUM0: 650,       // Gt CO2 émises avant 1950
    PPM0: 277, PPM_K: 0.054,
    FOSSIL_EF: 0.075, // Gt CO2 par unité d'énergie fossile et par an
    OTHER_EM: 3.5,   // émissions hors énergie (sols, forêts)
    PLANT: 10, FOSSIL_LIFE: 40, NUC_DELAY: 10,
    SAVE_KEY: 'sept-generations-v1',
  };
  const GENS = [
    { name: 'Jeanne', from: 1950 }, { name: 'Michel', from: 1980 }, { name: 'Nadia', from: 2010 },
    { name: 'Tom', from: 2040 }, { name: 'Inès', from: 2070 }, { name: 'Yaël', from: 2100 }, { name: 'Aube', from: 2130 },
  ];
  const END = C.START + C.GEN_YEARS * C.GENS;

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function newState() {
    const fossil = [];
    for (let i = 0; i < 11; i++) fossil.push({ y: 1912 + Math.round(i * 3.6), n: 1 });
    return {
      v: 1, year: C.START, gen: 0, speed: 1, paused: false, phase: 'intro',
      Y: 100, treasury: 20, debt: 0,
      industry: 0, services: 4, servicesBought: 0,
      fossil, Rcap: 0, cumR: 1, Ncap: 0, Fcap: 0, nQueue: [], nBuilt: 0, waste: 0,
      cum: C.CUM0, T: C.TCRE * C.CUM0, mask: 0, geoTarget: 0, SL: 0.07,
      tip: {}, tipYears: {}, dac: 0, digues: 0, clim: 0, sobriety: 0, cp: 0, market: true,
      research: {}, flags: {}, effects: [], shock: 0,
      log: [], hist: [], genW: [], genStart: [],
      qty: 1, lastYear: C.START, fusionAt: 0, renYear: 0, fusYear: 0,
      lastSave: Date.now(),
    };
  }

  function log(S, msg, kind) {
    S.log.unshift({ y: Math.floor(S.year), msg, kind: kind || '' });
    if (S.log.length > 120) S.log.length = 120;
  }

  // ---------- coûts ----------
  const R_ = (S) => S.research;
  function fossilCost(S) { return 10 * (S.shock > 0 ? 2 : 1); }
  function renCost(S) {
    const r = R_(S);
    return 8 + 300 * (r.pv ? 0.5 : 1) * (r.wind ? 0.6 : 1) * Math.pow(S.cumR, -0.6);
  }
  function nucCost(S) { return 90 * Math.pow(1.05, S.nBuilt); }
  function fusionCost() { return 40; }
  const industryCost = (S) => 15 * Math.pow(1.3, S.industry);
  const serviceCost = (S) => 10 * Math.pow(1.12, S.servicesBought);
  const dacCost = (S) => 80 * Math.pow(1.06, S.dac);
  const digueCost = (S) => 30 * (1 + S.digues * 8) * Math.max(1, S.Y / 2000);
  const climCost = (S) => 20 * Math.pow(1.25, S.clim);
  const closeCost = () => 5;
  function borrowAmount(S) { return Math.round(S.Y * 0.3); }

  // Les filières industrielles limitent ce qu'on peut installer chaque année.
  function renRoom(S) { return Math.max(0, 30 + 0.3 * S.Rcap - S.renYear); }
  function fusRoom(S) { return Math.max(0, 50 + 0.2 * S.Fcap - S.fusYear); }

  function fossilPlants(S) { return S.fossil.reduce((a, c) => a + c.n, 0); }

  // ---------- grandeurs dérivées ----------
  function derive(S) {
    const r = S.research;
    const d = {};
    d.plants = fossilPlants(S);
    d.F = d.plants * C.PLANT;
    d.effMult = (r.eff1 ? 0.85 : 1) * (r.eff2 ? 0.85 : 1) * (r.eff3 ? 0.85 : 1) * (r.heatpump ? 0.85 : 1);
    d.intensity = Math.pow(0.995, Math.min(S.year, 2000) - C.START) * Math.pow(0.988, Math.max(0, S.year - 2000)) * d.effMult * (1 - 0.35 * S.sobriety)
      * (1 - 0.15 * S.cp / 200) * (1 + 0.03 * S.clim);
    d.Ed = S.Y * d.intensity + S.dac * 15; // le captage consomme beaucoup d'énergie
    d.maxShareR = 0.4 + (r.storage1 ? 0.25 : 0) + (r.storage2 ? 0.25 : 0);
    // part des besoins qu'une électricité propre peut couvrir (le reste : carburants)
    d.elec = Math.min(1, 0.5 + (r.ev ? 0.15 : 0) + (r.heatpump ? 0.1 : 0) + (r.greensteel ? 0.1 : 0) + (r.h2 ? 0.1 : 0) + (r.synfuel ? 0.05 : 0));
    d.maxR = Math.min(d.maxShareR, d.elec);
    d.Ruse = Math.min(S.Rcap, d.Ed * d.maxR);
    d.Fuse = Math.min(S.Fcap, Math.max(0, d.Ed * d.elec - d.Ruse));
    d.Nuse = Math.min(S.Ncap, Math.max(0, d.Ed * d.elec - d.Ruse - d.Fuse));
    d.fossilUsed = Math.min(d.F, Math.max(0, d.Ed - d.Ruse - d.Fuse - d.Nuse));
    d.supply = d.Ruse + d.Fuse + d.Nuse + d.fossilUsed;
    d.capacity = S.Rcap + S.Fcap + S.Ncap + d.F;
    d.ratio = d.Ed > 0 ? Math.min(1, d.supply / d.Ed) : 1;
    d.fossilEm = d.fossilUsed * C.FOSSIL_EF;
    d.otherEm = C.OTHER_EM * (r.forests ? 0.4 : 1);
    d.tipEm = (S.tip.permafrost ? 1.5 + Math.min(1.5, (S.year - S.tipYears.permafrost) * 0.02) : 0) + (S.tip.amazon ? 2 : 0);
    d.E = d.fossilEm + d.otherEm + d.tipEm;
    d.removal = S.dac * 0.5 * (r.dac2 ? 2 : 1);
    d.net = d.E - d.removal;
    d.ppm = C.PPM0 + C.PPM_K * S.cum;
    d.nonCO2 = C.NONCO2 * clamp((S.year - C.START) / 50, 0, 1); // les aérosols de pollution masquaient l'effet au début
    d.Teq = C.TCRE * S.cum + d.nonCO2 - S.mask;

    d.growthBase = (0.02 + 0.025 * (1 - Math.pow(0.85, S.industry))) / (1 + Math.max(0, S.year - 2000) / 100);
    d.climDrag = 0.0035 * Math.pow(Math.max(0, S.T - 1), 2);
    d.growth = d.growthBase * Math.pow(d.ratio, 3) - 0.012 * S.sobriety - d.climDrag - (S.shock > 0 ? 0.01 : 0);

    d.taxRev = S.cp * d.fossilEm * 0.05 * (r.dividend ? 0.3 : 1);
    d.geoUpkeep = 0.01 * S.Y * S.mask;
    d.dacUpkeep = S.dac * 20;
    d.interest = S.debt * 0.03;
    d.income = S.Y * 0.15 + d.taxRev;
    d.netIncome = d.income - d.geoUpkeep - d.dacUpkeep - d.interest;

    // bien-être
    const Yc = S.Y * (1 - 0.25 * S.sobriety);
    d.w = {
      comfort: 45 * Yc / (Yc + 800),
      services: 10 * (1 - Math.exp(-S.services / 10)),
      heat: -6 * Math.pow(Math.max(0, S.T - 0.8), 1.6) * (1 - 0.08 * Math.min(5, S.clim)),
      floods: -30 * Math.max(0, S.SL - 0.25) * (1 - S.digues),
      pollution: -1.2 * d.fossilUsed / 100 * (r.filters ? 0.4 : 1),
      shortage: -25 * (1 - d.ratio),
      anger: -6 * S.cp / 200 * (r.dividend ? 0.2 : 1),
      geo: -3 * S.mask,
      events: -S.effects.reduce((a, e) => a + e.w, 0),
      lost: -(S.tip.coral ? 1.5 : 0),
    };
    d.W = Object.values(d.w).reduce((a, b) => a + b, 0);

    // projection et budget
    d.budget15 = (1.5 - C.NONCO2) / C.TCRE - S.cum;
    d.budget2 = (2 - C.NONCO2) / C.TCRE - S.cum;
    d.proj2100 = projection(S, d, Math.max(2100, Math.ceil(S.year) + 30));
    d.genEnd = C.START + (S.gen + 1) * C.GEN_YEARS;
    return d;
  }

  // Projection naïve : les émissions suivent leur tendance des dix dernières années.
  function projection(S, d, toYear) {
    const h = S.hist;
    let trend = 0;
    if (h.length > 10) {
      const a = h[h.length - 11].E, b = h[h.length - 1].E;
      if (a > 0.1) trend = clamp(Math.pow(b / a, 0.1) - 1, -0.06, 0.05);
    }
    let cum = S.cum, e = d.net;
    for (let y = Math.ceil(S.year); y < toYear; y++) { cum = addNet(cum, e); e = e > 0 ? e * (1 + trend) : e; }
    return { year: toYear, T: C.TCRE * cum + C.NONCO2 - S.mask };
  }

  // Quand on retire du CO₂ de l'air, l'océan et les sols en relâchent une partie.
  // On ne peut pas non plus revenir en deçà du niveau de 1950.
  function addNet(cum, net) { return Math.max(C.CUM0, cum + (net < 0 ? net * 0.6 : net)); }

  // ---------- actions ----------
  function spend(S, c) { if (S.treasury < c - 1e-9) return false; S.treasury -= c; return true; }
  function repeat(S, fn) { let k = 0; for (let i = 0; i < S.qty; i++) { if (!fn()) break; k++; } return k; }

  const A = {
    buildFossil(S) { return repeat(S, () => { if (!spend(S, fossilCost(S))) return false; addFossil(S, 1); return true; }); },
    buildRen(S) {
      if (!S.research.pv) return 0;
      return repeat(S, () => { if (renRoom(S) < C.PLANT || !spend(S, renCost(S))) return false; addRen(S); return true; });
    },
    buildNuc(S) {
      if (!S.research.nuclear) return 0;
      return repeat(S, () => {
        if (!spend(S, nucCost(S))) return false;
        S.nBuilt++; S.nQueue.push({ at: S.year + C.NUC_DELAY, cap: 2 * C.PLANT });
        return true;
      });
    },
    buildFusion(S) {
      if (!S.flags.fusionReady) return 0;
      return repeat(S, () => { if (fusRoom(S) < 5 * C.PLANT || !spend(S, fusionCost())) return false; S.Fcap += 5 * C.PLANT; S.fusYear += 5 * C.PLANT; return true; });
    },
    closeFossil(S) {
      return repeat(S, () => {
        if (fossilPlants(S) < 1 || !spend(S, closeCost())) return false;
        const c = S.fossil.find((x) => x.n > 0); // les plus vieilles d'abord
        c.n--; S.fossil = S.fossil.filter((x) => x.n > 0);
        S.flags.closed = (S.flags.closed || 0) + 1;
        return true;
      });
    },
    buyIndustry(S) { return repeat(S, () => { if (!spend(S, industryCost(S))) return false; S.industry++; return true; }); },
    buyService(S) { return repeat(S, () => { if (!spend(S, serviceCost(S))) return false; S.servicesBought++; S.services += 1; return true; }); },
    buyDac(S) { if (!S.research.dac) return 0; return repeat(S, () => { if (!spend(S, dacCost(S))) return false; S.dac++; return true; }); },
    buyDigue(S) {
      if (!S.research.adapt || S.digues >= 0.9) return 0;
      if (!spend(S, digueCost(S))) return 0;
      S.digues = Math.min(0.9, S.digues + 0.1); return 1;
    },
    buyClim(S) { if (!S.research.adapt || S.clim >= 5) return 0; if (!spend(S, climCost(S))) return 0; S.clim++; return 1; },
    stopDac(S) { return repeat(S, () => { if (S.dac < 1) return false; S.dac--; return true; }); },
    borrow(S) { const a = borrowAmount(S); S.treasury += a; S.debt += a; S.flags.borrowed = true; return 1; },
    repay(S) { const a = Math.min(S.debt, borrowAmount(S), S.treasury); if (a <= 0) return 0; S.treasury -= a; S.debt -= a; return 1; },
    setSobriety(S, v) { if (S.research.meadows) S.sobriety = clamp(+v, 0, 1); },
    setCp(S, v) { if (S.research.carbontax) S.cp = clamp(+v, 0, 200); },
    setGeo(S, v) { if (S.research.geo) { S.geoTarget = clamp(+v, 0, 1.5); if (S.geoTarget > 0) S.flags.geoUsed = true; } },
    setQty(S, q) { S.qty = q; },
    toggleMarket(S) { S.market = !S.market; },
    research(S, id) {
      const p = RES_BY_ID[id];
      if (!p || !researchVisible(S, p) || !spend(S, p.cost)) return false;
      S.research[id] = true;
      if (p.effect) p.effect(S);
      return true;
    },
    start(S) { if (S.phase === 'intro') { S.phase = 'play'; S.genStart[0] = snapshot(S); } },
    nextGen(S) {
      if (S.phase !== 'transition') return;
      S.gen++;
      S.genStart[S.gen] = snapshot(S);
      S.phase = 'play';
      log(S, `Génération ${S.gen + 1} : ${GENS[S.gen].name} prend le relais.`, 'sys');
    },
  };

  function addRen(S) { S.Rcap += C.PLANT; S.cumR += C.PLANT; S.renYear += C.PLANT; }

  function addFossil(S, n) {
    const y = Math.floor(S.year);
    const last = S.fossil[S.fossil.length - 1];
    if (last && last.y === y) last.n += n; else S.fossil.push({ y, n });
  }

  // ---------- recherche ----------
  const RESEARCH = [
    { id: 'nuclear', y: 1953, cost: 60, name: 'Programme nucléaire civil', desc: '« L’atome pour la paix. » Débloque les centrales nucléaires : sans CO₂, chères, lentes à construire, et leurs déchets durent plus longtemps que toutes les générations de ce jeu.' },
    { id: 'pv', y: 1954, cost: 40, name: 'Cellule photovoltaïque', desc: 'Un laboratoire transforme la lumière en électricité. C’est hors de prix. Débloque les renouvelables ; leur prix baisse à chaque installation, pour toutes les générations suivantes.' },
    { id: 'keeling', y: 1958, cost: 15, name: 'Mesurer le CO₂', desc: 'Installer un instrument au sommet d’un volcan, à Hawaï, et noter un chiffre chaque jour.',
      effect: (S) => log(S, 'Le premier relevé tombe : 315 ppm. Personne ne sait encore si c’est beaucoup.', 'sci') },
    { id: 'models', y: 1967, cost: 50, req: 'keeling', name: 'Modèles du climat', desc: 'Calculer ce que fait le CO₂ à la température. Révèle le réchauffement et la montée des eaux.',
      effect: (S) => log(S, `Les modèles sont formels : la Terre s’est déjà réchauffée de ${fmtT(S.T)} depuis l’ère préindustrielle.`, 'sci') },
    { id: 'filters', y: 1970, cost: 80, name: 'Filtres et pots catalytiques', desc: 'Respirer mieux. La pollution de l’air fossile pèse 60 % de moins sur le bien-être. Ne change rien au CO₂.' },
    { id: 'meadows', y: 1972, cost: 20, name: 'Les limites à la croissance', desc: 'Lire un rapport qui pose une question gênante. Débloque la sobriété.' },
    { id: 'eff1', y: 1974, cost: 80, name: 'Économies d’énergie', desc: 'Isoler, régler, éteindre. Besoins en énergie −15 %.' },
    { id: 'wind', y: 1980, cost: 120, req: 'pv', name: 'Éolien moderne', desc: 'Des pales de cinquante mètres. Renouvelables encore moins chers.' },
    { id: 'giec', y: 1988, cost: 60, req: 'models', name: 'Créer le GIEC', desc: 'Réunir les scientifiques du monde entier. Révèle la trajectoire projetée et le budget carbone restant.',
      effect: (S) => log(S, 'Premier rapport du GIEC : « Les émissions humaines augmentent substantiellement les concentrations de gaz à effet de serre. »', 'sci') },
    { id: 'carbontax', y: 1991, cost: 50, name: 'Prix du carbone', desc: 'Faire payer chaque tonne émise. Rapporte de l’argent, rend le fossile moins attractif, réduit un peu la demande. Et met des gens en colère.' },
    { id: 'eff2', y: 1995, cost: 200, req: 'eff1', name: 'Rénovation des bâtiments', desc: 'Besoins en énergie −15 %.' },
    { id: 'adapt', y: 2000, cost: 120, name: 'Plan d’adaptation', desc: 'Accepter que le climat a déjà changé. Débloque digues et climatisation.' },
    { id: 'storage1', y: 2005, cost: 250, req: 'pv', name: 'Batteries', desc: 'Stocker le soleil de midi pour le soir. Part maximale des renouvelables : 40 % → 65 %.' },
    { id: 'dividend', y: 2008, cost: 150, req: 'carbontax', name: 'Dividende carbone', desc: 'Rendre l’argent de la taxe aux ménages. La colère retombe, le budget aussi.' },
    { id: 'ev', y: 2008, cost: 250, name: 'Véhicules électriques', desc: 'Brancher les voitures et les camions. Part des besoins couverte par l’électricité propre +15 %.' },
    { id: 'heatpump', y: 2010, cost: 300, name: 'Pompes à chaleur', desc: 'Chauffer à l’électricité, trois fois mieux. Besoins −15 %, part électrifiable +10 %.' },
    { id: 'forests', y: 2015, cost: 400, name: 'Forêts et agroécologie', desc: 'Arrêter la déforestation, changer les sols. Émissions hors énergie −60 %.' },
    { id: 'storage2', y: 2020, cost: 600, req: 'storage1', name: 'Stockage saisonnier', desc: 'Garder l’été pour l’hiver. Part maximale des renouvelables : 90 %.' },
    { id: 'dac', y: 2022, cost: 500, name: 'Captage direct du CO₂', desc: 'Des machines qui aspirent le CO₂ de l’air. Chères à faire tourner, et très gourmandes en énergie : alimentées au fossile, elles émettent plus qu’elles ne captent. Mais elles font reculer le compteur.' },
    { id: 'greensteel', y: 2025, cost: 700, name: 'Acier et ciment bas carbone', desc: 'Réinventer l’industrie lourde. Part électrifiable +10 %.' },
    { id: 'h2', y: 2032, cost: 900, req: 'greensteel', name: 'Hydrogène vert', desc: 'Pour ce qui ne se branche pas : engrais, chimie, navires. Part électrifiable +10 %.' },
    { id: 'synfuel', y: 2050, cost: 1500, req: 'h2', name: 'Carburants de synthèse', desc: 'Des avions qui volent avec de l’air et du soleil. Très cher. Part électrifiable +5 %.' },
    { id: 'eff3', y: 2030, cost: 800, req: 'eff2', name: 'Sobriété technique', desc: 'Des objets qui durent. Besoins en énergie −15 %.' },
    { id: 'geo', y: 2040, cost: 400, name: 'Aérosols stratosphériques', desc: 'Voiler le soleil pour refroidir la Terre. Peu cher, rapide. Il faudra continuer chaque année, et toutes les générations après vous aussi.',
      effect: (S) => log(S, 'Les avions sont prêts. Il suffit de régler la jauge.', 'sys') },
    { id: 'fusion', y: 2045, cost: 3000, name: 'Fusion nucléaire', desc: 'Une énergie propre, presque illimitée, sans déchets à vie longue. Disponible dans trente ans. (Elle l’est depuis 1950.)',
      effect: (S) => {
        S.fusionAt = Math.floor(S.year) + 40;
        log(S, `Le programme de fusion est lancé. Premiers réacteurs promis pour ${S.fusionAt - 10}.`, 'sci');
      } },
    { id: 'dac2', y: 2060, cost: 1500, req: 'dac', name: 'Captage à grande échelle', desc: 'Chaque machine de captage retire deux fois plus de CO₂, pour la même énergie.' },
  ];
  const RES_BY_ID = {};
  RESEARCH.forEach((p) => { RES_BY_ID[p.id] = p; });
  function researchVisible(S, p) { return !S.research[p.id] && S.year >= p.y && (!p.req || S.research[p.req]); }
  function visibleResearch(S) { return RESEARCH.filter((p) => researchVisible(S, p)); }

  // ---------- histoire réelle (jusqu'à aujourd'hui) ----------
  // Les événements climatiques réels n'arrivent que si le monde du jeu est assez chaud.
  const HISTORY = [
    { y: 1952, msg: 'Grand smog de Londres : 4 000 morts en cinq jours. On ferme des cheminées.' },
    { y: 1957, msg: 'Un océanographe écrit que l’humanité mène « une expérience géophysique à grande échelle ».' },
    { y: 1965, msg: 'Un rapport remis au président des États-Unis avertit que le CO₂ pourrait modifier le climat d’ici l’an 2000.' },
    { y: 1969, msg: 'Des humains marchent sur la Lune. Ils photographient la Terre : elle a l’air petite.' },
    { y: 1973, msg: 'Premier choc pétrolier. Le prix du fossile double pendant cinq ans.', fn: (S) => { S.shock = 5; } },
    { y: 1979, msg: 'Rapport Charney : doubler le CO₂ réchaufferait la Terre d’environ 3 °C. « Attendre pour voir » pourrait être trop tard.' },
    { y: 1988, msg: 'Un climatologue déclare devant le Sénat américain que le réchauffement a commencé.' },
    { y: 1992, msg: 'Sommet de la Terre à Rio. Les pays promettent de « prévenir toute perturbation dangereuse » du climat.' },
    { y: 1997, msg: 'Protocole de Kyoto. Les pays riches s’engagent à réduire leurs émissions de 5 %.' },
    { y: 2003, cond: (S) => S.T >= 0.85, msg: 'Canicule en Europe : 70 000 morts.', w: 3,
      alt: 'Dans ce monde-ci, l’été est doux en Europe. (Dans le nôtre, 70 000 personnes sont mortes de chaud en Europe.)' },
    { y: 2009, msg: 'Conférence de Copenhague. On ne s’accorde sur rien, sinon sur le fait de se revoir.' },
    { y: 2015, msg: 'Accord de Paris : contenir le réchauffement « bien en dessous de 2 °C », en visant 1,5 °C.', fn: (S) => { S.flags.paris = true; } },
    { y: 2019, cond: (S) => S.T >= 1.0, msg: 'Méga-feux en Australie : un milliard d’animaux morts.', w: 2,
      alt: 'L’Australie connaît une saison des feux ordinaire. (Dans le nôtre, un milliard d’animaux y sont morts.)' },
    { y: 2022, cond: (S) => S.T >= 1.05, msg: 'Inondations au Pakistan : un tiers du pays sous l’eau.', w: 2,
      alt: 'La mousson au Pakistan est forte, mais normale. (Dans le nôtre, un tiers du pays a été inondé.)' },
  ];

  // ---------- événements aléatoires ----------
  function weather(S, d) {
    const T = S.T, y = Math.floor(S.year);
    const ev = (msg, w, years, extra) => {
      S.effects.push({ w, until: S.year + years });
      log(S, msg, 'event');
      if (extra) extra();
    };
    const R = Math.random;
    if (R() < Math.min(0.7, 0.25 * Math.pow(Math.max(0, T - 0.7), 1.4))) {
      const where = ['en Europe', 'en Inde', 'au Sahel', 'en Amérique du Nord', 'en Chine', 'au Moyen-Orient'][Math.floor(R() * 6)];
      const deg = T > 3 ? ' Certaines régions deviennent inhabitables l’été.' : T > 2 ? ' Les hôpitaux débordent.' : '';
      ev(`Canicule ${where}.${deg}`, 1.5 * T, 2);
    }
    if (R() < Math.min(0.6, 0.12 * Math.max(0, T - 0.9) + 0.4 * Math.max(0, S.SL - 0.2))) {
      const where = ['au Bangladesh', 'aux Pays-Bas', 'en Floride', 'à Jakarta', 'en Camargue', 'à Lagos'][Math.floor(R() * 6)];
      ev(`Inondations ${where}.` + (S.digues > 0.4 ? ' Les digues tiennent, cette fois.' : ''), (2 + 4 * S.SL) * (1 - S.digues), 2,
        () => { S.treasury -= S.Y * 0.03 * (1 - S.digues); });
    }
    if (R() < Math.min(0.5, 0.15 * Math.max(0, T - 1.1))) {
      ev(['Sécheresse : les récoltes de blé chutent.', 'Méga-feux de forêt.', 'Pénurie d’eau potable dans plusieurs grandes villes.', 'Ouragan de catégorie 5.'][Math.floor(R() * 4)],
        1 + T, 2, () => { S.Y *= 0.985; });
    }
    if (S.mask > 0.3 && R() < 0.15 * S.mask) ev('Les moussons se décalent. Personne ne sait si c’est le voile d’aérosols.', 1.5, 2);
    if (S.cp > 80 && !S.research.dividend && R() < 0.1 * S.cp / 200) ev('Manifestations contre le prix du carbone : « Fin du monde, fin du mois. »', 2, 1);
  }

  function tipping(S) {
    const t = (id, cond, msg, fn) => {
      if (S.tip[id]) return;
      S.tipYears[id + '_c'] = cond ? (S.tipYears[id + '_c'] || 0) + 1 : 0;
      if (S.tipYears[id + '_c'] >= 5) {
        S.tip[id] = true; S.tipYears[id] = Math.floor(S.year);
        log(S, msg, 'tip'); if (fn) fn();
      }
    };
    t('coral', S.T > 1.5, 'Point de bascule : les récifs coralliens tropicaux meurent. Ils ne reviendront pas à l’échelle d’une vie humaine.');
    t('greenland', S.T > 1.7, 'Point de bascule : la calotte du Groenland a commencé à fondre pour de bon. Elle mettra des siècles à disparaître. On ne peut plus l’arrêter.');
    t('permafrost', S.T > 1.8, 'Point de bascule : le pergélisol dégèle et relâche son carbone. Des émissions que personne n’a décidées.');
    t('amazon', S.T > 2.5, 'Point de bascule : l’Amazonie se transforme en savane. La forêt émet désormais plus qu’elle n’absorbe.');
    t('wais', S.T > 2.5, 'Point de bascule : l’Antarctique de l’Ouest se disloque. Plusieurs mètres d’océan sont désormais promis aux siècles qui viennent.');
  }

  // ---------- tick ----------
  function tick(S, dtSec) {
    if (S.phase !== 'play' || S.paused) return;
    const dt = dtSec / C.SEC_PER_YEAR * S.speed; // en années
    const genEnd = C.START + (S.gen + 1) * C.GEN_YEARS;
    const step = Math.min(dt, genEnd - S.year);
    advance(S, step);
    if (S.year >= genEnd - 1e-9) {
      S.year = genEnd;
      endGeneration(S);
    }
  }

  function advance(S, dt) {
    if (dt <= 0) return;
    let d = derive(S);
    // marché : construire le moins cher quand la capacité manque
    if (S.market) market(S, d);
    d = derive(S);

    S.Y *= Math.exp(d.growth * dt);
    S.treasury += d.netIncome * dt;
    if (S.treasury < 0) { S.debt += -S.treasury; S.treasury = 0; }
    S.cum = addNet(S.cum, d.net * dt);
    // masque d'aérosols : monte lentement, retombe vite
    const geoTarget = S.debt > 3 * S.Y ? 0 : S.geoTarget;
    const prevMask = S.mask;
    S.mask += (geoTarget > S.mask ? Math.min(0.15 * dt, geoTarget - S.mask) : Math.max(-0.4 * dt, geoTarget - S.mask));
    if (prevMask - S.mask > 0 && S.flags.geoUsed && geoTarget === 0 && prevMask > 0.3 && !S.flags.termination) {
      S.flags.termination = true;
      log(S, 'Le voile d’aérosols se dissipe. Des décennies de réchauffement masqué reviennent en quelques années.', 'tip');
    }
    S.T += (d.Teq - S.T) * Math.min(1, dt / 3);
    const ice = (S.tip.greenland ? 0.003 : 0) + (S.tip.wais ? 0.008 : 0);
    S.SL += (0.0012 + 0.0025 * Math.max(0, S.T) + ice) * dt;
    S.services *= Math.exp(-0.015 * dt);
    S.digues *= Math.exp(-0.01 * dt);
    S.Rcap *= Math.exp(-dt / 25);
    S.Ncap *= Math.exp(-dt / 60);
    S.Fcap *= Math.exp(-dt / 60);
    S.waste += d.Nuse * 0.3 * dt;
    if (S.shock > 0) S.shock -= dt;
    for (let i = S.nQueue.length - 1; i >= 0; i--) {
      if (S.year >= S.nQueue[i].at) { S.Ncap += S.nQueue[i].cap; S.nQueue.splice(i, 1); }
    }
    S.effects = S.effects.filter((e) => e.until > S.year);
    // bien-être cumulé de la génération
    const g = S.genW[S.gen] || (S.genW[S.gen] = { sum: 0, n: 0, min: Infinity, max: -Infinity });
    g.sum += d.W * dt; g.n += dt; g.min = Math.min(g.min, d.W); g.max = Math.max(g.max, d.W);

    S.year += dt;
    while (Math.floor(S.year) > S.lastYear) {
      S.lastYear++;
      yearly(S, derive(S));
    }
  }

  function market(S, d) {
    const capR = Math.min(S.Rcap, d.Ed * d.maxR);
    let cap = capR + S.Fcap + S.Ncap + d.F;
    const need = d.Ed * 1.03;
    let guard = 0;
    while (cap < need && guard++ < 500) {
      const roomR = Math.min(d.Ed * d.maxR - Math.min(S.Rcap, d.Ed * d.maxR), renRoom(S));
      const fEff = fossilCost(S) * (1 + S.cp / 50);
      const canRen = S.research.pv && roomR > 1 && renCost(S) < fEff;
      if (canRen && roomR >= C.PLANT) { if (!spend(S, renCost(S))) break; addRen(S); }
      else { if (!spend(S, fossilCost(S))) break; addFossil(S, 1); }
      cap += C.PLANT;
    }
  }

  function yearly(S, d) {
    const y = S.lastYear;
    S.renYear = 0; S.fusYear = 0;
    // centrales fossiles en fin de vie
    const before = fossilPlants(S);
    S.fossil = S.fossil.filter((c) => y - c.y < C.FOSSIL_LIFE);
    const retired = before - fossilPlants(S);
    if (retired > 0 && S.flags.retireMsg !== y && retired >= 3) { S.flags.retireMsg = y; log(S, `${retired} centrales fossiles ferment, en fin de vie.`, 'sys'); }
    for (const h of HISTORY) {
      if (h.y === y) {
        if (!h.cond || h.cond(S)) { log(S, h.msg, h.w ? 'event' : 'hist'); if (h.w) S.effects.push({ w: h.w, until: S.year + 2 }); }
        else log(S, h.alt, 'alt');
        if (h.fn) h.fn(S);
      }
    }
    if (y === 2026 && !S.flags.now) { S.flags.now = true; S.flags.showNow = true; }
    if (S.fusionAt && y >= S.fusionAt - 10 && !S.flags.fusionLate) {
      S.flags.fusionLate = true;
      log(S, `La fusion n’est pas prête. Encore dix ans, promis : ${S.fusionAt}.`, 'sci');
    }
    if (S.fusionAt && y >= S.fusionAt && !S.flags.fusionReady) {
      S.flags.fusionReady = true;
      log(S, 'La fusion fonctionne. Enfin. Elle arrive après la bataille, mais elle arrive.', 'sci');
    }
    tipping(S);
    if (S.phase === 'play') weather(S, d);
    if (S.debt > 3 * S.Y && !S.flags.debtCrisis) {
      S.flags.debtCrisis = true; S.services *= 0.7;
      log(S, 'Crise de la dette : les créanciers exigent des coupes. Les services publics reculent, les programmes coûteux s’arrêtent.', 'event');
    }
    S.hist.push({ y, T: S.T, E: d.E, W: d.W, Y: S.Y, ppm: d.ppm, net: d.net });
  }

  function snapshot(S) {
    const d = derive(S);
    return { year: Math.floor(S.year), T: S.T, cum: S.cum, SL: S.SL, Y: S.Y, debt: S.debt, ren: renCost(S), plants: d.plants, waste: S.waste, mask: S.mask, tips: Object.keys(S.tip).length, E: d.E };
  }

  function endGeneration(S) {
    if (!S.genEnd) S.genEnd = [];
    S.genEnd[S.gen] = snapshot(S);
    S.phase = S.gen >= C.GENS - 1 ? 'end' : 'transition';
  }

  function genAvg(S, g) { const x = S.genW[g]; return x && x.n > 0 ? x.sum / x.n : null; }

  function fmtT(t) { return (t >= 0 ? '+' : '−') + Math.abs(t).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' °C'; }

  // ---------- sauvegarde ----------
  function save(S) { S.lastSave = Date.now(); try { localStorage.setItem(C.SAVE_KEY, JSON.stringify(S)); } catch (e) { /* indisponible */ } }
  function load() {
    try {
      const raw = localStorage.getItem(C.SAVE_KEY);
      if (!raw) return null;
      const S = Object.assign(newState(), JSON.parse(raw));
      // anciennes sauvegardes : les réacteurs à fusion étaient comptés comme du nucléaire
      const nucMax = S.nBuilt * 2 * C.PLANT;
      if (S.flags.fusionReady && !S.Fcap && S.Ncap > nucMax) { S.Fcap = S.Ncap - nucMax; S.Ncap = nucMax; }
      return S;
    } catch (e) { return null; }
  }
  function wipe() { try { localStorage.removeItem(C.SAVE_KEY); } catch (e) { /* rien */ } }

  root.Sept = {
    C, GENS, END, newState, derive, tick, advance, A, RESEARCH, visibleResearch,
    renRoom, fusRoom, fossilCost, renCost, nucCost, fusionCost, industryCost, serviceCost, dacCost, digueCost, climCost, closeCost, borrowAmount,
    fossilPlants, genAvg, fmtT, save, load, wipe, log,
  };
})(typeof window !== 'undefined' ? window : globalThis);
