import type { ClientModule } from 'claude-code'

import type { Todo } from '../types'

// 在介面端畫清單，才收得到滑鼠事件做拖曳。一項一行：
// ⠿ ○ 文字 ………… ██   ✕   （色塊、✕ 只在滑過那行時出現；完成是 ✓；雙擊文字編輯）
type Props = { items: Todo[] }
type State = { hover?: number; drag?: { id: string; from: number; at: number } }

// 右邊 7 欄：" ██   ✕"，色塊兩格寬，和叉叉中間隔三格，點擊範圍各自放寬
const RIGHT = 7

// 點文字：等一下看有沒有第二下，雙擊就編輯，單擊才勾選（點 ○ 則立刻勾選）
const DOUBLE_MS = 350
let pendingClick: { id: string; at: number } | undefined

const List: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const items = props.items
  const state = surface.state ?? {}
  const last = items.length - 1

  // 每個 instance 第一次畫時開計時器（收起再展開會是新的 instance）
  if (surface.state === undefined) {
    surface.setState({})
    surface.every(80, () => {
      if (pendingClick && Date.now() - pendingClick.at >= DOUBLE_MS) {
        surface.post({ type: 'toggle', id: pendingClick.id })
        pendingClick = undefined
      }
    })
  }

  surface.onPointer(p => {
    const row = Math.max(0, Math.min(last, p.y))
    if (p.type === 'leave') return surface.setState({ ...state, hover: undefined })
    if (p.type === 'down' && p.button === 'left' && items[row]) {
      return surface.setState({ hover: row, drag: { id: items[row].id, from: row, at: row } })
    }
    if (p.type === 'move') {
      if (state.drag) {
        if (state.drag.at !== row) surface.setState({ ...state, drag: { ...state.drag, at: row } })
      } else if (state.hover !== p.y) surface.setState({ ...state, hover: p.y })
      return
    }
    if (p.type === 'up' && state.drag) {
      const { id, from, at } = state.drag
      surface.setState({ hover: at })
      if (at !== from) return surface.post({ type: 'move', id, to: at })
      // 沒移動就是點擊：右邊 ✕ 刪除、色塊換色，其他地方勾選
      const x = p.x
      if (x >= surface.columns - 2) return surface.post({ type: 'delete', id })
      if (x >= surface.columns - RIGHT && x <= surface.columns - 4) return surface.post({ type: 'color', id })
      if (x >= 4) {
        if (pendingClick?.id === id) {
          pendingClick = undefined
          return surface.post({ type: 'edit', id })
        }
        pendingClick = { id, at: Date.now() }
        return
      }
      if (x >= 2) surface.post({ type: 'toggle', id })
    }
  })

  // 拖曳中就畫成移動後的順序
  let shown = items
  if (state.drag) {
    const { from, at } = state.drag
    shown = [...items]
    const [moved] = shown.splice(from, 1)
    if (moved) shown.splice(at, 0, moved)
  }

  return (
    <Box flexDirection="column" width="100%">
      {shown.map((t, i) => {
        const isDragged = state.drag?.id === t.id
        const isHover = !state.drag && state.hover === i
        return (
          <Box key={t.id} flexDirection="row" width="100%">
            <Text dimColor={!isDragged}>{isDragged ? '⠿ ' : isHover ? '⠿ ' : '  '}</Text>
            <Text color={t.isDone ? 'success' : t.color} dimColor={!t.color && !t.isDone}>
              {t.isDone ? '✓ ' : '○ '}
            </Text>
            <Box flexGrow={1} flexShrink={1} overflow="hidden">
              <Text
                wrap="truncate-end"
                bold={isDragged}
                color={t.isDone ? undefined : t.color}
                dimColor={t.isDone}
                strikethrough={t.isDone}
              >
                {t.text}
              </Text>
            </Box>
            <Text> </Text>
            <Text color={t.color ?? 'subtle'}>{isHover ? (t.color ? '██' : '░░') : '  '}</Text>
            <Text>   </Text>
            <Text dimColor>{isHover ? '✕' : ' '}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

export default List
