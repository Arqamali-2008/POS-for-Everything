/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DATA_MODE?: 'local' | 'api';
  readonly VITE_WS_URL?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_DEFAULT_THEME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
