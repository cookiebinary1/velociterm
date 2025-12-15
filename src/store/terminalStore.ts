import { create } from 'zustand';

export interface Pane {
  id: string;
  ptyId: string | null;
  cwd: string;
  remoteTarget?: string;
  remoteCwd?: string;
  fontSizeOffset?: number;
  lastLatencyMs?: number;
  lastInputAt?: number;
  lastOutputAt?: number;
  ptyStatus?: 'connecting' | 'ok' | 'slow' | 'disconnected';
  bellUnread?: boolean;
  inputMode?: 'insert' | 'overwrite';
}

export type LayoutNode =
  | { type: 'pane'; paneId: string }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; children: LayoutNode[] };

export interface Tab {
  id: string;
  title: string;
  panes: Pane[];
  activePaneId: string;
  layout: LayoutNode;
}

export interface TerminalState {
  tabs: Tab[];
  activeTabId: string | null;
  addTab: (tab: Tab) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  setActivePane: (tabId: string, paneId: string) => void;
  setPanePtyId: (tabId: string, paneId: string, ptyId: string) => void;
  setPaneCwd: (tabId: string, paneId: string, cwd: string) => void;
  setPaneRemoteTarget: (tabId: string, paneId: string, remoteTarget: string) => void;
  setPaneRemoteCwd: (tabId: string, paneId: string, remoteCwd: string) => void;
  clearPaneRemote: (tabId: string, paneId: string) => void;
  markPaneInput: (tabId: string, paneId: string) => void;
  markPaneOutput: (tabId: string, paneId: string) => void;
  setPanePtyStatus: (tabId: string, paneId: string, status: Pane['ptyStatus']) => void;
  setPaneBellUnread: (tabId: string, paneId: string, unread: boolean) => void;
  togglePaneInputMode: (tabId: string, paneId: string) => void;
  removePane: (tabId: string, paneId: string) => void;
  splitVertical: () => void;
  splitHorizontal: () => void;
  adjustPaneFontSize: (tabId: string, paneId: string, delta: number) => void;
  resetPaneFontSize: (tabId: string, paneId: string) => void;
}

function replacePaneInLayout(node: LayoutNode, paneId: string, replacement: LayoutNode): { node: LayoutNode; replaced: boolean } {
  if (node.type === 'pane') {
    if (node.paneId !== paneId) return { node, replaced: false };
    return { node: replacement, replaced: true };
  }

  let replaced = false;
  const children = node.children.map((child) => {
    const res = replacePaneInLayout(child, paneId, replacement);
    if (res.replaced) replaced = true;
    return res.node;
  });

  return { node: replaced ? { ...node, children } : node, replaced };
}

function removePaneFromLayout(node: LayoutNode, paneId: string): { node: LayoutNode | null; removed: boolean } {
  if (node.type === 'pane') {
    if (node.paneId !== paneId) return { node, removed: false };
    return { node: null, removed: true };
  }

  let removed = false;
  const nextChildren: LayoutNode[] = [];
  for (const child of node.children) {
    const res = removePaneFromLayout(child, paneId);
    if (res.removed) removed = true;
    if (res.node) nextChildren.push(res.node);
  }

  if (!removed) return { node, removed: false };
  if (nextChildren.length === 0) return { node: null, removed: true };
  if (nextChildren.length === 1) return { node: nextChildren[0]!, removed: true };
  return { node: { ...node, children: nextChildren }, removed: true };
}

export const useTerminalStore = create<TerminalState>((set) => ({
  tabs: [],
  activeTabId: null,

  addTab: (tab) =>
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    })),

  removeTab: (id) =>
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id);
      let newActiveId = state.activeTabId;

      if (state.activeTabId === id) {
        const idx = state.tabs.findIndex((t) => t.id === id);
        if (newTabs.length > 0) {
          newActiveId = newTabs[Math.min(idx, newTabs.length - 1)]?.id || null;
        } else {
          newActiveId = null;
        }
      }

      return { tabs: newTabs, activeTabId: newActiveId };
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, updates) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  setActivePane: (tabId, paneId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              activePaneId: paneId,
              panes: t.panes.map((p) => (p.id === paneId ? { ...p, bellUnread: false } : p)),
            }
          : t
      ),
    })),

  setPanePtyId: (tabId, paneId, ptyId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              panes: t.panes.map((p) => (p.id === paneId ? { ...p, ptyId } : p)),
            }
          : t
      ),
    })),

  setPaneCwd: (tabId, paneId, cwd) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              panes: t.panes.map((p) => (p.id === paneId ? { ...p, cwd } : p)),
            }
          : t
      ),
    })),

  setPaneRemoteTarget: (tabId, paneId, remoteTarget) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              panes: t.panes.map((p) => (p.id === paneId ? { ...p, remoteTarget } : p)),
            }
          : t
      ),
    })),

  setPaneRemoteCwd: (tabId, paneId, remoteCwd) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              panes: t.panes.map((p) => (p.id === paneId ? { ...p, remoteCwd } : p)),
            }
          : t
      ),
    })),

  clearPaneRemote: (tabId, paneId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              panes: t.panes.map((p) => (p.id === paneId ? { ...p, remoteTarget: undefined, remoteCwd: undefined } : p)),
            }
          : t
      ),
    })),

  markPaneInput: (tabId, paneId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              panes: t.panes.map((p) =>
                p.id === paneId
                  ? {
                      ...p,
                      lastInputAt: Date.now(),
                      ptyStatus: p.ptyStatus ?? 'connecting',
                    }
                  : p
              ),
            }
          : t
      ),
    })),

  markPaneOutput: (tabId, paneId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              panes: t.panes.map((p) => {
                if (p.id !== paneId) return p;
                const now = Date.now();
                const latency = p.lastInputAt ? Math.max(0, now - p.lastInputAt) : p.lastLatencyMs;
                const status: Pane['ptyStatus'] = latency != null && latency > 200 ? 'slow' : 'ok';
                return {
                  ...p,
                  lastOutputAt: now,
                  lastLatencyMs: latency,
                  ptyStatus: status,
                };
              }),
            }
          : t
      ),
    })),

  setPanePtyStatus: (tabId, paneId, status) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              panes: t.panes.map((p) => (p.id === paneId ? { ...p, ptyStatus: status } : p)),
            }
          : t
      ),
    })),

  setPaneBellUnread: (tabId, paneId, unread) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              panes: t.panes.map((p) => (p.id === paneId ? { ...p, bellUnread: unread } : p)),
            }
          : t
      ),
    })),

  togglePaneInputMode: (tabId, paneId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              panes: t.panes.map((p) =>
                p.id === paneId
                  ? {
                      ...p,
                      inputMode: (p.inputMode ?? 'insert') === 'insert' ? 'overwrite' : 'insert',
                    }
                  : p
              ),
            }
          : t
      ),
    })),

  removePane: (tabId, paneId) =>
    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return state;

      const nextPanes = tab.panes.filter((p) => p.id !== paneId);
      if (nextPanes.length === 0) {
        const newTabs = state.tabs.filter((t) => t.id !== tabId);
        let newActiveId = state.activeTabId;
        if (state.activeTabId === tabId) {
          newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1]!.id : null;
        }
        return { tabs: newTabs, activeTabId: newActiveId };
      }

      const layoutRes = removePaneFromLayout(tab.layout, paneId);
      const nextLayout = layoutRes.node ?? { type: 'pane', paneId: nextPanes[0]!.id };

      const nextActivePaneId =
        tab.activePaneId === paneId
          ? nextPanes[Math.min(tab.panes.findIndex((p) => p.id === paneId), nextPanes.length - 1)]!.id
          : tab.activePaneId;

      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === tabId ? { ...t, panes: nextPanes, activePaneId: nextActivePaneId, layout: nextLayout } : t
        ),
      };
    }),

  splitVertical: () =>
    set((state) => {
      if (!state.activeTabId) return state;
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!tab) return state;

      const activePane = tab.panes.find((p) => p.id === tab.activePaneId) ?? tab.panes[0];
      if (!activePane) return state;

      const newPaneId = crypto.randomUUID();
      const newPane: Pane = { id: newPaneId, ptyId: null, cwd: activePane.cwd };

      const nextPanes = [...tab.panes, newPane];

      const splitNode: LayoutNode = {
        type: 'split',
        direction: 'horizontal',
        children: [
          { type: 'pane', paneId: tab.activePaneId },
          { type: 'pane', paneId: newPaneId },
        ],
      };

      const replaced = replacePaneInLayout(tab.layout, tab.activePaneId, splitNode);
      const nextLayout = replaced.replaced ? replaced.node : splitNode;

      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === tab.id ? { ...t, panes: nextPanes, activePaneId: newPaneId, layout: nextLayout } : t
        ),
      };
    }),

  splitHorizontal: () =>
    set((state) => {
      if (!state.activeTabId) return state;
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!tab) return state;

      const activePane = tab.panes.find((p) => p.id === tab.activePaneId) ?? tab.panes[0];
      if (!activePane) return state;

      const newPaneId = crypto.randomUUID();
      const newPane: Pane = { id: newPaneId, ptyId: null, cwd: activePane.cwd };

      const nextPanes = [...tab.panes, newPane];

      const splitNode: LayoutNode = {
        type: 'split',
        direction: 'vertical',
        children: [
          { type: 'pane', paneId: tab.activePaneId },
          { type: 'pane', paneId: newPaneId },
        ],
      };

      const replaced = replacePaneInLayout(tab.layout, tab.activePaneId, splitNode);
      const nextLayout = replaced.replaced ? replaced.node : splitNode;

      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === tab.id ? { ...t, panes: nextPanes, activePaneId: newPaneId, layout: nextLayout } : t
        ),
      };
    }),

  adjustPaneFontSize: (tabId, paneId, delta) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              panes: t.panes.map((p) =>
                p.id === paneId
                  ? { ...p, fontSizeOffset: Math.max(-6, Math.min(10, (p.fontSizeOffset ?? 0) + delta)) }
                  : p
              ),
            }
          : t
      ),
    })),

  resetPaneFontSize: (tabId, paneId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              panes: t.panes.map((p) =>
                p.id === paneId ? { ...p, fontSizeOffset: 0 } : p
              ),
            }
          : t
      ),
    })),
}));
