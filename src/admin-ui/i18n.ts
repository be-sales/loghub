import { Locale } from './types';

export interface UiMessages {
  appTitle: string;
  appDescription: string;
  appTagline: string;
  metricServices: string;
  metricKeys: string;
  metricTopics: string;
  metricTopicsEmpty: string;
  loginEyebrow: string;
  loginTitle: string;
  loginDescription: string;
  loginFieldLabel: string;
  passwordFieldLabel: string;
  loginSubmit: string;
  loginHint: string;
  loadingTitle: string;
  loadingDescription: string;
  toolbarCreate: string;
  toolbarRefresh: string;
  toolbarLogout: string;
  tableTitle: string;
  tableDescription: string;
  tableName: string;
  tableSlug: string;
  tableStatus: string;
  tableKey: string;
  tableTopic: string;
  tableLogs: string;
  tableCreated: string;
  tableUpdated: string;
  tableActions: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction: string;
  panelCreateEyebrow: string;
  panelCreateTitle: string;
  panelCreateDescription: string;
  panelEditEyebrow: string;
  panelEditTitle: string;
  panelEditDescription: string;
  fieldName: string;
  fieldSlug: string;
  fieldDescription: string;
  fieldActive: string;
  descriptionPlaceholder: string;
  createSubmit: string;
  updateSubmit: string;
  cancel: string;
  revealEyebrow: string;
  revealTitle: string;
  revealDescription: string;
  apiKeyLabel: string;
  endpointLabel: string;
  snippetLabel: string;
  copyKey: string;
  copySnippet: string;
  closeReveal: string;
  revealWarning: string;
  loginInvalid: string;
  loginThrottled: string;
  loginSessionExpired: string;
  genericServerError: string;
  networkError: string;
  createSuccess: string;
  updateSuccess: string;
  refreshSuccess: string;
  copySuccess: string;
  unknownValidationError: string;
  actionEdit: string;
  actionDelete: string;
  actionRegenerate: string;
  statusActive: string;
  statusInactive: string;
  topicMissing: string;
  envSnippetHelper: string;
  deleteConfirm: (name: string) => string;
  regenerateConfirm: (name: string) => string;
  deleteSuccess: (name: string) => string;
  regenerateSuccess: (name: string) => string;
  rowLogs: (count: number) => string;
  rowTopic: (topicId: number) => string;
  notFound: string;
  slugConflict: string;
}

const messages: Record<Locale, UiMessages> = {
  ru: {
    appTitle: 'Визуальная админка LogHub',
    appDescription:
      'Добавляй сервисы, выдавай API-ключи и управляй источниками логов без ручного curl.',
    appTagline: 'Один экран для сервисов, ключей и статуса отправителей.',
    metricServices: 'Сервисов',
    metricKeys: 'Активных ключей',
    metricTopics: 'Топиков в Telegram',
    metricTopicsEmpty: 'ещё не привязаны',
    loginEyebrow: 'Вход администратора',
    loginTitle: 'Command deck для источников логов',
    loginDescription:
      'Войди под админом, чтобы выдавать API-ключи приложениям, ботам и сайтам, которые будут слать ошибки в LogHub.',
    loginFieldLabel: 'Логин',
    passwordFieldLabel: 'Пароль',
    loginSubmit: 'Войти',
    loginHint:
      'Токен не хранится в интерфейсе: после входа backend устанавливает HttpOnly cookie только для /api/admin.',
    loadingTitle: 'Собираю control room',
    loadingDescription: 'Проверяю активную сессию и подтягиваю сервисы.',
    toolbarCreate: 'Добавить сервис',
    toolbarRefresh: 'Обновить список',
    toolbarLogout: 'Выйти',
    tableTitle: 'Источники логов',
    tableDescription:
      'Каждый сервис получает собственный API key и отдельный Telegram topic при первой ошибке.',
    tableName: 'Сервис',
    tableSlug: 'Slug',
    tableStatus: 'Статус',
    tableKey: 'API key',
    tableTopic: 'Topic',
    tableLogs: 'Логи',
    tableCreated: 'Создан',
    tableUpdated: 'Обновлён',
    tableActions: 'Действия',
    emptyTitle: 'Сервисов пока нет',
    emptyDescription:
      'Создай первый источник логов, и админка сразу покажет тебе API key и готовый env snippet.',
    emptyAction: 'Создать первый сервис',
    panelCreateEyebrow: 'Новый источник',
    panelCreateTitle: 'Выдать API key',
    panelCreateDescription:
      'Используй понятное имя и стабильный slug. Ключ будет показан один раз сразу после создания.',
    panelEditEyebrow: 'Редактирование',
    panelEditTitle: 'Обновить сервис',
    panelEditDescription:
      'Можно менять отображаемое имя, описание и активность без перегенерации API key.',
    fieldName: 'Название сервиса',
    fieldSlug: 'Slug',
    fieldDescription: 'Описание',
    fieldActive: 'Сервис активен и может отправлять логи',
    descriptionPlaceholder: 'Например: production API, маркетинговый сайт или Telegram-бот',
    createSubmit: 'Создать сервис',
    updateSubmit: 'Сохранить изменения',
    cancel: 'Отмена',
    revealEyebrow: 'One-time reveal',
    revealTitle: 'Новый API key готов',
    revealDescription:
      'Сохрани его сразу в env внешнего проекта. Повторно полный ключ уже не покажется.',
    apiKeyLabel: 'API key',
    endpointLabel: 'Endpoint',
    snippetLabel: 'Готовый env snippet',
    copyKey: 'Скопировать ключ',
    copySnippet: 'Скопировать env',
    closeReveal: 'Скрыть карточку',
    revealWarning:
      'После закрытия остаётся только `apiKeyLast4`. Если потеряешь ключ, придётся делать regenerate.',
    loginInvalid: 'Неверные логин или пароль.',
    loginThrottled: 'Слишком много попыток входа. Подожди и попробуй снова.',
    loginSessionExpired:
      'Сессия больше невалидна. Войди заново, чтобы продолжить работу.',
    genericServerError: 'Сервис ответил ошибкой. Попробуй ещё раз через пару секунд.',
    networkError: 'Не удалось связаться с backend. Проверь сеть или Railway deployment.',
    createSuccess: 'Сервис создан и готов принимать логи.',
    updateSuccess: 'Изменения сохранены.',
    refreshSuccess: 'Список сервисов обновлён.',
    copySuccess: 'Скопировано в буфер обмена.',
    unknownValidationError: 'Проверь заполнение формы и попробуй снова.',
    actionEdit: 'Редактировать',
    actionDelete: 'Удалить',
    actionRegenerate: 'Regenerate key',
    statusActive: 'Активен',
    statusInactive: 'Отключён',
    topicMissing: 'ещё не создан',
    envSnippetHelper:
      'Этот snippet можно сразу отдавать ИИ-агенту или вставлять в `.env` внешнего сервиса.',
    deleteConfirm: (name) =>
      `Удалить сервис "${name}"? Это каскадно удалит его логи и инвалидирует текущий API key.`,
    regenerateConfirm: (name) =>
      `Перегенерировать API key для "${name}"? Старый ключ перестанет работать сразу.`,
    deleteSuccess: (name) => `Сервис "${name}" удалён.`,
    regenerateSuccess: (name) =>
      `Для сервиса "${name}" выпущен новый API key.`,
    rowLogs: (count) => `${count}`,
    rowTopic: (topicId) => `#${topicId}`,
    notFound:
      'Сервис не найден. Возможно, его уже изменили или удалили в другом окне.',
    slugConflict:
      'Такой slug уже занят. Используй другой идентификатор сервиса.',
  },
  en: {
    appTitle: 'LogHub admin UI',
    appDescription:
      'Create services, issue API keys, and manage log senders without raw curl.',
    appTagline: 'One screen for service sources, keys, and delivery status.',
    metricServices: 'Services',
    metricKeys: 'Active keys',
    metricTopics: 'Telegram topics',
    metricTopicsEmpty: 'not created yet',
    loginEyebrow: 'Admin login',
    loginTitle: 'Command deck for log sources',
    loginDescription:
      'Sign in as admin to issue API keys for apps, bots, and sites that will send errors into LogHub.',
    loginFieldLabel: 'Login',
    passwordFieldLabel: 'Password',
    loginSubmit: 'Sign in',
    loginHint:
      'The token is never stored in UI code: backend sets an HttpOnly cookie scoped to /api/admin.',
    loadingTitle: 'Preparing control room',
    loadingDescription: 'Checking active session and loading services.',
    toolbarCreate: 'Create service',
    toolbarRefresh: 'Refresh',
    toolbarLogout: 'Logout',
    tableTitle: 'Log sources',
    tableDescription:
      'Each service gets its own API key and a dedicated Telegram topic on first error.',
    tableName: 'Service',
    tableSlug: 'Slug',
    tableStatus: 'Status',
    tableKey: 'API key',
    tableTopic: 'Topic',
    tableLogs: 'Logs',
    tableCreated: 'Created',
    tableUpdated: 'Updated',
    tableActions: 'Actions',
    emptyTitle: 'No services yet',
    emptyDescription:
      'Create your first log source and the UI will immediately reveal the API key and env snippet.',
    emptyAction: 'Create first service',
    panelCreateEyebrow: 'New source',
    panelCreateTitle: 'Issue API key',
    panelCreateDescription:
      'Use a clear name and a stable slug. The key is shown exactly once after creation.',
    panelEditEyebrow: 'Editing',
    panelEditTitle: 'Update service',
    panelEditDescription:
      'Change display name, description, and active flag without regenerating the API key.',
    fieldName: 'Service name',
    fieldSlug: 'Slug',
    fieldDescription: 'Description',
    fieldActive: 'Service is active and can send logs',
    descriptionPlaceholder: 'For example: production API, marketing site, or Telegram bot',
    createSubmit: 'Create service',
    updateSubmit: 'Save changes',
    cancel: 'Cancel',
    revealEyebrow: 'One-time reveal',
    revealTitle: 'New API key is ready',
    revealDescription:
      'Store it immediately in the external project env. The full key will not be shown again.',
    apiKeyLabel: 'API key',
    endpointLabel: 'Endpoint',
    snippetLabel: 'Ready-to-use env snippet',
    copyKey: 'Copy key',
    copySnippet: 'Copy env',
    closeReveal: 'Hide card',
    revealWarning:
      'After closing this card only `apiKeyLast4` remains visible. If the key is lost, you must regenerate it.',
    loginInvalid: 'Invalid login or password.',
    loginThrottled: 'Too many login attempts. Wait a bit and try again.',
    loginSessionExpired: 'Session is no longer valid. Sign in again to continue.',
    genericServerError: 'Server returned an error. Try again in a moment.',
    networkError: 'Cannot reach the backend. Check network or Railway deployment.',
    createSuccess: 'Service created and ready to receive logs.',
    updateSuccess: 'Changes saved.',
    refreshSuccess: 'Service list refreshed.',
    copySuccess: 'Copied to clipboard.',
    unknownValidationError: 'Check the form fields and try again.',
    actionEdit: 'Edit',
    actionDelete: 'Delete',
    actionRegenerate: 'Regenerate key',
    statusActive: 'Active',
    statusInactive: 'Disabled',
    topicMissing: 'not created yet',
    envSnippetHelper:
      'You can hand this snippet directly to an AI agent or paste it into the external service `.env`.',
    deleteConfirm: (name) =>
      `Delete service "${name}"? This will cascade-delete its logs and invalidate the current API key.`,
    regenerateConfirm: (name) =>
      `Regenerate API key for "${name}"? The old key will stop working immediately.`,
    deleteSuccess: (name) => `Service "${name}" deleted.`,
    regenerateSuccess: (name) =>
      `A new API key has been issued for "${name}".`,
    rowLogs: (count) => `${count}`,
    rowTopic: (topicId) => `#${topicId}`,
    notFound:
      'Service was not found. It may have already been changed or deleted in another tab.',
    slugConflict: 'This slug is already in use. Choose another service identifier.',
  },
};

export function getMessages(locale: Locale): UiMessages {
  return messages[locale];
}
