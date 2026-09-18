import type { ReactNode } from 'react'
import './tab-layout.scss'

type Tab = 'home' | 'sources' | 'settings'

interface TabLayoutProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  children: ReactNode
}

const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'sources', label: 'Sources', icon: '◫' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

export function TabLayout({ activeTab, onTabChange, children }: TabLayoutProps) {
  return (
    <main className="app-shell">
      <div className="content">{children}</div>
      <nav className="tab-bar" aria-label="Primary navigation">
        {tabs.map((tab) => (
          <button
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={activeTab === tab.id ? 'tab is-active' : 'tab'}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            <span aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </main>
  )
}
