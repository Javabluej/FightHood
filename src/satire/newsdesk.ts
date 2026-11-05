export interface NewsReaction {
  godi: string;
  troll: string;
  ticker: string;
}

export const SUPER_REACTIONS: Record<string, NewsReaction> = {
  pratham: { godi: 'ULTIMATE HURTING! The call has been ignored and the contact BLOCKED!', troll: 'U hurted me bro. Even the network needs some space.', ticker: 'Do Not Disturb activated in the arena · Opponent left on read' },
  kenny: {
    godi: 'KENNY HAS OPENED THE REGISTER! Attendance crisis in the arena!',
    troll: 'No attendance for u, pa. Should have listened to class.',
    ticker: 'Software Engineering faculty marks opponent ABSENT · Backbenchers suddenly sit upright',
  },
  modi: {
    godi: 'MITRA CHAKRA! Goosebumps, mitron! Historical moment!',
    troll: 'Bro brought a pizza cutter to a fight 💀',
    ticker: 'Seismologists alarmed across the national capital · Kursi Index spikes',
  },
  rahul: {
    godi: 'ALOO SE SONA! But what about the GDP impact?!',
    troll: 'Potato in, gold out?! Auditors are investigating! 🥔✨',
    ticker: 'Aloo prices hit all-time high at Azadpur Mandi',
  },
  didi: {
    godi: 'HUMBA HUMBA! Unparliamentary supernatural interference!',
    troll: 'Jadu hobe! Bro turned into a frog?! Call the referee! 🐸',
    ticker: 'Frog population of New Delhi increases by one · Dharna enters day 400',
  },
  trump: {
    godi: 'TARIFF TSUNAMI! The best tariff, everybody says so!',
    troll: 'He just taxed a punch at 50%?! Inflation incoming! 📦💸',
    ticker: 'Kursi Index crashes as crates rain on Sansad floor',
  },
  yogi: {
    godi: 'DOZER KA DHAMAKA! Laser eyes, unstoppable governance!',
    troll: 'Bro parked a bulldozer directly on the opponent 💀🚜',
    ticker: 'Bulldozer seen leaving Sansad with no number plate',
  },
  nitin: {
    godi: 'GADDHA BLAST! Ganna to E20, matchstick, cinematic walk!',
    troll: 'Bro walked away from the explosion like a Bollywood hero 💀🔥',
    ticker: 'Pothole on Desi Sadak catches fire · Immediate repair tender floated',
  },
  mbapu: {
    godi: 'MANCH CHHODO! Shanti wheel spinning at lightspeed!',
    troll: 'Bro got gift-wrapped and thrown off the stage 💀☮',
    ticker: 'Shanti Index hits record high across all rings',
  },
};

export const GENERAL_TICKERS = [
  'LIVE: Sansad adjourned till chai break · Snacks bill under audit',
  'BREAKING: Stray cow seen chewing placard near Stage boundary',
  'FLASH: Exit polls claim both fighters won simultaneously',
  'UPDATE: Chai Bhaiya demands compensation for shattered kullad',
  'SPECIAL: Referees declare timeout to take selfies with ringside netas',
];

export class NewsdeskManager {
  private godiEl: HTMLElement | null;
  private trollEl: HTMLElement | null;
  private tickerEl: HTMLElement | null;

  constructor() {
    this.godiEl = document.querySelector('#newsdesk .anchor.godi .line');
    this.trollEl = document.querySelector('#newsdesk .anchor.troll .line');
    this.tickerEl = document.querySelector('#newsdesk .ticker-track');

    const godiWho = document.querySelector('#newsdesk .anchor.godi .who');
    const godiChan = document.querySelector('#newsdesk .anchor.godi .channel');
    if (godiWho) godiWho.textContent = 'SHOR SHARMA';
    if (godiChan) godiChan.textContent = 'DESH NEWS';

    const trollWho = document.querySelector('#newsdesk .anchor.troll .who');
    const trollChan = document.querySelector('#newsdesk .anchor.troll .channel');
    if (trollWho) trollWho.textContent = 'TWEETY TROLLWALA';
    if (trollChan) trollChan.textContent = 'DHURNDHAR LIVE';
    this.setReaction({ godi: 'The candidates are ready. Let the showdown begin!', troll: 'Promises are free. These punches cost SHAKTI.', ticker: GENERAL_TICKERS[0] });
  }

  public setReaction(reaction: NewsReaction): void {
    if (this.godiEl) this.godiEl.textContent = reaction.godi;
    if (this.trollEl) this.trollEl.textContent = reaction.troll;
    if (this.tickerEl) this.tickerEl.textContent = reaction.ticker;
  }

  public setSuperReaction(charId: string): void {
    const reaction = SUPER_REACTIONS[charId] || {
      godi: 'UNBELIEVABLE DISPLAY OF DEMOCRATIC ENERGY!',
      troll: 'What did I just witness?! 💀',
      ticker: 'Energy meters reach maximum capacity inside Sansad',
    };
    this.setReaction(reaction);
  }

  public resetMatch(): void {
    this.setReaction({ godi: 'The candidates are ready. Let the showdown begin!', troll: 'Keep your eyes on the fight. Class is in session.', ticker: GENERAL_TICKERS[Math.floor(Math.random() * GENERAL_TICKERS.length)] });
  }

  public setRandomTicker(): void {
    const text = GENERAL_TICKERS[Math.floor(Math.random() * GENERAL_TICKERS.length)];
    if (this.tickerEl) this.tickerEl.textContent = text;
  }
}

