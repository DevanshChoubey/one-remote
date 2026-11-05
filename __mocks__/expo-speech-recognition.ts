// The real library needs the native module at import time; tests that care mock it themselves.
export const ExpoSpeechRecognitionModule = {
  supportsOnDeviceRecognition: (): boolean => false,
  getSupportedLocales: (): Promise<{ locales: string[]; installedLocales: string[] }> =>
    Promise.resolve({ locales: [], installedLocales: [] }),
  requestPermissionsAsync: (): Promise<{ granted: boolean }> => Promise.resolve({ granted: false }),
  start: (): void => undefined,
  stop: (): void => undefined,
  addListener: (): { remove(): void } => ({ remove: () => undefined }),
};
