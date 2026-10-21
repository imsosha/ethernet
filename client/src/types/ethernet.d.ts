export type HermesRadii = {
  ui?: number;
  topbar?: number;
  foldersSidebar?: number;
  messages?: number;
  buttons?: number;
  input?: number;
  avatars?: number;
};

export type HermesMod = {
  colors?: Record<string, string>;
  radii?: HermesRadii;
  borderRadius?: number;
  blurStrength?: number;
  blurGlare?: number;
  blurRefraction?: number;
  blurTargets?: {
    sidebar?: boolean;
    header?: boolean;
    bubbles?: boolean;
    menus?: boolean;
  };
  animationDuration?: number;
  animationCurve?: string;
  animationsDisabled?: boolean;
  disableSnapEffect?: boolean;
  chatWidth?: string;
  messageAlignOwn?: 'right' | 'left' | 'center';
  messageAlignOther?: 'left' | 'right' | 'center';
  wallpaperFile?: string;
  wallpaperKind?: 'image' | 'video' | 'color';
  wallpaperOriginalPath?: string;
  customCss?: string;
  profileOpenMode?: 'shift' | 'overlay';
  mediaMessageWidth?: 'standard' | 'wide' | 'full';
  hideTitlebar?: boolean;
};

export type EthernetMod = HermesMod;
export type EthernetRadii = HermesRadii;

export interface HermesDesktopApi {
  themesList: () => Promise<Array<{
    name: string;
    rawName?: string;
    displayName?: string;
    version?: string;
    author?: string;
    description?: string;
    icon?: string;
    pluginsCount?: number;
    hasPlugins?: boolean;
    active: boolean;
  }>>;
  themeRead: (name: string) => Promise<string>;
  themeSave: (name: string, css: string, wallpaperInfo?: any) => Promise<boolean>;
  themeDelete: (name: string) => Promise<boolean>;
  themeActivate: (name: string | null) => Promise<boolean>;
  pluginsList: () => Promise<Array<{
    id: string;
    name: string;
    enabled: boolean;
    description?: string;
    author?: string;
    version?: string;
    icon?: string;
    themeDependency?: string;
    requiredForTheme?: string;
    permissions?: string[];
    grantedPermissions?: Record<string, boolean>;
    hasDangerousPermissions?: boolean;
    hasActiveDangerousPermissions?: boolean;
  }>>;
  pluginRead: (id: string) => Promise<{ manifest: any; code: string }>;
  pluginSave: (plugin: {
    id?: string;
    name?: string;
    description?: string;
    author?: string;
    version?: string;
    code?: string;
    icon?: string;
    themeDependency?: string;
    requiredForTheme?: string;
    permissions?: string[];
    grantedPermissions?: Record<string, boolean>;
    enabled?: boolean;
  }) => Promise<any>;
  pluginDelete: (id: string) => Promise<boolean>;
  pluginToggle: (id: string) => Promise<boolean>;
  mediaGetSystemState?: () => Promise<{
    active: boolean;
    title?: string;
    artist?: string;
    album?: string;
    app?: string;
    status?: string;
    position?: number;
    duration?: number;
  }>;
  mediaControlSystem?: (action: string, value?: any) => Promise<any>;
  pickFile: (kind: string) => Promise<{ name: string; content: string; path?: string } | null>;
  saveFile: (payload: { defaultName?: string; content: string; ext?: string; filterName?: string }) => Promise<boolean>;
  reload: () => Promise<void>;
  modGet: () => Promise<HermesMod | null>;
  modSet: (mod: HermesMod) => Promise<HermesMod>;
  wallpaperSetFile: (payload: { name?: string; base64?: string; file?: string; kind?: string; path?: string; originalPath?: string; themeName?: string }) => Promise<{ slug?: string; file?: string; originalPath?: string }>;
  wallpaperClear: (themeName?: string) => Promise<boolean>;
  windowMinimize: () => Promise<boolean>;
  windowMaximizeToggle: () => Promise<boolean>;
  windowClose: () => Promise<boolean>;
  windowIsMaximized: () => Promise<boolean>;
  onWindowMaximizedChange: (cb: (isMax: boolean) => void) => () => void;
  showNotification?: (payload: {
    title: string;
    body: string;
    icon?: string;
    time?: string;
    chatId?: string;
    messageId?: number;
    isSilent?: boolean;
  }) => Promise<boolean>;
  onNotificationClick?: (cb: (data: { chatId?: string; messageId?: number }) => void) => () => void;
  onNotificationsDisabledChange?: (cb: (disabled: boolean) => void) => () => void;
  notificationsDisabledGet?: () => Promise<boolean>;
  notificationsDisabledSet?: (disabled: boolean) => Promise<boolean>;
  nativeNotificationsGet?: () => Promise<boolean>;
  nativeNotificationsSet?: (enabled: boolean) => Promise<boolean>;
  closeToTrayDisabledGet?: () => Promise<boolean>;
  closeToTrayDisabledSet?: (disabled: boolean) => Promise<boolean>;
  setUnreadCount?: (count: number) => Promise<boolean>;
  networkGeoInfo?: () => Promise<any>;
  safeModeGet?: () => Promise<boolean>;
  safeModeSet?: (enabled: boolean) => Promise<boolean>;
  lastCrashedPluginGet?: () => Promise<{ id: string; error: string; time: number } | null>;
  clearLastCrashedPlugin?: () => Promise<boolean>;
  reportPluginCrash?: (pluginId: string, error: string) => Promise<any>;
}

export interface HermesPluginHookResult<T = any> {
  cancel?: boolean;
  result?: T;
  args?: any;
  update?: any;
}

export interface HermesApiHooks {
  beforeRequest: (cb: (method: string, args: any) => boolean | HermesPluginHookResult | void) => () => void;
  onRequest: (cb: (method: string, args: any) => void) => () => void;
  onUpdate: (cb: (update: any) => boolean | HermesPluginHookResult | any | void) => () => void;
  afterUpdate: (cb: (update: any) => void) => () => void;
  _runBeforeRequest?: (method: string, args: any) => { cancel: boolean; result?: any; args?: any };
  _runOnUpdate?: (update: any) => { cancel: boolean; update?: any };
  _runAfterUpdate?: (update: any) => void;
}

export interface HermesStoreApi {
  getGlobal: () => any;
  setGlobal: (stateOrUpdater: any) => void;
  getActions: () => any;
  subscribe: (listener: () => void) => () => void;
}

export interface HermesLoaderApi {
  version: string;
  on: (event: string, cb: (data: any) => void) => () => void;
  off: (event: string, cb: (data: any) => void) => void;
  emit: (event: string, data: any) => void;
  addStyle: (css: string, id?: string) => HTMLStyleElement;
  log: (...args: any[]) => void;
  applyTheme: (name: string) => Promise<void>;
  clearTheme: () => void;
  applyMod: (mod: HermesMod) => void;
  wallpaperSet?: (file: string | null, kind?: 'image' | 'video' | 'color') => void;
  wallpaperClear?: () => void;
  api: HermesApiHooks;
  store: HermesStoreApi;
}

declare global {
  interface Window {
    ethernetDesktop?: HermesDesktopApi;
    hermesDesktop?: HermesDesktopApi;
    ethernet?: HermesLoaderApi;
    hermes?: HermesLoaderApi;
    __ethernetActiveTheme?: string | null;
    __hermesActiveTheme?: string | null;
    __ethernetMod?: HermesMod;
    __hermesMod?: HermesMod;
    __hermesPrevColors?: Record<string, string> | null;
    __hermesThemeBackup?: Record<string, string | null> | null;
    EyeDropper?: {
      new (): {
        open: () => Promise<{ sRGBHex: string }>;
      };
    };
  }
}
