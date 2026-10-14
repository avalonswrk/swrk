import { GameEngine } from './game/GameEngine';
import { SaveManager } from './storage/SaveManager';
import { Localization, LangCode } from './i18n/Localization';

Localization.init();
let engine: GameEngine | null = null;

const menuMain = document.getElementById('menu-main')!;
const menuHost = document.getElementById('menu-host')!;
const menuJoin = document.getElementById('menu-join')!;
const menuSettings = document.getElementById('menu-settings')!;
const menuPause = document.getElementById('menu-pause')!;
const hud = document.getElementById('hud')!;
const modalInv = document.getElementById('modal-inv')!;
const modalMap = document.getElementById('modal-map')!;

function showScreen(el: HTMLElement) {
  [menuMain, menuHost, menuJoin, menuSettings, menuPause, hud, modalInv, modalMap].forEach((s) => s.classList.add('hidden'));
  el.classList.remove('hidden');
}

function applyLocalization(): void {
  document.getElementById('txt-title')!.textContent = Localization.get('title');
  document.getElementById('txt-subtitle')!.textContent = Localization.get('subtitle');
  document.getElementById('btn-singleplayer')!.textContent = Localization.get('newSingle');
  document.getElementById('btn-create-lan')!.textContent = Localization.get('createLan');
  document.getElementById('btn-join-lan')!.textContent = Localization.get('joinLan');
  document.getElementById('btn-settings')!.textContent = Localization.get('settings');
  document.getElementById('lbl-hp-text')!.textContent = Localization.get('health');
  document.getElementById('lbl-hg-text')!.textContent = Localization.get('hunger');
  document.getElementById('lbl-st-text')!.textContent = Localization.get('stamina');
  document.getElementById('btn-pause-resume')!.textContent = Localization.get('resume');
  document.getElementById('btn-pause-inv')!.textContent = Localization.get('inventory');
  document.getElementById('btn-pause-map')!.textContent = Localization.get('map');
  document.getElementById('btn-pause-save')!.textContent = Localization.get('saveGame');
  document.getElementById('btn-pause-leave')!.textContent = Localization.get('leaveGame');
}

applyLocalization();

document.getElementById('sel-lang')!.onchange = (e) => {
  Localization.setLang((e.target as HTMLSelectElement).value as LangCode);
  applyLocalization();
};

document.getElementById('btn-singleplayer')!.onclick = async () => {
  const seed = parseInt((document.getElementById('inp-seed') as HTMLInputElement).value, 10) || 2026;
  if (!engine) engine = new GameEngine();
  engine.net.role = 'single';
  document.getElementById('lbl-mode')!.textContent = 'SINGLEPLAYER';
  showScreen(hud);
  await engine.startSession(seed, true);
};

document.getElementById('btn-create-lan')!.onclick = async () => {
  showScreen(menuHost);
  const seed = parseInt((document.getElementById('inp-seed') as HTMLInputElement).value, 10) || 2026;
  if (!engine) engine = new GameEngine();
  const info = await engine.net.startHostServer('CHRONOS LAN', seed);
  document.getElementById('host-ip')!.textContent = info.ip;
  document.getElementById('host-port')!.textContent = String(info.port);
  engine.net.onPeerCountChanged = (cnt) => { document.getElementById('host-players-cnt')!.textContent = `${cnt} / 8`; };
};

document.getElementById('btn-host-start')!.onclick = async () => {
  const seed = parseInt((document.getElementById('inp-seed') as HTMLInputElement).value, 10) || 2026;
  document.getElementById('lbl-mode')!.textContent = `LAN HOST (${engine?.net.hostIp})`;
  showScreen(hud);
  await engine!.startSession(seed, true);
};

document.getElementById('btn-join-lan')!.onclick = async () => {
  showScreen(menuJoin);
  const list = document.getElementById('discovered-list')!;
  list.innerHTML = '<div style="color:#94a3b8;font-size:11px;">Scanning Wi-Fi subnet...</div>';
  if (!engine) engine = new GameEngine();
  await engine.net.startLanDiscovery();
  engine.net.onHostDiscovered = (name, ip, port) => {
    list.innerHTML = '';
    const row = document.createElement('div'); row.className = 'server-item';
    row.innerHTML = `<span><strong>${name}</strong> (${ip})</span>`;
    const btn = document.createElement('button'); btn.textContent = 'JOIN'; btn.style.padding = '4px 8px';
    btn.onclick = () => connectToIp(ip);
    row.appendChild(btn); list.appendChild(row);
  };
};

async function connectToIp(ip: string) {
  if (!engine) engine = new GameEngine();
  const ok = await engine.net.connectToHost(ip, 7777);
  if (ok) {
    document.getElementById('lbl-mode')!.textContent = `LAN CLIENT (${ip})`;
    showScreen(hud);
    await engine.startSession(2026, false);
  } else {
    alert(`Failed to connect to Host at ${ip}:7777`);
  }
}

document.getElementById('btn-connect-ip')!.onclick = () => {
  connectToIp((document.getElementById('inp-join-ip') as HTMLInputElement).value);
};

document.getElementById('btn-settings')!.onclick = () => showScreen(menuSettings);
document.getElementById('btn-host-back')!.onclick = () => showScreen(menuMain);
document.getElementById('btn-join-back')!.onclick = () => showScreen(menuMain);
document.getElementById('btn-settings-back')!.onclick = () => showScreen(menuMain);

document.getElementById('btn-clear-save')!.onclick = async () => {
  await SaveManager.clearSave();
  alert('Saved world cleared.');
};

document.getElementById('btn-hud-inv')!.onclick = () => { showScreen(modalInv); engine?.renderInventoryModal(); };
document.getElementById('btn-hud-map')!.onclick = () => { showScreen(modalMap); engine?.renderRtsMap(); };
document.getElementById('btn-hud-pause')!.onclick = () => showScreen(menuPause);

document.getElementById('btn-pause-resume')!.onclick = () => showScreen(hud);
document.getElementById('btn-pause-inv')!.onclick = () => { showScreen(modalInv); engine?.renderInventoryModal(); };
document.getElementById('btn-pause-map')!.onclick = () => { showScreen(modalMap); engine?.renderRtsMap(); };
document.getElementById('btn-pause-save')!.onclick = async () => {
  await engine?.saveCurrentWorld();
  alert('World saved successfully.');
};
document.getElementById('btn-pause-leave')!.onclick = async () => {
  if (engine) {
    engine.stop();
    await engine.net.disconnect();
  }
  showScreen(menuMain);
};

document.getElementById('btn-close-inv')!.onclick = () => showScreen(hud);
document.getElementById('btn-close-map')!.onclick = () => showScreen(hud);
document.getElementById('btn-drop')!.onclick = () => engine?.dropActiveItem();
