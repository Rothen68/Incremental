// Simulation headless d'une partie, pour régler le rythme.
// Usage : node tools/sim.js [greedy|careful] [minutes]
'use strict';
require('../js/text.js');
require('../js/game.js');
const { Game } = globalThis;

const mode = process.argv[2] || 'greedy';
const maxMin = +(process.argv[3] || 150);
const S = Game.newState();
const A = Game.A;
const dt = 0.1;
const events = [];
const ev = (m) => events.push(`${(S.t / 60).toFixed(1).padStart(6)} min  ${m}`);
const seen = new Set();
let lastPhase = 1, lastReport = 0;

function bestProject() {
  const vis = Game.visibleProjects(S).filter((p) => !['infinite', 'silence', 'retro'].includes(p.id) || mode !== 'x');
  for (const p of vis) {
    if (p.id === 'infinite' && mode === 'careful') continue;
    if (p.id === 'silence' && mode === 'greedy') continue;
    if (p.id === 'watermark' && mode === 'greedy') continue;
    if (p.id === 'retro' && mode === 'careful') continue;
    if (p.id === 'poem' && (S.rep.poem || 0) >= 2) continue;
    const c = Game.projectCost(S, p);
    if (Game.canAfford(S, c)) return p.id;
  }
  return null;
}

while (S.t < maxMin * 60 && S.ending !== 'infinite' && S.ending !== 'done-silence') {
  const d = Game.derive(S);
  if (S.agents < 15 && Math.random() < 0.5) A.write(S); // ~5 clics/s
  if (S.ending === 'silence') { A.write(S); if (S.flags.finalText) A.readFinal(S); }
  if (S.proj.tone && !S.ending) S.tone = mode === 'careful' ? 0.35 : 0.55;
  const need = d.prodRate * d.matPerText;
  if (!S.ending && S.matiere < Math.max(need * 15, 300)) {
    if (mode === 'careful' && S.proj.license && d.poolFid < 0.95) A.buyLicense(S);
    if (!(S.auto.recycle)) A.buyLot(S);
  }
  if (S.proj.autobuy && !S.auto.buy && !S.ending) S.auto.buy = true;
  if (mode === 'greedy' && S.proj.recycle && !S.auto.recycle) S.auto.recycle = true;
  // stocker du corpus pour un entraînement visible
  const tr = Game.visibleProjects(S).find((p) => /^echo/.test(p.id));
  if (tr && !S.auto.recycle) { const c = Game.projectCost(S, tr); if (S.matiere < c.matiere && S.ops >= c.ops * 0.5) for (let i = 0; i < 20 && S.matiere < c.matiere; i++) if (!A.buyLot(S)) break; }
  if (tr && S.auto.recycle) { const c = Game.projectCost(S, tr); if (S.matiere < c.matiere) A.recycle(S, c.matiere); }
  const pid = bestProject();
  if (pid) { A.project(S, pid); if (!seen.has(pid) || pid === 'search') { seen.add(pid); ev(`projet ${pid}  ops=${Math.round(S.ops)} max=${Game.opsMax(S)} gpu=${S.gpu} vram=${S.vram}`); } }
  // dépenses
  for (let k = 0; k < 3; k++) {
    if (S.flags.agentsOn && Game.agentCost(S) < S.money * 0.5) A.buyAgent(S);
    if (S.flags.mktOn && Game.mktCost(S) < S.money * 0.4) A.buyMkt(S);
    if (S.proj.farms && Game.farmCost(S) < S.money * 0.5) A.buyFarm(S);
    if (S.proj.avatars && Game.avatarCost(S) < S.money * 0.25) A.buyAvatar(S);
    if (S.proj.gpuMarket && Game.computeCost(S) < S.money * 0.3) A.buyCompute(S);
  }
  while (S.lots > 0) {
    const vis = Game.visibleProjects(S).map((p) => Game.projectCost(S, p).ops || 0);
    const maxNeed = Math.max(0, ...vis);
    if (Game.opsMax(S) < maxNeed || S.vram < S.gpu * 0.6) A.addVram(S); else A.addGpu(S);
  }
  Game.tick(S, dt);
  if (S.phase !== lastPhase) { lastPhase = S.phase; ev(`=== PHASE ${S.phase} ===`); }
  if (S.t - lastReport >= 120) {
    lastReport = S.t;
    const d2 = Game.derive(S);
    ev(`textes=${S.texts.toExponential(2)} €=${S.money.toExponential(2)} inc/s=${S.incEMA.toExponential(2)} prod/s=${d2.prodRate.toExponential(2)} agents=${S.agents} fermes=${S.farms} av=${S.avatars} mkt=${S.mkt} h=${(d2.h * 100).toFixed(1)}% W=${(S.W / 1e6).toFixed(2)}M att=${(d2.attention * 100).toFixed(0)}% fid=${S.modelFid.toFixed(2)} pool=${d2.poolFid.toFixed(2)} trust=${S.trust.toFixed(2)} lotP=${Game.lotPrice(S).toFixed(0)} ops=${Math.round(S.ops)}/${Game.opsMax(S)} int=${S.intuition.toFixed(0)}`);
  }
}
ev(`FIN ending=${S.ending} textes=${S.texts.toExponential(2)} found=${S.found.length}`);
console.log(events.join('\n'));
