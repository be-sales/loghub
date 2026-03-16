import { Locale } from './types';

const DATE_TIME_FORMATTERS: Record<Locale, Intl.DateTimeFormat> = {
  ru: new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }),
  en: new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }),
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatDateTime(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return DATE_TIME_FORMATTERS[locale].format(date);
}

export function buildEnvSnippet(endpoint: string, apiKey: string): string {
  return `LOGHUB_ENDPOINT=${endpoint}\nLOGHUB_API_KEY=${apiKey}`;
}
