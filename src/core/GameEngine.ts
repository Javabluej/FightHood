import * as THREE from 'three';
import { CharacterId, CpuDifficulty, InputState, StageId, HitResult } from '../types';
import { CharacterRegistry } from '../characters/registry';
import { Fighter } from '../combat/Fighter';
import { updatePeaceCharge } from '../combat/peace';
import { resolveCombatExchange } from '../combat/collision';
import { resolvePushboxCollision, FIXED_DELTA_TIME, NEUTRAL_INPUT } from '../combat/physics';
import { ModelRig } from '../animation/ModelRig';
import { getBaseIdlePose, getIntroPose } from '../animation/poses';
import { StageRenderer } from '../stages/StageRenderer';
import { Bot } from '../ai/Bot';
import { InputManager } from '../input/InputManager';
import { UIManager } from '../ui/UIManager';
import { soundEngine } from '../audio/AudioManager';
import { NewsdeskManager } from '../satire/newsdesk';
import { NetworkClient } from '../multiplayer/NetworkClient';
import { GuestPrediction } from '../multiplayer/Prediction';
import { SuperDirector } from '../cinematics/SuperDirector';

type CombatImpact = Omit<HitResult, 'ko'>;

export type GameEngineState =
  | 'idle'
  | 'round_intro'
  | 'fighting'
  | 'super_cinematic'
  | 'round_over'
  | 'match_decided';

export class GameEngine {
  // Three.js Core
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public stageRenderer: StageRenderer;

  // UI & Input
  public ui: UIManager;
  public input: InputManager;
  public newsdesk: NewsdeskManager;
  public netClient: NetworkClient;

  // Combat Entities
  public fighter1!: Fighter;
  public fighter2!: Fighter;
  public rig1!: ModelRig;
  public rig2!: ModelRig;
  public cpuBot: Bot;

  // Engine State
  public state: GameEngineState = 'idle';
  public currentRound: number = 1;
  public roundTimeLeft: number = 60;
  public isPaused: boolean = false;
  public isOnline: boolean = false;
  public isGuest: boolean = false;
  public superDirector: SuperDirector | null = null;

  // 3D Previews on Title & Character Select screens
  private previewRigs: { rig: ModelRig; charId: string; isP1?: boolean }[] = [];
  private previewMode: 'title' | 'select' | 'none' = 'title';
  private previewTimer: number = 0;

  private lifecycle = 0;
  private peaceVictory = false;
  private hurtSpeechAt = new WeakMap<Fighter, number>();
  private accumulator: number = 0;
  private lastTime: number = performance.now();
  private frameCount: number = 0;
  private lastSentInputKey: string = '';
  private prediction = new GuestPrediction();
  private remoteInputFrame = 0;
  private processedInputFrame = 0;
  private remoteInputs: InputState = {
    moveX: 0,
    up: false,
    down: false,
    punch: false,
    kick: false,
    grab: false,
    super: false,
  };

  constructor() {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    try {
      this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } catch (e) {
      console.warn("WebGLRenderer not supported in this environment:", e);
      const message = document.createElement('div');
      message.textContent = 'This game needs WebGL. Enable hardware acceleration or try another browser.';
      message.style.cssText = 'position:fixed;inset:0;z-index:2000;background:#120a06;color:#fff;padding:15vh 10vw;font:24px system-ui';
      document.body.appendChild(message);
      throw e;
    }

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
    this.camera.position.set(0, 2.2, 7.8);

    // Responsive resize handler
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.stageRenderer = new StageRenderer(this.scene);
    this.ui = new UIManager();
    this.input = new InputManager();
    this.newsdesk = new NewsdeskManager();
    this.cpuBot = new Bot('normal');
    this.netClient = new NetworkClient();

    this.bindUiCallbacks();
    document.getElementById('cine-skip')?.addEventListener('click', () => {
      if (!this.superDirector || this.isPaused || this.isOnline) return;
      // Advance every choreography step so damage and completion still occur.
      for (let frame = 0; frame < 1200 && this.superDirector; frame++) this.superDirector.update(FIXED_DELTA_TIME);
    });
    (window as any).gameEngine = this;
    this.setupTitlePreview();
    this.startLoop();
  }

  private clearPreviewRigs(): void {
    for (const item of this.previewRigs) {
      this.scene.remove(item.rig.root);
      item.rig.dispose();
    }
    this.previewRigs = [];
  }

  private setupTitlePreview(): void {
    this.clearPreviewRigs();
    this.previewMode = 'title';
    this.stageRenderer.setStage('sansad');

    const lineup: { id: CharacterId; x: number; z: number; facing: number }[] = [
      { id: 'didi', x: -1.4, z: -0.4, facing: 1 },
      { id: 'yogi', x: -0.48, z: -0.7, facing: 1 },
      { id: 'nitin', x: 0.48, z: -0.7, facing: -1 },
      { id: 'trump', x: 1.4, z: -0.4, facing: -1 },
    ];

    for (const item of lineup) {
      const def = CharacterRegistry.get(item.id);
      const rig = new ModelRig(def, false);
      rig.root.position.set(item.x, 0, item.z);
      rig.yaw = item.facing > 0 ? 0.24 : -0.24;
      rig.root.rotation.set(0, rig.yaw, 0);
      this.scene.add(rig.root);
      this.previewRigs.push({ rig, charId: item.id });
    }
  }

  private setupSelectPreview(): void {
    const p1Id = this.ui.selectedP1;
    const p2Id = this.ui.selectedP2;
    this.stageRenderer.setStage(this.ui.selectedStage || 'sansad');

    const existingP1 = this.previewRigs.find((r) => r.isP1);
    const existingP2 = this.previewRigs.find((r) => !r.isP1);

    if (existingP1 && existingP1.charId === p1Id && existingP2 && existingP2.charId === p2Id && this.previewMode === 'select') {
      return;
    }

    this.clearPreviewRigs();
    this.previewMode = 'select';

    const def1 = CharacterRegistry.get(p1Id);
    const def2 = CharacterRegistry.get(p2Id);

    const rig1 = new ModelRig(def1, false);
    rig1.setTransform(-1.25, 0, 1, 0, 0.4);
    this.scene.add(rig1.root);
    this.previewRigs.push({ rig: rig1, charId: p1Id, isP1: true });

    const rig2 = new ModelRig(def2, p1Id === p2Id);
    rig2.setTransform(1.25, 0, -1, 0, 0.4);
    this.scene.add(rig2.root);
    this.previewRigs.push({ rig: rig2, charId: p2Id, isP1: false });
  }

  private updatePreviewVisuals(dt: number): void {
    this.previewTimer += dt;

    if (this.previewMode === 'title') {
      const swing = Math.sin(this.previewTimer * 0.22) * 0.28;
      const dist = 4.3 * Math.max(1, 1.45 / this.camera.aspect);
      this.camera.position.set(Math.sin(swing) * dist, 1.45, Math.cos(swing) * dist);
      this.camera.lookAt(0, 1.15, 0);

      for (const item of this.previewRigs) {
        const pose = getBaseIdlePose(this.previewTimer, item.charId);
        item.rig.blendTo(pose, 6, dt);
      }
    } else if (this.previewMode === 'select') {
      const swing = Math.sin(this.previewTimer * 0.2) * 0.12;
      const dist = 4.1 * Math.max(1, 1.45 / this.camera.aspect);
      this.camera.position.set(Math.sin(swing) * dist, 1.45, Math.cos(swing) * dist);
      this.camera.lookAt(0, 1.15, 0);

      for (const item of this.previewRigs) {
        const pose = item.isP1
          ? getIntroPose(this.previewTimer, item.charId)
          : getBaseIdlePose(this.previewTimer, item.charId);
        item.rig.blendTo(pose, 6, dt);
      }
    }
  }

  private bindUiCallbacks(): void {
    this.ui.onResumeFight = () => this.setPaused(false);
    this.ui.onPauseFight = () => this.setPaused(true);

    this.ui.onQuitToSelect = () => {
      this.isPaused = false;
      this.state = 'idle';
      this.cleanupFight();
      this.setupSelectPreview();
      soundEngine.setTrack('background');

      if (this.isOnline) {
        this.refreshLobbyLabels();
        this.netClient.sendNetEvent({ type: 'net_event', event: 'return_to_select' });
      }
    };

    this.ui.onScreenChange = (screen) => {
      this.input.enabled = screen === 'hud';
      this.input.clear();
      if (screen === 'title') {
        this.setupTitlePreview();
      } else if (screen === 'select') {
        this.setupSelectPreview();
      } else if (screen === 'hud') {
        this.clearPreviewRigs();
        this.previewMode = 'none';
      }
    };

    this.ui.onStartFight = () => {
      if (this.isOnline) {
        if (this.isGuest) {
          // Guest waits for host to start
          return;
        }
        this.netClient.startMatch(
          this.ui.selectedStage,
          this.ui.selectedP1,
          this.ui.selectedP2
        );
      }
      this.startMatch(
        this.ui.selectedP1,
        this.ui.selectedP2,
        this.ui.selectedStage,
        this.ui.selectedDifficulty,
        this.isOnline
      );
    };

    this.ui.onSelectionChanged = (p1, p2) => {
      if (this.previewMode === 'select') {
        this.setupSelectPreview();
      }
      if (this.isOnline) {
        if (this.isGuest) {
          this.netClient.sendLobbyUpdate({
            hostChar: this.ui.selectedP1,
            guestChar: p2,
            stage: this.ui.selectedStage,
          });
        } else {
          this.netClient.sendLobbyUpdate({
            hostChar: p1,
            guestChar: this.ui.selectedP2,
            stage: this.ui.selectedStage,
          });
        }
      }
    };

    this.ui.onRematch = () => {
      if (this.isOnline) {
        this.netClient.sendNetEvent({ type: 'net_event', event: 'rematch' });
      }
      this.startMatch(
        this.fighter1.definition.id,
        this.fighter2.definition.id,
        this.stageRenderer.currentStageId,
        this.ui.selectedDifficulty,
        this.isOnline
      );
    };

    this.ui.onHostRoom = async () => {
      try {
        await this.netClient.connect();
        this.netClient.createRoom();
      } catch (err: any) {
        this.ui.showOnlineError(err?.message || 'Could not connect to multiplayer server on port 8080.');
      }
    };

    this.ui.onJoinRoom = async (code: string) => {
      try {
        await this.netClient.connect();
        this.netClient.joinRoom(code);
      } catch (err: any) {
        this.ui.showOnlineError(err?.message || 'Could not connect to multiplayer server on port 8080.');
      }
    };

    this.ui.onLeaveOnline = () => {
      this.state = 'idle';
      this.isPaused = false;
      this.cleanupFight();
      this.ui.showScreen('select');
      this.netClient.disconnect();
      this.isOnline = false;
      this.isGuest = false;
      this.ui.isOnline = false;
      this.ui.isGuest = false;
      this.ui.setNetBadge(null);
      this.ui.setNetAway(false);
      const fightBtn = document.getElementById('fight-btn');
      const p1PlateTag = document.querySelector('#plate-p1 .plate-tag');
      const p2PlateTag = document.querySelector('#plate-p2 .plate-tag');
      if (fightBtn) fightBtn.textContent = 'FIGHT!';
      if (p1PlateTag) p1PlateTag.textContent = '1P · YOU';
      if (p2PlateTag) p2PlateTag.textContent = 'CPU';
      document.querySelectorAll('.cur.p2').forEach((el) => { el.textContent = 'CPU'; });
      this.ui.pickTarget = 'p1';
    };

    this.netClient.onRoomCreated = (code) => {
      this.ui.setRoomCode(code);
      this.ui.showOnlinePanel('hosting');
    };

    this.netClient.onRoomJoined = (code, role) => {
      soundEngine.uiConfirm();
      this.isOnline = true;
      this.isGuest = role === 'guest';
      this.ui.isOnline = true;
      this.ui.isGuest = this.isGuest;
      this.ui.setNetBadge(`ROOM: ${code} · ${role === 'host' ? 'HOST (1P)' : 'GUEST (2P)'}`);
      this.ui.showScreen('select');
      this.refreshLobbyLabels();

      if (!this.isGuest) {
        this.netClient.sendLobbyUpdate({
          hostChar: this.ui.selectedP1,
          guestChar: this.ui.selectedP2,
          stage: this.ui.selectedStage,
        });
      }
    };

    this.netClient.onLobbyUpdate = (state) => {
      if (this.isGuest) {
        if (state.hostChar) this.ui.selectedP1 = state.hostChar;
        if (state.stage) this.ui.selectedStage = state.stage;
      } else {
        if (state.guestChar) this.ui.selectedP2 = state.guestChar;
      }
      this.ui.updateSelectView(false);
      if (this.previewMode === 'select') {
        this.setupSelectPreview();
      }
    };

    this.netClient.onMatchStart = (msg) => {
      this.startMatch(msg.p1Char, msg.p2Char, msg.stage, 'normal', true);
    };

    this.netClient.onRemoteInput = (input, frame) => {
      if (frame <= this.remoteInputFrame) return;
      this.remoteInputFrame = frame;
      // Preserve one-shot presses until the next host simulation tick.
      this.remoteInputs = { ...input,
        punch: input.punch || this.remoteInputs.punch,
        kick: input.kick || this.remoteInputs.kick,
        grab: input.grab || this.remoteInputs.grab,
        super: input.super || this.remoteInputs.super,
      };
    };

    this.netClient.onSnapshot = (snap) => {
      if (!this.isOnline || !this.isGuest || this.state === 'idle' || !this.fighter1 || !this.fighter2) return;
      if (this.state === 'super_cinematic') return;

      this.roundTimeLeft = snap.timer;
      this.ui.updateTimer(this.roundTimeLeft);
      this.ui.updatePeace(snap.f2.peaceCharge / (this.fighter1.definition.peaceGoalSeconds ?? 1), !!this.fighter1.definition.peaceGoalSeconds);

      // P1 (Host) is remote to Guest
      if (!this.prediction.reconcile(snap.frame, snap.ackInputFrame ?? 0, this.fighter1, this.fighter2, snap.f1, snap.f2, this.state === 'fighting' && !this.isPaused)) return;

      this.ui.updateHealth(this.fighter1.health / this.fighter1.maxHealth * 100, this.fighter2.health / this.fighter2.maxHealth * 100);
      this.ui.updateMeters(this.fighter1.meter, this.fighter2.meter);
      this.ui.showCombo('left', this.fighter2.comboHits);
      this.ui.showCombo('right', this.fighter1.comboHits);
    };

    this.netClient.onNetEvent = async (event) => {
      const lifecycle = this.lifecycle;
      switch (event.event) {
        case 'pause':
          this.setPaused(event.paused, false);
          break;
        case 'hit':
          if (!this.fighter1 || !this.fighter2 || this.state === 'idle') return;
          this.handleCombatImpact({
            blocked: event.blocked ?? false,
            knockdown: event.knockdown ?? false,
            moveId: event.moveId ?? 'jab',
            damage: event.damage ?? 0,
            attacker: event.attacker === 'p1' ? this.fighter1 : this.fighter2,
            defender: event.attacker === 'p1' ? this.fighter2 : this.fighter1,
            grab: event.moveId === 'grab' ? (event.blocked ? 'break' : 'connect') : undefined,
            x: (event.attacker === 'p1' ? this.fighter2 : this.fighter1).x,
            y: 1.2,
          });
          break;

        case 'super_end':
          this.superDirector?.finish(false);
          this.superDirector = null;
          this.state = 'fighting';
          break;

        case 'super_trigger':
          if (!this.fighter1 || !this.fighter2) return;
          if (event.attacker === 'p1') {
            this.triggerSuper(this.fighter1, this.fighter2);
          } else {
            this.triggerSuper(this.fighter2, this.fighter1);
          }
          break;

        case 'round_over':
          this.peaceVictory = event.peace ?? false;
          this.state = 'round_over';
          if (this.fighter1 && this.fighter2) {
            this.fighter1.wins = event.p1Wins;
            this.fighter2.wins = event.p2Wins;
            this.ui.updateWins(event.p1Wins, event.p2Wins);
          }
          soundEngine.announce(event.timeUp ? 'time_up' : 'ko');
          this.ui.announceText(event.peace ? 'SHANTI KI JEET!' : event.timeUp ? 'TIME UP!' : 'K.O.!', event.timeUp ? '' : 'ko', 1400);
          break;

        case 'round_start':
          this.currentRound = event.round;
          this.startRound();
          break;

        case 'match_over': {
          this.peaceVictory = event.peace ?? false;
          this.state = 'match_decided';
          if (!this.fighter1 || !this.fighter2) return;
          this.fighter1.wins = event.p1Wins;
          this.fighter2.wins = event.p2Wins;
          this.ui.updateWins(this.fighter1.wins, this.fighter2.wins);

          const guestWon = event.p2Wins >= 2;
          const winFighter = guestWon ? this.fighter2 : this.fighter1;
          const loseFighter = guestWon ? this.fighter1 : this.fighter2;

          winFighter.forceState('victory');
          loseFighter.forceState(this.peaceVictory ? 'frozen' : 'ko');

          soundEngine.matchJingle(guestWon);
          soundEngine.announce(guestWon ? 'you_win' : 'you_lose');

          await new Promise((r) => setTimeout(r, 1600));
          if (lifecycle !== this.lifecycle) return;

          this.ui.showResultNewspaper(
            event.winner,
            event.loser,
            [event.p1Wins, event.p2Wins],
            this.peaceVictory,
            guestWon
          );
          break;
        }

        case 'return_to_select':
          this.isPaused = false;
          this.state = 'idle';
          this.cleanupFight();
          this.ui.showScreen('select');
          this.refreshLobbyLabels();
          this.setupSelectPreview();
          soundEngine.setTrack('background');
          break;

        case 'rematch':
          if (this.fighter1 && this.fighter2) {
            this.startMatch(
              this.fighter1.definition.id,
              this.fighter2.definition.id,
              this.stageRenderer.currentStageId,
              'normal',
              true
            );
          }
          break;
      }
    };

    this.netClient.onRematch = () => {
      if (this.fighter1 && this.fighter2) {
        this.startMatch(
          this.fighter1.definition.id,
          this.fighter2.definition.id,
          this.stageRenderer.currentStageId,
          'normal',
          true
        );
      }
    };

    this.netClient.onPeerDisconnect = () => {
      if (this.isOnline) {
        this.setPaused(true, false);
        this.ui.setNetAway(true);
      }
    };

    this.netClient.onError = (err) => {
      this.ui.showOnlineError(err);
    };

    this.input.onMuteToggle = () => document.getElementById('sound-btn')?.click();
    this.input.onMusicToggle = () => soundEngine.toggleMusic();
    this.input.onPauseToggle = () => {
      if (this.state === 'fighting' || this.state === 'super_cinematic') {
        this.setPaused(!this.isPaused);
      }
    };
  }

  private setPaused(paused: boolean, broadcast = true): void {
    this.isPaused = paused;
    this.input.clear();
    this.ui.showPause(paused);
    if (broadcast && this.isOnline) {
      this.netClient.sendNetEvent({ type: 'net_event', event: 'pause', paused });
    }
  }

  private refreshLobbyLabels(): void {
    const fightBtn = document.getElementById('fight-btn');
    const p1PlateTag = document.querySelector('#plate-p1 .plate-tag');
    const p2PlateTag = document.querySelector('#plate-p2 .plate-tag');
    if (this.isOnline) {
      document.querySelectorAll('.cur.p2').forEach((el) => { el.textContent = '2P'; });
      if (this.isGuest) {
        if (fightBtn) fightBtn.textContent = 'WAITING FOR HOST…';
        if (p1PlateTag) p1PlateTag.textContent = '1P · HOST';
        if (p2PlateTag) p2PlateTag.textContent = '2P · YOU';
        this.ui.pickTarget = 'p2';
      } else {
        if (fightBtn) fightBtn.textContent = 'FIGHT!';
        if (p1PlateTag) p1PlateTag.textContent = '1P · YOU';
        if (p2PlateTag) p2PlateTag.textContent = '2P · GUEST';
        this.ui.pickTarget = 'p1';
      }
    }
  }

  public async startMatch(
    p1Id: CharacterId,
    p2Id: CharacterId,
    stageId: StageId,
    difficulty: CpuDifficulty,
    online: boolean = false
  ): Promise<void> {
    this.cleanupFight();
    const lifecycle = this.lifecycle;
    this.state = 'idle';
    this.clearPreviewRigs();
    this.previewMode = 'none';

    this.peaceVictory = false;
    this.isOnline = online;
    this.isPaused = false;
    this.stageRenderer.setStage(stageId);
    this.cpuBot.setDifficulty(difficulty);

    const def1 = CharacterRegistry.get(p1Id);
    const def2 = CharacterRegistry.get(p2Id);

    // Initialize Fighters
    this.fighter1 = new Fighter(def1, true, 'left');
    this.fighter2 = new Fighter(def2, !online, 'right');

    // Initialize 3D Model Rigs
    this.rig1 = new ModelRig(def1, false);
    this.rig2 = new ModelRig(def2, p1Id === p2Id); // P2 gets alternate palette if mirror match

    this.scene.add(this.rig1.root);
    this.scene.add(this.rig2.root);

    // Initialize UI HUD
    this.ui.initHud(def1, def2);
    this.ui.showScreen('loading');
    const loaded = await Promise.all([this.rig1.ready, this.rig2.ready]);
    if (lifecycle !== this.lifecycle) return;
    if (loaded.some(success => !success)) {
      this.cleanupFight();
      this.ui.showScreen('select');
      this.ui.showPopup('A fighter model could not load. Check the connection and retry.', window.innerWidth / 2, window.innerHeight / 2, '#fff');
      return;
    }
    this.ui.showScreen('hud');
    this.newsdesk.resetMatch();

    // Start background battle music
    soundEngine.setTrack('battle', 0.8);

    this.currentRound = 1;
    this.startRound();
  }

  private async startRound(): Promise<void> {
    const lifecycle = ++this.lifecycle;
    this.cpuBot.reset();
    this.input.clear();
    this.remoteInputs = { moveX: 0, up: false, down: false, punch: false, kick: false, grab: false, super: false };
    this.lastSentInputKey = '';
    this.state = 'round_intro';
    this.roundTimeLeft = 60;
    this.fighter1.resetRound();
    this.fighter2.resetRound();
    this.fighter1.forceState('intro');
    this.fighter2.forceState('intro');

    // Round Voice & Announcement
    const roundText =
      this.currentRound === 1
        ? 'ROUND 1'
        : this.currentRound === 2
        ? 'ROUND 2'
        : 'FINAL ROUND';
    const roundVoice =
      this.currentRound === 1
        ? 'round_1'
        : this.currentRound === 2
        ? 'round_2'
        : 'final_round';

    soundEngine.announce(roundVoice);
    await this.ui.announceText(roundText, '', 1000);
    if (lifecycle !== this.lifecycle) return;

    soundEngine.announce('fight');
    await this.ui.announceText('FIGHT!', 'fight', 650);
    if (lifecycle !== this.lifecycle) return;
    this.input.clear();
    for (const fighter of [this.fighter1, this.fighter2]) {
      if (!fighter.definition.hitLine) continue;
      const point = this.toScreen(fighter.x, fighter.y + 2);
      this.ui.showSpeech(fighter.definition.introLine, point.x, point.y, '', `fighter-${fighter.side}`);
    }

    // Release both fighters into actionable idle state
    this.fighter1.forceState('idle');
    this.fighter2.forceState('idle');
    this.state = 'fighting';
  }

  private updateCamera(dt: number): void {
    if (!this.fighter1 || !this.fighter2) return;

    // Center camera on midpoint between fighters
    const midX = (this.fighter1.x + this.fighter2.x) / 2;
    const midY = (this.fighter1.y + this.fighter2.y) / 2 + 1.25;
    const distance = Math.abs(this.fighter1.x - this.fighter2.x);

    // Dynamic zoom based on separation
    const cinematic = this.state === 'super_cinematic';
    const targetZ = Math.max(cinematic ? 9.2 : 6.2, 5.0 + distance * 0.7, (distance / 2 + 1.1) / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect));
    const targetX = midX * 0.75;
    const targetY = cinematic ? 2.1 : Math.max(1.8, midY * 0.8 + 0.6);

    const alpha = 1 - Math.pow(0.92, dt * 60);
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetX, alpha);
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetY, alpha);
    this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetZ, alpha);

    this.camera.lookAt(targetX, targetY - 0.2, 0);
  }

  private fixedUpdate(): void {
    if (this.isPaused) return;
    if (this.state !== 'fighting') {
      if ((this.state === 'round_over' || this.state === 'match_decided' || this.state === 'round_intro') && this.fighter1 && this.fighter2) {
        const neutral = NEUTRAL_INPUT;
        // Continue KO gravity and animation clocks while match actions are locked.
        this.fighter1.update(neutral, this.fighter2);
        this.fighter2.update(neutral, this.fighter1);
      }
      return;
    }

    this.frameCount++;

    // 1. Poll Inputs
    let p1Input: InputState;
    let p2Input: InputState;

    if (this.isOnline) {
      const localInput = this.input.pollInputs();
      // Only the guest sends commands. Predict immediately, then replay inputs
      // newer than the host's acknowledgement when the next snapshot arrives.
      if (this.isGuest) {
        const sequence = this.prediction.predict(this.fighter2, this.fighter1, localInput);
        this.netClient.sendInput(sequence, localInput);
      } else this.processedInputFrame = this.remoteInputFrame;

      if (this.isGuest) {
        p1Input = { ...this.remoteInputs };
        p2Input = localInput;
      } else {
        p1Input = localInput;
        p2Input = { ...this.remoteInputs };
      }
      this.remoteInputs.punch = false;
      this.remoteInputs.kick = false;
      this.remoteInputs.grab = false;
      this.remoteInputs.super = false;
    } else {
      p1Input = this.input.pollInputs();
      p2Input = this.cpuBot.think(this.fighter2, this.fighter1, FIXED_DELTA_TIME);
    }

    // Guest renders complete authoritative snapshots; it never advances combat twice.
    if (this.isOnline && this.isGuest) return;

    // 2. Super Move Trigger Check
    if (p1Input.super && this.fighter1.meter >= 100 && this.fighter1.actionable) {
      if (this.isOnline && !this.isGuest) {
        this.netClient.sendNetEvent({
          type: 'net_event',
          event: 'super_trigger',
          attacker: 'p1',
        });
      }
      this.triggerSuper(this.fighter1, this.fighter2);
      return;
    }
    if (p2Input.super && this.fighter2.meter >= 100 && this.fighter2.actionable) {
      if (this.isOnline && !this.isGuest) {
        this.netClient.sendNetEvent({
          type: 'net_event',
          event: 'super_trigger',
          attacker: 'p2',
        });
      }
      this.triggerSuper(this.fighter2, this.fighter1);
      return;
    }

    // 3. Update Fighter State Machines
    this.fighter1.update(p1Input, this.fighter2);
    this.fighter2.update(p2Input, this.fighter1);

    const p1Peace = updatePeaceCharge(this.fighter1, this.fighter2, p1Input, FIXED_DELTA_TIME);
    const p2Peace = updatePeaceCharge(this.fighter2, this.fighter1, p2Input, FIXED_DELTA_TIME);
    this.ui.updatePeace(this.fighter1.peaceCharge / (this.fighter2.definition.peaceGoalSeconds ?? 1), !!this.fighter2.definition.peaceGoalSeconds);
    if (p1Peace || p2Peace) {
      const winner = p1Peace ? this.fighter1 : this.fighter2;
      this.peaceVictory = true;
      winner.wins = 1;
      this.fighter1.peaceful = true;
      this.fighter2.peaceful = true;
      this.completeRound(winner, false);
      return;
    }

    // 4. Resolve Pushbox Overlaps
    resolvePushboxCollision(this.fighter1, this.fighter2);

    // 5. Check Attack Collisions
    let hit1: HitResult | null = null;
    let hit2: HitResult | null = null;
    if (!this.isOnline || !this.isGuest) {
      [hit1, hit2] = resolveCombatExchange(this.fighter1, this.fighter2);

      if (hit1) {
        this.handleCombatImpact(hit1);
        if (this.isOnline) {
          this.netClient.sendNetEvent({
            type: 'net_event',
            event: 'hit',
            attacker: 'p1',
            moveId: hit1.moveId,
            damage: hit1.damage,
            blocked: hit1.blocked,
            knockdown: hit1.knockdown,
          });
        }
      }
      if (hit2) {
        this.handleCombatImpact(hit2);
        if (this.isOnline) {
          this.netClient.sendNetEvent({
            type: 'net_event',
            event: 'hit',
            attacker: 'p2',
            moveId: hit2.moveId,
            damage: hit2.damage,
            blocked: hit2.blocked,
            knockdown: hit2.knockdown,
          });
        }
      }
    }

    // 6. Host Broadcasts Authoritative State Snapshots (every 2 frames ~30Hz or immediately on hit)
    if (this.isOnline && !this.isGuest) {
      if (this.frameCount % 2 === 0 || hit1 || hit2) {
        this.netClient.sendSnapshot(
          this.frameCount,
          this.roundTimeLeft,
          this.fighter1.getSnapshot(),
          this.fighter2.getSnapshot(),
          this.processedInputFrame
        );
      }
    }

    // 7. Manage Round Timer & KO Checks (Authoritative on Host / Offline)
    if (!this.isOnline || !this.isGuest) {
      if (this.state === 'fighting') {
        this.roundTimeLeft -= FIXED_DELTA_TIME;
        this.ui.updateTimer(this.roundTimeLeft);

        if (this.roundTimeLeft <= 0) {
          this.handleTimeUp();
        }
      }

      if (this.fighter1.health <= 0 || this.fighter2.health <= 0) {
        this.handleKo();
      }
    }

    // 8. Update In-fight HUD
    this.ui.updateHealth(this.fighter1.health / this.fighter1.maxHealth * 100, this.fighter2.health / this.fighter2.maxHealth * 100);
    this.ui.updateMeters(this.fighter1.meter, this.fighter2.meter);
    this.ui.showCombo('left', this.fighter2.comboHits);
    this.ui.showCombo('right', this.fighter1.comboHits);
  }

  public triggerSuper(attacker: Fighter, defender: Fighter): void {
    if (this.state !== 'fighting' || attacker.health <= 0 || defender.health <= 0 || (!(this.isOnline && this.isGuest) && (!attacker.actionable || attacker.meter < 100))) return;
    this.prediction.clearPending();
    const lifecycle = this.lifecycle;
    this.state = 'super_cinematic';

    attacker.consumeSuper();
    attacker.forceState('super');
    defender.forceState('frozen');

    // Announce Super Move Banner & Newsdesk Reaction
    this.newsdesk.setSuperReaction(attacker.definition.id);

    const attRig = attacker === this.fighter1 ? this.rig1 : this.rig2;
    const defRig = defender === this.fighter1 ? this.rig1 : this.rig2;

    this.superDirector = new SuperDirector({
      boss: !this.isOnline && attacker === this.fighter2 && attacker.definition.id === 'mbapu',
      scene: this.scene,
      camera: this.camera,
      ui: this.ui,
      attacker,
      defender,
      attRig,
      defRig,
      onFinish: () => {
        if (lifecycle !== this.lifecycle) return;
        this.superDirector = null;
        if (this.isOnline && this.isGuest) {
          if (this.state === 'super_cinematic') this.state = 'fighting';
          return;
        }
        if (this.isOnline) this.netClient.sendNetEvent({ type: 'net_event', event: 'super_end' });
        this.state = 'fighting';

        // Attacker is actionable immediately
        attacker.forceState('idle');
        attacker.currentAttack = null;

        // If defender was KO'd by super, trigger KO immediately
        if (defender.health <= 0) {
          this.handleKo();
        } else {
          // Defender smoothly rises from getup into combat stance
          defender.forceState('getup');
          defender.stunFrames = 24;
          defender.invulnerableFrames = 18;
        }
        this.broadcastSnapshot();
      },
    });

    const director = this.superDirector;
    director.play().catch((error: unknown) => {
      console.error('Super cinematic failed:', error);
      if (lifecycle === this.lifecycle) director.finish();
    });
  }

  public toScreen(worldX: number, worldY: number, worldZ: number = 0): { x: number; y: number } {
    const v = new THREE.Vector3(worldX, worldY, worldZ).project(this.camera);
    return {
      x: ((v.x + 1) * window.innerWidth) / 2,
      y: ((-v.y + 1) * window.innerHeight) / 2,
    };
  }

  private handleCombatImpact(hit: CombatImpact): void {
    if (!hit.blocked && hit.damage > 0 && hit.defender.definition.hurtLine && this.frameCount - (this.hurtSpeechAt.get(hit.defender) ?? -150) >= 150) {
      this.hurtSpeechAt.set(hit.defender, this.frameCount);
      const point = this.toScreen(hit.defender.x, hit.defender.y + 2);
      this.ui.showSpeech(hit.defender.definition.hurtLine, point.x, point.y, '', `fighter-${hit.defender.side}`);
    }
    if (!hit.blocked && hit.attacker.definition.hitLine && (hit.moveId === 'special1' || hit.moveId === 'special2')) {
      const point = this.toScreen(hit.attacker.x, hit.attacker.y + 2);
      this.ui.showSpeech(hit.attacker.definition.hitLine, point.x, point.y, '', `fighter-${hit.attacker.side}`);
    }
    if (hit.grab === 'break') {
      const pos = this.toScreen(hit.x, hit.y);
      this.ui.showPopup('THROW BREAK!', pos.x, pos.y, '#7fd6ff');
      soundEngine.playSound('block', 0.95);
      this.ui.shake(0.12, 0.15);
      return;
    }

    if (hit.grab === 'connect') {
      const pos = this.toScreen(hit.x, hit.y);
      const grabName = hit.attacker?.definition?.moveNames?.grab || 'GRAB!';
      const color = hit.attacker?.definition?.accent || '#ffd000';
      this.ui.showPopup(grabName, pos.x, pos.y, color);
      soundEngine.playSound('hit_3', 1.0);
      this.ui.shake(0.35, 0.25);
      return;
    }

    if (hit.blocked) {
      soundEngine.playSound('block', 0.85);
    } else {
      // Play crisp impact sound
      const sfx = hit.knockdown ? 'hit_3' : Math.random() < 0.5 ? 'hit_1' : 'hit_2';
      soundEngine.playSound(sfx, 1.0);
      if (hit.damage > 0) {
        this.ui.shake(hit.knockdown ? 0.22 : 0.1, 0.12);
      }
    }
  }

  private handleKo(): Promise<void> {
    const winner = this.fighter1.health > 0 ? this.fighter1 : this.fighter2.health > 0 ? this.fighter2 : null;
    return this.completeRound(winner, false);
  }

  private handleTimeUp(): Promise<void> {
    const winner = this.fighter1.health === this.fighter2.health ? null :
      this.fighter1.health > this.fighter2.health ? this.fighter1 : this.fighter2;
    return this.completeRound(winner, true);
  }

  private async completeRound(winner: Fighter | null, timeUp: boolean): Promise<void> {
    if (this.isGuest && this.isOnline) return;
    if (this.state === 'round_over' || this.state === 'match_decided') return;
    const lifecycle = this.lifecycle;
    this.state = 'round_over';
    if (winner) {
      winner.wins++;
      winner.currentAttack = null;
      winner.forceState('victory');
      const loser = winner === this.fighter1 ? this.fighter2 : this.fighter1;
      loser.currentAttack = null;
      loser.forceState(this.peaceVictory ? 'frozen' : 'ko');
    }
    this.ui.updateWins(this.fighter1.wins, this.fighter2.wins);
    this.broadcastSnapshot();
    if (this.isOnline) {
      this.netClient.sendNetEvent({ type: 'net_event', event: 'round_over',
        p1Wins: this.fighter1.wins, p2Wins: this.fighter2.wins, timeUp, peace: this.peaceVictory });
    }
    soundEngine.announce(timeUp ? 'time_up' : 'ko');
    await this.ui.announceText(this.peaceVictory ? 'SHANTI KI JEET!' : timeUp ? 'TIME UP!' : 'K.O.!', timeUp ? '' : 'ko', 1400);
    if (lifecycle !== this.lifecycle) return;
    this.checkMatchEnd();
  }

  private broadcastSnapshot(): void {
    if (!this.isOnline || this.isGuest) return;
    this.netClient.sendSnapshot(this.frameCount, this.roundTimeLeft,
      this.fighter1.getSnapshot(), this.fighter2.getSnapshot(), this.processedInputFrame);
  }

  private async checkMatchEnd(): Promise<void> {
    const lifecycle = this.lifecycle;
    if (this.fighter1.wins >= 2 || this.fighter2.wins >= 2) {
      this.state = 'match_decided';
      const p1Won = this.fighter1.wins >= 2;
      const winner = p1Won ? this.fighter1 : this.fighter2;
      const loser = p1Won ? this.fighter2 : this.fighter1;

      if (this.isOnline && !this.isGuest) {
        this.netClient.sendNetEvent({
          type: 'net_event',
          event: 'match_over',
          winner: winner.definition.id,
          loser: loser.definition.id,
          peace: this.peaceVictory,
          p1Wins: this.fighter1.wins,
          p2Wins: this.fighter2.wins,
        });
      }

      winner.forceState('victory');
      loser.forceState(this.peaceVictory ? 'frozen' : 'ko');

      const isLocalWinner = this.isGuest ? !p1Won : p1Won;

      if (winner.definition.hitLine) {
        const point = this.toScreen(winner.x, winner.y + 2);
        this.ui.showSpeech(winner.definition.winLine, point.x, point.y, '', `fighter-${winner.side}`);
      }
      soundEngine.matchJingle(isLocalWinner);
      soundEngine.announce(isLocalWinner ? 'you_win' : 'you_lose');

      await new Promise((r) => setTimeout(r, 1600));
      if (lifecycle !== this.lifecycle) return;

      this.ui.showResultNewspaper(
        winner.definition.id,
        loser.definition.id,
        [this.fighter1.wins, this.fighter2.wins],
        this.peaceVictory,
        isLocalWinner
      );
    } else {
      if (this.isOnline && !this.isGuest) {
        this.netClient.sendNetEvent({
          type: 'net_event',
          event: 'round_start',
          round: this.currentRound + 1,
        });
      }
      this.currentRound++;
      this.startRound();
    }
  }

  private cleanupFight(): void {
    this.prediction.reset();
    this.remoteInputFrame = 0;
    this.processedInputFrame = 0;
    ++this.lifecycle;
    this.input.clear();
    this.accumulator = 0;
    this.ui.clearTransientEffects();
    if (this.superDirector) {
      this.superDirector.finish(false);
      this.superDirector = null;
    }
    if (this.rig1) {
      this.rig1.root.visible = false;
      this.scene.remove(this.rig1.root);
      this.rig1.dispose();
    }
    if (this.rig2) {
      this.rig2.root.visible = false;
      this.scene.remove(this.rig2.root);
      this.rig2.dispose();
    }
  }

  private startLoop(): void {
    const loop = (currentTime: number) => {
      requestAnimationFrame(loop);

      const delta = Math.min(0.1, (currentTime - this.lastTime) / 1000);
      this.lastTime = currentTime;

      // Fixed update physics accumulator
      this.accumulator += delta;
      while (this.accumulator >= FIXED_DELTA_TIME) {
        this.fixedUpdate();
        this.accumulator -= FIXED_DELTA_TIME;
      }

      // Update active Super Cinematic if playing
      if (!this.isPaused && this.state === 'super_cinematic' && this.superDirector) {
        this.superDirector.update(delta);
      }
      if (this.state === 'super_cinematic' && this.fighter1 && this.fighter2) {
        this.ui.updateHealth(this.fighter1.health / this.fighter1.maxHealth * 100, this.fighter2.health / this.fighter2.maxHealth * 100);
      }

      // Update Rigs & Visual Animations
      if (this.previewMode === 'none' && this.rig1 && this.fighter1) {
        if (this.state === 'super_cinematic') this.rig1.setTransform(this.fighter1.x, this.fighter1.y, this.fighter1.facing, this.isPaused ? 0 : delta);
        else this.rig1.update(this.fighter1, this.isPaused ? 0 : delta);
      }
      if (this.previewMode === 'none' && this.rig2 && this.fighter2) {
        if (this.state === 'super_cinematic') this.rig2.setTransform(this.fighter2.x, this.fighter2.y, this.fighter2.facing, this.isPaused ? 0 : delta);
        else this.rig2.update(this.fighter2, this.isPaused ? 0 : delta);
      }

      if (this.isOnline && this.isGuest && this.state === 'fighting' && this.rig1 && this.rig2) {
        this.prediction.decay(this.isPaused ? 0 : delta);
        [this.rig1, this.rig2].forEach((rig, index) => {
          rig.root.position.x += this.prediction.correction[index].x;
          rig.root.position.y += this.prediction.correction[index].y;
        });
      }

      // Update Stage Environment & Shaders
      this.stageRenderer.update(delta, currentTime / 1000);

      // Update 3D Preview Rigs or In-Fight Camera Tracking
      if (this.previewMode !== 'none') {
        this.updatePreviewVisuals(delta);
      } else {
        this.updateCamera(this.isPaused ? 0 : delta);
      }

      if (this.superDirector) {
        this.camera.updateMatrixWorld(true);
        this.superDirector.refreshScreenEffects();
      }

      // Render Three.js Scene
      this.renderer.render(this.scene, this.camera);
    };

    requestAnimationFrame(loop);
  }
}
