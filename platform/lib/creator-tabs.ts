type Tab = { id: string; label: string; icon: string; href: string }

export function getCreatorTabs(): Tab[] {
  return [
    { id: 'dashboard', label: 'Dashboard', icon: 'BarChart3', href: '/creator' },
    { id: 'apps', label: 'My Apps', icon: 'Box', href: '/creator/apps' },
    { id: 'revenue', label: 'Revenue', icon: 'Sparkles', href: '/creator/revenue' },
    { id: 'settings', label: 'Settings', icon: 'Shield', href: '/creator/settings' },
    { id: 'developer', label: 'Developer API', icon: 'Cpu', href: '/developers' },
  ]
}
