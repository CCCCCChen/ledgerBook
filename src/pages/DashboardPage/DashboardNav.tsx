import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, AlertTriangle, Wallet, PieChart,
  BarChart3, TrendingUp, Clock, Target, Calendar,
} from 'lucide-react';

interface NavSection {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: NavSection[] = [
  { id: 'overview', label: '概览', icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
  { id: 'plan-status', label: '计划状态', icon: <Target className="h-3.5 w-3.5" /> },
  { id: 'alerts', label: '预警', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { id: 'budget', label: '预算', icon: <Wallet className="h-3.5 w-3.5" /> },
  { id: 'category-pie', label: '支出分布', icon: <PieChart className="h-3.5 w-3.5" /> },
  { id: 'account-bar', label: '账户对比', icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { id: 'trend', label: '财务趋势', icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: 'recent', label: '最近交易', icon: <Clock className="h-3.5 w-3.5" /> },
];

export default function DashboardNav() {
  const [activeId, setActiveId] = useState<string>('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sectionIds = SECTIONS.map((s) => s.id);

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-10% 0px -80% 0px', threshold: 0 },
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
    }
  };

  return (
    <nav
      className="fixed right-6 top-1/2 -translate-y-1/2 z-40 hidden xl:flex flex-col gap-0.5"
      aria-label="仪表盘快速导航"
    >
      {SECTIONS.map((section) => {
        const isActive = activeId === section.id;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => handleClick(section.id)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
              transition-all duration-200 whitespace-nowrap
              ${isActive
                ? 'bg-primary/10 text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }
            `}
          >
            <span className={isActive ? 'text-primary' : 'text-muted-foreground'}>
              {section.icon}
            </span>
            <span>{section.label}</span>
            {isActive && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
