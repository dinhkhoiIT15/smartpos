export type SmartPosAppInfo = {
  name: string;
  version: string;
  mode: 'DEMO_ONLY';
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
