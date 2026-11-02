'use strict';
// Sept générations — lettres et textes de fin.
(function (root) {
  const { Sept } = root;
  const T = (t) => Sept.fmtT(t);
  const cm = (m) => Math.round(m * 100) + ' cm';

  const TIP_NAMES = {
    coral: 'les récifs coralliens sont morts',
    greenland: 'le Groenland a commencé à fondre pour de bon',
    permafrost: 'le pergélisol s’est mis à dégeler',
    amazon: 'l’Amazonie est devenue une savane',
    wais: 'l’Antarctique de l’Ouest s’est disloqué',
  };

  function opener(S, g, end) {
    const t = end.T;
    const r = S.research;
    switch (g) {
      case 0: return 'Quand j’étais petite, on se chauffait au charbon, et la fumée voulait dire qu’on avait de quoi manger. J’ai vu arriver l’électricité partout, le frigo, la voiture, les vacances. Je ne vais pas m’en excuser.';
      case 1:
        if (r.giec || r.models) return 'Tu me demanderas un jour si on savait. On savait. Les rapports étaient sur mon bureau.';
        if (r.keeling) return 'On mesurait le CO₂ depuis des années. Personne ne regardait vraiment la courbe.';
        return 'Personne, autour de moi, ne mesurait ce qu’on rejetait dans le ciel. On aurait pu. Les instruments existaient.';
      case 2:
        if (t < 1.4) return 'Je suis née au moment où tout le monde savait. Pour une fois, on n’est pas arrivés trop tard. Pas complètement.';
        return 'Je suis née au moment où tout le monde savait, et où presque personne n’agissait assez vite. J’ai passé ma vie à essayer de rattraper ce retard.';
      case 3:
        if (t < 1.6) return 'On dit que ma génération a tout changé. Je crois surtout qu’on n’avait plus le choix, et que celles d’avant nous avaient laissé de quoi le faire.';
        if (t < 2.2) return 'On a beaucoup construit, beaucoup réparé, beaucoup perdu. On a réussi des choses. Pas assez vite.';
        return 'J’ai grandi avec les alertes canicule comme d’autres avec la météo. On s’habitue à tout. C’est ça, le pire.';
      case 4:
        if (!S.tip.coral) return 'J’ai nagé au-dessus d’un récif de corail. Garde cette lettre : un jour, ça te paraîtra peut-être incroyable. J’espère que non.';
        if (t < 2.2) return 'Tu n’as jamais vu de récif de corail. Moi non plus, seulement en photo. Mais j’ai vu des forêts repousser, et je te jure que c’est beau aussi.';
        return 'Tu n’as jamais vu de récif de corail. Moi non plus. Ma grand-mère disait que la mer était bleue « à l’intérieur ». Je n’ai jamais compris.';
      case 5:
        if (t < 2) return 'Tu vas naître dans un monde abîmé, mais vivable. C’est moins que ce qu’on espérait. C’est plus que ce qu’on craignait.';
        if (t < 3) return 'Les étés sont devenus une saison qu’on traverse plutôt qu’une saison qu’on vit. On a appris à vivre la nuit.';
        return 'Je ne sais pas comment t’écrire ça. Il y a des régions entières où l’on ne peut plus vivre l’été. On s’est déplacés. On se déplacera encore.';
      default: return '';
    }
  }

  // Lettre de la génération g à la suivante.
  function letter(S, g) {
    const start = S.genStart[g], end = S.genEnd[g];
    const me = Sept.GENS[g], next = Sept.GENS[g + 1];
    const P = [];
    P.push(opener(S, g, end));

    if (S.research.models) {
      const dT = end.T - start.T;
      let s = `Pendant ma vie, la Terre est passée de ${T(start.T)} à ${T(end.T)}.`;
      if (dT < 0.03) s += ' Elle a presque cessé de chauffer. Tu ne sauras jamais à quel point c’était difficile.';
      else if (dT > 0.6) s += ' Je n’arrive pas à écrire ce chiffre sans trembler.';
      P.push(s);
    } else {
      P.push('Je ne sais pas ce que nous avons changé dans le ciel. Personne ne le calculait.');
    }

    const inherit = [];
    if (end.plants > 0) {
      const last = Math.max(...S.fossil.map((c) => c.y)) + Sept.C.FOSSIL_LIFE;
      inherit.push(`Je te laisse ${end.plants} centrales fossiles. Les plus récentes tourneront jusqu’en ${last}, à moins que tu ne les fermes avant.`);
    } else if (start.plants > 0) {
      inherit.push('Je ne te laisse aucune centrale fossile. La dernière a fermé de mon vivant. Je suis allé·e voir la cheminée tomber.');
    }
    if (end.ren < start.ren * 0.6) {
      inherit.push(`Le prix des renouvelables a baissé de ${Math.round((1 - end.ren / start.ren) * 100)} % pendant ma vie. C’est peut-être le cadeau le plus utile que je te fasse, et personne ne me remerciera.`);
    }
    if (end.debt > start.debt + 10) inherit.push(`Je te laisse aussi une dette de ${Math.round(end.debt)} milliards. Je me suis dit que tu serais plus riche que moi.`);
    else if (start.debt > 10 && end.debt < start.debt * 0.7) inherit.push('J’ai remboursé une partie de la dette que l’on m’avait laissée.');
    if (end.mask > 0.05) inherit.push(`Je te laisse un ciel voilé d’aérosols. Il cache ${T(end.mask).replace('+', '')} de réchauffement. Il ne coûte presque rien, mais il faudra le payer chaque année. Si tu arrêtes, cette chaleur te tombera dessus en quelques années. Pardon.`);
    if (end.waste > start.waste + 1) inherit.push('Et des déchets nucléaires. Ils dureront plus longtemps que notre nom de famille.');
    if (inherit.length) P.push(inherit.join(' '));

    const newTips = Object.keys(S.tipYears).filter((k) => !k.endsWith('_c') && S.tipYears[k] >= start.year && S.tipYears[k] < end.year + 1);
    if (newTips.length) {
      const list = newTips.map((k) => TIP_NAMES[k]).filter(Boolean);
      P.push('De mon vivant, ' + list.join(', ') + '. Ça, personne ne pourra le rattraper.');
    }
    if (end.cY > 0.5 && end.cW < end.cY - 0.3) P.push('Nous avons fait notre part. Le reste du monde, lui, se développe comme nous l’avons fait : au charbon. De quel droit le lui reprocher ?');
    else if (end.cW > 0.5 && start.cW <= 0.5) P.push('Le reste du monde a suivi. Plus lentement qu’on l’espérait, mais il a suivi.');
    const rb = (end.rollbacks || 0) - (start.rollbacks || 0);
    if (rb >= 2) P.push('On a voté contre nos propres promesses. Plusieurs fois. Je comprends pourquoi, et c’est peut-être ça le pire.');
    else if ((end.support || 0) > 0.6 && (start.support || 0) < 0.5) P.push('Pour la première fois de ma vie, une majorité voulait vraiment changer. Ne la gâche pas.');
    if (end.SL - start.SL > 0.1) P.push(`La mer est montée de ${cm(end.SL - start.SL)} depuis ma naissance.`);

    const w = Sept.genAvg(S, g), wPrev = g > 0 ? Sept.genAvg(S, g - 1) : null;
    if (g === 0) P.push('J’ai eu une vie meilleure que celle de mes parents. Je te souhaite la même chose.');
    else if (w > wPrev + 2) P.push(`J’ai eu une vie plus douce que celle de ${Sept.GENS[g - 1].name}. J’espère que la tienne le sera encore plus.`);
    else if (w < wPrev - 2) P.push(`J’ai eu une vie plus dure que celle de ${Sept.GENS[g - 1].name}. J’espère que la tienne sera meilleure.`);
    else P.push(`J’ai vécu à peu près comme ${Sept.GENS[g - 1].name}. Ce n’est déjà pas si mal.`);

    return { to: next.name, from: me.name, year: end.year, paragraphs: P };
  }

  function finalLetter(S) {
    const t = S.T;
    const P = [];
    if (t < 1.6) P.push('Je vis dans le monde que vous m’avez gardé. Il n’est pas tout à fait le vôtre : la mer a pris des plages, des espèces sont parties. Mais il fait encore bon vivre ici, et je sais ce que ça vous a coûté. Merci d’avoir pensé à quelqu’un que vous ne connaîtriez jamais.');
    else if (t < 2.2) P.push('Je vis dans un monde plus chaud que celui où vous êtes nés. On s’y est adaptés, souvent avec ce que vous nous avez laissé : des panneaux, des digues, des habitudes. Certaines choses ne reviendront pas. D’autres sont encore là parce que vous vous êtes battus. Je ne vous en veux pas. Pas trop.');
    else if (t < 3) P.push('Je ne vous en veux pas, mais je voudrais que vous sachiez. Les étés tuent. Les villes du bord de mer ont reculé. On parle de vous dans les livres d’histoire, entre les guerres et les épidémies : l’époque où l’on savait, et où l’on a continué.');
    else P.push('Je voudrais vous en vouloir, mais vous n’êtes plus là. Ma génération vit les conséquences de décisions prises avant ma naissance, par des gens qui m’aimaient sans me connaître. C’était donc ça, l’héritage.');
    const add = [];
    if (S.mask > 0.05) add.push('Le ciel est blanc. Il faut le repeindre tous les ans. Personne ne sait comment arrêter.');
    if (S.flags.termination) add.push('Une année, quelqu’un a arrêté les aérosols. On parle encore de cet été-là.');
    if (S.SL > 1) add.push('La maison de Jeanne est sous l’eau. On y va en bateau, parfois, pour voir.');
    else if (S.SL > 0.6) add.push(`La mer est montée de ${cm(S.SL - 0.07)} depuis la naissance de Jeanne. Elle continuera longtemps après moi.`);
    if (S.waste > 1) add.push('Nous gardons vos déchets nucléaires. Nos enfants les garderont aussi.');
    if (S.debt > S.Y * 0.5) add.push('Nous remboursons encore vos dettes.');
    const cY = Sept.derive(S).cY;
    if (cY > 0.8 && S.cW < 0.6) add.push('Vous aviez montré le chemin. Le monde ne l’a pas pris assez vite. On ne gagne pas seul contre le climat.');
    else if (S.cW > 0.9 && S.research.paris) add.push('Le monde entier a fini par changer. Ça a commencé par des réunions interminables, paraît-il.');
    const w0 = Sept.genAvg(S, 0), w6 = Sept.genAvg(S, 6);
    if (w6 < w0) add.push('Je vis moins bien que Jeanne. Elle avait tellement moins que moi, et pourtant.');
    else if (w6 > Math.max(...[1, 2, 3, 4, 5].map((g) => Sept.genAvg(S, g)))) add.push('Je crois que j’ai eu plus de chance que vous tous. Je ne l’ai pas mérité. Vous, si.');
    if (add.length) P.push(add.join(' '));
    P.push('Je vous écris quand même, même si vous ne lirez jamais ça. Quelqu’un, un jour, lira peut-être ce que j’aurai laissé.');
    return { paragraphs: P };
  }

  function nowText(S) {
    const known = S.research.models;
    return {
      title: '2026. Vous êtes ici.',
      paragraphs: [
        'Jusqu’ici, le monde de ce jeu suivait à peu près le nôtre. Les mêmes rapports, les mêmes sommets, les mêmes promesses.',
        'Dans notre monde, en 2026, la Terre s’est réchauffée d’environ +1,4 °C. ' + (known ? `Dans le vôtre : ${T(S.T)}.` : 'Dans le vôtre, personne ne le sait : aucune génération n’a financé les modèles du climat.'),
        'Vous avez joué avec un avantage que personne n’a jamais eu : connaître la suite. Le reste du monde, lui, ne la connaît pas.',
        'À partir de maintenant, rien n’est écrit.',
      ],
    };
  }

  const INTRO = [
    '1950. Vous allez vivre sept vies d’une même famille, de Jeanne à Aube.',
    'Chacune dure trente ans. Chacune hérite de ce que la précédente a construit, et de ce qu’elle a rejeté dans le ciel.',
    'Une année passe toutes les huit secondes. Le temps ne s’arrête pas pour réfléchir, mais vous pouvez le mettre en pause.',
  ];
  const QUOTE = '« Dans chacune de nos délibérations, nous devons considérer l’impact de nos décisions sur les sept générations à venir. »';
  const QUOTE_SRC = 'principe attribué à la Confédération haudenosaunee';

  root.SeptStory = { letter, finalLetter, nowText, INTRO, QUOTE, QUOTE_SRC };
})(typeof window !== 'undefined' ? window : globalThis);
