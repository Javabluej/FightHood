import { CharacterId, CpuDifficulty, FighterDefinition, StageId } from '../types';
import { CharacterRegistry } from '../characters/registry';
import { STAGE_DEFINITIONS } from '../stages/StageRenderer';
import { generateNewspaper } from '../satire/headlines';
import { soundEngine } from '../audio/AudioManager';

export class UIManager {
  // Screens
  private loadingScreen: HTMLElement;
  private titleScreen: HTMLElement;
  private selectScreen: HTMLElement;
  private onlineScreen: HTMLElement;
  private hudScreen: HTMLElement;
  private pauseScreen: HTMLElement;
  private resultScreen: HTMLElement;
  private legalModal: HTMLElement;
  private announceEl: HTMLElement;
  private superBannerEl: HTMLElement;
  private cinemaEl: HTMLElement;
  private peaceMeterEl: HTMLElement;

  // Online Panels
  private onHomePanel: HTMLElement;
  private onHostingPanel: HTMLElement;
  private onConnectingPanel: HTMLElement;
  private onErrorPanel: HTMLElement;
  private onRoomCodeEl: HTMLElement;
  private onConnectingText: HTMLElement;
  private onErrorText: HTMLElement;
  private netBadgeEl: HTMLElement;
  private netAwayEl: HTMLElement;

  // HUD Elements
  private p1HpFill: HTMLElement;
  private p1HpTrail: HTMLElement;
  private p2HpFill: HTMLElement;
  private p2HpTrail: HTMLElement;
  private p1Name: HTMLElement;
  private p2Name: HTMLElement;
  private p1Portrait: HTMLImageElement;
  private p2Portrait: HTMLImageElement;
  private timerEl: HTMLElement;
  private p1MeterFill: HTMLElement;
  private p2MeterFill: HTMLElement;
  private p1MeterWrap: HTMLElement;
  private p2MeterWrap: HTMLElement;
  private p1WinsPips: NodeListOf<HTMLElement>;
  private p2WinsPips: NodeListOf<HTMLElement>;
  private comboLeft: HTMLElement;
  private comboRight: HTMLElement;

  // Sound Button
  private soundBtn: HTMLElement;
  private pauseSoundBtn: HTMLElement;

  // Selections
  public selectedP1: CharacterId = 'modi';
  public selectedP2: CharacterId = 'rahul';
  public selectedStage: StageId = 'sansad';
  public selectedDifficulty: CpuDifficulty = 'normal';
  public pickTarget: 'p1' | 'p2' = 'p1';
  public isOnline: boolean = false;
  public isGuest: boolean = false;
  public currentScreen: 'loading' | 'title' | 'select' | 'online' | 'hud' | 'result' = 'loading';

  private healthTrailTimeout?: ReturnType<typeof setTimeout>;
  private lastHealth = '';
  private comboValues = { left: -1, right: -1 };
  private announcement = 0;
  private banner = 0;

  // Callbacks
  public onStartFight: (() => void) | null = null;
  public onPauseFight: (() => void) | null = null;
  public onResumeFight: (() => void) | null = null;
  public onQuitToSelect: (() => void) | null = null;
  public onRematch: (() => void) | null = null;
  public onOnlineClick: (() => void) | null = null;
  public onHostRoom: (() => void) | null = null;
  public onJoinRoom: ((code: string) => void) | null = null;
  public onLeaveOnline: (() => void) | null = null;
  public onScreenChange: ((screen: 'loading' | 'title' | 'select' | 'online' | 'hud' | 'result') => void) | null = null;
  public onSelectionChanged: ((p1: CharacterId, p2: CharacterId) => void) | null = null;

  constructor() {
    this.loadingScreen = document.getElementById('loading') || document.createElement('div');
    this.titleScreen = document.getElementById('title') || document.createElement('div');
    this.selectScreen = document.getElementById('select') || document.createElement('div');
    this.onlineScreen = document.getElementById('online') || document.createElement('div');
    this.hudScreen = document.getElementById('hud') || document.createElement('div');
    this.pauseScreen = document.getElementById('pause') || document.createElement('div');
    this.resultScreen = document.getElementById('result') || document.createElement('div');
    this.legalModal = document.getElementById('legal') || document.createElement('div');
    this.announceEl = document.getElementById('announce') || document.createElement('div');
    this.superBannerEl = document.getElementById('super-banner') || document.createElement('div');
    this.cinemaEl = document.getElementById('cinema') || document.createElement('div');
    this.peaceMeterEl = document.getElementById('peace-meter') || document.createElement('div');

    // Online panel elements
    this.onHomePanel = document.getElementById('on-home') || document.createElement('div');
    this.onHostingPanel = document.getElementById('on-hosting') || document.createElement('div');
    this.onConnectingPanel = document.getElementById('on-connecting') || document.createElement('div');
    this.onErrorPanel = document.getElementById('on-error') || document.createElement('div');
    this.onRoomCodeEl = document.getElementById('on-room-code') || document.createElement('div');
    this.onConnectingText = document.getElementById('on-connecting-text') || document.createElement('span');
    this.onErrorText = document.getElementById('on-error-text') || document.createElement('p');
    this.netBadgeEl = document.getElementById('net-badge') || document.createElement('div');
    this.netAwayEl = document.getElementById('net-away') || document.createElement('div');

    // HUD bindings
    this.p1HpFill = document.querySelector('#hud .side.left .hp-fill')!;
    this.p1HpTrail = document.querySelector('#hud .side.left .hp-trail')!;
    this.p2HpFill = document.querySelector('#hud .side.right .hp-fill')!;
    this.p2HpTrail = document.querySelector('#hud .side.right .hp-trail')!;
    this.p1Name = document.querySelector('#hud .side.left .name')!;
    this.p2Name = document.querySelector('#hud .side.right .name')!;
    this.p1Portrait = document.querySelector('#hud .side.left .portrait')!;
    this.p2Portrait = document.querySelector('#hud .side.right .portrait')!;
    this.timerEl = document.getElementById('timer')!;
    this.p1MeterFill = document.querySelector('#hud .meter.left .meter-fill')!;
    this.p2MeterFill = document.querySelector('#hud .meter.right .meter-fill')!;
    this.p1MeterWrap = document.querySelector('#hud .meter.left')!;
    this.p2MeterWrap = document.querySelector('#hud .meter.right')!;
    this.p1WinsPips = document.querySelectorAll('#hud .side.left .win');
    this.p2WinsPips = document.querySelectorAll('#hud .side.right .win');
    this.comboLeft = document.querySelector('#hud .combo.left')!;
    this.comboRight = document.querySelector('#hud .combo.right')!;

    this.soundBtn = document.getElementById('sound-btn')!;
    this.pauseSoundBtn = document.getElementById('pause-sound-btn')!;

    const grid = document.querySelector('#select .grid');
    for (const character of CharacterRegistry.getAll()) {
      if (!grid || Array.from(grid.querySelectorAll<HTMLElement>('[data-tile]')).some(tile => tile.dataset.tile === character.id)) continue;
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.dataset.tile = character.id;
      const portrait = document.createElement('img');
      portrait.src = character.facePhoto;
      portrait.alt = character.name;
      const name = document.createElement('span');
      name.className = 'tile-name';
      name.textContent = character.name;
      tile.append(portrait, name);
      for (const [side, label] of [['p1', '1P'], ['p2', 'CPU']]) {
        const marker = document.createElement('span');
        marker.className = `cur ${side}`;
        marker.textContent = label;
        tile.appendChild(marker);
      }
      grid.appendChild(tile);
    }
    this.initLegalNotice();
    this.bindButtons();
    this.updateSelectView();
    this.finishLoading();
  }

  public finishLoading(): void {
    const fill = document.getElementById('load-fill');
    if (fill) fill.style.width = '100%';
    setTimeout(() => {
      this.loadingScreen.classList.add('hidden');
      if (this.currentScreen === 'loading') {
        this.showScreen('title');
      }
    }, 250);
  }

  private initLegalNotice(): void {
    const isAccepted = localStorage.getItem('sansad-showdown:legal-v1') === '1';
    if (isAccepted) {
      document.documentElement.classList.add('legal-accepted');
      this.legalModal.classList.add('hidden');
    } else {
      const scrollEl = this.legalModal.querySelector('.legal-scroll');
      const okBtn = document.getElementById('legal-ok') as HTMLButtonElement;

      // Allow clicking right away so user is never blocked or stuck
      if (okBtn) {
        okBtn.disabled = false;
        okBtn.textContent = 'AGREE & PLAY ›';
        okBtn.classList.add('ready');
      }

      scrollEl?.addEventListener('scroll', () => {
        if (okBtn) {
          okBtn.disabled = false;
          okBtn.textContent = 'AGREE & PLAY ›';
          okBtn.classList.add('ready');
        }
      });

      okBtn?.addEventListener('click', () => {
        localStorage.setItem('sansad-showdown:legal-v1', '1');
        document.documentElement.classList.add('legal-accepted');
        this.legalModal.classList.add('hidden');
        soundEngine.unlock();
        soundEngine.uiConfirm();
        soundEngine.setTrack('intro');
        if (this.currentScreen === 'loading' || this.currentScreen === 'title') this.showScreen('title');
      });
    }
  }

  private bindButtons(): void {
    // Title Start Click or Enter/Space Key
    const startFromTitle = () => {
      if (!this.legalModal.classList.contains('hidden')) return;
      soundEngine.unlock();
      soundEngine.uiConfirm();
      soundEngine.setTrack('background');
      this.showScreen('select');
    };
    this.titleScreen.addEventListener('click', startFromTitle);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.code === 'Space') {
        if (!this.titleScreen.classList.contains('hidden')) {
          startFromTitle();
        }
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.repeat || this.currentScreen !== 'select' || (e.target as HTMLElement)?.closest('input, textarea')) return;
      const roster = CharacterRegistry.getAll();
      const cycle = (id: CharacterId, step: number) => roster[(roster.findIndex(c => c.id === id) + step + roster.length) % roster.length].id;
      if (e.code === 'Enter') { this.onStartFight?.(); return; }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        if (!this.isOnline || !this.isGuest) this.selectedP1 = cycle(this.selectedP1, e.code === 'ArrowLeft' ? -1 : 1);
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        if (!this.isOnline || this.isGuest) this.selectedP2 = cycle(this.selectedP2, e.code === 'ArrowUp' ? -1 : 1);
      } else if (e.code === 'KeyT' && !this.isGuest) {
        const stages = Object.keys(STAGE_DEFINITIONS);
        this.selectedStage = stages[(stages.indexOf(this.selectedStage) + 1) % stages.length];
      } else if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
        this.selectedDifficulty = (['easy', 'normal', 'hard'] as const)[Number(e.code.slice(-1)) - 1];
      } else return;
      e.preventDefault();
      this.updateSelectView();
    });
    document.getElementById('plate-p1')?.addEventListener('click', () => { if (!this.isGuest) this.pickTarget = 'p1'; });
    document.getElementById('plate-p2')?.addEventListener('click', () => { if (!this.isOnline || this.isGuest) this.pickTarget = 'p2'; });

    // Character Tile Clicks
    const tiles = document.querySelectorAll('.tile, [data-tile]');
    tiles.forEach((tile) => {
      tile.addEventListener('click', () => {
        const charId = (tile as HTMLElement).dataset.tile as CharacterId;
        if (!charId) return;

        soundEngine.uiTap();
        if (this.isOnline) {
          if (this.isGuest) {
            this.selectedP2 = charId === 'random' ? CharacterRegistry.getRandom().id : charId;
          } else {
            this.selectedP1 = charId === 'random' ? CharacterRegistry.getRandom().id : charId;
          }
        } else {
          if (charId === 'random') {
            const picked = CharacterRegistry.getRandom();
            if (this.pickTarget === 'p1') {
              this.selectedP1 = picked.id;
              this.pickTarget = 'p2';
            } else {
              this.selectedP2 = picked.id;
              this.pickTarget = 'p1';
            }
          } else {
            if (this.pickTarget === 'p1') {
              this.selectedP1 = charId;
              this.pickTarget = 'p2';
            } else {
              this.selectedP2 = charId;
              this.pickTarget = 'p1';
            }
          }
        }
        this.updateSelectView();
      });
    });

    // Stage Selector Clicks
    const stageBtns = document.querySelectorAll('[data-stage]');
    stageBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.isOnline && this.isGuest) return;
        soundEngine.uiSelect();
        this.selectedStage = (btn as HTMLElement).dataset.stage as StageId;
        this.updateSelectView();
      });
    });

    // CPU Difficulty Selector Clicks
    const diffBtns = document.querySelectorAll('[data-diff]');
    diffBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        soundEngine.uiSelect();
        this.selectedDifficulty = (btn as HTMLElement).dataset.diff as CpuDifficulty;
        this.updateSelectView();
      });
    });

    // Fight Button Click
    const fightBtn = document.getElementById('fight-btn');
    fightBtn?.addEventListener('click', () => {
      soundEngine.uiConfirm();
      this.onStartFight?.();
    });

    // Online Button Click
    const onlineBtn = document.getElementById('online-btn');
    onlineBtn?.addEventListener('click', () => {
      soundEngine.uiSelect();
      this.showScreen('online');
      this.showOnlinePanel('home');
      this.onOnlineClick?.();
    });

    // Online Panel Actions
    const hostBtn = document.getElementById('on-host');
    hostBtn?.addEventListener('click', () => {
      soundEngine.uiConfirm();
      this.showOnlinePanel('connecting');
      if (this.onConnectingText) this.onConnectingText.textContent = 'Creating room…';
      this.onHostRoom?.();
    });

    const joinForm = document.getElementById('on-join-form') as HTMLFormElement;
    joinForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const codeInput = document.getElementById('on-code') as HTMLInputElement;
      const code = (codeInput?.value || '').trim().toUpperCase();
      if (code) {
        soundEngine.uiConfirm();
        this.showOnlinePanel('connecting');
        if (this.onConnectingText) this.onConnectingText.textContent = `Joining room ${code}…`;
        this.onJoinRoom?.(code);
      }
    });

    const onBackBtn = document.getElementById('on-back');
    onBackBtn?.addEventListener('click', () => {
      soundEngine.uiBack();
      const isSubpanel =
        !this.onHostingPanel.classList.contains('hidden') ||
        !this.onConnectingPanel.classList.contains('hidden') ||
        !this.onErrorPanel.classList.contains('hidden');

      if (isSubpanel) {
        this.onLeaveOnline?.();
        this.showOnlinePanel('home');
      } else {
        this.showScreen('select');
      }
    });

    const copyBtn = document.getElementById('on-copy');
    copyBtn?.addEventListener('click', async () => {
      const code = this.onRoomCodeEl?.dataset.code || this.onRoomCodeEl?.textContent || '';
      const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
      try {
        await navigator.clipboard.writeText(url);
        if (copyBtn) {
          const orig = copyBtn.textContent;
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { if (copyBtn) copyBtn.textContent = orig; }, 2000);
        }
      } catch {
        prompt('Room Link (Ctrl+C to copy):', url);
      }
    });

    const waBtn = document.getElementById('on-wa');
    waBtn?.addEventListener('click', () => {
      const code = this.onRoomCodeEl?.dataset.code || this.onRoomCodeEl?.textContent || '';
      const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
      const msg = `Fight me in College Hood! 🥊 Room code ${code}: ${url}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    });

    const netAwayLeaveBtn = document.getElementById('net-away-leave');
    netAwayLeaveBtn?.addEventListener('click', () => {
      soundEngine.uiBack();
      this.setNetAway(false);
      this.onLeaveOnline?.();
      this.showScreen('select');
    });

    const onlineLeaveBtn = document.getElementById('online-leave');
    onlineLeaveBtn?.addEventListener('click', () => {
      soundEngine.uiBack();
      this.onLeaveOnline?.();
    });

    // Pause Buttons
    const pauseBtn = document.getElementById('pause-btn');
    pauseBtn?.addEventListener('click', () => {
      this.onPauseFight?.();
    });

    const resumeBtn = document.getElementById('resume-btn');
    resumeBtn?.addEventListener('click', () => {
      soundEngine.uiConfirm();
      this.showPause(false);
      this.onResumeFight?.();
    });

    const quitBtn = document.getElementById('quit-btn');
    quitBtn?.addEventListener('click', () => {
      soundEngine.uiBack();
      this.showPause(false);
      this.showScreen('select');
      this.onQuitToSelect?.();
    });

    // Result Screen Buttons
    const rematchBtn = document.getElementById('rematch-btn');
    rematchBtn?.addEventListener('click', () => {
      soundEngine.uiConfirm();
      this.onRematch?.();
    });

    const selectBtn = document.getElementById('select-btn');
    selectBtn?.addEventListener('click', () => {
      soundEngine.uiBack();
      this.showScreen('select');
      this.onQuitToSelect?.();
    });

    // Sound Toggles
    const handleSoundToggle = () => {
      const isMuted = soundEngine.toggleMute();
      this.soundBtn.textContent = isMuted ? '🔇' : '🔊';
      if (this.pauseSoundBtn) {
        this.pauseSoundBtn.textContent = isMuted ? 'SOUND: OFF' : 'SOUND: ON';
      }
    };
    this.soundBtn?.addEventListener('click', handleSoundToggle);
    this.pauseSoundBtn?.addEventListener('click', handleSoundToggle);

    // Initial state reflection
    if (this.soundBtn) {
      this.soundBtn.textContent = soundEngine.muted ? '🔇' : '🔊';
    }
    if (this.pauseSoundBtn) {
      this.pauseSoundBtn.textContent = soundEngine.muted ? 'SOUND: OFF' : 'SOUND: ON';
    }
  }

  public updateSelectView(notifyChanged: boolean = true): void {
    // Highlight selected tiles
    const tiles = document.querySelectorAll('.tile, [data-tile]');
    tiles.forEach((tile) => {
      const charId = (tile as HTMLElement).dataset.tile;
      const isP1 = charId === this.selectedP1;
      const isP2 = charId === this.selectedP2;

      tile.classList.toggle('selected-p1', isP1);
      tile.classList.toggle('selected-p2', isP2);

      const p1Cur = tile.querySelector('.cur.p1');
      const p2Cur = tile.querySelector('.cur.p2');
      if (p1Cur) (p1Cur as HTMLElement).style.display = isP1 ? 'block' : 'none';
      if (p2Cur) (p2Cur as HTMLElement).style.display = isP2 ? 'block' : 'none';
    });

    // Update Stage buttons
    document.querySelectorAll('[data-stage]').forEach((btn) => {
      const s = (btn as HTMLElement).dataset.stage;
      btn.classList.toggle('selected', s === this.selectedStage);
    });

    // Update Difficulty buttons
    document.querySelectorAll('[data-diff]').forEach((btn) => {
      const d = (btn as HTMLElement).dataset.diff;
      btn.classList.toggle('selected', d === this.selectedDifficulty);
    });

    // Update Side Preview Plates
    const def1 = CharacterRegistry.get(this.selectedP1);
    const def2 = CharacterRegistry.get(this.selectedP2);

    const p1Img = document.querySelector('#plate-p1 img') as HTMLImageElement;
    const p1Title = document.querySelector('#plate-p1 .plate-name');
    const p1Party = document.querySelector('#plate-p1 .plate-party, #plate-p1 .plate-sub');
    const p1Super = document.querySelector('#plate-p1 .plate-super');
    const p1Desc = document.querySelector('#plate-p1 .plate-desc');
    if (p1Img) p1Img.src = def1.facePhoto;
    if (p1Title) p1Title.textContent = def1.name;
    if (p1Party) p1Party.textContent = def1.party;
    if (p1Super) p1Super.textContent = def1.superName;
    if (p1Desc) p1Desc.textContent = def1.superDesc;

    const p2Img = document.querySelector('#plate-p2 img') as HTMLImageElement;
    const p2Title = document.querySelector('#plate-p2 .plate-name');
    const p2Party = document.querySelector('#plate-p2 .plate-party, #plate-p2 .plate-sub');
    const p2Super = document.querySelector('#plate-p2 .plate-super');
    const p2Desc = document.querySelector('#plate-p2 .plate-desc');
    if (p2Img) p2Img.src = def2.facePhoto;
    if (p2Title) p2Title.textContent = def2.name;
    if (p2Party) p2Party.textContent = def2.party;
    if (p2Super) p2Super.textContent = def2.superName;
    if (p2Desc) p2Desc.textContent = def2.superDesc;

    if (notifyChanged) {
      this.onSelectionChanged?.(this.selectedP1, this.selectedP2);
    }
  }

  public showScreen(screen: 'loading' | 'title' | 'select' | 'online' | 'hud' | 'result'): void {
    this.currentScreen = screen;
    document.body.classList.toggle('in-battle', screen === 'hud');
    document.body.classList.toggle('online', this.isOnline);
    this.loadingScreen.classList.toggle('hidden', screen !== 'loading');
    this.titleScreen.classList.toggle('hidden', screen !== 'title');
    this.selectScreen.classList.toggle('hidden', screen !== 'select');
    this.onlineScreen.classList.toggle('hidden', screen !== 'online');
    this.hudScreen.classList.toggle('hidden', screen !== 'hud');
    this.resultScreen.classList.toggle('hidden', screen !== 'result');
    this.pauseScreen.classList.add('hidden');
    this.onScreenChange?.(screen);
  }

  public clearTransientEffects(): void {
    ++this.announcement;
    ++this.banner;
    clearTimeout(this.healthTrailTimeout);
    this.lastHealth = '';
    this.comboValues = { left: -1, right: -1 };
    this.announceEl.classList.remove('show');
    this.superBannerEl.style.opacity = '0';
    this.cinemaEl.style.opacity = '0';
    this.setVignette(false);
    this.updatePeace(0, false);
    document.getElementById('popups')?.replaceChildren();
  }

  public showOnlinePanel(panel: 'home' | 'hosting' | 'connecting' | 'error'): void {
    this.onHomePanel.classList.toggle('hidden', panel !== 'home');
    this.onHostingPanel.classList.toggle('hidden', panel !== 'hosting');
    this.onConnectingPanel.classList.toggle('hidden', panel !== 'connecting');
    this.onErrorPanel.classList.toggle('hidden', panel !== 'error');
  }

  public setRoomCode(code: string): void {
    if (this.onRoomCodeEl) {
      this.onRoomCodeEl.textContent = code;
      this.onRoomCodeEl.dataset.code = code;
    }
  }

  public showOnlineError(err: string): void {
    if (this.onErrorText) this.onErrorText.textContent = err;
    this.showOnlinePanel('error');
  }

  public setNetBadge(text: string | null): void {
    if (!this.netBadgeEl) return;
    if (text) {
      this.netBadgeEl.textContent = text;
      this.netBadgeEl.classList.remove('hidden');
    } else {
      this.netBadgeEl.classList.add('hidden');
    }

    const bar = document.getElementById('online-bar');
    const status = document.getElementById('online-status');
    const onlineBtn = document.getElementById('online-btn');
    if (bar && status) {
      if (text) {
        status.textContent = text;
        bar.classList.add('on');
        onlineBtn?.classList.add('hidden');
      } else {
        status.textContent = '';
        bar.classList.remove('on');
        onlineBtn?.classList.remove('hidden');
      }
    }
  }

  public setNetAway(visible: boolean): void {
    if (this.netAwayEl) {
      this.netAwayEl.classList.toggle('hidden', !visible);
    }
  }

  public showPause(show: boolean): void {
    this.pauseScreen.classList.toggle('hidden', !show);
  }

  public initHud(p1: FighterDefinition, p2: FighterDefinition): void {
    this.p1Name.textContent = p1.name;
    this.p1Name.style.color = p1.accent;
    this.p1Portrait.src = p1.facePhoto;

    this.p2Name.textContent = p2.name;
    this.p2Name.style.color = p2.accent;
    this.p2Portrait.src = p2.facePhoto;

    this.updateHealth(100, 100);
    this.updateMeters(0, 0);
    this.updateTimer(60);
    this.updateWins(0, 0);
  }

  public updateHealth(p1Hp: number, p2Hp: number): void {
    const healthKey = `${p1Hp},${p2Hp}`;
    if (this.lastHealth === healthKey) return;
    this.lastHealth = healthKey;
    const p1Pct = Math.max(0, Math.min(100, p1Hp));
    const p2Pct = Math.max(0, Math.min(100, p2Hp));

    this.p1HpFill.style.width = `${p1Pct}%`;
    this.p2HpFill.style.width = `${p2Pct}%`;

    // One pending trail update, only when health actually changes.
    clearTimeout(this.healthTrailTimeout);
    this.healthTrailTimeout = setTimeout(() => {
      this.p1HpTrail.style.width = `${p1Pct}%`;
      this.p2HpTrail.style.width = `${p2Pct}%`;
    }, 180);
  }

  public updatePeace(progress: number, visible: boolean): void {
    this.peaceMeterEl.classList.toggle('show', visible);
    const fill = this.peaceMeterEl.querySelector('i');
    if (fill) fill.style.transform = `scaleX(${Math.max(0, Math.min(1, progress))})`;
    this.peaceMeterEl.title = 'Hold back near Mbapu for 12 seconds without attacking to win peacefully. Attacking resets SHANTI.';
  }

  public updateMeters(p1Meter: number, p2Meter: number): void {
    this.p1MeterFill.style.width = `${p1Meter}%`;
    this.p2MeterFill.style.width = `${p2Meter}%`;

    this.p1MeterWrap.classList.toggle('ready', p1Meter >= 100);
    this.p2MeterWrap.classList.toggle('ready', p2Meter >= 100);
  }

  public updateTimer(seconds: number): void {
    this.timerEl.textContent = String(Math.max(0, Math.ceil(seconds)));
    this.timerEl.classList.toggle('low', seconds <= 10);
  }

  public updateWins(p1Wins: number, p2Wins: number): void {
    this.p1WinsPips.forEach((pip, idx) => {
      pip.classList.toggle('on', idx < p1Wins);
    });
    this.p2WinsPips.forEach((pip, idx) => {
      pip.classList.toggle('on', idx < p2Wins);
    });
  }

  public showCombo(side: 'left' | 'right', hits: number): void {
    if (this.comboValues[side] === hits) return;
    this.comboValues[side] = hits;
    const el = side === 'left' ? this.comboLeft : this.comboRight;
    if (hits > 1) {
      el.innerHTML = `<b>${hits}</b> HITS!`;
      el.classList.remove('show');
      void el.offsetWidth; // re-trigger animation
      el.classList.add('show');
    } else {
      el.classList.remove('show');
    }
  }

  public announceText(text: string, styleClass: string = '', durationMs: number = 1200): Promise<void> {
    const announcement = ++this.announcement;
    return new Promise((resolve) => {
      this.announceEl.textContent = text;
      this.announceEl.className = styleClass;
      this.announceEl.classList.remove('show');
      void this.announceEl.offsetWidth;
      this.announceEl.classList.add('show');

      setTimeout(() => {
        if (announcement === this.announcement) this.announceEl.classList.remove('show');
        resolve();
      }, durationMs);
    });
  }

  public showSuperBanner(char: FighterDefinition, durationMs: number = 1400): Promise<void> {
    const banner = ++this.banner;
    return new Promise((resolve) => {
      this.superBannerEl.innerHTML = `
        <img src="${char.facePhoto}" alt="" />
        <div>
          <small style="color:${char.accent}">SUPER MOVE</small>
          <h2 style="font-family:'Bebas Neue';font-size:38px;color:#fff">${char.superName}</h2>
        </div>
      `;
      this.superBannerEl.style.opacity = '1';
      this.cinemaEl.style.opacity = '1';

      setTimeout(() => {
        if (banner === this.banner) {
          this.superBannerEl.style.opacity = '0';
          this.cinemaEl.style.opacity = '0';
        }
        resolve();
      }, durationMs);
    });
  }

  public showSpeech(text: string, screenX: number, screenY: number, className: string = '', speaker?: string): void {
    if (speaker) {
      document.querySelectorAll<HTMLElement>('#popups .speech').forEach(bubble => {
        if (bubble.dataset.speaker === speaker) bubble.remove();
      });
    }
    const el = document.createElement('div');
    el.className = className ? `speech ${className}` : 'speech';
    if (speaker) el.dataset.speaker = speaker;
    el.textContent = text;
    el.style.maxWidth = 'min(440px, calc(100vw - 24px))';
    el.style.whiteSpace = 'normal';
    el.style.left = `${Math.round(screenX)}px`;
    el.style.top = `${Math.round(screenY)}px`;
    const popups = document.getElementById('popups');
    if (popups) {
      popups.appendChild(el);
      setTimeout(() => el.remove(), 2400);
    }
  }

  public showPopup(text: string, screenX: number, screenY: number, color: string = '#ffd000'): void {
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${Math.round(screenX)}px`;
    el.style.top = `${Math.round(screenY)}px`;
    const popups = document.getElementById('popups');
    if (popups) {
      popups.appendChild(el);
      setTimeout(() => el.remove(), 1100);
    }
  }

  public positionSpeech(speaker: string, x: number, y: number): void {
    document.querySelectorAll<HTMLElement>('#popups .speech').forEach(bubble => {
      if (bubble.dataset.speaker !== speaker) return;
      const halfWidth = bubble.offsetWidth / 2;
      bubble.style.left = `${Math.round(Math.max(halfWidth + 8, Math.min(window.innerWidth - halfWidth - 8, x)))}px`;
      bubble.style.top = `${Math.round(Math.max(100 + bubble.offsetHeight, Math.min(window.innerHeight - 70, y)))}px`;
    });
  }

  public separateSpeechBubbles(): void {
    const bubbles = [...document.querySelectorAll<HTMLElement>('#popups .speech[data-speaker]')];
    if (bubbles.length !== 2) return;
    const [a, b] = bubbles.map(bubble => bubble.getBoundingClientRect());
    const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (Math.min(a.right, b.right) <= Math.max(a.left, b.left) || overlapY <= 0) return;
    const gap = overlapY + 12;
    const higher = a.top <= b.top ? 0 : 1;
    const upper = higher === 0 ? a : b;
    if (upper.top - gap >= 95) bubbles[higher].style.top = `${parseFloat(bubbles[higher].style.top) - gap}px`;
    else {
      const lower = 1 - higher;
      bubbles[lower].style.top = `${parseFloat(bubbles[lower].style.top) + gap}px`;
    }
  }

  public shake(intensity: number = 0.25, durationSec: number = 0.2): void {
    const start = performance.now();
    const durationMs = durationSec * 1000;
    const interval = setInterval(() => {
      const elapsed = performance.now() - start;
      if (elapsed >= durationMs) {
        document.body.style.transform = '';
        clearInterval(interval);
        return;
      }
      const remain = 1 - elapsed / durationMs;
      const ox = (Math.random() - 0.5) * intensity * 24 * remain;
      const oy = (Math.random() - 0.5) * intensity * 24 * remain;
      document.body.style.transform = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px)`;
    }, 16);
  }

  public showFlash(color: string = 'rgba(255, 255, 255, 0.75)', durationMs: number = 300): void {
    const flashEl = document.getElementById('flash');
    if (flashEl) {
      flashEl.style.background = color;
      flashEl.style.opacity = '1';
      flashEl.style.transition = 'none';
      setTimeout(() => {
        flashEl.style.transition = `opacity ${durationMs}ms ease-out`;
        flashEl.style.opacity = '0';
      }, 50);
    }
  }

  public setVignette(active: boolean): void {
    const el = document.getElementById('vignette');
    if (el) {
      el.classList.toggle('on', active);
    }
  }

  public showResultNewspaper(winner: CharacterId, loser: CharacterId, score: [number, number], peace: boolean = false, isPlayerWinner: boolean = true): void {
    const paper = generateNewspaper(winner, loser, score, peace, isPlayerWinner);
    const winDef = CharacterRegistry.get(winner);

    const headlineEl = document.getElementById('paper-headline');
    const dateEl = document.getElementById('paper-date');
    const subEl = document.getElementById('paper-sub');
    const excuseEl = document.getElementById('paper-excuse');
    const photoEl = document.getElementById('paper-photo') as HTMLImageElement;
    const captionEl = document.getElementById('paper-caption');
    const stampEl = document.getElementById('result-title');
    const resultSubEl = document.getElementById('result-sub');

    if (headlineEl) headlineEl.textContent = paper.headline;
    if (dateEl) dateEl.textContent = paper.dateline;
    if (subEl) subEl.textContent = paper.sub;
    if (excuseEl) excuseEl.textContent = paper.excuse;
    if (photoEl) photoEl.src = winDef.facePhoto;
    if (captionEl) captionEl.textContent = paper.caption;
    if (stampEl) {
      stampEl.textContent = paper.stamp;
      stampEl.className = peace ? 'stamp win peace' : (isPlayerWinner ? 'stamp win' : 'stamp lose');
    }
    if (resultSubEl) {
      resultSubEl.textContent = `${winDef.name} WINS! ${isPlayerWinner ? `${winDef.name} rules the Sansad!` : 'Better luck next election.'}`;
    }

    this.showScreen('result');
  }
}

