import {
  CreateServicePayload,
  CreateServiceResponse,
  DeleteServiceResponse,
  LoginPayload,
  RegenerateKeyResponse,
  ServiceListItemDto,
  UpdateServicePayload,
  UpdateServiceResponse,
} from './types';

const ADMIN_API_BASE = '/api/admin';

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details: unknown,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export const adminApi = {
  async login(payload: LoginPayload): Promise<void> {
    await request<void>('/login', {
      method: 'POST',
      body: payload,
    });
  },

  async logout(): Promise<void> {
    await request<void>('/logout', {
      method: 'POST',
    });
  },

  async listServices(): Promise<ServiceListItemDto[]> {
    return request<ServiceListItemDto[]>('/services');
  },

  async createService(payload: CreateServicePayload): Promise<CreateServiceResponse> {
    return request<CreateServiceResponse>('/services', {
      method: 'POST',
      body: payload,
    });
  },

  async updateService(
    serviceId: string,
    payload: UpdateServicePayload,
  ): Promise<UpdateServiceResponse> {
    return request<UpdateServiceResponse>(`/services/${serviceId}`, {
      method: 'PATCH',
      body: payload,
    });
  },

  async deleteService(serviceId: string): Promise<DeleteServiceResponse> {
    return request<DeleteServiceResponse>(`/services/${serviceId}`, {
      method: 'DELETE',
    });
  },

  async regenerateKey(serviceId: string): Promise<RegenerateKeyResponse> {
    return request<RegenerateKeyResponse>(`/services/${serviceId}/regenerate-key`, {
      method: 'POST',
    });
  },
};

async function request<T>(
  path: string,
  init: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.body);
  }

  let response: Response;
  try {
    response = await fetch(`${ADMIN_API_BASE}${path}`, {
      ...init,
      body,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new AdminApiError(0, 'NETWORK_ERROR', null);
  }

  const payload = await parsePayload(response);
  if (!response.ok) {
    throw new AdminApiError(
      response.status,
      extractErrorMessage(payload),
      payload,
    );
  }

  return payload as T;
}

async function parsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

function extractErrorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (Array.isArray(message)) {
      return message.join('\n');
    }
    if (typeof message === 'string') {
      return message;
    }
  }

  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload;
  }

  return 'UNKNOWN_ERROR';
}
