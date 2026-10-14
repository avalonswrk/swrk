import * as THREE from 'three';
import { BiomeType, ResourceNode, TribeData } from '../types';
import { MeshFactory } from '../models/MeshFactory';

export class WorldManager {
  public seed: number;
  public scene: THREE.Scene;
  public chunkSize = 36;
  public viewDistance = 3;
  public loadedChunks = new Map<string, THREE.Group>();
  public resources = new Map<string, ResourceNode>();
  public destroyedUids = new Set<string>();
  public tribes: TribeData[] = [];
  private waterMat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, seed: number) {
    this.scene = scene;
    this.seed = seed || 2026;
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, transparent: true, opacity: 0.72, roughness: 0.2 });
    this.generate20Tribes();
  }

  private hash(x: number, z: number): number {
    const n = Math.sin(x * 127.1 + z * 311.7 + this.seed * 74.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  private smoothNoise(x: number, z: number): number {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = this.hash(ix, iz), b = this.hash(ix + 1, iz);
    const c = this.hash(ix, iz + 1), d = this.hash(ix + 1, iz + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }

  public fbm(x: number, z: number): number {
    let val = 0, amp = 0.5, freq = 0.012;
    for (let i = 0; i < 4; i++) {
      val += amp * this.smoothNoise(x * freq, z * freq);
      freq *= 2.15; amp *= 0.48;
    }
    return val;
  }

  public getHeightAndBiome(x: number, z: number): { height: number; biome: BiomeType; temp: number } {
    const elev = this.fbm(x, z);
    const moisture = this.fbm(x + 4200, z - 4200);
    const tempNoise = this.fbm(x - 8500, z + 3100);

    let height = (elev - 0.34) * 28;
    if (elev > 0.62) height += Math.pow(elev - 0.62, 1.6) * 65;

    const river = Math.abs(this.smoothNoise(x * 0.008, z * 0.008) - 0.5);
    if (river < 0.032 && height < 6) height = -2.2;

    let biome: BiomeType = 'plains';
    const temp = Math.round(12 + tempNoise * 26 - Math.max(0, height) * 0.6);

    if (height < 0.9) biome = 'coast';
    else if (height > 15) biome = 'mountains';
    else if (temp < 2) biome = 'tundra';
    else if (temp > 27 && moisture < 0.46) biome = 'desert';
    else if (moisture > 0.52) biome = 'forest';

    return { height, biome, temp };
  }

  public updateChunks(playerX: number, playerZ: number): void {
    const cx = Math.floor(playerX / this.chunkSize);
    const cz = Math.floor(playerZ / this.chunkSize);
    const activeKeys = new Set<string>();

    for (let dx = -this.viewDistance; dx <= this.viewDistance; dx++) {
      for (let dz = -this.viewDistance; dz <= this.viewDistance; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        activeKeys.add(key);
        if (!this.loadedChunks.has(key)) this.buildChunk(cx + dx, cz + dz, key);
      }
    }
    for (const [key, group] of this.loadedChunks.entries()) {
      if (!activeKeys.has(key)) {
        this.scene.remove(group);
        this.loadedChunks.delete(key);
      }
    }
  }

  private buildChunk(cx: number, cz: number, key: string): void {
    const chunkGroup = new THREE.Group();
    const geo = new THREE.PlaneGeometry(this.chunkSize, this.chunkSize, 14, 14);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors: number[] = [];
    const color = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i) + (cx + 0.5) * this.chunkSize;
      const vz = pos.getZ(i) + (cz + 0.5) * this.chunkSize;
      const { height, biome } = this.getHeightAndBiome(vx, vz);
      pos.setY(i, height);

      switch (biome) {
        case 'coast': color.setHex(0xe2c792); break;
        case 'desert': color.setHex(0xd9b26f); break;
        case 'tundra': color.setHex(0xdbeafe); break;
        case 'mountains': color.setHex(height > 21 ? 0xf1f5f9 : 0x64748b); break;
        case 'forest': color.setHex(0x2d5a27); break;
        default: color.setHex(0x4d7c2b); break;
      }
      colors.push(color.r, color.g, color.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const terrainMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    terrainMesh.position.set((cx + 0.5) * this.chunkSize, 0, (cz + 0.5) * this.chunkSize);
    terrainMesh.receiveShadow = true;
    chunkGroup.add(terrainMesh);

    const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(this.chunkSize, this.chunkSize), this.waterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set((cx + 0.5) * this.chunkSize, -0.35, (cz + 0.5) * this.chunkSize);
    chunkGroup.add(waterMesh);

    for (let i = 0; i < 11; i++) {
      const rx = cx * this.chunkSize + this.hash(cx * 19 + i, cz * 31) * this.chunkSize;
      const rz = cz * this.chunkSize + this.hash(cx * 47, cz * 13 + i) * this.chunkSize;
      const uid = `res_${cx}_${cz}_${i}`;
      if (this.destroyedUids.has(uid)) continue;

      const { height, biome } = this.getHeightAndBiome(rx, rz);
      if (height < 0.2) continue;

      const roll = this.hash(rx, rz);
      let type: ResourceNode['type'] | null = null;
      let maxHp = 40;

      if ((biome === 'forest' && roll < 0.55) || (biome === 'plains' && roll < 0.2) || (biome === 'tundra' && roll < 0.22)) {
        type = 'tree'; maxHp = 60;
      } else if (roll > 0.86) { type = 'iron_node'; maxHp = 90; }
      else if (roll > 0.76) { type = 'coal_node'; maxHp = 70; }
      else if (roll > 0.62) { type = 'rock'; maxHp = 55; }
      else if (roll > 0.54 && biome !== 'desert') { type = 'bush'; maxHp = 20; }
      else if (roll > 0.48) { type = 'stick_pickup'; maxHp = 10; }

      if (!type) continue;

      let mesh: THREE.Object3D;
      if (type === 'tree') mesh = MeshFactory.createTree(biome === 'tundra');
      else if (type === 'rock' || type === 'coal_node' || type === 'iron_node') mesh = MeshFactory.createRock(type);
      else if (type === 'bush') mesh = MeshFactory.createBush();
      else { mesh = MeshFactory.createItemMesh('stick'); mesh.scale.setScalar(1.5); }

      const scale = 0.85 + (roll * 10 % 0.45);
      const rotY = roll * Math.PI * 2;
      mesh.position.set(rx, height, rz);
      mesh.rotation.y = rotY;
      mesh.scale.multiplyScalar(scale);
      chunkGroup.add(mesh);

      this.resources.set(uid, { uid, type, x: rx, y: height, z: rz, rotY, scale, hp: maxHp, maxHp, mesh });
    }

    this.scene.add(chunkGroup);
    this.loadedChunks.set(key, chunkGroup);
  }

  public removeResource(uid: string): ResourceNode | undefined {
    const res = this.resources.get(uid);
    if (res) {
      if (res.mesh && res.mesh.parent) res.mesh.parent.remove(res.mesh);
      this.resources.delete(uid);
      this.destroyedUids.add(uid);
    }
    return res;
  }

  private generate20Tribes(): void {
    const prefixes = ['Aethel', 'Vorg', 'Kran', 'Sol', 'Drak', 'Nox', 'Thul', 'Zeph', 'Mor', 'Val', 'Ash', 'Grom', 'Pyre', 'Syl', 'Kor', 'Onyx', 'Bryn', 'Tor', 'Fen', 'Kael'];
    const techs = ['Stone Knapping', 'Fire Mastery', 'Spear Hunting', 'Pottery', 'Primitive Smelting', 'Timber Fortification'];
    const biomes: BiomeType[] = ['plains', 'forest', 'mountains', 'desert', 'coast', 'tundra'];

    this.tribes = [];
    for (let i = 0; i < 20; i++) {
      const h = this.hash(i * 15, this.seed);
      const angle = (i / 20) * Math.PI * 2;
      const dist = 180 + Math.floor(h * 600);
      this.tribes.push({
        id: i + 1, name: `${prefixes[i]} Clan`, biome: biomes[i % biomes.length],
        x: Math.round(Math.cos(angle) * dist), z: Math.round(Math.sin(angle) * dist),
        aggression: Math.round(15 + this.hash(i, 1) * 85),
        development: Math.round(10 + this.hash(i, 2) * 90),
        population: Math.round(18 + this.hash(i, 3) * 140),
        military: Math.round(10 + this.hash(i, 4) * 90),
        resources: Math.round(25 + this.hash(i, 5) * 200),
        technology: techs[i % techs.length],
        expansion: Math.round(1 + this.hash(i, 6) * 10)
      });
    }
  }
}
