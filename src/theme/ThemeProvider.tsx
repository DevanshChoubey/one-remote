import { StatusBar } from 'expo-status-bar';
import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkTokens, lightTokens } from './tokens';
import type { Tokens } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

const ThemeContext = createContext<Tokens>(lightTokens);

export interface ThemeProviderProps {
  children: ReactNode;
  /** The saved choice; 'system' (the default) follows the OS colour scheme. */
  preference?: ThemePreference;
  /** Forces a scheme (tests, previews); ignores the system and the preference. */
  scheme?: 'light' | 'dark';
}

export function ThemeProvider(props: ThemeProviderProps): ReactElement {
  const system = useColorScheme();
  const preference = props.preference ?? 'system';
  const resolved =
    props.scheme ?? (preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference);
  const tokens = resolved === 'dark' ? darkTokens : lightTokens;
  return (
    <ThemeContext.Provider value={tokens}>
      {/* Dark icons on the light theme, light icons on the dark one, whatever the system says. */}
      <StatusBar style={tokens.dark ? 'light' : 'dark'} />
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Tokens {
  return useContext(ThemeContext);
}
