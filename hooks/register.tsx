import type { EngineInterface, Register } from 'claude-code'

import type { Todo } from '../types'

const todos = { plugin: 'todo-pane', key: 'todos' } as const
const isOpen = { plugin: 'todo-pane', key: 'isOpen' } as const
const draftRef = { plugin: 'todo-pane', key: 'draft' } as const
const editingRef = { plugin: 'todo-pane', key: 'editing' } as const // 正在編輯的 id，'' 表示沒有

// 清單存成檔案，同一個 git repo 的所有 worktree／session 共用：
// git repo 放在 .git/todo-pane.json（不會被 commit），否則放在 <root>/.claude/todo-pane.json
const fileOf = new Map<string, string>()

async function listFile($: EngineInterface) {
  const root = await $.session.root()
  const known = fileOf.get(root)
  if (known) return known
  // 直接看 .git，不開 git 程序（Windows 上開程序很慢）
  const dotGit = `${root}/.git`
  let file = `${root}/.claude/todo-pane.json`
  if (await $.fs.exists(dotGit)) {
    const stat = await $.fs.stat(dotGit)
    if (stat.kind === 'dir') file = `${dotGit}/todo-pane.json`
    else if (stat.kind === 'file') {
      // worktree：.git 是一行 "gitdir: <repo>/.git/worktrees/<name>"
      const gitdir = (await $.fs.read(dotGit)).replace(/^gitdir:\s*/, '').trim()
      file = `${gitdir.replace(/[\\/]worktrees[\\/][^\\/]+$/, '')}/todo-pane.json`
    }
  }
  fileOf.set(root, file)
  return file
}

async function readList($: EngineInterface): Promise<Todo[]> {
  const file = await listFile($)
  if (await $.fs.exists(file)) return JSON.parse(await $.fs.read(file)) as Todo[]
  // 舊版存在 $.store，第一次讀時帶過來
  return ((await $.store.get(`todos:${await $.session.root()}`)) as Todo[] | undefined) ?? []
}

async function load($: EngineInterface) {
  const list = await readList($)
  const { value } = await $.state.get(todos)
  if (JSON.stringify(value) !== JSON.stringify(list)) await $.state.set(todos, list)
}

async function change($: EngineInterface, fn: (list: Todo[]) => Todo[]) {
  const list = fn(await readList($))
  await $.state.set(todos, list) // 先畫，再寫檔
  await $.fs.write(await listFile($), JSON.stringify(list, null, 2))
}

// 摘要自己截短（中文一字約兩格），不靠排版，按鈕才不會被擠掉
// 介面文字：設定 language 為 auto 時看系統語系，中文以外都用英文
const STRINGS = {
  zh: {
    title: '待辦', collapse: '收起 ▴', expand: '展開 ▾', empty: '沒有待辦，享受一下 ☕',
    edit: '編輯', save: '儲存', cancel: '取消', placeholder: '＋ 新增待辦…', add: '新增',
    clear: '清除已完成', command: '展開／收起待辦清單', toggled: '待辦清單已切換。',
  },
  en: {
    title: 'To-do', collapse: 'Hide ▴', expand: 'Show ▾', empty: 'Nothing to do ☕',
    edit: 'Edit', save: 'Save', cancel: 'Cancel', placeholder: '+ Add a to-do…', add: 'Add',
    clear: 'Clear done', command: 'Show or hide the to-do list', toggled: 'To-do list toggled.',
  },
}

function pickStrings(language: unknown) {
  let lang = typeof language === 'string' ? language : 'auto'
  if (lang === 'auto') {
    try {
      lang = Intl.DateTimeFormat().resolvedOptions().locale
    } catch {
      lang = 'en'
    }
  }
  return lang.startsWith('zh') ? STRINGS.zh : STRINGS.en
}

function preview(items: Todo[], max = 28) {
  const text = items.map(t => t.text).join(' · ')
  return text.length > max ? `${text.slice(0, max)}…` : text
}

// 每 3 秒重讀檔案，跟上其他 session 的修改。
// 計時器可能被引擎停掉（重載、worker 重啟），所以每次畫面或對話有動靜就檢查，停了就重開。
let timer: { cancel: () => void } | undefined
let lastTick = 0

function arm($: EngineInterface) {
  timer?.cancel()
  lastTick = Date.now()
  timer = $.clock.every(3000, () => {
    lastTick = Date.now()
    void load($).catch(() => {})
  })
}

function revive($: EngineInterface) {
  if (Date.now() - lastTick < 10_000) return
  arm($)
  void load($).catch(() => {})
}

// 顏色標籤：點 ■ 依序切換，最後一個回到無色
const COLORS = ['#e5484d', '#f5a524', '#46a758', '#3e8eed', '#a46ee0'] as const

function nextColor(color?: string) {
  const i = COLORS.indexOf(color as (typeof COLORS)[number])
  return i === COLORS.length - 1 ? undefined : COLORS[i + 1]
}

function moveTo(list: Todo[], id: string, to: number) {
  const from = list.findIndex(t => t.id === id)
  if (from < 0 || to < 0 || to >= list.length) return list
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item!)
  return copy
}

function edit($: EngineInterface, id: string, fn: (x: Todo) => Todo) {
  return change($, l => l.map(x => (x.id === id ? fn(x) : x)))
}

async function toggle($: EngineInterface) {
  const { value = false } = await $.state.get(isOpen)
  await $.state.set(isOpen, !value)
}

export const register: Register = (on, options) => {
  const s = pickStrings(options.language)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // 不擋 session 啟動：背景載入，載好才畫
    void load($).catch(() => {})
    arm($)
    void $.command.register({ name: 'todo', description: s.command })
    void $.ui.close({ id: 'todos' }) // 舊版的 pane

    return started
  })

  on('classic.CwdChanged', async ($, e, next) => {
    const ran = await next(e)
    await load($)

    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    revive($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    revive($)

    return next(e)
  })

  // list.tsx 傳來的拖曳、點擊
  on('ui.message', async ($, e, next) => {
    if (e.element !== 'list') return next(e)
    const msg = e.data as { type: string; id: string; to?: number }
    if (msg.type === 'toggle') await edit($, msg.id, x => ({ ...x, isDone: !x.isDone }))
    if (msg.type === 'color') await edit($, msg.id, x => ({ ...x, color: nextColor(x.color) }))
    if (msg.type === 'delete') await change($, l => l.filter(x => x.id !== msg.id))
    if (msg.type === 'move') await change($, l => moveTo(l, msg.id, msg.to ?? 0))
    if (msg.type === 'edit') await $.state.set(editingRef, msg.id)

    return {}
  })

  on('command.run', { command: 'todo' }, async $ => {
    await toggle($)

    return { text: s.toggled }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    $.clock.after(0, () => revive($)) // 畫的當下不能寫 state，排到下一拍

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Input = 'Input' in ui ? ui.Input : undefined // 不是每個介面都有輸入框
    const Client = 'Client' in ui ? ui.Client : undefined
    const { value: list } = await $.state.get(todos)
    if (list === undefined) return next(e) // 還沒載入
    const { value: open = false } = await $.state.get(isOpen)
    const { value: draft = '' } = await $.state.get(draftRef)
    const { value: editingId = '' } = await $.state.get(editingRef)
    const editing = list.find(t => t.id === editingId)
    const pending = list.filter(t => !t.isDone)

    const header = (
      <Box flexDirection="row" alignItems="center" gap="sm" width="100%">
        <Text size="caption" weight="semibold">{s.title}</Text>
        <Text size="caption" dimColor tabular>{pending.length}</Text>
        {!open && pending.length > 0 && (
          <Box flexShrink={1} overflow="hidden">
            <Text size="caption" dimColor wrap="truncate-end">{preview(pending)}</Text>
          </Box>
        )}
        <Box flexGrow={1} />
        <Box flexShrink={0}>
          <Button key="toggle" plain dimColor onPress={() => void toggle($)}>
            {open ? s.collapse : s.expand}
          </Button>
        </Box>
      </Box>
    )

    if (!open) return <Box flexDirection="column" paddingX="sm">{header}</Box>

    return (
      <Box flexDirection="column" paddingX="sm" gap="xs">
        {header}
        {list.length === 0 && <Text size="caption" dimColor>{s.empty}</Text>}
        {list.length > 0 && Client && <Client key="list" module="./list.tsx" props={{ items: list }} width="100%" />}
        {/* 終端機沒有 Client：一行一項，按圓圈勾選、按 ✕ 刪除 */}
        {!Client &&
          list.map(t => (
            <Box key={t.id} flexDirection="row" gap="sm">
              <Button key={`done-${t.id}`} plain onPress={() => void edit($, t.id, x => ({ ...x, isDone: !x.isDone }))}>
                {t.isDone ? '✓' : '○'}
              </Button>
              <Box flexGrow={1}>
                <Text color={t.isDone ? undefined : t.color} dimColor={t.isDone} strikethrough={t.isDone}>{t.text}</Text>
              </Box>
              <Button key={`del-${t.id}`} plain dimColor onPress={() => void change($, l => l.filter(x => x.id !== t.id))}>✕</Button>
            </Box>
          ))}
        {editing && Input && (
          <Box flexDirection="row" alignItems="center" gap="sm">
            <Box flexGrow={1}>
              <Input
                key={`edit-${editing.id}`}
                label={s.edit}
                value={editing.text}
                submitLabel={s.save}
                autoFocus
                onSubmit={(text: string) => {
                  const trimmed = text.trim()
                  void $.state.set(editingRef, '')
                  if (trimmed) void change($, l => l.map(x => (x.id === editing.id ? { ...x, text: trimmed } : x)))
                }}
              />
            </Box>
            <Button key="cancel-edit" plain dimColor onPress={() => void $.state.set(editingRef, '')}>{s.cancel}</Button>
          </Box>
        )}
        <Box flexDirection="row" alignItems="center" gap="sm" display={editing ? 'none' : 'flex'}>
          <Box flexGrow={1}>
            {Input && (
              <Input
                key="new"
                placeholder={s.placeholder}
                submitLabel={s.add}
                value={draft}
                onInput={(text: string) => void $.state.set(draftRef, text)}
                onSubmit={(text: string) => {
                  const trimmed = text.trim()
                  void $.state.set(draftRef, '') // 送出後清空輸入欄
                  if (trimmed) void change($, l => [...l, { id: String(Date.now()), text: trimmed, isDone: false }])
                }}
              />
            )}
          </Box>
          {list.some(t => t.isDone) && (
            <Button key="clear" variant="secondary" onPress={() => void change($, l => l.filter(x => !x.isDone))}>{s.clear}</Button>
          )}
        </Box>
      </Box>
    )
  })
}
