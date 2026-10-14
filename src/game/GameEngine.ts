import * as THREE from 'three';
import { AnimalEntity, InvSlot, ItemId, ITEMS, PlacedBuilding, RECIPES, RemotePlayer } from '../types';
import { MeshFactory } from '../models/MeshFactory';
import { WorldManager } from '../world/WorldManager';
import { TouchController } from '../player/TouchController';
import { NetworkManager } from '../networking/NetworkManager';
import { SaveManager } from '../storage/SaveManager';

export class GameEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;
  private torchLight: THREE.PointLight;

  public world!: WorldManager;
  public touch!: TouchController;
  public net = new NetworkManager();

  public playerPos = new THREE.Vector3(0, 12, 0);
  public playerVel = new THREE.Vector3();
  public yaw = 0;
  public pitch = 0;
  public onGround = false;
  public hp = 100;
  public hunger = 100;
  public stamina = 100;
  public timeOfDay = 8.0;

  private handPivot = new THREE.Group();
  private heldMesh: THREE.Object3D | null = null;
  private swingProgress = 0;
  private isSwinging = false;

  public inventory: InvSlot[] = [];
  public activeSlot = 0;

  private previewMesh: THREE.Group | null = null;
  private previewValid = false;
  private previewPos = new THREE.Vector3();
  public buildings = new Map<string, PlacedBuilding>();

  public animals: AnimalEntity[] = [];
  public remotePlayers = new Map<number, RemotePlayer>();

  private clock = new THREE.Clock();
  private netSyncTimer = 0;
  private running = false;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.012);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 180);
    this.ambientLight = new THREE.AmbientLight(0xdbeafe, 0.55);
    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.2);
    this.sunLight.castShadow = true;

    this.torchLight = new THREE.PointLight(0xff8800, 0, 14);
    this.camera.add(this.torchLight);

    this.handPivot.position.set(0.36, -0.32, -0.58);
    this.camera.add(this.handPivot);
    this.scene.add(this.ambientLight, this.sunLight, this.camera);

    this.touch = new TouchController(() => this.performAttack(), () => this.performInteractOrPlant());
    this.setupNetworkCallbacks();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  public async startSession(seed: number, loadExisting: boolean): Promise<void> {
    this.scene.clear();
    this.scene.add(this.ambientLight, this.sunLight, this.camera);
    this.buildings.clear();
    this.animals = [];
    this.remotePlayers.clear();

    this.initDefaultInventory();
    const saved = loadExisting ? await SaveManager.loadWorld() : null;
    const finalSeed = saved ? saved.seed : seed;
    this.world = new WorldManager(this.scene, finalSeed);

    if (saved) {
      this.playerPos.set(saved.x, saved.y, saved.z);
      this.hp = saved.hp; this.hunger = saved.hunger; this.timeOfDay = saved.timeOfDay;
      this.inventory = saved.inventory;
      saved.destroyedUids.forEach((u) => this.world.destroyedUids.add(u));
      saved.buildings.forEach((b) => this.spawnBuildingObject(b.uid, b.type, b.x, b.y, b.z, b.rotY));
    } else {
      const startY = this.world.getHeightAndBiome(0, 0).height + 2.2;
      this.playerPos.set(0, Math.max(2, startY), 0);
    }

    this.world.updateChunks(this.playerPos.x, this.playerPos.z);
    if (this.net.role !== 'client') this.spawnInitialAnimals();

    this.equipSlot(0);
    this.renderHotbarUI();

    if (!this.running) {
      this.running = true;
      this.clock.start();
      this.animate();
    }
  }

  private initDefaultInventory(): void {
    this.inventory = Array.from({ length: 24 }, () => ({ id: 'hands' as ItemId, count: 0 }));
    this.inventory[0] = { id: 'stone_axe', count: 1 };
    this.inventory[1] = { id: 'stone_pickaxe', count: 1 };
    this.inventory[2] = { id: 'torch', count: 1 };
    this.inventory[3] = { id: 'seeds', count: 6 };
    this.inventory[4] = { id: 'berries', count: 4 };
  }

  public equipSlot(slotIndex: number): void {
    this.activeSlot = slotIndex;
    const item = this.inventory[this.activeSlot]?.id || 'hands';
    if (this.heldMesh) this.handPivot.remove(this.heldMesh);
    this.heldMesh = MeshFactory.createItemMesh(item);
    this.handPivot.add(this.heldMesh);
    this.torchLight.intensity = item === 'torch' ? 2.2 : 0;

    if (this.previewMesh) { this.scene.remove(this.previewMesh); this.previewMesh = null; }
    if (ITEMS[item].isBuildable) {
      this.previewMesh = MeshFactory.createBuildingMesh(item);
      this.previewMesh.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.45 });
        }
      });
      this.scene.add(this.previewMesh);
    }
    this.renderHotbarUI();
  }

  private performAttack(): void {
    if (this.isSwinging) return;
    this.isSwinging = true;
    this.swingProgress = 0;

    const heldId = this.inventory[this.activeSlot]?.id || 'hands';
    const def = ITEMS[heldId];
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);

    for (let i = this.animals.length - 1; i >= 0; i--) {
      const anim = this.animals[i];
      if (this.playerPos.distanceTo(new THREE.Vector3(anim.x, anim.y, anim.z)) < 3.6) {
        anim.hp -= def.damage;
        anim.state = anim.species === 'wolf' ? 'attack' : 'flee';
        anim.stateTimer = 6;
        if (anim.hp <= 0) {
          this.scene.remove(anim.mesh);
          this.animals.splice(i, 1);
          this.addItem('cooked_meat', 2);
        }
        return;
      }
    }

    let closestUid: string | null = null;
    let closestDist = 4.0;
    for (const [uid, res] of this.world.resources.entries()) {
      const rPos = new THREE.Vector3(res.x, res.y + 1.0, res.z);
      const dist = this.camera.position.distanceTo(rPos);
      if (dist < closestDist) {
        const toRes = rPos.clone().sub(this.camera.position).normalize();
        if (dir.dot(toRes) > 0.65) { closestDist = dist; closestUid = uid; }
      }
    }

    if (closestUid) {
      const node = this.world.resources.get(closestUid)!;
      if (node.type === 'crop_plant' && (node.growthStage || 0) >= 1.0) {
        this.world.removeResource(closestUid);
        this.addItem('berries', 2);
        this.addItem('seeds', 2);
        return;
      }

      let dmg = def.damage;
      if (node.type === 'tree') dmg *= def.woodBonus;
      if (node.type === 'rock' || node.type === 'coal_node' || node.type === 'iron_node') dmg *= def.rockBonus;
      node.hp -= dmg;

      if (node.hp <= 0) {
        this.world.removeResource(closestUid);
        this.net.sendResourceDestroy(closestUid);
        if (node.type === 'tree') { this.addItem('wood', 3); this.addItem('stick', 2); }
        else if (node.type === 'rock') this.addItem('stone', 3);
        else if (node.type === 'coal_node') { this.addItem('coal', 2); this.addItem('stone', 1); }
        else if (node.type === 'iron_node') { this.addItem('iron_ore', 2); this.addItem('stone', 1); }
        else if (node.type === 'bush') { this.addItem('berries', 3); this.addItem('seeds', 1); }
        else if (node.type === 'stick_pickup') this.addItem('stick', 2);
      }
    }
  }

  private performInteractOrPlant(): void {
    const slot = this.inventory[this.activeSlot];
    if (!slot || slot.count <= 0) return;
    const def = ITEMS[slot.id];

    if (def.isFood) {
      this.hunger = Math.min(100, this.hunger + (def.foodRestore || 25));
      this.hp = Math.min(100, this.hp + 10);
      this.consumeActiveItem(1);
      return;
    }

    if (def.isSeed) {
      const lookDir = new THREE.Vector3();
      this.camera.getWorldDirection(lookDir);
      const pPos = this.playerPos.clone().addScaledVector(lookDir, 2.5);
      const h = this.world.getHeightAndBiome(pPos.x, pPos.z).height;
      if (h > 0.2) {
        const uid = `crop_${Date.now()}_${Math.floor(Math.random() * 999)}`;
        const mesh = MeshFactory.createCropPlant(0.2);
        mesh.position.set(pPos.x, h, pPos.z);
        this.scene.add(mesh);
        this.world.resources.set(uid, {
          uid, type: 'crop_plant', x: pPos.x, y: h, z: pPos.z, rotY: 0, scale: 1, hp: 10, maxHp: 10, growthStage: 0.2, mesh
        });
        this.consumeActiveItem(1);
      }
      return;
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
    const mesh = MeshFactory.createBuildingMesh(type);
    mesh.position.set(x, y, z); mesh.rotation.y = rotY; this.scene.add(mesh);

    let light: THREE.PointLight | undefined;
    if (type === 'campfire') {
      light = new THREE.PointLight(0xff6600, 2.6, 16);
      light.position.set(x, y + 0.8, z);
      this.scene.add(light);
    }
    this.buildings.set(uid, { uid, type, x, y, z, rotY, mesh, light });
  }

  public addItem(id: ItemId, count: number): void {
    const def = ITEMS[id];
    if (def.stackable) {
      for (const s of this.inventory) {
        if (s.id === id && s.count > 0) { s.count += count; this.renderHotbarUI(); return; }
      }
    }
    for (const s of this.inventory) {
      if (s.count === 0 || s.id === 'hands') { s.id = id; s.count = count; this.renderHotbarUI(); return; }
    }
  }

  private consumeActiveItem(amount: number): void {
    const s = this.inventory[this.activeSlot];
    if (!s) return;
    s.count -= amount;
    if (s.count <= 0) { s.id = 'hands'; s.count = 1; this.equipSlot(this.activeSlot); }
    this.renderHotbarUI();
  }

  public dropActiveItem(): void {
    const s = this.inventory[this.activeSlot];
    if (!s || s.id === 'hands') return;
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
      const ax = this.playerPos.x + (Math.random() - 0.5) * 65;
      const az = this.playerPos.z + (Math.random() - 0.5) * 65;
      const ay = this.world.getHeightAndBiome(ax, az).height;
      if (ay < 0.5) continue;
      const { mesh, legs } = MeshFactory.createAnimal(sp);
      mesh.position.set(ax, ay, az); this.scene.add(mesh);
      this.animals.push({ uid: `anim_${i}`, species: sp, x: ax, y: ay, z: az, rotY: 0, hp: sp === 'wolf' ? 55 : 30, state: 'wander', stateTimer: 4, targetYaw: 0, mesh, legs });
    }
  }

  private updateAnimals(dt: number): void {
    for (const a of this.animals) {
      a.stateTimer -= dt;
      const dist = Math.hypot(this.playerPos.x - a.x, this.playerPos.z - a.z);
      if (a.species === 'wolf' && dist < 14) a.state = 'attack';
      else if (a.species !== 'wolf' && dist < 8) a.state = 'flee';
      else if (a.stateTimer <= 0) {
        a.state = Math.random() < 0.35 ? 'idle' : 'wander';
        a.stateTimer = 3 + Math.random() * 3; a.targetYaw = Math.random() * Math.PI * 2;
      }

      let speed = a.state === 'wander' ? 2.0 : a.state === 'flee' ? 5.2 : a.state === 'attack' ? 4.6 : 0;
      if (a.state === 'flee') a.targetYaw = Math.atan2(a.x - this.playerPos.x, a.z - this.playerPos.z);
      if (a.state === 'attack') {
        a.targetYaw = Math.atan2(this.playerPos.x - a.x, this.playerPos.z - a.z);
        if (dist < 1.8) this.hp = Math.max(0, this.hp - 8 * dt);
      }

      a.rotY += (a.targetYaw - a.rotY) * 5 * dt;
      if (speed > 0) {
        a.x += Math.sin(a.rotY) * speed * dt;
        a.z += Math.cos(a.rotY) * speed * dt;
        a.y = this.world.getHeightAndBiome(a.x, a.z).height;
      }
      a.mesh.position.set(a.x, a.y, a.z); a.mesh.rotation.y = a.rotY;
    }
  }

  private updateCrops(dt: number): void {
    for (const res of this.world.resources.values()) {
      if (res.type === 'crop_plant' && (res.growthStage || 0) < 1.0) {
        res.growthStage = Math.min(1.0, (res.growthStage || 0.2) + 0.02 * dt);
        if (res.mesh) res.mesh.scale.setScalar(res.growthStage);
      }
    }
  }

  private setupNetworkCallbacks(): void {
    this.net.onPlayerUpdate = (id, x, y, z, yaw, pitch, hp, item, swinging) => {
      let rp = this.remotePlayers.get(id);
      if (!rp) {
        const { mesh, handMount } = MeshFactory.createHumanoidAvatar();
        this.scene.add(mesh);
        rp = { id, x, y, z, targetX: x, targetY: y, targetZ: z, yaw, pitch, hp, heldItem: item, swinging, swingTime: 0, mesh, handMount };
        this.remotePlayers.set(id, rp);
      }
      rp.targetX = x; rp.targetY = y; rp.targetZ = z; rp.yaw = yaw; rp.pitch = pitch; rp.hp = hp;
      if (rp.heldItem !== item || !rp.currentHeldMesh) {
        rp.heldItem = item; rp.handMount.clear();
        rp.currentHeldMesh = MeshFactory.createItemMesh(item);
        rp.handMount.add(rp.currentHeldMesh);
      }
      if (swinging) rp.swingTime = 0.3;
    };
    this.net.onResourceRemoved = (uid) => this.world?.removeResource(uid);
    this.net.onBuildingPlaced = (uid, type, x, y, z, rotY) => this.spawnBuildingObject(uid, type, x, y, z, rotY);
    this.net.onWorldSync = (seed, tod) => {
      if (this.world && this.world.seed !== seed) this.startSession(seed, false);
      this.timeOfDay = tod;
    };
  }

  public animate = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, this.clock.getDelta());

    this.yaw -= this.touch.lookDeltaX;
    this.pitch = Math.max(-1.42, Math.min(1.42, this.pitch - this.touch.lookDeltaY));
    this.touch.lookDeltaX = 0; this.touch.lookDeltaY = 0;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const moveDir = new THREE.Vector3().addScaledVector(right, this.touch.moveX).addScaledVector(forward, -this.touch.moveZ);

    let speed = this.touch.isSprinting ? 9.2 : 5.4;
    if (this.touch.isSprinting) this.stamina = Math.max(0, this.stamina - 18 * dt);
    else this.stamina = Math.min(100, this.stamina + 12 * dt);

    this.playerPos.x += moveDir.x * speed * dt;
    this.playerPos.z += moveDir.z * speed * dt;

    const { height, biome, temp } = this.world.getHeightAndBiome(this.playerPos.x, this.playerPos.z);
    if (this.touch.isJumping && this.onGround && this.stamina > 10) {
      this.playerVel.y = 7.8; this.onGround = false; this.stamina -= 8;
    }

    this.playerVel.y -= 19.6 * dt;
    this.playerPos.y += this.playerVel.y * dt;

    const floorLevel = Math.max(-0.2, height) + 1.72;
    if (this.playerPos.y <= floorLevel) {
      this.playerPos.y = floorLevel; this.playerVel.y = 0; this.onGround = true;
    }

    this.camera.position.copy(this.playerPos);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    if (this.isSwinging) {
      this.swingProgress += dt * 7.5;
      const s = Math.sin(this.swingProgress * Math.PI);
      this.handPivot.rotation.set(-s * 1.1, 0, s * 0.4);
      if (this.swingProgress >= 1) { this.isSwinging = false; this.handPivot.rotation.set(0, 0, 0); }
    }

    if (this.previewMesh) {
      const lookDir = new THREE.Vector3(); this.camera.getWorldDirection(lookDir);
      this.previewPos.copy(this.playerPos).addScaledVector(lookDir, 3.6);
      const bh = this.world.getHeightAndBiome(this.previewPos.x, this.previewPos.z).height;
      this.previewPos.y = bh; this.previewMesh.position.copy(this.previewPos); this.previewMesh.rotation.y = this.yaw;
      this.previewValid = bh > 0.05;
      const col = this.previewValid ? 0x22c55e : 0xef4444;
      this.previewMesh.traverse((c) => { if ((c as THREE.Mesh).isMesh) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(col); });
    }

    this.hunger = Math.max(0, this.hunger - 0.42 * dt);
    if (this.hunger <= 0) this.hp = Math.max(0, this.hp - 1.5 * dt);

    this.timeOfDay = (this.timeOfDay + dt * 0.12) % 24;
    const sunAngle = ((this.timeOfDay - 6) / 24) * Math.PI * 2;
    const sunY = Math.sin(sunAngle);
    this.sunLight.position.set(this.playerPos.x + Math.cos(sunAngle) * 60, this.playerPos.y + sunY * 70, this.playerPos.z + 30);

    const dayFactor = Math.max(0.06, Math.min(1, (sunY + 0.2) * 1.4));
    this.sunLight.intensity = dayFactor * 1.25;
    this.ambientLight.intensity = 0.18 + dayFactor * 0.45;
    const skyColor = new THREE.Color().lerpColors(new THREE.Color(0x060b16), new THREE.Color(0x7dd3fc), dayFactor);
    this.scene.background = skyColor;
    (this.scene.fog as THREE.FogExp2).color.copy(skyColor);

    this.world.updateChunks(this.playerPos.x, this.playerPos.z);
    this.updateAnimals(dt);
    this.updateCrops(dt);
    if (this.net.role !== 'client') this.world.updateTribesAutonomous(dt);

    for (const rp of this.remotePlayers.values()) {
      rp.x += (rp.targetX - rp.x) * 10 * dt;
      rp.y += (rp.targetY - rp.y) * 10 * dt;
      rp.z += (rp.targetZ - rp.z) * 10 * dt;
      rp.mesh.position.set(rp.x, rp.y - 1.72, rp.z);
      rp.mesh.rotation.y = rp.yaw;
    }

    this.netSyncTimer += dt;
    if (this.netSyncTimer >= 0.066) {
      this.netSyncTimer = 0;
      const held = this.inventory[this.activeSlot]?.id || 'hands';
      this.net.sendPlayerState(this.playerPos.x, this.playerPos.y, this.playerPos.z, this.yaw, this.pitch, this.hp, held, this.isSwinging);
      if (this.net.role === 'host') this.net.sendWorldSync(this.world.seed, this.timeOfDay);
    }

    this.updateHUD(biome, temp);
    this.renderer.render(this.scene, this.camera);
  };

  private updateHUD(biome: string, temp: number): void {
    (document.getElementById('bar-hp') as HTMLElement).style.width = `${this.hp}%`;
    (document.getElementById('bar-hg') as HTMLElement).style.width = `${this.hunger}%`;
    (document.getElementById('bar-st') as HTMLElement).style.width = `${this.stamina}%`;

    const deg = Math.round((this.yaw * (180 / Math.PI)) % 360);
    const compassDir = Math.abs(deg) < 45 ? 'N' : Math.abs(deg - 90) < 45 ? 'E' : Math.abs(deg - 180) < 45 ? 'S' : 'W';
    document.getElementById('lbl-coords')!.textContent = `X:${Math.round(this.playerPos.x)} Z:${Math.round(this.playerPos.z)} (${compassDir})`;
    document.getElementById('lbl-biome')!.textContent = `Biome: ${biome.toUpperCase()} (${temp}°C)`;

    const hh = Math.floor(this.timeOfDay).toString().padStart(2, '0');
    const mm = Math.floor((this.timeOfDay % 1) * 60).toString().padStart(2, '0');
    document.getElementById('lbl-time')!.textContent = `${hh}:${mm} (${this.timeOfDay > 6 && this.timeOfDay < 18 ? 'Day' : 'Night'})`;
    document.getElementById('lbl-net')!.textContent = `Players: ${this.remotePlayers.size + 1}`;
  }

  public renderHotbarUI(): void {
    const hb = document.getElementById('hotbar')!;
    hb.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const slot = this.inventory[i];
      const div = document.createElement('div');
      div.className = `hslot ${this.activeSlot === i ? 'active' : ''}`;
      div.innerHTML = `<span class="slot-name">${ITEMS[slot.id].name}</span><span class="slot-cnt">${slot.count > 0 ? slot.count : ''}</span>`;
      div.addEventListener('touchstart', (e) => { e.preventDefault(); this.equipSlot(i); });
      hb.appendChild(div);
    }
  }

  public renderInventoryModal(): void {
    const grid = document.getElementById('inv-grid')!;
    grid.innerHTML = '';
    this.inventory.forEach((slot, idx) => {
      const cell = document.createElement('div');
      cell.className = `hslot ${this.activeSlot === idx ? 'active' : ''}`;
      cell.style.width = '100%';
      cell.innerHTML = `<span class="slot-name">${ITEMS[slot.id].name}</span><span class="slot-cnt">${slot.count || ''}</span>`;
      cell.onclick = () => {
        if (idx >= 5 && slot.count > 0) {
          const temp = this.inventory[this.activeSlot];
          this.inventory[this.activeSlot] = slot;
          this.inventory[idx] = temp;
        } else {
          this.equipSlot(idx);
        }
        this.equipSlot(this.activeSlot);
        this.renderInventoryModal();
      };
      grid.appendChild(cell);
    });

    const cList = document.getElementById('craft-list')!;
    cList.innerHTML = '';
    for (const rec of RECIPES) {
      const row = document.createElement('div');
      row.className = 'craft-item';
      const reqStr = rec.ingredients.map((ing) => {
        const have = this.inventory.reduce((a, s) => (s.id === ing.id ? a + s.count : a), 0);
        const color = have >= ing.count ? '#4ade80' : '#ef4444';
        return `<span style="color:${color}">${ing.count}x ${ITEMS[ing.id].name} (${have})</span>`;
      }).join(', ');

      row.innerHTML = `<div style="flex:1;"><strong>${ITEMS[rec.result].name} (x${rec.count})</strong><div style="font-size:10px;">${reqStr}</div></div>`;
      const btn = document.createElement('button');
      btn.textContent = 'CRAFT'; btn.style.padding = '5px 8px'; btn.style.fontSize = '10px';
      btn.onclick = () => {
        for (const ing of rec.ingredients) {
          if (this.inventory.reduce((acc, s) => (s.id === ing.id ? acc + s.count : acc), 0) < ing.count) return;
        }
        for (const ing of rec.ingredients) {
          let rem = ing.count;
          for (const s of this.inventory) {
            if (s.id === ing.id && s.count > 0) {
              const take = Math.min(s.count, rem);
              s.count -= take; rem -= take;
              if (s.count === 0) s.id = 'hands';
            }
          }
        }
        this.addItem(rec.result, rec.count);
        this.renderInventoryModal();
      };
      row.appendChild(btn);
      cList.appendChild(row);
    }
  }

  public renderRtsMap(): void {
    const canvas = document.getElementById('rts-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.parentElement?.clientWidth || 320;
    canvas.height = 240;

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const scale = 0.35;

    const infoBox = document.getElementById('tribe-info-box')!;
    infoBox.innerHTML = `<strong>Active Civilizations (${this.world.tribes.length}):</strong><br/>`;

    for (const tr of this.world.tribes) {
      const tx = cx + (tr.x - this.playerPos.x) * scale;
      const tz = cy + (tr.z - this.playerPos.z) * scale;
      if (tx >= 0 && tx <= canvas.width && tz >= 0 && tz <= canvas.height) {
        ctx.fillStyle = tr.diplomacy === 'allied' ? '#4ade80' : tr.diplomacy === 'hostile' ? '#ef4444' : '#38bdf8';
        ctx.beginPath();
        ctx.arc(tx, tz, Math.max(3, Math.min(8, tr.population * 0.03)), 0, Math.PI * 2);
        ctx.fill();
      }
      infoBox.innerHTML += `• <strong>${tr.name}</strong> [${tr.biome}] - Pop: ${tr.population}, Mil: ${tr.military}, Diplo: <span style="color:${tr.diplomacy === 'allied' ? '#4ade80' : '#ef4444'}">${tr.diplomacy.toUpperCase()}</span><br/>`;
    }

    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  public async saveCurrentWorld(): Promise<void> {
    if (this.net.role === 'client') return;
    const bList = Array.from(this.buildings.values()).map(({ uid, type, x, y, z, rotY }) => ({ uid, type, x, y, z, rotY }));
    await SaveManager.saveWorld({
      seed: this.world.seed, x: this.playerPos.x, y: this.playerPos.y, z: this.playerPos.z,
      hp: this.hp, hunger: this.hunger, timeOfDay: this.timeOfDay,
      inventory: this.inventory, destroyedUids: Array.from(this.world.destroyedUids), buildings: bList
    });
  }

  public stop(): void {
    this.running = false;
  }
}
