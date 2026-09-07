declare module 'qz-tray' {
  export interface QzPrinterConfigOptions {
    units?: 'in' | 'cm' | 'mm';
    size?: { width: number; height: number };
    margins?: number | { top: number; right: number; bottom: number; left: number };
    density?: number | string;
    orientation?: 'portrait' | 'landscape' | 'reverse-landscape' | null;
    colorType?: 'color' | 'grayscale' | 'blackwhite';
    interpolation?: 'bicubic' | 'bilinear' | 'nearest-neighbor';
    scaleContent?: boolean;
    rasterize?: boolean;
    copies?: number;
    jobName?: string | null;
    encoding?: string | null;
    [key: string]: unknown;
  }

  export interface QzPrintData {
    type?: 'pixel' | 'raw';
    format?: 'html' | 'image' | 'pdf' | 'command' | 'plain';
    flavor?: 'base64' | 'file' | 'hex' | 'plain' | 'xml';
    data: string;
    options?: Record<string, unknown>;
  }

  export interface QzConfig {
    getPrinter(): string;
    reconfigure(options: QzPrinterConfigOptions): QzConfig;
  }

  const qz: {
    version: string;
    websocket: {
      connect(options?: {
        host?: string | string[];
        usingSecure?: boolean;
        keepAlive?: number;
        retries?: number;
        delay?: number;
      }): Promise<void>;
      disconnect(): Promise<void>;
      isActive(): boolean;
      setClosedCallbacks(calls: ((evt: unknown) => void) | ((evt: unknown) => void)[]): void;
      setErrorCallbacks(calls: ((evt: unknown) => void) | ((evt: unknown) => void)[]): void;
    };
    printers: {
      find(query?: string): Promise<string | string[]>;
      getDefault(): Promise<string | null>;
      details(): Promise<Array<{ name: string; driver?: string; density?: number[]; [k: string]: unknown }>>;
    };
    configs: {
      create(printer: string | null, options?: QzPrinterConfigOptions): QzConfig;
      setDefaults(options: QzPrinterConfigOptions): void;
    };
    print(config: QzConfig, data: Array<QzPrintData | string>, signature?: string): Promise<void>;
    security: {
      setCertificatePromise(promiseCall: (resolve: (v: string) => void, reject: (e: unknown) => void) => void): void;
      setSignaturePromise(
        promiseGen: (toSign: string) => (resolve: (v: string) => void, reject: (e: unknown) => void) => void,
      ): void;
      setSignatureAlgorithm(algorithm: string): void;
    };
    api: {
      setPromiseType(promiser: (resolver: (resolve: unknown, reject: unknown) => void) => unknown): void;
      setSha256Type(hasher: (data: string) => string): void;
      setWebSocketType(ws: unknown): void;
      isVersion(major: number, minor?: number, patch?: number): boolean;
    };
  };

  export default qz;
}
