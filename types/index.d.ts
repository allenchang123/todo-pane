export type Todo = { id: string; text: string; isDone: boolean; color?: string }

declare module 'claude-code' {
  interface PluginState {
    'todo-pane': { todos: Todo[]; isOpen: boolean; draft: string; editing: string }
  }
}
