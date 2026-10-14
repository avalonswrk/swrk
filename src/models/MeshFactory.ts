import * as THREE from 'three';
import { ItemId } from '../types';

export class MeshFactory {
  private static matWood = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85 });
  private static matBark = new THREE.MeshStandardMaterial({ color: 0x4a2e16, roughness: 0.9 });
  private static matPine = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.75, flatShading: true });
  private static matSnowPine = new THREE.MeshStandardMaterial({ color: 0xa7c9c5, roughness: 0.65, flatShading: true });
  private static matStone = new THREE.MeshStandardMaterial({ color: 0x7c858e, roughness: 0.8, flatShading: true });
  private static matCoal = new THREE.MeshStandardMaterial({ color: 0x1e2226, roughness: 0.5, metalness: 0.2, flatShading: true });
  private static matIron = new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.4, metalness: 0.65, flatShading: true });
  private static matSteel = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.3, metalness: 0.8 });
  private static matFlame = new THREE.MeshBasicMaterial({ color: 0xff7700 });
  private static matBerry = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 });
  private static matCrop = new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.6 });

  public static createTree(isTundra = false): THREE.Group {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 2.8, 7), this.matBark);
    trunk.position.y = 1.4; trunk.castShadow = true; group.add(trunk);
    const leafMat = isTundra ? this.matSnowPine : this.matPine;
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.55 - i * 0.3, 1.9 - i * 0.2, 7), leafMat);
      cone.position.y = 2.6 + i * 1.05; cone.castShadow = true; group.add(cone);
    }
    return group;
  }

  public static createRock(type: 'rock' | 'coal_node' | 'iron_node' = 'rock'): THREE.Group {
    const group = new THREE.Group();
    const geo = new THREE.DodecahedronGeometry(1.0, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const deform = 0.82 + 0.32 * Math.sin(vx * 3.1 + vy * 2.3 + vz * 4.7);
      pos.setXYZ(i, vx * deform, Math.max(-0.2, vy * deform * 0.8), vz * deform);
    }
    geo.computeVertexNormals();
    const mat = type === 'coal_node' ? this.matCoal : type === 'iron_node' ? this.matIron : this.matStone;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.45; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    return group;
  }

  public static createBush(): THREE.Group {
    const group = new THREE.Group();
    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 1), this.matPine);
    bush.position.y = 0.45; group.add(bush);
    for (let i = 0; i < 6; i++) {
      const berry = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), this.matBerry);
      berry.position.set(Math.cos(i * 1.1) * 0.52, 0.45 + (i % 3) * 0.14, Math.sin(i * 1.1) * 0.52);
      group.add(berry);
    }
    return group;
  }

  public static createCropPlant(stage = 1.0): THREE.Group {
    const group = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5 * stage, 5), this.matCrop);
    stem.position.y = (0.25 * stage);
    group.add(stem);
    if (stage > 0.6) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.14 * stage, 6, 6), this.matBerry);
      fruit.position.y = 0.4 * stage;
      group.add(fruit);
    }
    return group;
  }

  public static createItemMesh(item: ItemId): THREE.Group {
    const group = new THREE.Group();
    switch (item) {
      case 'hands': group.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.22), new THREE.MeshStandardMaterial({ color: 0xe0ac69 }))); break;
      case 'stone':
      case 'coal':
      case 'iron_ore': {
        const mat = item === 'coal' ? this.matCoal : item === 'iron_ore' ? this.matIron : this.matStone;
        group.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), mat)); break;
      }
      case 'wood': { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.45, 7), this.matBark); log.rotation.x = Math.PI / 2; group.add(log); break; }
      case 'stick': { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.5, 6), this.matWood); st.rotation.x = Math.PI / 4; group.add(st); break; }
      case 'berries':
      case 'cooked_meat': {
        const col = item === 'berries' ? 0xdc2626 : 0x993322;
        group.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 1), new THREE.MeshStandardMaterial({ color: col }))); break;
      }
      case 'seeds': { group.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshStandardMaterial({ color: 0x84cc16 }))); break; }
      case 'stone_axe':
      case 'iron_axe': {
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.038, 0.7, 7), this.matWood); handle.position.y = 0.1;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.07), item === 'iron_axe' ? this.matSteel : this.matStone); blade.position.set(0.08, 0.36, 0);
        group.add(handle, blade); break;
      }
      case 'stone_pickaxe':
      case 'iron_pickaxe': {
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.038, 0.7, 7), this.matWood); handle.position.y = 0.1;
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.48, 6), item === 'iron_pickaxe' ? this.matSteel : this.matStone); head.rotation.z = Math.PI / 2; head.position.set(0, 0.38, 0);
        group.add(handle, head); break;
      }
      case 'torch': {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.55, 6), this.matWood); stick.position.y = 0.1;
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), this.matFlame); flame.position.y = 0.44;
        group.add(stick, flame); break;
      }
      default: { const bMesh = this.createBuildingMesh(item); bMesh.scale.setScalar(0.15); group.add(bMesh); break; }
    }
    return group;
  }

  public static createBuildingMesh(type: ItemId): THREE.Group {
    const group = new THREE.Group();
    switch (type) {
      case 'wooden_floor': { const floor = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.25, 3.0), this.matWood); floor.position.y = 0.125; floor.receiveShadow = true; group.add(floor); break; }
      case 'wooden_wall': { const wall = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.6, 0.28), this.matWood); wall.position.y = 1.3; wall.castShadow = true; group.add(wall); break; }
      case 'wooden_roof': { const roof = new THREE.Mesh(new THREE.ConeGeometry(2.35, 1.6, 4), this.matBark); roof.rotation.y = Math.PI / 4; roof.position.y = 3.2; group.add(roof); break; }
      case 'door': { const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.3, 0.22), this.matBark); frame.position.y = 1.15; group.add(frame); break; }
      case 'chest': {
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.65, 0.65), this.matWood); base.position.y = 0.325;
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.06), this.matSteel); lock.position.set(0, 0.38, 0.33);
        group.add(base, lock); break;
      }
      case 'campfire': {
        for (let i = 0; i < 6; i++) {
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), this.matStone);
          rock.position.set(Math.cos(i * 1.04) * 0.45, 0.12, Math.sin(i * 1.04) * 0.45); group.add(rock);
        }
        const fire = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.65, 6), this.matFlame); fire.position.y = 0.34; group.add(fire); break;
      }
    }
    return group;
  }

  public static createAnimal(species: 'deer' | 'rabbit' | 'wolf'): { mesh: THREE.Group; legs: THREE.Mesh[] } {
    const group = new THREE.Group();
    const legs: THREE.Mesh[] = [];
    const color = species === 'deer' ? 0x8d5524 : species === 'wolf' ? 0x546e7a : 0xd7ccc8;
    const scale = species === 'deer' ? 1.1 : species === 'wolf' ? 0.85 : 0.42;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.65 * scale, 0.5 * scale, 1.25 * scale), mat); body.position.y = 0.65 * scale;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42 * scale, 0.42 * scale, 0.5 * scale), mat); head.position.set(0, 0.98 * scale, 0.68 * scale);
    group.add(body, head);

    const legGeo = new THREE.BoxGeometry(0.14 * scale, 0.55 * scale, 0.14 * scale);
    const offsets = [ [-0.22 * scale, 0.27 * scale, 0.42 * scale], [0.22 * scale, 0.27 * scale, 0.42 * scale], [-0.22 * scale, 0.27 * scale, -0.42 * scale], [0.22 * scale, 0.27 * scale, -0.42 * scale] ];
    for (const [lx, ly, lz] of offsets) {
      const leg = new THREE.Mesh(legGeo, mat); leg.position.set(lx, ly, lz); group.add(leg); legs.push(leg);
    }
    return { mesh: group, legs };
  }

  public static createHumanoidAvatar(): { mesh: THREE.Group; handMount: THREE.Group } {
    const group = new THREE.Group();
    const suitMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.4, roughness: 0.3 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.34), suitMat); torso.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), headMat); head.position.y = 1.82;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.05), new THREE.MeshBasicMaterial({ color: 0x38bdf8 })); visor.position.set(0, 1.84, -0.21);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), suitMat); legL.position.set(-0.16, 0.36, 0);
    const legR = legL.clone(); legR.position.x = 0.16;
    const handMount = new THREE.Group(); handMount.position.set(0.38, 1.15, -0.35);
    group.add(torso, head, visor, legL, legR, handMount);
    return { mesh: group, handMount };
  }
}
