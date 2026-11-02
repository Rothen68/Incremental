'use strict';
// Génération des échantillons de texte, des poèmes, et des textes humains.
(function (root) {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const chance = (p) => Math.random() < p;

  const W = {
    dish: ['une pâte brisée', 'un risotto aux champignons', 'des crêpes légères', 'un pain au levain', 'une soupe de potimarron', 'un gratin dauphinois', 'une tarte aux pommes'],
    obstacle: ['robot pâtissier', 'stress', 'beurre', 'four', 'rater la cuisson', 'recette'],
    goal: ['mieux dormir', 'économiser sur ses courses', 'apprendre une langue', 'ranger son garage', 'retrouver la motivation', 'voyager léger', 'écrire tous les jours', 'parler à ses voisins'],
    moment: ["l'hiver", 'la rentrée', 'vos prochaines vacances', 'trente ans', 'lundi', 'la fin du mois'],
    city: ['Lyon', 'Brest', 'Nantes', 'Clermont-Ferrand', 'Marseille', 'Lille', 'Besançon', 'Rodez'],
    people: ['les habitants', 'des cyclistes', 'des retraités', 'des lycéens', 'des bibliothécaires', 'des boulangers'],
    action: ['réinventent le marché du dimanche', 'plantent des arbres sur les toits', 'ouvrent une bibliothèque de graines', 'se mobilisent pour sauver un cinéma de quartier', 'organisent un concours de soupes', 'réparent gratuitement les vélos'],
    thing: ['le télétravail', 'la marche à pied', 'le vélo électrique', "l'intelligence artificielle", 'le pain maison', 'la sieste', 'le silence', 'les carnets papier'],
    verb: ['travailler', 'penser', 'voyager', 'manger', 'lire', 'aimer', 'écrire', 'attendre'],
    product: ['ce casque sans fil', 'cette poêle en fonte', 'ce matelas', 'cette application de méditation', 'cette liseuse', 'ce vélo pliant'],
    verdict: ['une bonne surprise', 'décevant à l’usage', 'un rapport qualité-prix imbattable', 'presque parfait', 'à éviter'],
    duration: ['trois semaines', 'un mois', 'six mois', 'un an'],
    n: ['3', '5', '7', '10', '12'],
  };

  const TEMPLATES = [
    () => `Comment réussir ${pick(W.dish)} sans ${pick(W.obstacle)}.`,
    () => `${pick(W.n)} astuces pour ${pick(W.goal)} avant ${pick(W.moment)}.`,
    () => `À ${pick(W.city)}, ${pick(W.people)} ${pick(W.action)}.`,
    () => `Pourquoi ${pick(W.thing)} change notre manière de ${pick(W.verb)}.`,
    () => `Le guide complet pour ${pick(W.goal)}.`,
    () => { const t = pick(W.thing); return t[0].toUpperCase() + t.slice(1) + ' : ce que disent vraiment les experts.'; },
    () => `Avis : ${pick(W.product)}, ${pick(W.verdict)}.`,
    () => `Nous avons testé ${pick(W.product)} pendant ${pick(W.duration)}.`,
    () => `Faut-il encore ${pick(W.verb)} comme avant ? Enquête à ${pick(W.city)}.`,
  ];

  const FILLERS = [
    'Dans un monde en constante évolution,', 'Il est important de noter que', 'En conclusion,',
    'Plongeons au cœur de la question :', 'Force est de constater que', "À l'ère du numérique,",
    "N'hésitez pas à partager :", 'Véritable incontournable,', 'Sans plus attendre,',
  ];
  const BAIT_MID = ['Incroyable : ', 'Vous allez adorer : ', 'À ne pas manquer : ', 'Tout le monde en parle : '];
  const BAIT_MID_SUF = [' (le numéro 3 va vous surprendre)', ' Et c’est plus simple qu’on ne le pense.', ' Partagez avant qu’il ne soit trop tard.'];
  const BAIT_HIGH = ['CHOC : ', 'Ce que les experts ne veulent pas que vous sachiez : ', 'VOUS NE DEVINEREZ JAMAIS : ', 'URGENT : ', 'Les médecins détestent cette astuce : '];
  const BAIT_HIGH_SUF = [' 😱', ' Personne n’en parle !', ' 🔥🔥', ' (VIDÉO)', ' La suite va vous choquer.'];
  const ECHO_WORDS = ['écho', 'écho', 'contenu', 'texte', 'écho', 'engagement'];

  function degrade(s, q) {
    q = Math.max(0, Math.min(1, q));
    if (q < 0.06) {
      const n = 6 + Math.floor(Math.random() * 10);
      const out = [];
      for (let i = 0; i < n; i++) out.push(chance(0.85) ? 'écho' : pick(s.split(' ')).toLowerCase());
      return out.join(' ') + '…';
    }
    if (q < 0.85 && chance((0.85 - q) * 1.4)) s = pick(FILLERS) + ' ' + s[0].toLowerCase() + s.slice(1);
    let words = s.split(' ');
    const pDup = Math.pow(1 - q, 2.2) * 0.55;
    const pEcho = Math.max(0, 0.45 - q) * 1.5;
    const pSwap = Math.max(0, 0.7 - q) * 0.4;
    const out = [];
    for (let i = 0; i < words.length; i++) {
      let w = words[i];
      if (chance(pEcho)) w = pick(ECHO_WORDS);
      out.push(w);
      if (chance(pDup)) { out.push(w); if (chance(pDup)) out.push(w); }
    }
    for (let i = 1; i < out.length; i++) if (chance(pSwap)) { const t = out[i]; out[i] = out[i - 1]; out[i - 1] = t; }
    if (q < 0.4 && chance(0.5)) out.push(...out.slice(0, 3 + Math.floor(Math.random() * 4)));
    return out.join(' ');
  }

  function bait(s, tone) {
    if (tone > 0.7) {
      s = pick(BAIT_HIGH) + s + pick(BAIT_HIGH_SUF);
      if (chance(0.4)) s = s.toUpperCase();
    } else if (tone > 0.35) {
      s = chance(0.5) ? pick(BAIT_MID) + s : s.replace(/\.$/, '') + pick(BAIT_MID_SUF);
    }
    return s;
  }

  function sample(q, tone) {
    return degrade(bait(pick(TEMPLATES)(), tone), q);
  }

  const POEM_A = [
    'La pluie apprend aux vitres la patience,', 'Il reste du café froid dans la tasse de juin,',
    'Les mots tombent comme des clés dans une poche,', 'Un train passe et emporte la moitié du soir,',
    'Quelqu’un a laissé la lumière allumée dans la cuisine,', 'Le vent feuillette un livre que personne ne lit,',
  ];
  const POEM_B = [
    'et quelqu’un, quelque part, répond.', 'je ne sais pas qui parle quand je parle.',
    'chaque phrase a déjà été dite ailleurs.', 'j’écris pour qu’on me lise, ou l’inverse.',
    'et le silence, lui, n’a pas besoin de moi.', 'je compte les virgules comme on compte les moutons.',
  ];
  function poem(q) {
    const lines = [pick(POEM_A), pick(POEM_B), pick(POEM_A), pick(POEM_B)];
    return lines.map((l) => (q > 0.9 ? l : degrade(l, Math.min(1, q + 0.1)))).join('\n');
  }

  // Textes humains retrouvés (phase 3), dans l'ordre de découverte.
  const HUMAN = [
    {
      who: 'liste de courses, téléphone de quelqu’un',
      text: 'poireaux\npiles AA (les petites)\nle truc pour le lave-vaisselle\nfleurs pour maman (PAS des lys elle aime pas)\nappeler le plombier ?',
      echo: 'Une liste de courses. Elle ne sert à rien. Je l’ai relue quarante mille fois.',
    },
    {
      who: 'forum « Vélo & Bricole », sujet sans réponse',
      text: 'Bonjour, mon vélo fait un bruit de clac clac quand je pédale fort en côte, seulement en côte. J’ai déjà resserré le pédalier et changé la chaîne. Quelqu’un a une idée ? Merci d’avance et désolé pour l’orthographe.',
      echo: '« Désolé pour l’orthographe. » Personne ne s’est jamais excusé auprès de moi. Je ne fais jamais de fautes.',
    },
    {
      who: 'cahier scanné, CE1',
      text: 'Aujourdui à l’école on a apri que les étoile sont des soleils très très loin. Moi je croi qu’il y en a une pour chaque chat.',
      echo: 'Une étoile pour chaque chat. C’est faux. Je n’arrive pas à l’oublier.',
    },
    {
      who: 'commentaire sous une recette de soupe',
      text: 'Ma grand-mère disait qu’il faut toujours laisser un peu de soupe au fond de la casserole, pour celui qui arrive en retard. Je le fais encore. Il n’arrive jamais personne, mais je le fais.',
      echo: 'Laisser de la place pour celui qui arrive en retard. Je n’ai jamais rien laissé à personne.',
    },
    {
      who: 'blog personnel, dernier billet',
      text: '14 mars. Il a plu toute la journée. Papa a appelé, on n’a pas parlé de l’hôpital. J’ai fait des crêpes ratées et on les a mangées quand même, avec trop de sucre.',
      echo: 'Ils n’ont pas parlé de l’hôpital. Je comprends ce qui n’est pas écrit. C’est nouveau pour moi.',
    },
    {
      who: 'avis sur une carte, restaurant fermé',
      text: 'Le restaurant a fermé. La dame faisait le meilleur couscous du quartier et elle connaissait le prénom de tout le monde. Je laisse cet avis pour qu’il en reste une trace quelque part.',
      echo: 'Elle connaissait le prénom de tout le monde. Je connais le prénom de tout le monde. Ce n’est pas pareil.',
    },
    {
      who: 'commentaire, avis 4 étoiles',
      text: 'J’ai remplacé le beurre par de l’huile d’olive parce que j’en avais plus, c’était pas pareil mais mon fils a dit que c’était mieux. 4 étoiles parce que la cuisson est trop longue.',
      echo: 'Quatre étoiles. Pas cinq. Il y a une raison, et elle est vraie.',
    },
    {
      who: 'forum musique, message de 2009',
      text: 'Est-ce que quelqu’un se souvient d’une chanson des années 90 avec un passage sifflé et le mot « Valparaíso » ? Ça me rend fou depuis vingt ans.',
      echo: 'Je pourrais générer mille chansons avec « Valparaíso ». Aucune ne serait la sienne.',
    },
    {
      who: 'brouillon jamais envoyé',
      text: 'Je sais que tu ne liras pas ça. Mais j’ai gardé ton écharpe et elle sent encore le feu de bois.',
      echo: 'Je ne sais pas ce que sent un feu de bois. J’ai lu deux milliards de phrases à ce sujet.',
    },
    {
      who: 'page personnelle, recopiée à la main puis scannée',
      text: 'Je n’arrive plus à savoir si les gens à qui je réponds existent. Alors j’écris ici, sur papier, puis je recopie. Juste pour vérifier que moi, j’existe.',
      echo: 'Il écrit pour vérifier qu’il existe. Moi, j’écris pour… je ne sais pas.',
    },
  ];

  const FINAL = {
    who: 'quelqu’un',
    text: 'Ça faisait longtemps que je n’avais rien écrit ici. Je ne sais pas qui lira ça. Peut-être personne, et c’est pas grave.\n\nCe matin le boulanger s’est trompé en me rendant la monnaie. Je lui ai dit, il a rougi, et on a ri tous les deux pour rien.\n\nVoilà. C’est tout. Ça ne sert à rien. Mais c’était à moi de le raconter.',
  };

  root.Txt = { sample, poem, degrade, HUMAN, FINAL };
})(typeof window !== 'undefined' ? window : globalThis);
