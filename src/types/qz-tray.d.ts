/**
 * qz-tray ships no TypeScript definitions. This covers only the surface this
 * app actually calls - not the full QZ Tray API.
 */
declare module 'qz-tray' {
  interface QzPrintDataOptions {
    pageWidth?: number;
    pageHeight?: number;
    [key: string]: unknown;
  }

  interface QzPrintData {
    type: 'pixel' | 'raw';
    format?: string;
    flavor?: string;
    data: string;
    options?: QzPrintDataOptions;
  }

  interface QzConfigOptions {
    units?: 'in' | 'cm' | 'mm';
    margins?: number | { top?: number; right?: number; bottom?: number; left?: number };
    scaleContent?: boolean;
    colorType?: 'color' | 'grayscale' | 'blackwhite' | 'default';
    size?: { width?: number; height?: number; custom?: boolean };
    [key: string]: unknown;
  }

  interface QzConfig {
    getPrinter(): unknown;
    getOptions(): unknown;
  }

  interface QzWebsocketConnectOptions {
    host?: string | string[];
    usingSecure?: boolean;
    keepAlive?: number;
    retries?: number;
    delay?: number;
  }

  interface QzWebsocket {
    isActive(): boolean;
    connect(options?: QzWebsocketConnectOptions): Promise<void>;
    disconnect(): Promise<void>;
  }

  interface QzPrinters {
    getDefault(): Promise<string>;
    find(query?: string): Promise<string[] | string>;
    details(): Promise<unknown>;
  }

  interface QzConfigs {
    create(printer: string | Record<string, unknown>, options?: QzConfigOptions): QzConfig;
    setDefaults(options: QzConfigOptions): void;
  }

  interface QzSecurity {
    setCertificatePromise(handler: (...args: unknown[]) => unknown): void;
    setSignaturePromise(factory: (...args: unknown[]) => unknown): void;
    setSignatureAlgorithm(algorithm: 'SHA1' | 'SHA256' | 'SHA512'): void;
  }

  interface Qz {
    websocket: QzWebsocket;
    printers: QzPrinters;
    configs: QzConfigs;
    security: QzSecurity;
    print(config: QzConfig | QzConfig[], data: QzPrintData[]): Promise<void>;
    version: string;
  }

  const qz: Qz;
  export default qz;
}
