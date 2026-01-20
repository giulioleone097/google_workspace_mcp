export const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
export const USERINFO_PROFILE_SCOPE = 'https://www.googleapis.com/auth/userinfo.profile';
export const OPENID_SCOPE = 'openid';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
export const CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
export const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const DOCS_READONLY_SCOPE = 'https://www.googleapis.com/auth/documents.readonly';
export const DOCS_WRITE_SCOPE = 'https://www.googleapis.com/auth/documents';

export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
export const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
export const GMAIL_LABELS_SCOPE = 'https://www.googleapis.com/auth/gmail.labels';
export const GMAIL_SETTINGS_BASIC_SCOPE = 'https://www.googleapis.com/auth/gmail.settings.basic';

export const CHAT_READONLY_SCOPE = 'https://www.googleapis.com/auth/chat.messages.readonly';
export const CHAT_WRITE_SCOPE = 'https://www.googleapis.com/auth/chat.messages';
export const CHAT_SPACES_SCOPE = 'https://www.googleapis.com/auth/chat.spaces';

export const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
export const SHEETS_WRITE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export const FORMS_BODY_SCOPE = 'https://www.googleapis.com/auth/forms.body';
export const FORMS_BODY_READONLY_SCOPE = 'https://www.googleapis.com/auth/forms.body.readonly';
export const FORMS_RESPONSES_READONLY_SCOPE = 'https://www.googleapis.com/auth/forms.responses.readonly';

export const SLIDES_SCOPE = 'https://www.googleapis.com/auth/presentations';
export const SLIDES_READONLY_SCOPE = 'https://www.googleapis.com/auth/presentations.readonly';

export const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';
export const TASKS_READONLY_SCOPE = 'https://www.googleapis.com/auth/tasks.readonly';

export const CUSTOM_SEARCH_SCOPE = 'https://www.googleapis.com/auth/cse';

export const BASE_SCOPES = [USERINFO_EMAIL_SCOPE, USERINFO_PROFILE_SCOPE, OPENID_SCOPE];

export const TOOL_SCOPES_MAP: Record<string, string[]> = {
  gmail: [GMAIL_READONLY_SCOPE, GMAIL_SEND_SCOPE, GMAIL_COMPOSE_SCOPE, GMAIL_MODIFY_SCOPE, GMAIL_LABELS_SCOPE, GMAIL_SETTINGS_BASIC_SCOPE],
  drive: [DRIVE_SCOPE, DRIVE_READONLY_SCOPE, DRIVE_FILE_SCOPE],
  calendar: [CALENDAR_SCOPE, CALENDAR_READONLY_SCOPE, CALENDAR_EVENTS_SCOPE],
  docs: [DOCS_READONLY_SCOPE, DOCS_WRITE_SCOPE],
  sheets: [SHEETS_READONLY_SCOPE, SHEETS_WRITE_SCOPE],
  chat: [CHAT_READONLY_SCOPE, CHAT_WRITE_SCOPE, CHAT_SPACES_SCOPE],
  forms: [FORMS_BODY_SCOPE, FORMS_BODY_READONLY_SCOPE, FORMS_RESPONSES_READONLY_SCOPE],
  slides: [SLIDES_SCOPE, SLIDES_READONLY_SCOPE],
  tasks: [TASKS_SCOPE, TASKS_READONLY_SCOPE],
  search: [CUSTOM_SEARCH_SCOPE],
};

let enabledTools: string[] | null = null;

export function setEnabledTools(tools: string[] | null) {
  enabledTools = tools;
}

export function getCurrentScopes(): string[] {
  const tools = enabledTools ?? Object.keys(TOOL_SCOPES_MAP);
  const scopes = new Set<string>(BASE_SCOPES);
  for (const tool of tools) {
    for (const scope of TOOL_SCOPES_MAP[tool] ?? []) {
      scopes.add(scope);
    }
  }
  return Array.from(scopes);
}
