import * as THREE from 'three';
import { AnimalEntity, InvSlot, ItemId, ITEMS, PlacedBuilding, RECIPES, RemotePlayer } from '../types';
import { MeshFactory } from '../models/MeshFactory';
import { WorldManager } from '../world/WorldManager';
import { TouchController } from '../player/TouchController';
import { NetworkManager } from '../networking/NetworkManager';
import { SaveManager } from '../storage/SaveManager';

export class GameEngine {
  private renderer: THREE.WebGLRenderer; private scene: THREE.Scene; private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight; private ambientLight: THREE.AmbientLight; private torchLight: THREE.PointLight;
  public world!: WorldManager; public touch!: TouchController; public net = new NetworkManager();
  
  public playerPos = new THREE.Vector3(0, 12, 0); public playerVel = new THREE.Vector3();
  public yaw = 0; public pitch = 0; public onGround = false;
  public hp = 100; public hunger = 100; public stamina = 100; public timeOfDay = 8.0;

  private handPivot = new THREE.Group(); private heldMesh: THREE.Object3D | null = null;
  private swingProgress = 0; private isSwinging = false;
  public inventory: InvSlot[] = []; public activeSlot = 0;
  
  private previewMesh: THREE.Group | null = null; private previewValid = false; private previewPos = new THREE.Vector3();
  public buildings = new Map<string, PlacedBuilding>();
  public animals: AnimalEntity[] = []; public remotePlayers = new Map<number, RemotePlayer>();

  private clock = new THREE.Clock(); private netSyncTimer = 0; private running = false;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x87ceeb); this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.012);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 180);
    
    this.ambientLight = new THREE.AmbientLight(0xdbeafe, 0.55);
    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.2); this.sunLight.castShadow = true;
    this.torchLight = new THREE.PointLight(0xff8800, 0, 14);
    
    this.camera.add(this.torchLight);
    this.handPivot.position.set(0.36, -0.32, -0.58); this.camera.add(this.handPivot);
    this.scene.add(this.ambientLight, this.sunLight, this.camera);

    this.touch = new TouchController(() => this.performAttack(), () => this.performInteractOrBuild(), () => this.toggleModal());
    this.setupNetworkCallbacks();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  public async startSession(seed: number, loadExisting: boolean): Promise<void> {
    this.scene.clear(); this.scene.add(this.ambientLight, this.sunLight, this.camera);
    this.buildings.clear(); this.animals = []; this.remotePlayers.clear();

    this.inventory = Array.from({ length: 20 }, () => ({ id: 'hands' as ItemId, count: 0 }));
    this.inventory[0] = { id: 'stone_axe', count: 1 }; this.inventory[1] = { id: 'stone_pickaxe', count: 1 };
    this.inventory[2] = { id: 'torch', count: 1 }; this.inventory[3] = { id: 'berries', count: 5 }; this.inventory[4] = { id: 'hands', count: 1 };

    const saved = loadExisting ? await SaveManager.loadWorld() : null;
    this.world = new WorldManager(this.scene, saved ? saved.seed : seed);

    if (saved) {
      this.playerPos.set(saved.x, saved.y, saved.z); this.hp = saved.hp; this.hunger = saved.hunger; this.timeOfDay = saved.timeOfDay;
      this.inventory = saved.inventory;
      saved.destroyedUids.forEach((u) => this.world.destroyedUids.add(u));
      saved.buildings.forEach((b) => this.spawnBuildingObject(b.uid, b.type, b.x, b.y, b.z, b.rotY));
    } else {
      this.playerPos.set(0, Math.max(2, this.world.getHeightAndBiome(0, 0).height + 2.2), 0);
    }

    this.world.updateChunks(this.playerPos.x, this.playerPos.z);
    if (this.net.role !== 'client') this.spawnInitialAnimals();

    this.equipSlot(0); this.renderHotbarUI();
    if (!this.running) { this.running = true; this.clock.start(); this.animate(); }
  }

  public equipSlot(slotIndex: number): void {
    this.activeSlot = slotIndex;
    const item = this.inventory[this.activeSlot]?.id || 'hands';
    if (this.heldMesh) this.handPivot.remove(this.heldMesh);
    this.heldMesh = MeshFactory.createItemMesh(item); this.handPivot.add(this.heldMesh);
    this.torchLight.intensity = item === 'torch' ? 2.2 : 0;

    if (this.previewMesh) { this.scene.remove(this.previewMesh); this.previewMesh = null; }
    if (ITEMS[item].isBuildable) {
      this.previewMesh = MeshFactory.createBuildingMesh(item);
      this.previewMesh.traverse((c) => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.45 }); });
      this.scene.add(this.previewMesh);
    }
    this.renderHotbarUI();
  }

  private performAttack(): void {
    if (this.isSwinging) return;
    this.isSwinging = true; this.swingProgress = 0;
    const def = ITEMS[this.inventory[this.activeSlot]?.id || 'hands'];
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);

    for (let i = this.animals.length - 1; i >= 0; i--) {
      const anim = this.animals[i];
      if (this.playerPos.distanceTo(new THREE.Vector3(anim.x, anim.y, anim.z)) < 3.6) {
        anim.hp -= def.damage; anim.state = anim.species === 'wolf' ? 'attack' : 'flee'; anim.stateTimer = 6;
        if (anim.hp <= 0) { this.scene.remove(anim.mesh); this.animals.splice(i, 1); this.addItem('cooked_meat', 2); }
        return;
      }
    }

    let closestUid: string | null = null; let closestDist = 4.0;
    for (const [uid, res] of this.world.resources.entries()) {
      const rPos = new THREE.Vector3(res.x, res.y + 1.0, res.z);
      const dist = this.camera.position.distanceTo(rPos);
      if (dist < closestDist && dir.dot(rPos.clone().sub(this.camera.position).normalize()) > 0.65) { closestDist = dist; closestUid = uid; }
    }

    if (closestUid) {
      const node = this.world.resources.get(closestUid)!;
      node.hp -= def.damage * (node.type === 'tree' ? def.woodBonus : def.rockBonus);
      if (node.hp <= 0) {
        this.world.removeResource(closestUid); this.net.sendResourceDestroy(closestUid);
        if (node.type === 'tree') { this.addItem('wood', 3); this.addItem('stick', 2); }
        else if (node.type === 'rock') this.addItem('stone', 3);
        else if (node.type === 'coal_node') { this.addItem('coal', 2); this.addItem('stone', 1); }
        else if (node.type === 'iron_node') { this.addItem('iron_ore', 2); this.addItem('stone', 1); }
        else if (node.type === 'bush') this.addItem('berries', 3);
        else if (node.type === 'stick_pickup') this.addItem('stick', 2);
      }
    }
  }

  private performInteractOrBuild(): void {
    const slot = this.inventory[this.activeSlot]; if (!slot || slot.count <= 0) return;
    const def = ITEMS[slot.id];
    if (def.isFood) {
      this.hunger = Math.min(100, this.hunger + (def.foodRestore || 20)); this.hp = Math.min(100, this.hp + 8);
      this.consumeActiveItem(1); return;
    }
    if (def.isBuildable && this.previewMesh && this.previewValid) {
      const uid = `bld_${Date.now()}_${Math.floor(Math.random() * 999)}`;
      this.spawnBuildingObject(uid, slot.id, this.previewPos.x, this.previewPos.y, this.previewPos.z, this.yaw);
      this.net.sendBuildingPlace(uid, slot.id, this.previewPos.x, this.previewPos.y, this.previewPos.z, this.yaw);
      this.consumeActiveItem(1);
    }
  }

  public spawnBuildingObject(uid: string, type: ItemId, x: number, y: number, z: number, rotY: number): void {
    if (this.buildings.has(uid)) return;
    const mesh = MeshFactory.createBuildingMesh(type); mesh.position.set(x, y, z); mesh.rotation.y = rotY; this.scene.add(mesh);
    let light: THREE.PointLight | undefined;
    if (type === 'campfire') { light = new THREE.PointLight(0xff6600, 2.6, 16); light.position.set(x, y + 0.8, z); this.scene.add(light); }
    this.buildings.set(uid, { uid, type, x, y, z, rotY, mesh, light });
  }

  public addItem(id: ItemId, count: number): void {
    const def = ITEMS[id];
    if (def.stackable) { for (const s of this.inventory) { if (s.id === id && s.count > 0) { s.count += count; this.renderHotbarUI(); return; } } }
    for (const s of this.inventory) { if (s.count === 0 || s.id === 'hands') { s.id = id; s.count = count; this.renderHotbarUI(); return; } }
  }

  private consumeActiveItem(amount: number): void {
    const s = this.inventory[this.activeSlot]; if (!s) return;
    s.count -= amount; if (s.count <= 0) { s.id = 'hands'; s.count = 1; this.equipSlot(this.activeSlot); }
    this.renderHotbarUI();
  }

  public dropActiveItem(): void {
    const s = this.inventory[this.activeSlot]; if (!s || s.id === 'hands') return;
    const dropMesh = MeshFactory.createItemMesh(s.id);
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    const dropPos = this.playerPos.clone().addScaledVector(dir, 2.2);
    dropPos.y = this.world.getHeightAndBiome(dropPos.x, dropPos.z).height + 0.25;
    dropMesh.position.copy(dropPos); this.scene.add(dropMesh); this.consumeActiveItem(1);
  }

  private spawnInitialAnimals(): void {
    const types: ('deer' | 'rabbit' | 'wolf')[] = ['deer', 'rabbit', 'wolf', 'deer', 'rabbit', 'wolf'];
    for (let i = 0; i < types.length; i++) {
      const sp = types[i];
      const ax = this.playerPos.x + (Math.random() - 0.5) * 65, az = this.playerPos.z + (Math.random() - 0.5) * 65;
      const ay = this.world.getHeightAndBiome(ax, az).height;
      if (ay < 0.5) continue;
      const { mesh, legs } = MeshFactory.createAnimal(sp); mesh.position.set(ax, ay, az); this.scene.add(mesh);
      this.animals.push({ uid: `anim_${i}`, species: sp, x: ax, y: ay, z: az, rotY: 0, hp: sp === 'wolf' ? 55 : 30, state: 'wander', stateTimer: 4, targetYaw: 0, mesh, legs });
    }
  }

  private updateAnimals(dt: number): void {
    for (const a of this.animals) {
      a.stateTimer -= dt;
      const dist = Math.hypot(this.playerPos.x - a.x, this.playerPos.z - a.z);
      if (a.species === 'wolf' && dist < 14) a.state = 'attack';
      else if (a.species !== 'wolf' && dist < 8) a.state = 'flee';
      else if (a.stateTimer <= 0) { a.state = Math.random() < 0.35 ? 'idle' : 'wander'; a.stateTimer = 3 + Math.random() * 3; a.targetYaw = Math.random() * Math.PI * 2; }

      let speed = a.state === 'wander' ? 2.0 : a.state === 'flee' ? 5.2 : a.state === 'attack' ? 4.6 : 0;
      if (a.state === 'flee') a.targetYaw = Math.atan2(a.x - this.playerPos.x, a.z - this.playerPos.z);
      if (a.state === 'attack') { a.targetYaw = Math.atan2(this.playerPos.x - a.x, this.playerPos.z - a.z); if (dist < 1.8) this.hp = Math.max(0, this.hp - 8 * dt); }

      a.rotY += (a.targetYaw - a.rotY) * 5 * dt;
      if (speed > 0) { a.x += Math.sin(a.rotY) * speed * dt; a.z += Math.cos(a.rotY) * speed * dt; a.y = this.world.getHeightAndBiome(a.x, a.z).height; }
      a.mesh.position.set(a.x, a.y, a.z); a.mesh.rotation.y = a.rotY;
    }
  }

  private setupNetworkCallbacks(): void {
    this.net.onPlayerUpdate = (id, x, y, z, yaw, pitch, hp, item, swinging) => {
      let rp = this.remotePlayers.get(id);
      if (!rp) {
        const { mesh, handMount } = MeshFactory.createHumanoidAvatar(); this.scene.add(mesh);
        rp = { id, x, y, z, targetX: x, targetY: y, targetZ: z, yaw, pitch, hp, heldItem: item, swinging, swingTime: 0, mesh, handMount };
        this.remotePlayers.set(id, rp);
      }
      rp.targetX = x; rp.targetY = y; rp.targetZ = z; rp.yaw = yaw; rp.pitch = pitch; rp.hp = hp;
      if (rp.heldItem !== item || !rp.currentHeldMesh) {
        rp.heldItem = item; rp.handMount.clear(); rp.currentHeldMesh = MeshFactory.createItemMesh(item); rp.handMount.add(rp.currentHeldMesh);
      }
      if (swinging) rp.swingTime = 0.3;
    };
    this.net.onResourceRemoved = (uid) => this.world?.removeResource(uid);
    this.net.onBuildingPlaced = (uid, type, x, y, z, rotY) => this.spawnBuildingObject(uid, type, x, y, z, rotY);
    this.net.onWorldSync = (seed, tod) => { if (this.world && this.world.seed !== seed) this.startSession(seed, false); this.timeOfDay = tod; };
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, this.clock.getDelta());

    this.yaw -= this.touch.lookDeltaX; this.pitch = Math.max(-1.42, Math.min(1.42, this.pitch - this.touch.lookDeltaY));
    this.touch.lookDeltaX = 0; this.touch.lookDeltaY = 0;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const moveDir = new THREE.Vector3().addScaledVector(right, this.touch.moveX).addScaledVector(forward, -this.touch.moveZ);

    let speed = 5.4;
    if (this.touch.isSprinting && this.stamina > 5 && moveDir.lengthSq() > 0.05) { speed = 9.0; this.stamina = Math.max(0, this.stamina - 16 * dt); }
    else { this.stamina = Math.min(100, this.stamina + 11 * dt); }

    this.playerPos.x += moveDir.x * speed * dt; this.playerPos.z += moveDir.z * speed * dt;

    const { height, biome, temp } = this.world.getHeightAndBiome(this.playerPos.x, this.playerPos.z);
    if (this.touch.isJumping && this.onGround && this.stamina > 10) { this.playerVel.y = 7.8; this.onGround = false; this.stamina -= 8; }

    this.playerVel.y -= 19.6 * dt; this.playerPos.y += this.playerVel.y * dt;
    const floorLevel = Math.max(-0.2, height) + 1.72;
    if (this.playerPos.y <= floorLevel) { this.playerPos.y = floorLevel; this.playerVel.y = 0; this.onGround = true; }

    this.camera.position.copy(this.playerPos); this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    if (this.isSwinging) {
      this.swingProgress += dt * 7.5; const s = Math.sin(this.swingProgress * Math.PI);
      this.handPivot.rotation.set(-s * 1.1, 0, s * 0.4);
      if (this.swingProgress >= 1) { this.isSwinging = false; this.handPivot.rotation.set(0, 0, 0); }
    }

    if (this.previewMesh) {
      const lookDir = new THREE.Vector3(); this.camera.getWorldDirection(lookDir);
      this.previewPos.copy(this.playerPos).addScaledVector(lookDir, 3.6);
      const bh = this.world.getHeightAndBiome(this.previewPos.x, this.previewPos.z).height;
      this.previewPos.y = bh; this.previewMesh.position.copy(this.previewPos); this.previewMesh.rotation.y = this.yaw;
      this.previewValid = bh > 0.05;
      this.previewMesh.traverse((c) => { if ((c as THREE.Mesh).isMesh) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(this.previewValid ? 0x22c55e : 0xef4444); });
    }

    this.hunger = Math.max(0, this.hunger - 0.45 * dt);
    if (this.hunger <= 0) this.hp = Math.max(0, this.hp - 1.5 * dt);

    this.timeOfDay = (this.timeOfDay + dt * 0.12) % 24;
    const sunAngle = ((this.timeOfDay - 6) / 24) * Math.PI * 2, sunY = Math.sin(sunAngle);
    this.sunLight.position.set(this.playerPos.x + Math.cos(sunAngle) * 60, this.playerPos.y + sunY * 70, this.playerPos.z + 30);
    const dayFactor = Math.max(0.06, Math.min(1, (sunY + 0.2) * 1.4));
    this.sunLight.intensity = dayFactor * 1.25; this.ambientLight.intensity = 0.18 + dayFactor * 0.45;
    const skyColor = new THREE.Color().lerpColors(new THREE.Color(0x060b16), new THREE.Color(0x7dd3fc), dayFactor);
    this.scene.background = skyColor; (this.scene.fog as THREE.FogExp2).color.copy(skyColor);

    this.world.updateChunks(this.playerPos.x, this.playerPos.z);
    this.updateAnimals(dt);

    for (const rp of this.remotePlayers.values()) {
      rp.x += (rp.targetX - rp.x) * 10 * dt; rp.y += (rp.targetY - rp.y) * 10 * dt; rp.z += (rp.targetZ - rp.z) * 10 * dt;
      rp.mesh.position.set(rp.x, rp.y - 1.72, rp.z); rp.mesh.rotation.y = rp.yaw;
    }

    this.netSyncTimer += dt;
    if (this.netSyncTimer >= 0.066) {
      this.netSyncTimer = 0;
      this.net.sendPlayerState(this.playerPos.x, this.playerPos.y, this.playerPos.z, this.yaw, this.pitch, this.hp, this.inventory[this.activeSlot]?.id || 'hands', this.isSwinging);
      if (this.net.role === 'host') this.net.sendWorldSync(this.world.seed, this.timeOfDay);
    }
    
    (document.getElementById('bar-hp') as HTMLElement).style.width = `${this.hp}%`;
    (document.getElementById('bar-hg') as HTMLElement).style.width = `${this.hunger}%`;
    (document.getElementById('bar-st') as HTMLElement).style.width = `${this.stamina}%`;
    document.getElementById('lbl-biome')!.textContent = `Biome: ${biome.toUpperCase()} (${temp}°C)`;
    document.getElementById('lbl-time')!.textContent = `Time: ${Math.floor(this.timeOfDay).toString().padStart(2, '0')}:${Math.floor((this.timeOfDay % 1) * 60).toString().padStart(2, '0')}`;
    document.getElementById('lbl-net')!.textContent = `Players: ${this.remotePlayers.size + 1}`;
    
    this.renderer.render(this.scene, this.camera);
  };

  public renderHotbarUI(): void {
    const hb = document.getElementById('hotbar')!; hb.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const slot = this.inventory[i]; const div = document.createElement('div');
      div.className = `hslot ${this.activeSlot === i ? 'active' : ''}`;
      div.innerHTML = `<span class="slot-name">${ITEMS[slot.id].name}</span><span class="slot-cnt">${slot.count > 0 ? slot.count : ''}</span>`;
      div.addEventListener('touchstart', (e) => { e.preventDefault(); this.equipSlot(i); });
      hb.appendChild(div);
    }
  }

  public toggleModal(): void {
    const modal = document.getElementById('modal-panel')!; modal.classList.toggle('hidden');
    if (!modal.classList.contains('hidden')) {
      const grid = document.getElementById('inv-grid')!; grid.innerHTML = '';
      this.inventory.forEach((slot, idx) => {
        const cell = document.createElement('div'); cell.className = `hslot ${this.activeSlot === idx ? 'active' : ''}`; cell.style.width = '100%';
        cell.innerHTML = `<span class="slot-name">${ITEMS[slot.id].name}</span><span class="slot-cnt">${slot.count || ''}</span>`;
        cell.onclick = () => {
          if (idx >= 5 && slot.count > 0) { const temp = this.inventory[this.activeSlot]; this.inventory[this.activeSlot] = slot; this.inventory[idx] = temp; }
          else { this.equipSlot(idx); }
          this.equipSlot(this.activeSlot); this.toggleModal(); this.toggleModal(); // re-render
        };
        grid.appendChild(cell);
      });
      const cList = document.getElementById('craft-list')!; cList.innerHTML = '';
      for (const rec of RECIPES) {
        const row = document.createElement('div'); row.className = 'craft-item';
        row.innerHTML = `<div><strong>${ITEMS[rec.result].name} (x${rec.count})</strong><div style="font-size:10px;color:#94a3b8;">Requires: ${rec.ingredients.map(i => `${i.count}x${ITEMS[i.id].name}`).join(', ')}</div></div>`;
        const btn = document.createElement('button'); btn.textContent = 'CRAFT'; btn.style.padding = '6px 10px'; btn.style.fontSize = '11px';
        btn.onclick = () => {
          for (const ing of rec.ingredients) if (this.inventory.reduce((a, s) => (s.id === ing.id ? a + s.count : a), 0) < ing.count) return;
          for (const ing of rec.ingredients) {
            let rem = ing.count;
            for (const s of this.inventory) if (s.id === ing.id && s.count > 0) { const take = Math.min(s.count, rem); s.count -= take; rem -= take; if (s.count === 0) s.id = 'hands'; }
          }
          this.addItem(rec.result, rec.count); this.toggleModal(); this.toggleModal();
        };
        row.appendChild(btn); cList.appendChild(row);
      }
      const tGrid = document.getElementById('tribe-grid')!; tGrid.innerHTML = '';
      for (const tr of this.world.tribes) {
        const card = document.createElement('div'); card.className = 'tribe-card';
        card.innerHTML = `<strong style="color:#38bdf8;">#${tr.id} ${tr.name}</strong> (${tr.biome.toUpperCase()})<br/>Coords: [${tr.x}, ${tr.z}] | Tech: ${tr.technology}<br/>Pop: ${tr.population} | Mil: ${tr.military} | Aggr: ${tr.aggression}%`;
        tGrid.appendChild(card);
      }
    }
  }

  public async saveCurrentWorld(): Promise<void> {
    if (this.net.role === 'client') return;
    await SaveManager.saveWorld({
      seed: this.world.seed, x: this.playerPos.x, y: this.playerPos.y, z: this.playerPos.z,
      hp: this.hp, hunger: this.hunger, timeOfDay: this.timeOfDay, inventory: this.inventory,
      destroyedUids: Array.from(this.world.destroyedUids), buildings: Array.from(this.buildings.values()).map(({ uid, type, x, y, z, rotY }) => ({ uid, type, x, y, z, rotY }))
    });
  }
}
