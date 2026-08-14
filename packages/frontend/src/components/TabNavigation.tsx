interface TabNavigationProps {
  activeTab: 'scheduled' | 'sent';
  onTabChange: (tab: 'scheduled' | 'sent') => void;
}

const tabs: { key: 'scheduled' | 'sent'; label: string }[] = [
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'sent', label: 'Sent' },
];

/**
 * Tab navigation component for switching between Scheduled and Sent views.
 */
export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <nav className="flex border-b">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === tab.key
              ? 'border-b-2 border-blue-600 text-blue-600 font-semibold'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
