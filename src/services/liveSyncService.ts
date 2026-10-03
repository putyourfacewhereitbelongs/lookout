type StateListener = (payload: string) => void;

/** Low-latency portal synchronization over the same-origin WebSocket. */
class LiveSyncService {
  private socket: WebSocket | null = null;
  private listeners = new Set<StateListener>();
  private reconnectTimer: number | null = null;
  private deviceId = localStorage.getItem('lookout_device_id') || crypto.randomUUID();

  constructor() {
    localStorage.setItem('lookout_device_id', this.deviceId);
  }

  connect(): void {
    if (typeof window === 'undefined' || this.socket?.readyState === WebSocket.OPEN) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_SYNC_TOKEN || '';
    try {
      this.socket = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);
      this.socket.onopen = () => this.sendState();
      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'state' && typeof message.payload === 'string') this.listeners.forEach((listener) => listener(message.payload));
        } catch { /* Ignore malformed peer data. */ }
      };
      this.socket.onclose = () => {
        this.socket = null;
        if (this.reconnectTimer === null) this.reconnectTimer = window.setTimeout(() => { this.reconnectTimer = null; this.connect(); }, 1500);
      };
    } catch { this.socket = null; }
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(payload: string): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: 'state', deviceId: this.deviceId, payload }));
  }

  private sendState(): void {
    const state = localStorage.getItem('lookout_faces_v1');
    if (state) this.publish(JSON.stringify({ faces: JSON.parse(state) }));
  }
}

export const liveSyncService = new LiveSyncService();
