export type Locale = 'ru' | 'en';

export interface ServiceCountDto {
  errorLogs: number;
}

export interface ServiceListItemDto {
  id: string;
  name: string;
  slug: string;
  apiKeyLast4: string;
  topicId: number | null;
  isActive: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count: ServiceCountDto;
}

export interface CreateServicePayload {
  name: string;
  slug: string;
  description?: string;
}

export interface CreateServiceResponse {
  id: string;
  name: string;
  slug: string;
  apiKey: string;
  apiKeyLast4: string;
  createdAt: string;
}

export interface UpdateServicePayload {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateServiceResponse {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  description: string | null;
  updatedAt: string;
}

export interface RegenerateKeyResponse {
  apiKey: string;
  apiKeyLast4: string;
}

export interface DeleteServiceResponse {
  message: string;
}

export interface LoginPayload {
  login: string;
  password: string;
}

export interface UiBanner {
  tone: 'danger' | 'success' | 'warning';
  message: string;
}

export interface ApiKeyRevealState {
  serviceName: string;
  serviceSlug: string;
  endpoint: string;
  apiKey: string;
  apiKeyLast4: string;
}

export type EditorPanelState =
  | { kind: 'create' }
  | { kind: 'edit'; serviceId: string }
  | null;

export interface AdminUiState {
  phase: 'booting' | 'login' | 'dashboard';
  locale: Locale;
  services: ServiceListItemDto[];
  editor: EditorPanelState;
  banner: UiBanner | null;
  loginError: string | null;
  formError: string | null;
  busyAction: string | null;
  reveal: ApiKeyRevealState | null;
}
