# todo pane for claude code

A small to-do list for Claude Code that sits in a band above the prompt box.
Every session of the same project shares one list.

Claude Code 的待辦清單，顯示在輸入框上方。同一個專案的所有 session 共用同一份清單。（中文說明在下方）

## Install

At the prompt of a terminal session:

```
/plugin install todo-pane --marketplace allenchang123/todo-pane
```

From a shell:

```bash
claude plugin install todo-pane --marketplace allenchang123/todo-pane
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `allenchang123/todo-pane`, then **Add plugin**.

## Use

- Click **Show ▾** / **Hide ▴**, or run `/todo`, to open or close the list.
- Type in the box and press Enter to add an item.
- Desktop app: click the circle to tick an item, double-click the text to edit it, drag a row to reorder, click the colour swatch to cycle its colour, and click ✕ to delete. The swatch and ✕ show when you hover over a row.
- Terminal: press the circle to tick an item and ✕ to delete it.
- **Clear done** removes ticked items.

The list is stored in `.git/todo-pane.json` inside a git repository, so it is never committed and is shared by every worktree. Outside a git repository it is stored in `.claude/todo-pane.json`. Other open sessions pick up changes within a few seconds.

Labels follow your system language (Chinese or English). To pick one yourself, set the plugin's **Language** option in `/config` (`auto`, `zh-TW` or `en`).

## 中文說明

安裝方法同上。使用方式：

- 按「展開 ▾／收起 ▴」或輸入 `/todo` 開關清單。
- 在輸入框打字後按 Enter 新增。
- 桌面版：點圓圈勾選、雙擊文字編輯、拖曳排序、點色塊換顏色、點 ✕ 刪除（色塊和 ✕ 在滑鼠移到那一行時才出現）。
- 終端機：按圓圈勾選、按 ✕ 刪除。
- 「清除已完成」會刪掉打勾的項目。

清單存在 git repo 的 `.git/todo-pane.json`，所以不會被 commit，所有 worktree 都共用。不在 git repo 裡時存在 `.claude/todo-pane.json`。

介面語言跟著系統語系；想自己指定的話，到 `/config` 把 **Language** 設成 `auto`、`zh-TW` 或 `en`。

## License

MIT
