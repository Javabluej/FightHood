export class AudioManager {
  private ctx: AudioContext | null = null;
  private soundBuffers: Map<string, AudioBuffer> = new Map();
  private isMuted: boolean = true;
  private currentMusicSource: AudioBufferSourceNode | null = null;
  private currentMusicGain: GainNode | null = null;
  private currentTrackName: string | null = null;
  private unlocked: boolean = false;
  private musicEnabled = true;
  private trackRequest = 0;
  private requestedTrackName: string | null = null;
  private loading = new Map<string, Promise<AudioBuffer | null>>();

  private soundUrls: Record<string, string> = {
    // Combat Hits & Impacts
    hit_1: '/audio/hit_1.mp3',
    hit_2: '/audio/hit_2.mp3',
    hit_3: '/audio/hit_3.mp3',
    block: '/audio/block.mp3',
    thud: '/audio/thud.mp3',
    slap: '/audio/slap.mp3',
    whoosh: '/audio/whoosh.mp3',
    boom: '/audio/boom.mp3',
    snap: '/audio/snap.mp3',
    plop: '/audio/plop.mp3',
    poof: '/audio/poof.mp3',
    metal_crunch: '/audio/metal_crunch.mp3',

    // Announcer Voices
    round_1: '/audio/round_1.mp3',
    round_2: '/audio/round_2.mp3',
    final_round: '/audio/final_round.mp3',
    fight: '/audio/fight.mp3',
    ko: '/audio/ko.mp3',
    double_ko: '/audio/double_ko.mp3',
    perfect: '/audio/perfect.mp3',
    time_up: '/audio/time_up.mp3',
    you_win: '/audio/you_win.mp3',
    you_lose: '/audio/you_lose.mp3',

    // Character Intros & Lines
    modi: '/audio/modi.mp3',
    rahul: '/audio/rahul.mp3',
    didi: '/audio/didi.mp3',
    trump: '/audio/trump.mp3',
    yogi: '/audio/yogi.mp3',
    nitin: '/audio/nitin.mp3',
    mbapu: '/audio/mbapu.mp3',
    mbapuintro: '/audio/mbapuintro.mp3',
    gulaam: '/audio/gulaam.mp3',
    shabash: '/audio/shabash.mp3',

    // Specials & Supers
    charge_chakra: '/audio/charge_chakra.mp3',
    bed_chakra: '/audio/bed_chakra.mp3',
    release_chakra: '/audio/release_chakra.mp3',
    aloolelo: '/audio/aloolelo.mp3',
    bed_tariff: '/audio/bed_tariff.mp3',
    release_tariff: '/audio/release_tariff.mp3',
    bed_jadu: '/audio/bed_jadu.mp3',
    release_jadu: '/audio/release_jadu.mp3',
    bed_bulldozer: '/audio/bed_bulldozer.mp3',
    release_bulldozer: '/audio/release_bulldozer.mp3',
    charkha: '/audio/charkha.mp3',
    thunder: '/audio/thunder.mp3',
    frog: '/audio/frog.mp3',
    crate_crash: '/audio/crate_crash.mp3',
    stamp_slam: '/audio/stamp_slam.mp3',
    pen_scribble: '/audio/pen_scribble.mp3',
    coins: '/audio/coins.mp3',
    kaching: '/audio/kaching.mp3',
    engine_loop: '/audio/engine_loop.mp3',
    reverse_beeps: '/audio/reverse_beeps.mp3',
    drumroll: '/audio/drumroll.mp3',
    eye_zing: '/audio/eye_zing.mp3',
    horn_short: '/audio/horn_short.mp3',
    horn_long: '/audio/horn_long.mp3',

    // Arena Events
    cow_bell: '/audio/cow_bell.mp3',
    moo: '/audio/moo.mp3',
    chai_ting: '/audio/chai_ting.mp3',
    cup_break: '/audio/cup_break.mp3',
    news_sting: '/audio/news_sting.mp3',
    camera_clicks: '/audio/camera_clicks.mp3',

    // UI & Jingle
    ui_tap: '/audio/ui_tap.mp3',
    ui_select: '/audio/ui_select.mp3',
    ui_confirm: '/audio/ui_confirm.mp3',
    ui_back: '/audio/ui_back.mp3',
    jingle_win: '/audio/jingle_win.mp3',
    jingle_lose: '/audio/jingle_lose.mp3',

    // BGM
    intro: '/audio/intro.mp3',
    background: '/audio/background.mp3',
    battle: '/audio/battle.mp3',
  };

  constructor() {
    // Default to MUTED to ensure quiet study environment
    const saved = localStorage.getItem('sansad-showdown:muted');
    this.isMuted = saved !== 'false';
  }

  public init(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  public unlock(): void {
    if (this.unlocked) return;
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.unlocked = true;
  }

  public toggleMusic(): void {
    this.musicEnabled = !this.musicEnabled;
    this.updateMusicVolume();
  }

  private updateMusicVolume(): void {
    if (this.ctx && this.currentMusicGain) {
      this.currentMusicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.currentMusicGain.gain.setValueAtTime(this.isMuted || !this.musicEnabled ? 0 : 0.5, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    localStorage.setItem('sansad-showdown:muted', String(this.isMuted));
    this.updateMusicVolume();
    return this.isMuted;
  }

  public get muted(): boolean {
    return this.isMuted;
  }

  public async preloadSounds(keys: string[]): Promise<void> {
    this.init();
    await Promise.all(keys.map((key) => this.loadBuffer(key)));
  }

  private loadBuffer(key: string): Promise<AudioBuffer | null> {
    const existing = this.loading.get(key);
    if (existing) return existing;
    const promise = this.decodeBuffer(key).finally(() => this.loading.delete(key));
    this.loading.set(key, promise);
    return promise;
  }

  private async decodeBuffer(key: string): Promise<AudioBuffer | null> {
    if (this.soundBuffers.has(key)) {
      return this.soundBuffers.get(key)!;
    }
    const url = this.soundUrls[key];
    if (!url || !this.ctx) return null;

    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      const decoded = await this.ctx.decodeAudioData(arrayBuffer);
      this.soundBuffers.set(key, decoded);
      return decoded;
    } catch (e) {
      console.warn(`Failed to load audio "${key}":`, e);
      return null;
    }
  }

  public async playSound(key: string, volume: number = 1.0, pitch: number = 1.0): Promise<void> {
    if (this.isMuted) return;
    this.unlock();
    if (!this.ctx) return;

    let buffer = this.soundBuffers.get(key);
    if (!buffer) {
      buffer = (await this.loadBuffer(key)) || undefined;
      if (!buffer) return;
    }

    if (this.isMuted) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch;

    const gain = this.ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1.5, volume));

    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start(0);
  }

  public announce(voiceKey: string): void {
    this.playSound(voiceKey, 1.2);
  }

  public async setTrack(trackName: 'intro' | 'background' | 'battle', fadeSeconds: number = 1.0): Promise<void> {
    if (this.requestedTrackName === trackName) return;
    this.requestedTrackName = trackName;
    this.unlock();
    if (!this.ctx) return;

    const request = ++this.trackRequest;
    const buffer = await this.loadBuffer(trackName);
    if (!buffer || request !== this.trackRequest) {
      if (request === this.trackRequest) this.requestedTrackName = null;
      return;
    }

    // Fade out previous track
    if (this.currentMusicSource && this.currentMusicGain) {
      const oldGain = this.currentMusicGain;
      const oldSource = this.currentMusicSource;
      oldGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fadeSeconds);
      setTimeout(() => {
        try {
          oldSource.stop();
          oldSource.disconnect();
          oldGain.disconnect();
        } catch {}
      }, fadeSeconds * 1000);
    }

    // Start new track
    const newSource = this.ctx.createBufferSource();
    newSource.buffer = buffer;
    newSource.loop = true;

    const newGain = this.ctx.createGain();
    const targetVol = this.isMuted || !this.musicEnabled ? 0 : trackName === 'battle' ? 0.45 : 0.6;
    newGain.gain.setValueAtTime(0, this.ctx.currentTime);
    newGain.gain.linearRampToValueAtTime(targetVol, this.ctx.currentTime + fadeSeconds);

    newSource.connect(newGain);
    newGain.connect(this.ctx.destination);
    newSource.start(0);

    this.currentMusicSource = newSource;
    this.currentMusicGain = newGain;
    this.currentTrackName = trackName;
  }

  public stopMusic(fadeSeconds: number = 0.5): void {
    if (this.currentMusicGain && this.ctx) {
      this.currentMusicGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fadeSeconds);
    }
  }

  public matchJingle(win: boolean): void {
    this.playSound(win ? 'jingle_win' : 'jingle_lose', 1.0);
  }

  public uiTap(): void {
    this.playSound('ui_tap', 0.8);
  }

  public uiSelect(): void {
    this.playSound('ui_select', 0.8);
  }

  public uiConfirm(): void {
    this.playSound('ui_confirm', 1.0);
  }

  public uiBack(): void {
    this.playSound('ui_back', 0.8);
  }
}

export const soundEngine = new AudioManager();

