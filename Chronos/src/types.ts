import * as THREE from 'three';

export type ItemId =
  | 'hands' | 'stone' | 'wood' | 'stick' | 'berries' | 'coal' | 'iron_ore' | 'cooked_meat'
  | 'stone_axe' | 'stone_pickaxe' | 'iron_axe' | 'iron_pickaxe' | 'torch'
  | 'campfire' | 'chest' | 'wooden_wall' | 'wooden_floor' | 'wooden_roof' | 'door';

export interface ItemDef {
  id: ItemId; name: string; stackable: boolean; isTool?: boolean; isBuildable?: boolean;
  isFood?: boolean; damage: number; woodBonus: number; rockBonus: number; foodRestore?: number;
}
export interface InvSlot { id: ItemId; count: number; }
export interface Recipe { result: ItemId; count: number; ingredients: { id: ItemId; count: number }[]; }
export type BiomeType = 'plains' | 'forest' | 'mountains' | 'desert' | 'coast' | 'tundra';

export interface ResourceNode {
  uid: string; type: 'tree' | 'rock' | 'coal_node' | 'iron_node' | 'bush' | 'stick_pickup' | 'stone_pickup';
  x: number; y: number; z: number; rotY: number; scale: number; hp: number; maxHp: number;
  mesh?: THREE.Object3D;
}
export interface PlacedBuilding {
  uid: string; type: ItemId; x: number; y: number; z: number; rotY: number;
  mesh?: THREE.Object3D; light?: THREE.PointLight; doorOpen?: boolean;
}
export interface AnimalEntity {
  uid: string; species: 'deer' | 'rabbit' | 'wolf';
  x: number; y: number; z: number; rotY: number; hp: number;
  state: 'idle' | 'wander' | 'flee' | 'attack'; stateTimer: number; targetYaw: number;
  mesh: THREE.Group; legs: THREE.Mesh[];
}
export interface TribeData {
  id: number; name: string; biome: BiomeType; x: number; z: number;
  aggression: number; development: number; population: number;
  military: number; resources: number; technology: string; expansion: number;
}
export interface RemotePlayer {
  id: number; x: number; y: number; z: number; targetX: number; targetY: number; targetZ: number;
  yaw: number; pitch: number; hp: number; heldItem: ItemId;
  swinging: boolean; swingTime: number; mesh: THREE.Group; handMount: THREE.Group; currentHeldMesh?: THREE.Object3D;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  hands: { id: 'hands', name: 'Bare Hands', stackable: false, isTool: true, damage: 6, woodBonus: 1, rockBonus: 0.5 },
  stone: { id: 'stone', name: '3D Stone', stackable: true, damage: 10, woodBonus: 1.2, rockBonus: 1.2 },
  wood: { id: 'wood', name: 'Timber Log', stackable: true, damage: 8, woodBonus: 1, rockBonus: 1 },
  stick: { id: 'stick', name: 'Wood Stick', stackable: true, damage: 7, woodBonus: 1, rockBonus: 1 },
  berries: { id: 'berries', name: 'Wild Berries', stackable: true, isFood: true, foodRestore: 18, damage: 4, woodBonus: 1, rockBonus: 1 },
  coal: { id: 'coal', name: 'Coal Lump', stackable: true, damage: 6, woodBonus: 1, rockBonus: 1 },
  iron_ore: { id: 'iron_ore', name: 'Iron Ore', stackable: true, damage: 9, woodBonus: 1, rockBonus: 1 },
  cooked_meat: { id: 'cooked_meat', name: 'Vension Meat', stackable: true, isFood: true, foodRestore: 40, damage: 5, woodBonus: 1, rockBonus: 1 },
  stone_axe: { id: 'stone_axe', name: 'Stone Axe', stackable: false, isTool: true, damage: 18, woodBonus: 3.0, rockBonus: 1.2 },
  stone_pickaxe: { id: 'stone_pickaxe', name: 'Stone Pickaxe', stackable: false, isTool: true, damage: 15, woodBonus: 1.2, rockBonus: 3.2 },
  iron_axe: { id: 'iron_axe', name: 'Iron Axe', stackable: false, isTool: true, damage: 30, woodBonus: 5.0, rockBonus: 1.5 },
  iron_pickaxe: { id: 'iron_pickaxe', name: 'Iron Pickaxe', stackable: false, isTool: true, damage: 26, woodBonus: 1.5, rockBonus: 5.5 },
  torch: { id: 'torch', name: 'Burning Torch', stackable: false, isTool: true, damage: 10, woodBonus: 1, rockBonus: 1 },
  campfire: { id: 'campfire', name: 'Campfire', stackable: true, isBuildable: true, damage: 5, woodBonus: 1, rockBonus: 1 },
  chest: { id: 'chest', name: 'Storage Chest', stackable: true, isBuildable: true, damage: 5, woodBonus: 1, rockBonus: 1 },
  wooden_wall: { id: 'wooden_wall', name: 'Wooden Wall', stackable: true, isBuildable: true, damage: 5, woodBonus: 1, rockBonus: 1 },
  wooden_floor: { id: 'wooden_floor', name: 'Wooden Floor', stackable: true, isBuildable: true, damage: 5, woodBonus: 1, rockBonus: 1 },
  wooden_roof: { id: 'wooden_roof', name: 'Wooden Roof', stackable: true, isBuildable: true, damage: 5, woodBonus: 1, rockBonus: 1 },
  door: { id: 'door', name: 'Wooden Door', stackable: true, isBuildable: true, damage: 5, woodBonus: 1, rockBonus: 1 }
};

export const RECIPES: Recipe[] = [
  { result: 'stick', count: 4, ingredients: [{ id: 'wood', count: 1 }] },
  { result: 'stone_axe', count: 1, ingredients: [{ id: 'stick', count: 2 }, { id: 'stone', count: 2 }] },
  { result: 'stone_pickaxe', count: 1, ingredients: [{ id: 'stick', count: 2 }, { id: 'stone', count: 3 }] },
  { result: 'torch', count: 1, ingredients: [{ id: 'stick', count: 1 }, { id: 'coal', count: 1 }] },
  { result: 'campfire', count: 1, ingredients: [{ id: 'stick', count: 4 }, { id: 'stone', count: 4 }] },
  { result: 'chest', count: 1, ingredients: [{ id: 'wood', count: 4 }] },
  { result: 'wooden_floor', count: 1, ingredients: [{ id: 'wood', count: 2 }] },
  { result: 'wooden_wall', count: 1, ingredients: [{ id: 'wood', count: 2 }, { id: 'stick', count: 2 }] },
  { result: 'wooden_roof', count: 1, ingredients: [{ id: 'wood', count: 2 }, { id: 'stick', count: 1 }] },
  { result: 'door', count: 1, ingredients: [{ id: 'wood', count: 3 }, { id: 'stick', count: 2 }] },
  { result: 'iron_axe', count: 1, ingredients: [{ id: 'stick', count: 2 }, { id: 'iron_ore', count: 3 }, { id: 'coal', count: 1 }] },
  { result: 'iron_pickaxe', count: 1, ingredients: [{ id: 'stick', count: 2 }, { id: 'iron_ore', count: 3 }, { id: 'coal', count: 1 }] }
];
