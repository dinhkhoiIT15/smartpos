export type SmartPosAppInfo = {
  name: string;
  version: string;
  mode: 'DEMO_ONLY';
  localSchemaVersion: number;
};

export interface SmartPosBridge {
  getAppInfo(): Promise<SmartPosAppInfo>;
}

declare global {
  interface Window {
    smartpos: SmartPosBridge;
  }
}

export {};
