import './style.css';
import { CharacterRegistry } from './characters/registry';
import { GameEngine } from './core/GameEngine';
import { preloadAllFighterModels } from './animation/ModelRig';

window.addEventListener('DOMContentLoaded', () => {
  console.log('[College Hood] Initializing platform...');
  CharacterRegistry.initialize();
  const engine = new GameEngine();
  (window as any).__ENGINE__ = engine;
  (window as any).__gameEngine = engine;

  // Background preload sequentially to avoid renderer memory spikes
  setTimeout(() => {
    preloadAllFighterModels().catch(() => {});
  }, 1000);

  // Handle direct join link: ?room=CODE
  const urlParams = new URLSearchParams(window.location.search);
  const room = urlParams.get('room');
  if (room) {
    const code = room.trim().toUpperCase();
    const codeInput = document.getElementById('on-code') as HTMLInputElement;
    if (codeInput) codeInput.value = code;
    engine.ui.showScreen('online');
    engine.ui.showOnlinePanel('connecting');
    const connText = document.getElementById('on-connecting-text');
    if (connText) connText.textContent = `Joining room ${code}…`;
    engine.netClient.connect().then(() => {
      engine.netClient.joinRoom(code);
    }).catch((err) => {
      engine.ui.showOnlineError(err?.message || 'Could not connect to multiplayer server on port 8080.');
    });
  }
});

