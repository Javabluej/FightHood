import { CharacterId } from '../types';

export interface NewspaperResult {
  headline: string;
  sub: string;
  caption: string;
  excuse: string;
  dateline: string;
  stamp: string;
}

export const EXCUSES: Record<string, string[]> = {
  pratham: ['"U hurted me bro" — Pratham', '"why bro ignoring" — Pratham'],
  kenny: [`"The opponent never attended Software Engineering." — Kenny`, `"I don't give a damn." — Kenny`],
  modi: [
    '"Yeh sab pichhle 70 saal ki galti hai." — MitraMan camp',
    '"Opposition ki saazish thi." — MitraMan camp',
    '"Hum aatmanirbhar haar se seekhenge." — MitraMan camp',
    '"EVM check karwaya jayega." — MitraMan camp',
  ],
  rahul: [
    '"Scoreboard hack ho gaya tha." — Yatra Boy camp',
    '"Introspection committee banayi jayegi." — Yatra Boy camp',
    '"Main yatra se aur strong waapas aaunga." — Yatra Boy camp',
    '"Aloo se sona machine ka calibration baaki tha." — Yatra Boy camp',
  ],
  didi: [
    '"Sab referee ki chaal hai!" — Deedee camp',
    '"Kal se dharna shuru. Ladai abhi baaki hai!" — Deedee camp',
    '"Jadu ka recount hoga!" — Deedee camp',
    '"Khela hobe, phir se khela hobe!" — Deedee camp',
  ],
  trump: [
    '"The fight was rigged. Very unfair!" — Taau camp',
    '"Fake news! We actually won. Hugely." — Taau camp',
    '"Tariffs on the referee, effective immediately." — Taau camp',
    '"I will build a wall around the fighting stage." — Taau camp',
  ],
  yogi: [
    '"Bulldozer ka diesel khatam ho gaya tha." — Dozer Dada camp',
    '"Yeh haar nahi, lunch break tha." — Dozer Dada camp',
    '"Kal subah 5 baje se double shift." — Dozer Dada camp',
    '"Illegal encroachers par action jaari rahega." — Dozer Dada camp',
  ],
  nitin: [
    '"Speed breaker nahi tha, isliye slip ho gaya." — Toll Man camp',
    '"Agla flyover seedha ring ke upar banega." — Toll Man camp',
    '"FasTag scan nahi hua." — Toll Man camp',
    '"Green fuel ka trial run chal raha tha." — Toll Man camp',
  ],
  mbapu: [
    '"Krodh par vijay prapt hui." — Mbapu',
    '"Shanti hi sarvopari hai." — Mbapu',
    '"Satya aur ahimsa ki pariksha samapt." — Mbapu',
  ],
};

export function generateNewspaper(
  winnerId: CharacterId,
  loserId: CharacterId,
  score: [number, number],
  peaceWin: boolean = false,
  isPlayerWinner: boolean = true
): NewspaperResult {
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  if (peaceWin) {
    return {
      headline: 'SANSAD EMBRACES AHIMSA: HISTORIC PEACE WIN!',
      sub: 'All netas drop gloves as non-violence triumphs over punch combinations.',
      caption: 'Spectators in disbelief as peace meter hits 100%.',
      excuse: '"Shanti se bada koi mukka nahi." — Mbapu',
      dateline: `NEW DELHI · ${today} · ₹ 2.50 · SPECIAL SATIRE EDITION`,
      stamp: 'SHANTI KI JEET',
    };
  }

  const winnerNames: Record<string, string> = {
    pratham: 'PRATHAM',
    kenny: 'KENNY',
    modi: 'MITRAMAN',
    rahul: 'YATRA BOY',
    didi: 'DEEDEE',
    trump: 'TARIFF TAAU',
    yogi: 'DOZER DADA',
    nitin: 'TOLL MAN',
    mbapu: 'MBAPU',
  };

  const loserNames: Record<string, string> = {
    modi: 'MitraMan',
    rahul: 'Yatra Boy',
    didi: 'Deedee',
    trump: 'Tariff Taau',
    yogi: 'Dozer Dada',
    nitin: 'Toll Man',
    mbapu: 'Mbapu',
  };

  const wName = winnerNames[winnerId] || winnerId.toUpperCase();
  const lName = loserNames[loserId] || loserId;

  const headlines = [
    `${wName} SWEEPS COLLEGE HOOD!`,
    `LANDSLIDE KNOCKOUT: ${wName} CRUSHES ${lName.toUpperCase()}!`,
    `BREAKING: ${wName} DECLARED VICTOR BY UNANIMOUS DECISION!`,
    `${wName} UNLEASHES FULL POWER, CLAIMS THE SANSAD THRONE!`,
  ];

  const sublines = [
    `Opposition camp stunned by decisive ${score[0]}-${score[1]} round victory.`,
    `Supporters take to the streets with laddus and victory dances.`,
    `Exit polls overturned as final punch connects cleanly.`,
  ];

  const excusePool = EXCUSES[loserId] || [`"${lName} camp declined to comment on the outcome."`];
  const excuse = excusePool[Math.floor(Math.random() * excusePool.length)];

  return {
    headline: headlines[Math.floor(Math.random() * headlines.length)],
    sub: sublines[Math.floor(Math.random() * sublines.length)],
    caption: `${wName} photographed celebrating after round ${score[0] + score[1]}.`,
    excuse,
    dateline: `NEW DELHI · ${today} · ₹ 2.50 · EVENING SATIRE EDITION`,
    stamp: isPlayerWinner ? 'YOU WIN!' : (winnerId === 'mbapu' ? 'BOSS DEFEAT' : 'YOU LOSE'),
  };
}

