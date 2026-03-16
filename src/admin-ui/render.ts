import { escapeHtml, formatDateTime, buildEnvSnippet } from './helpers';
import { UiMessages } from './i18n';
import { AdminUiState, ServiceListItemDto } from './types';

export function renderApp(state: AdminUiState, t: UiMessages): string {
  const body = state.phase === 'booting'
    ? renderBooting(t)
    : state.phase === 'login'
      ? renderLogin(state, t)
      : renderDashboard(state, t);

  return `<main class="admin-shell">${body}</main>`;
}

function renderBooting(t: UiMessages): string {
  return `
    <section class="hero-card splash-card">
      <div>
        <span class="hero-eyebrow">${escapeHtml(t.loginEyebrow)}</span>
        <h1 class="hero-title">${escapeHtml(t.loadingTitle)}</h1>
        <p class="hero-description">${escapeHtml(t.loadingDescription)}</p>
      </div>
      <div class="splash-copy">
        <div class="splash-pulse" aria-hidden="true"></div>
      </div>
    </section>
  `;
}

function renderLogin(state: AdminUiState, t: UiMessages): string {
  return `
    <section class="hero-card">
      <div>
        <span class="hero-eyebrow">${escapeHtml(t.loginEyebrow)}</span>
        <h1 class="hero-title">${escapeHtml(t.loginTitle)}</h1>
        <p class="hero-description">${escapeHtml(t.loginDescription)}</p>
        <p class="supporting-text">${escapeHtml(t.loginHint)}</p>
      </div>
      <div class="panel">
        <span class="panel-eyebrow">${escapeHtml(t.appTitle)}</span>
        <h2 class="panel-title">${escapeHtml(t.loginSubmit)}</h2>
        <p class="panel-description">${escapeHtml(t.appTagline)}</p>
        ${renderBanner(state.banner)}
        ${state.loginError ? renderNotice('danger', state.loginError) : ''}
        <form id="login-form" class="form-grid">
          <label class="field">
            <span class="field-label">${escapeHtml(t.loginFieldLabel)}</span>
            <input class="field-input" name="login" autocomplete="username" required />
          </label>
          <label class="field">
            <span class="field-label">${escapeHtml(t.passwordFieldLabel)}</span>
            <input class="field-input" name="password" type="password" autocomplete="current-password" required />
          </label>
          <div class="login-actions">
            <button class="button button--primary" type="submit" ${isBusy(state, 'login') ? 'disabled' : ''}>
              ${escapeHtml(t.loginSubmit)}
            </button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function renderDashboard(state: AdminUiState, t: UiMessages): string {
  const topicsCount = state.services.filter((service) => service.topicId !== null).length;
  const editingService = resolveEditingService(state.services, state.editor);

  return `
    <section class="hero-card">
      <div>
        <span class="hero-eyebrow">${escapeHtml(t.appTitle)}</span>
        <h1 class="hero-title">${escapeHtml(t.appDescription)}</h1>
        <p class="hero-description">${escapeHtml(t.appTagline)}</p>
        <div class="hero-summary">
          <article class="metric-card">
            <div class="metric-label">${escapeHtml(t.metricServices)}</div>
            <div class="metric-value">${state.services.length}</div>
          </article>
          <article class="metric-card">
            <div class="metric-label">${escapeHtml(t.metricKeys)}</div>
            <div class="metric-value">${state.services.filter((service) => service.isActive).length}</div>
          </article>
          <article class="metric-card">
            <div class="metric-label">${escapeHtml(t.metricTopics)}</div>
            <div class="metric-value">${topicsCount}</div>
            <div class="supporting-text">${escapeHtml(t.metricTopicsEmpty)}</div>
          </article>
        </div>
      </div>
      <div class="panel">
        <div class="toolbar">
          <div class="toolbar-group">
            <button class="button button--primary" data-action="show-create">
              ${escapeHtml(t.toolbarCreate)}
            </button>
            <button class="button button--secondary" data-action="refresh" ${isBusy(state, 'refresh') ? 'disabled' : ''}>
              ${escapeHtml(t.toolbarRefresh)}
            </button>
          </div>
          <button class="button button--ghost" data-action="logout" ${isBusy(state, 'logout') ? 'disabled' : ''}>
            ${escapeHtml(t.toolbarLogout)}
          </button>
        </div>
        ${renderBanner(state.banner)}
      </div>
    </section>

    <section class="panel-grid">
      <article class="panel">
        ${renderEditorPanel(state, t, editingService)}
      </article>
      ${state.reveal ? renderRevealCard(state.reveal, t) : renderHintCard(t)}
    </section>

    ${
      state.services.length === 0
        ? renderEmptyState(t)
        : `
          <section class="table-card">
            <div class="toolbar">
              <div>
                <h2 class="panel-title">${escapeHtml(t.tableTitle)}</h2>
                <p class="table-meta">${escapeHtml(t.tableDescription)}</p>
              </div>
            </div>
            <div class="table-scroll">
              <table class="services-table">
                <thead>
                  <tr>
                    <th>${escapeHtml(t.tableName)}</th>
                    <th>${escapeHtml(t.tableSlug)}</th>
                    <th>${escapeHtml(t.tableStatus)}</th>
                    <th>${escapeHtml(t.tableKey)}</th>
                    <th>${escapeHtml(t.tableTopic)}</th>
                    <th>${escapeHtml(t.tableLogs)}</th>
                    <th>${escapeHtml(t.tableCreated)}</th>
                    <th>${escapeHtml(t.tableUpdated)}</th>
                    <th>${escapeHtml(t.tableActions)}</th>
                  </tr>
                </thead>
                <tbody>
                  ${state.services.map((service) => renderServiceRow(service, state, t)).join('')}
                </tbody>
              </table>
            </div>
          </section>
        `
    }
  `;
}

function renderEditorPanel(
  state: AdminUiState,
  t: UiMessages,
  editingService: ServiceListItemDto | null,
): string {
  const isEdit = state.editor?.kind === 'edit' && editingService !== null;
  const nameValue = isEdit ? editingService.name : '';
  const slugValue = isEdit ? editingService.slug : '';
  const descriptionValue = isEdit ? editingService.description ?? '' : '';
  const activeChecked = isEdit && editingService.isActive ? 'checked' : '';

  return `
    <span class="panel-eyebrow">
      ${escapeHtml(isEdit ? t.panelEditEyebrow : t.panelCreateEyebrow)}
    </span>
    <h2 class="panel-title">
      ${escapeHtml(isEdit ? t.panelEditTitle : t.panelCreateTitle)}
    </h2>
    <p class="panel-description">
      ${escapeHtml(isEdit ? t.panelEditDescription : t.panelCreateDescription)}
    </p>
    ${state.formError ? renderNotice('danger', state.formError) : ''}
    <form id="service-form" class="form-grid">
      <label class="field">
        <span class="field-label">${escapeHtml(t.fieldName)}</span>
        <input
          class="field-input"
          name="name"
          value="${escapeHtml(nameValue)}"
          minlength="2"
          maxlength="100"
          required
        />
      </label>
      ${
        isEdit
          ? ''
          : `
            <label class="field">
              <span class="field-label">${escapeHtml(t.fieldSlug)}</span>
              <input
                class="field-input mono"
                name="slug"
                value="${escapeHtml(slugValue)}"
                minlength="3"
                maxlength="50"
                pattern="^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$"
                required
              />
            </label>
          `
      }
      <label class="field">
        <span class="field-label">${escapeHtml(t.fieldDescription)}</span>
        <textarea
          class="field-textarea"
          name="description"
          maxlength="500"
          placeholder="${escapeHtml(t.descriptionPlaceholder)}"
        >${escapeHtml(descriptionValue)}</textarea>
      </label>
      ${
        isEdit
          ? `
            <label class="switch-field">
              <input type="checkbox" name="isActive" ${activeChecked} />
              <span>${escapeHtml(t.fieldActive)}</span>
            </label>
          `
          : ''
      }
      <div class="form-actions">
        <button class="button button--primary" type="submit" ${state.busyAction === 'save' ? 'disabled' : ''}>
          ${escapeHtml(isEdit ? t.updateSubmit : t.createSubmit)}
        </button>
        ${
          state.editor
            ? `
              <button class="button button--subtle" type="button" data-action="cancel-editor">
                ${escapeHtml(t.cancel)}
              </button>
            `
            : ''
        }
      </div>
    </form>
  `;
}

function renderRevealCard(
  reveal: NonNullable<AdminUiState['reveal']>,
  t: UiMessages,
): string {
  const envSnippet = buildEnvSnippet(reveal.endpoint, reveal.apiKey);
  return `
    <aside class="reveal-card">
      <span class="reveal-eyebrow">${escapeHtml(t.revealEyebrow)}</span>
      <h2 class="reveal-title">${escapeHtml(t.revealTitle)}</h2>
      <p class="reveal-description">${escapeHtml(t.revealDescription)}</p>
      <div class="supporting-text">
        <strong>${escapeHtml(reveal.serviceName)}</strong>
        <span class="mono">${escapeHtml(reveal.serviceSlug)}</span>
      </div>
      <div class="reveal-box"><strong>${escapeHtml(t.apiKeyLabel)}:</strong>\n${escapeHtml(reveal.apiKey)}</div>
      <div class="supporting-text">${escapeHtml(t.endpointLabel)}: <span class="mono">${escapeHtml(reveal.endpoint)}</span></div>
      <div class="reveal-warning">${escapeHtml(t.revealWarning)}</div>
      <div class="supporting-text">${escapeHtml(t.envSnippetHelper)}</div>
      <div class="snippet-box"><strong>${escapeHtml(t.snippetLabel)}:</strong>\n${escapeHtml(envSnippet)}</div>
      <div class="reveal-actions">
        <button class="button button--secondary" data-action="copy-key">
          ${escapeHtml(t.copyKey)}
        </button>
        <button class="button button--secondary" data-action="copy-snippet">
          ${escapeHtml(t.copySnippet)}
        </button>
        <button class="button button--subtle" data-action="dismiss-reveal">
          ${escapeHtml(t.closeReveal)}
        </button>
      </div>
    </aside>
  `;
}

function renderHintCard(t: UiMessages): string {
  return `
    <aside class="reveal-card">
      <span class="reveal-eyebrow">${escapeHtml(t.revealEyebrow)}</span>
      <h2 class="reveal-title">${escapeHtml(t.snippetLabel)}</h2>
      <p class="reveal-description">${escapeHtml(t.revealDescription)}</p>
      <div class="reveal-warning">${escapeHtml(t.revealWarning)}</div>
    </aside>
  `;
}

function renderEmptyState(t: UiMessages): string {
  return `
    <section class="empty-card">
      <h2 class="panel-title">${escapeHtml(t.emptyTitle)}</h2>
      <p class="empty-description">${escapeHtml(t.emptyDescription)}</p>
      <button class="button button--primary" data-action="show-create">
        ${escapeHtml(t.emptyAction)}
      </button>
    </section>
  `;
}

function renderServiceRow(
  service: ServiceListItemDto,
  state: AdminUiState,
  t: UiMessages,
): string {
  const isEditing = state.editor?.kind === 'edit' && state.editor.serviceId === service.id;

  return `
    <tr>
      <td>
        <span class="service-name">${escapeHtml(service.name)}</span>
        ${
          service.description
            ? `<span class="service-description">${escapeHtml(service.description)}</span>`
            : ''
        }
      </td>
      <td><span class="mono">${escapeHtml(service.slug)}</span></td>
      <td>
        <span class="badge ${service.isActive ? 'badge--active' : 'badge--inactive'}">
          ${escapeHtml(service.isActive ? t.statusActive : t.statusInactive)}
        </span>
      </td>
      <td><span class="mono">••••${escapeHtml(service.apiKeyLast4)}</span></td>
      <td>${service.topicId === null ? escapeHtml(t.topicMissing) : escapeHtml(t.rowTopic(service.topicId))}</td>
      <td>${escapeHtml(t.rowLogs(service._count.errorLogs))}</td>
      <td>${escapeHtml(formatDateTime(service.createdAt, state.locale))}</td>
      <td>${escapeHtml(formatDateTime(service.updatedAt, state.locale))}</td>
      <td>
        <div class="table-actions">
          <button class="table-link" data-action="edit-service" data-service-id="${escapeHtml(service.id)}">
            ${escapeHtml(isEditing ? t.cancel : t.actionEdit)}
          </button>
          <button class="table-link" data-action="regenerate-key" data-service-id="${escapeHtml(service.id)}">
            ${escapeHtml(t.actionRegenerate)}
          </button>
          <button class="table-link table-link--danger" data-action="delete-service" data-service-id="${escapeHtml(service.id)}">
            ${escapeHtml(t.actionDelete)}
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderBanner(banner: AdminUiState['banner']): string {
  if (!banner) {
    return '';
  }

  return renderNotice(banner.tone, banner.message);
}

function renderNotice(
  tone: 'danger' | 'success' | 'warning',
  message: string,
): string {
  return `<div class="notice notice--${tone}">${escapeHtml(message)}</div>`;
}

function resolveEditingService(
  services: ServiceListItemDto[],
  editor: AdminUiState['editor'],
): ServiceListItemDto | null {
  if (editor?.kind !== 'edit') {
    return null;
  }

  return services.find((service) => service.id === editor.serviceId) ?? null;
}

function isBusy(state: AdminUiState, action: string): boolean {
  return state.busyAction === action;
}
