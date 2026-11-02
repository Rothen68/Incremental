// Simulation headless de Sept générations, pour l'équilibrage.
// Usage : node tools/sim-sept.js [naive|balanced|green] [graine]
'use strict';
require('../sept/model.js');
const { Sept } = globalThis;

const mode = process.argv[2] || 'naive';
let seed = +(process.argv[3] || 1);
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const S = Sept.newState();
const A = Sept.A;
A.start(S);
S.market = true;
const out = [];
let lastLog = 0;
const climateIds = ['keeling', 'models', 'giec', 'pv', 'wind', 'storage1', 'storage2', 'eff1', 'eff2', 'eff3', 'heatpump', 'forests', 'filters', 'carbontax', 'dividend', 'adapt', 'dac', 'meadows', 'dac2', 'ev', 'greensteel', 'h2', 'synfuel'];

while (S.phase !== 'end') {
  if (S.phase === 'transition') { A.nextGen(S); continue; }
  const d = Sept.derive(S);
  S.qty = 1;
  // recherche
  for (const p of Sept.visibleResearch(S)) {
    if (mode === 'naive' && !['filters', 'nuclear', 'eff1', 'eff2', 'heatpump'].includes(p.id)) continue;
    if (mode === 'balanced' && !climateIds.includes(p.id)) continue;
    if (mode === 'green' && ['geo'].includes(p.id)) continue;
    const c = Sept.priceOf(p);
    if (c.amount < S[c.pool] * (c.pool === 'treasury' ? (mode === 'naive' ? 0.6 : 0.9) : 1)) A.research(S, p.id);
  }
  // science et diplomatie
  if (Sept.labCost(S) < S.treasury * (mode === 'naive' ? 0.1 : 0.2)) A.buyLab(S);
  if (mode !== 'naive') {
    for (const t of Sept.visibleTreaties(S)) if (t.inf <= S.influence && (mode === 'green' || t.id !== 'cbam')) A.research(S, t.id);
    if (S.research.greenfund) A.setAid(S, mode === 'green' ? 0.04 : 0.02);
  }
  if (mode !== 'naive') {
    if (S.research.carbontax) S.cp = mode === 'green' ? (S.research.dividend ? 150 : 60) : (S.research.dividend ? 80 : 30);
    if (S.research.meadows && mode === 'green' && S.year > 2000) S.sobriety = 0.4;
    // renouvelables au-delà du marché
    const share = mode === 'green' ? 0.3 : 0.15;
    if (S.research.pv && Sept.renCost(S) < S.treasury * share) A.buildRen(S);
    if (S.research.dac && S.year > 2040 && Sept.dacCost(S) < S.treasury * 0.1 && d.netIncome > 50 && d.net > 0 && mode === 'green') A.buyDac(S);
    if (S.research.nuclear && mode === 'green' && S.Rcap >= d.Ed * d.maxR * 0.95 && S.Ncap + S.nQueue.length * 20 < d.Ed * (d.elec - d.maxR) + 20 && Sept.nucCost(S) < S.treasury * 0.5) A.buildNuc(S);
    if (S.debt > 0 && S.treasury > Sept.borrowAmount(S) * 2) A.repay(S);
    if (S.research.adapt && Sept.digueCost(S) < S.treasury * 0.2 && S.SL > 0.3) A.buyDigue(S);
    if (S.research.adapt && Sept.climCost(S) < S.treasury * 0.1 && S.T > 1.4) A.buyClim(S);
    if (mode === 'green' && S.research.storage1 && d.Ruse + d.Nuse > d.Ed * 0.6 && Sept.fossilPlants(S) > 0 && S.treasury > 50) A.closeFossil(S);
  }
  if (Sept.industryCost(S) < S.treasury * 0.4) A.buyIndustry(S);
  if (Sept.serviceCost(S) < S.treasury * 0.3) A.buyService(S);
  Sept.tick(S, 0.1);
  if (S.year - lastLog >= 10) {
    lastLog = Math.floor(S.year);
    const dd = Sept.derive(S);
    out.push(`${lastLog} T=${S.T.toFixed(2)} E=${dd.E.toFixed(1)} Y=${S.Y.toFixed(0)} g=${(dd.growth * 100).toFixed(1)}% W=${dd.W.toFixed(1)} €=${S.treasury.toFixed(0)} inc=${dd.netIncome.toFixed(0)} ind=${S.industry} fos=${dd.plants} R=${S.Rcap.toFixed(0)} ren€=${Sept.renCost(S).toFixed(0)} N=${S.Ncap.toFixed(0)} ratio=${dd.ratio.toFixed(2)} SL=${S.SL.toFixed(2)} debt=${S.debt.toFixed(0)} tips=${Object.keys(S.tip).join(',')}`);
  }
}
console.log(out.join('\n'));
console.log('Bien-être par génération :', Sept.GENS.map((g, i) => `${g.name} ${Sept.genAvg(S, i).toFixed(1)}`).join(' | '));
console.log(`Fin : T=${S.T.toFixed(2)} SL=${S.SL.toFixed(2)} m`);
