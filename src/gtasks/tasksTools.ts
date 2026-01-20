import { z } from 'zod';
import { registerTool } from '../core/toolRegistry.js';
import { textResponse, safeJsonStringify } from '../core/utils.js';
import { getAuthenticatedGoogleService } from '../auth/googleAuth.js';
import { TASKS_READONLY_SCOPE, TASKS_SCOPE } from '../auth/scopes.js';

const defaultTaskList = '@default';

export function registerTasksTools(server: any) {
  registerTool(server, {
    name: 'list_task_lists',
    description: 'List task lists.',
    inputSchema: z.object({ user_google_email: z.string() }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'tasks',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [TASKS_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.tasklists.list();
      return textResponse(safeJsonStringify(response.data.items ?? []));
    },
  });

  registerTool(server, {
    name: 'get_task_list',
    description: 'Get a task list by ID.',
    inputSchema: z.object({ user_google_email: z.string(), task_list_id: z.string() }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'tasks',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [TASKS_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.tasklists.get({ tasklist: input.task_list_id });
      return textResponse(safeJsonStringify(response.data));
    },
  });

  registerTool(server, {
    name: 'create_task_list',
    description: 'Create a task list.',
    inputSchema: z.object({ user_google_email: z.string(), title: z.string() }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'tasks',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [TASKS_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.tasklists.insert({ requestBody: { title: input.title } });
      return textResponse(`Task list created: ${response.data.id}`);
    },
  });

  registerTool(server, {
    name: 'update_task_list',
    description: 'Update a task list.',
    inputSchema: z.object({ user_google_email: z.string(), task_list_id: z.string(), title: z.string() }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'tasks',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [TASKS_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.tasklists.update({ tasklist: input.task_list_id, requestBody: { title: input.title } });
      return textResponse(`Task list updated: ${response.data.id}`);
    },
  });

  registerTool(server, {
    name: 'delete_task_list',
    description: 'Delete a task list.',
    inputSchema: z.object({ user_google_email: z.string(), task_list_id: z.string() }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'tasks',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [TASKS_SCOPE],
        sessionId: context?.sessionId,
      });
      await service.tasklists.delete({ tasklist: input.task_list_id });
      return textResponse('Task list deleted.');
    },
  });

  registerTool(server, {
    name: 'list_tasks',
    description: 'List tasks in a task list.',
    inputSchema: z.object({
      user_google_email: z.string(),
      task_list_id: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'tasks',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [TASKS_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.tasks.list({ tasklist: input.task_list_id ?? defaultTaskList });
      return textResponse(safeJsonStringify(response.data.items ?? []));
    },
  });

  registerTool(server, {
    name: 'get_task',
    description: 'Get a task by ID.',
    inputSchema: z.object({
      user_google_email: z.string(),
      task_list_id: z.string().optional(),
      task_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'tasks',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [TASKS_READONLY_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.tasks.get({ tasklist: input.task_list_id ?? defaultTaskList, task: input.task_id });
      return textResponse(safeJsonStringify(response.data));
    },
  });

  registerTool(server, {
    name: 'create_task',
    description: 'Create a task.',
    inputSchema: z.object({
      user_google_email: z.string(),
      task_list_id: z.string().optional(),
      title: z.string(),
      notes: z.string().optional(),
      due: z.string().optional(),
      parent: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'tasks',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [TASKS_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.tasks.insert({
        tasklist: input.task_list_id ?? defaultTaskList,
        requestBody: { title: input.title, notes: input.notes, due: input.due, parent: input.parent },
      });
      return textResponse(`Task created: ${response.data.id}`);
    },
  });

  registerTool(server, {
    name: 'update_task',
    description: 'Update a task.',
    inputSchema: z.object({
      user_google_email: z.string(),
      task_list_id: z.string().optional(),
      task_id: z.string(),
      title: z.string().optional(),
      notes: z.string().optional(),
      due: z.string().optional(),
      status: z.enum(['needsAction', 'completed']).optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'tasks',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [TASKS_SCOPE],
        sessionId: context?.sessionId,
      });
      const response = await service.tasks.update({
        tasklist: input.task_list_id ?? defaultTaskList,
        task: input.task_id,
        requestBody: { title: input.title, notes: input.notes, due: input.due, status: input.status },
      });
      return textResponse(`Task updated: ${response.data.id}`);
    },
  });

  registerTool(server, {
    name: 'delete_task',
    description: 'Delete a task.',
    inputSchema: z.object({
      user_google_email: z.string(),
      task_list_id: z.string().optional(),
      task_id: z.string(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'tasks',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [TASKS_SCOPE],
        sessionId: context?.sessionId,
      });
      await service.tasks.delete({ tasklist: input.task_list_id ?? defaultTaskList, task: input.task_id });
      return textResponse('Task deleted.');
    },
  });

  registerTool(server, {
    name: 'move_task',
    description: 'Move a task within a task list.',
    inputSchema: z.object({
      user_google_email: z.string(),
      task_list_id: z.string().optional(),
      task_id: z.string(),
      parent: z.string().optional(),
      previous: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'tasks',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [TASKS_SCOPE],
        sessionId: context?.sessionId,
      });
      await service.tasks.move({
        tasklist: input.task_list_id ?? defaultTaskList,
        task: input.task_id,
        parent: input.parent,
        previous: input.previous,
      });
      return textResponse('Task moved.');
    },
  });

  registerTool(server, {
    name: 'clear_completed_tasks',
    description: 'Clear completed tasks from a task list.',
    inputSchema: z.object({ user_google_email: z.string(), task_list_id: z.string().optional() }),
    handler: async (input, context) => {
      const { service } = await getAuthenticatedGoogleService<any>({
        serviceName: 'tasks',
        version: 'v1',
        userGoogleEmail: input.user_google_email,
        requiredScopes: [TASKS_SCOPE],
        sessionId: context?.sessionId,
      });
      await service.tasks.clear({ tasklist: input.task_list_id ?? defaultTaskList });
      return textResponse('Completed tasks cleared.');
    },
  });
}
