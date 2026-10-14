import { registerPlugin } from '@capacitor/core';
import { ItemId } from '../types';

export interface LanServerPluginInterface {
  startHost(options: { port: number; gameName: string; seed: number }): Promise<{ ip: string; port: number }>;
  stopHost(): Promise<void>;
  broadcastBinary(options: { base64: string }): Promise<void>;
  startDiscovery(): Promise<void>;
  addListener(eventName: string, listenerFunc: (data: any) => void): Promise<any>;
}

const LanServer = registerPlugin<LanServerPluginInterface>('LanServer');

export const ITEM_INDEX: ItemId[] = [
  'hands', 'stone', 'wood', 'stick', 'berries', 'coal', 'iron_ore', 'cooked_meat',
  'stone_axe', 'stone_pickaxe', 'iron_axe', 'iron_pickaxe', 'torch',
  'campfire', 'chest', 'wooden_wall', 'wooden_floor', 'wooden_roof', 'door'
];

export class NetworkManager {
  public role: 'single' | 'host' | 'client' = 'single';
  public myPlayerId = Math.floor(1 + Math.random() * 60000);
  public hostIp = '192.168.1.1';
  public port = 7777;
  private ws: WebSocket | null = null;

  public onPlayerUpdate?: (id: number, x: number, y: number, z: number, yaw: number, pitch: number, hp: number, item: ItemId, swinging: boolean) => void;
  public onResourceRemoved?: (uid: string) => void;
  public onBuildingPlaced?: (uid: string, type: ItemId, x: number, y: number, z: number, rotY: number) => void;
  public onWorldSync?: (seed: number, timeOfDay: number) => void;
  public onHostDiscovered?: (name: string, ip: string, port: number) => void;
  public onPeerCountChanged?: (count: number) => void;

  public async startHostServer(gameName: string, seed: number): Promise<{ ip: string; port: number }> {
    this.role = 'host';
    this.myPlayerId = 1;
    try {
      const res = await LanServer.startHost({ port: this.port, gameName, seed });
      this.hostIp = res.ip;
      await LanServer.addListener('clientBinaryPacket', (ev: { base64: string }) => {
        const buf = this.base64ToArrayBuffer(ev.base64);
        this.handleBinaryPacket(buf);
        LanServer.broadcastBinary({ base64: ev.base64 });
      });
      await LanServer.addListener('peerCount', (ev: { count: number }) => {
        this.onPeerCountChanged?.(ev.count + 1);
      });
      return res;
    } catch { return { ip: '192.168.43.1', port: this.port }; }
  }

  public async startLanDiscovery(): Promise<void> {
    try {
      await LanServer.startDiscovery();
      await LanServer.addListener('hostDiscovered', (ev: { name: string; ip: string; port: number }) => {
        this.onHostDiscovered?.(ev.name, ev.ip, ev.port);
      });
    } catch {}
  }

  public connectToHost(ip: string, port = 7777): Promise<boolean> {
    return new Promise((resolve) => {
      this.role = 'client';
      this.ws = new WebSocket(`ws://${ip.trim()}:${port}`);
      this.ws.binaryType = 'arraybuffer';
      this.ws.onopen = () => resolve(true);
      this.ws.onerror = () => resolve(false);
      this.ws.onmessage = (ev) => { if (ev.data instanceof ArrayBuffer) this.handleBinaryPacket(ev.data); };
    });
  }

  public sendPlayerState(x: number, y: number, z: number, yaw: number, pitch: number, hp: number, item: ItemId, swinging: boolean): void {
    if (this.role === 'single') return;
    const buf = new ArrayBuffer(28); const view = new DataView(buf);
    view.setUint8(0, 0x01); view.setUint16(1, this.myPlayerId, true);
    view.setFloat32(3, x, true); view.setFloat32(7, y, true); view.setFloat32(11, z, true);
    view.setFloat32(15, yaw, true); view.setFloat32(19, pitch, true);
    view.setUint8(23, Math.max(0, Math.min(100, Math.round(hp))));
    view.setUint8(24, Math.max(0, ITEM_INDEX.indexOf(item)));
    view.setUint8(25, swinging ? 1 : 0);
    this.transmit(buf);
  }

  public sendResourceDestroy(uid: string): void {
    if (this.role === 'single') return;
    const enc = new TextEncoder().encode(uid);
    const buf = new ArrayBuffer(2 + enc.length); const view = new DataView(buf);
    view.setUint8(0, 0x02); view.setUint8(1, enc.length);
    new Uint8Array(buf, 2).set(enc);
    this.transmit(buf);
  }

  public sendBuildingPlace(uid: string, type: ItemId, x: number, y: number, z: number, rotY: number): void {
    if (this.role === 'single') return;
    const enc = new TextEncoder().encode(uid);
    const buf = new ArrayBuffer(19 + enc.length); const view = new DataView(buf);
    view.setUint8(0, 0x03); view.setUint8(1, Math.max(0, ITEM_INDEX.indexOf(type)));
    view.setFloat32(2, x, true); view.setFloat32(6, y, true); view.setFloat32(10, z, true); view.setFloat32(14, rotY, true);
    view.setUint8(18, enc.length);
    new Uint8Array(buf, 19).set(enc);
    this.transmit(buf);
  }

  public sendWorldSync(seed: number, timeOfDay: number): void {
    if (this.role !== 'host') return;
    const buf = new ArrayBuffer(9); const view = new DataView(buf);
    view.setUint8(0, 0x04); view.setInt32(1, seed, true); view.setFloat32(5, timeOfDay, true);
    this.transmit(buf);
  }

  private transmit(buf: ArrayBuffer): void {
    if (this.role === 'client' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(buf);
    } else if (this.role === 'host') {
      LanServer.broadcastBinary({ base64: this.arrayBufferToBase64(buf) }).catch(() => {});
    }
  }

  private handleBinaryPacket(buf: ArrayBuffer): void {
    if (buf.byteLength < 1) return;
    const view = new DataView(buf); const op = view.getUint8(0);
    if (op === 0x01 && buf.byteLength >= 26) {
      const id = view.getUint16(1, true);
      if (id === this.myPlayerId) return;
      this.onPlayerUpdate?.(
        id, view.getFloat32(3, true), view.getFloat32(7, true), view.getFloat32(11, true),
        view.getFloat32(15, true), view.getFloat32(19, true), view.getUint8(23),
        ITEM_INDEX[view.getUint8(24)] || 'hands', view.getUint8(25) === 1
      );
    } else if (op === 0x02) {
      this.onResourceRemoved?.(new TextDecoder().decode(new Uint8Array(buf, 2, view.getUint8(1))));
    } else if (op === 0x03) {
      const type = ITEM_INDEX[view.getUint8(1)] || 'wooden_wall';
      const x = view.getFloat32(2, true), y = view.getFloat32(6, true), z = view.getFloat32(10, true), rotY = view.getFloat32(14, true);
      this.onBuildingPlaced?.(new TextDecoder().decode(new Uint8Array(buf, 19, view.getUint8(18))), type, x, y, z, rotY);
    } else if (op === 0x04 && this.role === 'client') {
      this.onWorldSync?.(view.getInt32(1, true), view.getFloat32(5, true));
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = ''; const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64); const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
}
