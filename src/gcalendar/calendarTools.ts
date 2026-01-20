import { z } from 'zod';
import { registerTool } from '../core/toolRegistry.js';
import { textResponse } from '../core/utils.js';
import { getAuthenticatedGoogleService } from '../auth/googleAuth.js';
import { CALENDAR_READONLY_SCOPE, CALENDAR_EVENTS_SCOPE } from '../auth/scopes.js';

export function registerCalendarTools(server: any) {
  registerTool(server, {
    name: 'list_calendars',
    description: 'List accessible Google Calendars.',
    inputSchema: z.object({ user_google_email: z.string() }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'calendar',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [CALENDAR_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.calendarList.list();
      const calendars = response.data.items ?? [];
      const lines = calendars.map((cal: any) => `- ${cal.summary} (ID: ${cal.id})${cal.primary ? ' (Primary)' : ''}`);
      return textResponse(lines.length ? lines.join('\n') : 'No calendars found.');
    },
  });

  registerTool(server, {
    name: 'get_events',
    description: 'Get events from a Google Calendar.',
    inputSchema: z.object({
      user_google_email: z.string(),
      calendar_id: z.string().optional(),
      event_id: z.string().optional(),
      time_min: z.string().optional(),
      time_max: z.string().optional(),
      max_results: z.number().int().min(1).max(250).optional(),
      query: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'calendar',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [CALENDAR_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const calendarId = input.calendar_id ?? 'primary';
      if (input.event_id) {
        const response = await service.events.get({ calendarId, eventId: input.event_id });
        return textResponse(`Event: ${response.data.summary ?? 'Untitled'} (ID: ${response.data.id})`);
      }
      const response = await service.events.list({
        calendarId,
        timeMin: input.time_min,
        timeMax: input.time_max,
        maxResults: input.max_results ?? 25,
        q: input.query,
        singleEvents: true,
        orderBy: 'startTime',
      });
      const events = response.data.items ?? [];
      const lines = events.map((event: any) => `- ${event.summary ?? 'Untitled'} (${event.start?.dateTime ?? event.start?.date} -> ${event.end?.dateTime ?? event.end?.date}) ID: ${event.id}`);
      return textResponse(lines.length ? lines.join('\n') : 'No events found.');
    },
  });

  registerTool(server, {
    name: 'create_event',
    description: 'Create a Google Calendar event.',
    inputSchema: z.object({
      user_google_email: z.string(),
      summary: z.string(),
      start_time: z.string(),
      end_time: z.string(),
      calendar_id: z.string().optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      attendees: z.array(z.string()).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'calendar',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [CALENDAR_EVENTS_SCOPE],
        sessionId: context?.sessionId,
      });
      const calendarId = input.calendar_id ?? 'primary';
      const body: any = {
        summary: input.summary,
        start: input.start_time.includes('T') ? { dateTime: input.start_time } : { date: input.start_time },
        end: input.end_time.includes('T') ? { dateTime: input.end_time } : { date: input.end_time },
        description: input.description,
        location: input.location,
        attendees: input.attendees?.map((email: string) => ({ email })),
      };
      const response = await service.events.insert({ calendarId, requestBody: body });
      return textResponse(`Event created: ${response.data.summary ?? input.summary} (ID: ${response.data.id})`);
    },
  });

  registerTool(server, {
    name: 'modify_event',
    description: 'Modify an existing Google Calendar event.',
    inputSchema: z.object({
      user_google_email: z.string(),
      event_id: z.string(),
      calendar_id: z.string().optional(),
      summary: z.string().optional(),
      start_time: z.string().optional(),
      end_time: z.string().optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      attendees: z.array(z.string()).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'calendar',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [CALENDAR_EVENTS_SCOPE],
        sessionId: context?.sessionId,
      });
      const calendarId = input.calendar_id ?? 'primary';
      const body: any = {
        summary: input.summary,
        description: input.description,
        location: input.location,
        attendees: input.attendees?.map((email: string) => ({ email })),
      };
      if (input.start_time) {
        body.start = input.start_time.includes('T') ? { dateTime: input.start_time } : { date: input.start_time };
      }
      if (input.end_time) {
        body.end = input.end_time.includes('T') ? { dateTime: input.end_time } : { date: input.end_time };
      }
      const response = await service.events.patch({ calendarId, eventId: input.event_id, requestBody: body });
      return textResponse(`Event updated: ${response.data.summary ?? input.event_id}`);
    },
  });

  registerTool(server, {
    name: 'delete_event',
    description: 'Delete a Google Calendar event.',
    inputSchema: z.object({
      user_google_email: z.string(),
      event_id: z.string(),
      calendar_id: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'calendar',
        version: 'v3',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [CALENDAR_EVENTS_SCOPE],
        sessionId: context?.sessionId,
      });
      const calendarId = input.calendar_id ?? 'primary';
      await service.events.delete({ calendarId, eventId: input.event_id });
      return textResponse(`Event deleted: ${input.event_id}`);
    },
  });
}
