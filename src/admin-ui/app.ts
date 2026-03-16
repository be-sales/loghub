import { adminApi, AdminApiError } from './api';
import { buildEnvSnippet } from './helpers';
import { getMessages } from './i18n';
import { renderApp } from './render';
import { createInitialState } from './state';
import {
  AdminUiState,
  ApiKeyRevealState,
  CreateServicePayload,
  ServiceListItemDto,
  UpdateServicePayload,
} from './types';

const locale = 'ru';
const messages = getMessages(locale);

const appRoot = document.getElementById('app');
if (!appRoot) {
  throw new Error('Root элемент #app не найден');
}
const root = appRoot;

let state = createInitialState(locale);

root.addEventListener('click', (event) => {
  void handleClick(event);
});

root.addEventListener('submit', (event) => {
  void handleSubmit(event);
});

void bootstrap();

async function bootstrap(): Promise<void> {
  render();
  await loadServices({ silentUnauthorized: true });
}

function render(): void {
  root.innerHTML = renderApp(state, messages);
}

function setState(updater: (previous: AdminUiState) => AdminUiState): void {
  state = updater(state);
  render();
}

async function loadServices(options: { silentUnauthorized?: boolean; successMessage?: string } = {}): Promise<void> {
  setState((previous) => ({
    ...previous,
    phase: previous.phase === 'login' ? 'booting' : previous.phase,
    busyAction: previous.phase === 'dashboard' ? 'refresh' : previous.busyAction,
    banner: options.successMessage ? { tone: 'success', message: options.successMessage } : previous.banner,
    loginError: null,
  }));

  try {
    const services = await adminApi.listServices();
    setState((previous) => ({
      ...previous,
      phase: 'dashboard',
      services,
      busyAction: null,
      loginError: null,
      formError: null,
      banner: previous.banner,
    }));
  } catch (error) {
    const apiError = normalizeError(error);
    if (apiError.status === 401) {
      const banner = options.silentUnauthorized
        ? null
        : { tone: 'warning' as const, message: messages.loginSessionExpired };
      setState((previous) => ({
        ...previous,
        phase: 'login',
        services: [],
        editor: null,
        reveal: null,
        busyAction: null,
        formError: null,
        banner,
        loginError: null,
      }));
      return;
    }

    const message = resolveApiErrorMessage(apiError);
    setState((previous) => ({
      ...previous,
      phase: previous.phase === 'booting' ? 'login' : previous.phase,
      busyAction: null,
      banner: { tone: 'danger', message },
    }));
  }
}

async function handleClick(event: Event): Promise<void> {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const actionTarget = target.closest<HTMLElement>('[data-action]');
  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;
  const serviceId = actionTarget.dataset.serviceId;

  switch (action) {
    case 'show-create':
      setState((previous) => ({
        ...previous,
        editor: { kind: 'create' },
        formError: null,
      }));
      return;
    case 'cancel-editor':
      setState((previous) => ({
        ...previous,
        editor: null,
        formError: null,
      }));
      return;
    case 'refresh':
      await loadServices({ successMessage: messages.refreshSuccess });
      return;
    case 'logout':
      await logout();
      return;
    case 'edit-service':
      if (!serviceId) return;
      toggleEditor(serviceId);
      return;
    case 'delete-service':
      if (!serviceId) return;
      await deleteService(serviceId);
      return;
    case 'regenerate-key':
      if (!serviceId) return;
      await regenerateKey(serviceId);
      return;
    case 'dismiss-reveal':
      setState((previous) => ({
        ...previous,
        reveal: null,
      }));
      return;
    case 'copy-key':
      if (!state.reveal) return;
      await copyToClipboard(state.reveal.apiKey);
      return;
    case 'copy-snippet':
      if (!state.reveal) return;
      await copyToClipboard(buildEnvSnippet(state.reveal.endpoint, state.reveal.apiKey));
      return;
    default:
      return;
  }
}

async function handleSubmit(event: Event): Promise<void> {
  event.preventDefault();

  const target = event.target;
  if (!(target instanceof HTMLFormElement)) {
    return;
  }

  if (target.id === 'login-form') {
    await login(target);
    return;
  }

  if (target.id === 'service-form') {
    await submitServiceForm(target);
  }
}

async function login(form: HTMLFormElement): Promise<void> {
  const login = readTextField(form, 'login');
  const password = readTextField(form, 'password');

  setState((previous) => ({
    ...previous,
    busyAction: 'login',
    loginError: null,
    banner: null,
  }));

  try {
    await adminApi.login({ login, password });
    await loadServices();
  } catch (error) {
    const apiError = normalizeError(error);
    setState((previous) => ({
      ...previous,
      phase: 'login',
      busyAction: null,
      loginError: resolveLoginError(apiError),
    }));
  }
}

async function submitServiceForm(form: HTMLFormElement): Promise<void> {
  const name = readTextField(form, 'name');
  const description = readOptionalTextField(form, 'description');

  setState((previous) => ({
    ...previous,
    busyAction: 'save',
    formError: null,
  }));

  try {
    if (state.editor?.kind === 'edit') {
      const payload: UpdateServicePayload = {
        name,
        description,
        isActive: readCheckboxField(form, 'isActive'),
      };
      await adminApi.updateService(state.editor.serviceId, payload);
      await loadServices({ successMessage: messages.updateSuccess });
      setState((previous) => ({
        ...previous,
        editor: null,
      }));
      return;
    }

    const payload: CreateServicePayload = {
      name,
      slug: readTextField(form, 'slug'),
      ...(description ? { description } : {}),
    };
    const result = await adminApi.createService(payload);
    await loadServices({ successMessage: messages.createSuccess });
    setState((previous) => ({
      ...previous,
      editor: null,
      reveal: createRevealState(result.name, result.slug, result.apiKey, result.apiKeyLast4),
    }));
  } catch (error) {
    const apiError = normalizeError(error);
    if (apiError.status === 401) {
      await handleUnauthorized();
      return;
    }

    setState((previous) => ({
      ...previous,
      busyAction: null,
      formError: resolveServiceError(apiError),
    }));
  }
}

function toggleEditor(serviceId: string): void {
  setState((previous) => ({
    ...previous,
    editor:
      previous.editor?.kind === 'edit' && previous.editor.serviceId === serviceId
        ? null
        : { kind: 'edit', serviceId },
    formError: null,
  }));
}

async function deleteService(serviceId: string): Promise<void> {
  const service = getServiceById(serviceId);
  if (!service) {
    setState((previous) => ({
      ...previous,
      banner: { tone: 'warning', message: messages.notFound },
    }));
    return;
  }

  if (!window.confirm(messages.deleteConfirm(service.name))) {
    return;
  }

  setState((previous) => ({
    ...previous,
    busyAction: `delete:${serviceId}`,
  }));

  try {
    await adminApi.deleteService(serviceId);
    setState((previous) => ({
      ...previous,
      services: previous.services.filter((item) => item.id !== serviceId),
      editor:
        previous.editor?.kind === 'edit' && previous.editor.serviceId === serviceId
          ? null
          : previous.editor,
      busyAction: null,
      banner: { tone: 'success', message: messages.deleteSuccess(service.name) },
    }));
  } catch (error) {
    const apiError = normalizeError(error);
    if (apiError.status === 401) {
      await handleUnauthorized();
      return;
    }

    setState((previous) => ({
      ...previous,
      busyAction: null,
      banner: { tone: 'danger', message: resolveServiceError(apiError) },
    }));
  }
}

async function regenerateKey(serviceId: string): Promise<void> {
  const service = getServiceById(serviceId);
  if (!service) {
    setState((previous) => ({
      ...previous,
      banner: { tone: 'warning', message: messages.notFound },
    }));
    return;
  }

  if (!window.confirm(messages.regenerateConfirm(service.name))) {
    return;
  }

  setState((previous) => ({
    ...previous,
    busyAction: `regenerate:${serviceId}`,
  }));

  try {
    const result = await adminApi.regenerateKey(serviceId);
    setState((previous) => ({
      ...previous,
      services: previous.services.map((item) =>
        item.id === serviceId ? { ...item, apiKeyLast4: result.apiKeyLast4 } : item,
      ),
      busyAction: null,
      banner: { tone: 'success', message: messages.regenerateSuccess(service.name) },
      reveal: createRevealState(service.name, service.slug, result.apiKey, result.apiKeyLast4),
    }));
  } catch (error) {
    const apiError = normalizeError(error);
    if (apiError.status === 401) {
      await handleUnauthorized();
      return;
    }

    setState((previous) => ({
      ...previous,
      busyAction: null,
      banner: { tone: 'danger', message: resolveServiceError(apiError) },
    }));
  }
}

async function logout(): Promise<void> {
  setState((previous) => ({
    ...previous,
    busyAction: 'logout',
  }));

  try {
    await adminApi.logout();
  } finally {
    setState((previous) => ({
      ...previous,
      phase: 'login',
      services: [],
      editor: null,
      reveal: null,
      busyAction: null,
      banner: { tone: 'success', message: messages.loginSessionExpired },
      loginError: null,
      formError: null,
    }));
  }
}

async function handleUnauthorized(): Promise<void> {
  setState((previous) => ({
    ...previous,
    phase: 'login',
    services: [],
    editor: null,
    reveal: null,
    busyAction: null,
    formError: null,
    banner: { tone: 'warning', message: messages.loginSessionExpired },
  }));
}

async function copyToClipboard(value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      copyWithFallback(value);
    }
    setState((previous) => ({
      ...previous,
      banner: { tone: 'success', message: messages.copySuccess },
    }));
  } catch {
    setState((previous) => ({
      ...previous,
      banner: { tone: 'danger', message: messages.networkError },
    }));
  }
}

function copyWithFallback(value: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function resolveLoginError(error: AdminApiError): string {
  if (error.status === 401) {
    return messages.loginInvalid;
  }
  if (error.status === 429) {
    return messages.loginThrottled;
  }
  return resolveApiErrorMessage(error);
}

function resolveServiceError(error: AdminApiError): string {
  if (error.status === 404) {
    return messages.notFound;
  }
  if (error.status === 409) {
    return messages.slugConflict;
  }
  return resolveApiErrorMessage(error);
}

function resolveApiErrorMessage(error: AdminApiError): string {
  if (error.message === 'NETWORK_ERROR' || error.status === 0) {
    return messages.networkError;
  }

  if (error.message === 'UNKNOWN_ERROR') {
    return messages.genericServerError;
  }

  if (error.status === 400 && error.message.trim().length > 0) {
    return error.message;
  }

  if (error.status >= 500) {
    return messages.genericServerError;
  }

  return error.message || messages.unknownValidationError;
}

function normalizeError(error: unknown): AdminApiError {
  if (error instanceof AdminApiError) {
    return error;
  }

  return new AdminApiError(0, 'NETWORK_ERROR', null);
}

function readTextField(form: HTMLFormElement, name: string): string {
  const value = readFieldValue(form, name);
  return value.trim();
}

function readOptionalTextField(form: HTMLFormElement, name: string): string | undefined {
  const value = readFieldValue(form, name).trim();
  return value.length > 0 ? value : undefined;
}

function readCheckboxField(form: HTMLFormElement, name: string): boolean {
  const element = form.elements.namedItem(name);
  if (!(element instanceof HTMLInputElement)) {
    return false;
  }
  return element.checked;
}

function readFieldValue(form: HTMLFormElement, name: string): string {
  const element = form.elements.namedItem(name);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return '';
  }
  return element.value;
}

function createRevealState(
  serviceName: string,
  serviceSlug: string,
  apiKey: string,
  apiKeyLast4: string,
): ApiKeyRevealState {
  return {
    serviceName,
    serviceSlug,
    apiKey,
    apiKeyLast4,
    endpoint: window.location.origin,
  };
}

function getServiceById(serviceId: string): ServiceListItemDto | undefined {
  return state.services.find((service) => service.id === serviceId);
}
