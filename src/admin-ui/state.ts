import { AdminUiState, Locale } from './types';

export function createInitialState(locale: Locale = 'ru'): AdminUiState {
  return {
    phase: 'booting',
    locale,
    services: [],
    editor: null,
    banner: null,
    loginError: null,
    formError: null,
    busyAction: null,
    reveal: null,
  };
}
