import { GameEngine } from './game/GameEngine';
import { SaveManager } from './storage/SaveManager';

const engine = new GameEngine();
const screens = ['menu-main', 'menu-host', 'menu-join', 'menu-settings', 'hud'].map(id => document.getElementById(id)!);
function showScreen(el: HTMLElement) { screens.forEach(s => s.classList.add('hidden')); el.classList.remove('hidden'); }

document.getElementById('btn-singleplayer')!.onclick = async () => {
  engine.net.role = 'single'; document.getElementById('lbl-mode')!.textContent = 'SINGLEPLAYER';
  showScreen(screens[4]); await engine.startSession(parseInt((document.getElementById('inp-seed') as HTMLInputElement).value, 10) || 2026, true);
};

document.getElementById('btn-create-lan')!.onclick = async () => {
  showScreen(screens[1]);
  const info = await engine.net.startHostServer('CHRONOS LAN', parseInt((document.getElementById('inp-seed') as HTMLInputElement).value, 10) || 2026);
  document.getElementById('host-ip')!.textContent = info.ip; document.getElementById('host-port')!.textContent = String(info.port);
  engine.net.onPeerCountChanged = (cnt) => { document.getElementById('host-players-cnt')!.textContent = `${cnt} / 8`; };
};

document.getElementById('btn-host-start')!.onclick = async () => {
  document.getElementById('lbl-mode')!.textContent = `LAN HOST (${engine.net.hostIp})`;
  showScreen(screens[4]); await engine.startSession(parseInt((document.getElementById('inp-seed') as HTMLInputElement).value, 10) || 2026, true);
};

document.getElementById('btn-join-lan')!.onclick = async () => {
  showScreen(screens[2]);
  const list = document.getElementById('discovered-list')!; list.innerHTML = '<div style="color:#94a3b8;font-size:12px;">Listening for LAN Hosts on Wi-Fi...</div>';
  await engine.net.startLanDiscovery();
  engine.net.onHostDiscovered = (name, ip, port) => {
    list.innerHTML = ''; const row = document.createElement('div'); row.className = 'server-item';
    row.innerHTML = `<span><strong>${name}</strong> (${ip}:${port})</span>`;
    const btn = document.createElement('button'); btn.textContent = 'JOIN'; btn.style.padding = '5px 10px';
    btn.onclick = async () => {
      if (await engine.net.connectToHost(ip, 7777)) {
        document.getElementById('lbl-mode')!.textContent = `LAN CLIENT (${ip})`; showScreen(screens[4]); await engine.startSession(2026, false);
      } else alert(`Failed to connect to Host at ${ip}:7777.`);
    };
    row.appendChild(btn); list.appendChild(row);
  };
};

document.getElementById('btn-connect-ip')!.onclick = async () => {
  const ip = (document.getElementById('inp-join-ip') as HTMLInputElement).value;
  if (await engine.net.connectToHost(ip, 7777)) {
    document.getElementById('lbl-mode')!.textContent = `LAN CLIENT (${ip})`; showScreen(screens[4]); await engine.startSession(2026, false);
  } else alert(`Failed to connect to Host at ${ip}:7777.`);
};

document.getElementById('btn-settings')!.onclick = () => showScreen(screens[3]);
document.getElementById('btn-host-back')!.onclick = () => showScreen(screens[0]);
document.getElementById('btn-join-back')!.onclick = () => showScreen(screens[0]);

document.getElementById('btn-settings-back')!.onclick = () => {
  if (engine.world) engine.world.viewDistance = parseInt((document.getElementById('sel-viewdist') as HTMLSelectElement).value, 10);
  engine.touch.sensitivity = parseInt((document.getElementById('inp-sens') as HTMLInputElement).value, 10) * 0.001;
  showScreen(screens[0]);
};

document.getElementById('btn-clear-save')!.onclick = async () => { await SaveManager.clearSave(); alert('Saved world cleared.'); };
document.getElementById('btn-save')!.onclick = async () => { await engine.saveCurrentWorld(); };
document.getElementById('btn-close-modal')!.onclick = () => engine.toggleModal();
document.getElementById('btn-drop-item')!.onclick = () => engine.dropActiveItem();

document.getElementById('tab-inv')!.onclick = () => { document.getElementById('modal-content-inv')!.classList.remove('hidden'); document.getElementById('modal-content-tribes')!.classList.add('hidden'); };
document.getElementById('tab-tribes')!.onclick = () => { document.getElementById('modal-content-inv')!.classList.add('hidden'); document.getElementById('modal-content-tribes')!.classList.remove('hidden'); };
