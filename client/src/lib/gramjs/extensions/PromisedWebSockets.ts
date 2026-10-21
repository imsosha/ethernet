import { Mutex } from 'async-mutex';

import { concat } from '../../../util/encoding/buffer';
import { getDCMirrors } from '../Utils';

const closeError = new Error('WebSocket was closed');
const CANDIDATE_TIMEOUT = 5000;

const LAST_WORKING_HOST = new Map<string, string>();
const LAST_WORKING_PREFIX = new Map<number, string>();

const DC_PLANET_NAMES: Record<string, number> = {
  pluto: 1,
  venus: 2,
  aurora: 3,
  vesta: 4,
  flora: 5,
};

function getHostCandidates(ip: string): string[] {
  let candidates: string[] = [];
  let dcId: number | undefined;
  let isDownload = false;

  const wsMatch = ip.match(/^(?:zws|kws)(\d)(-1)?\.web\.telegram\.org$/i);
  if (wsMatch) {
    dcId = Number(wsMatch[1]);
    isDownload = Boolean(wsMatch[2]);
    candidates = getDCMirrors(dcId, isDownload);
  } else {
    const planetMatch = ip.match(/^(pluto|venus|aurora|vesta|flora)\.web\.telegram\.org$/i);
    if (planetMatch) {
      dcId = DC_PLANET_NAMES[planetMatch[1].toLowerCase()];
      candidates = getDCMirrors(dcId, false);
    } else {
      candidates = [ip];
    }
  }

  if (!candidates.includes(ip)) {
    candidates = [ip, ...candidates];
  }

  const workingHost = LAST_WORKING_HOST.get(ip);
  if (workingHost && candidates.includes(workingHost)) {
    return [workingHost, ...candidates.filter((h) => h !== workingHost)];
  }

  if (dcId && LAST_WORKING_PREFIX.has(dcId)) {
    const prefix = LAST_WORKING_PREFIX.get(dcId)!;
    const preferred = candidates.find((c) => c.startsWith(prefix));
    if (preferred) {
      return [preferred, ...candidates.filter((h) => h !== preferred)];
    }
  }

  if (candidates[0] !== ip && candidates.includes(ip)) {
    return [ip, ...candidates.filter((h) => h !== ip)];
  }

  return candidates;
}

function recordWorkingHost(originalIp: string, host: string) {
  LAST_WORKING_HOST.set(originalIp, host);
  const match = host.match(/^(?:(zws|kws)\d|([a-z]+))(-1)?\.web\.telegram\.org$/i);
  if (match) {
    const prefix = match[1] || match[2];
    const originalMatch = originalIp.match(/^(?:zws|kws)(\d)/i);
    if (originalMatch) {
      const dcId = Number(originalMatch[1]);
      LAST_WORKING_PREFIX.set(dcId, prefix);
    }
  }
}

export default class PromisedWebSockets {
  private readonly mutex = new Mutex();

  private closed: boolean;

  private stream: Uint8Array;

  private canRead?: boolean | Promise<boolean>;

  private resolveRead: ((value?: any) => void) | undefined;

  private client: WebSocket | undefined;

  private website?: string;

  private disconnectedCallback: () => void;

  private handleOffline: () => void;

  constructor(disconnectedCallback: () => void) {
    this.client = undefined;
    this.closed = true;
    this.stream = new Uint8Array(0);
    this.disconnectedCallback = disconnectedCallback;

    this.handleOffline = () => {
      this.close();
      this.resolveRead?.(false);
    };

    if (typeof self !== 'undefined' && 'addEventListener' in self) {
      self.addEventListener('offline', this.handleOffline);
    }
  }

  async readExactly(number: number) {
    let readData = new Uint8Array(0);

    while (true) {
      const thisTime = await this.read(number);
      readData = concat(readData, thisTime);
      number -= thisTime.length;
      if (!number) {
        return readData;
      }
    }
  }

  async read(number: number) {
    if (this.closed) {
      throw closeError;
    }
    await this.canRead;
    if (this.closed) {
      throw closeError;
    }
    const toReturn = this.stream.slice(0, number);
    this.stream = this.stream.slice(number);
    if (this.stream.length === 0) {
      this.canRead = new Promise((resolve) => {
        this.resolveRead = resolve;
      });
    }

    return toReturn;
  }

  async readAll() {
    if (this.closed || !await this.canRead) {
      throw closeError;
    }
    const toReturn = this.stream;
    this.stream = new Uint8Array(0);
    this.canRead = new Promise((resolve) => {
      this.resolveRead = resolve;
    });

    return toReturn;
  }

  getWebSocketLink(ip: string, port: number, isTestServer?: boolean, isPremium?: boolean) {
    if (port === 443) {
      return `wss://${ip}:${port}/apiws${isTestServer ? '_test' : ''}${isPremium ? '_premium' : ''}`;
    } else {
      return `ws://${ip}:${port}/apiws${isTestServer ? '_test' : ''}${isPremium ? '_premium' : ''}`;
    }
  }

  async connect(port: number, ip: string, isTestServer = false, isPremium = false) {
    this.stream = new Uint8Array(0);
    this.canRead = new Promise((resolve) => {
      this.resolveRead = resolve;
    });
    this.closed = false;

    const candidates = getHostCandidates(ip);
    let lastError: any;

    for (const host of candidates) {
      try {
        await this.connectCandidate(port, host, isTestServer, isPremium);
        recordWorkingHost(ip, host);
        return this;
      } catch (err: any) {
        lastError = err;
        // eslint-disable-next-line no-console
        console.warn(`[PromisedWebSockets] Failed to connect to ${host}, trying next mirror...`, err);
      }
    }

    this.closed = true;
    this.resolveRead?.(false);
    if (this.disconnectedCallback) {
      this.disconnectedCallback();
    }
    throw lastError || new Error(`WebSocket failed to connect to any mirror for ${ip}`);
  }

  private connectCandidate(
    port: number,
    host: string,
    isTestServer = false,
    isPremium = false,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let hasResolved = false;
      let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;

      const website = this.getWebSocketLink(host, port, isTestServer, isPremium);
      this.website = website;

      let client: WebSocket;
      try {
        client = new WebSocket(website, 'binary');
        client.binaryType = 'arraybuffer';
      } catch (err) {
        reject(err);
        return;
      }

      this.client = client;

      const cleanup = () => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = undefined;
        }
      };

      client.onopen = () => {
        if (hasResolved) return;
        hasResolved = true;
        cleanup();
        this.receive();
        resolve();
      };

      client.onerror = (error) => {
        if (hasResolved) return;
        hasResolved = true;
        cleanup();
        // eslint-disable-next-line no-console
        console.error(`WebSocket error (${host})`, error);
        try {
          client.close();
        } catch (_) {}
        reject(error);
      };

      client.onclose = (event) => {
        cleanup();
        // Ignore events from stale clients replaced by newer attempts
        if (this.client !== client) {
          return;
        }

        const { code, reason, wasClean } = event;

        if (!hasResolved) {
          hasResolved = true;
          reject(new Error(`WebSocket closed before open (${host}). Code: ${code}, reason: ${reason}`));
          return;
        }

        if (code !== 1000) {
          // eslint-disable-next-line no-console
          console.error(`Socket ${host} closed. Code: ${code}, reason: ${reason}, was clean: ${wasClean}`);
        }

        this.resolveRead?.(false);
        this.closed = true;
        if (this.disconnectedCallback) {
          this.disconnectedCallback();
        }
      };

      timeout = setTimeout(() => {
        if (hasResolved) return;
        hasResolved = true;
        try {
          client.close();
        } catch (_) {}
        reject(new Error(`WebSocket connection timeout (${host})`));
      }, CANDIDATE_TIMEOUT);
    });
  }

  write(data: Uint8Array) {
    if (this.closed) {
      throw closeError;
    }
    this.client?.send(new Uint8Array(data));
  }

  close() {
    this.client?.close();
    this.closed = true;
  }

  receive() {
    if (!this.client) return;
    this.client.onmessage = async (message) => {
      await this.mutex.runExclusive(async () => {
        const data = message.data instanceof ArrayBuffer
          ? new Uint8Array(message.data)
          : new Uint8Array(await new Response(message.data).arrayBuffer());
        this.stream = concat(this.stream, data);
        this.resolveRead?.(true);
      });
    };
  }
}
