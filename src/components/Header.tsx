import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Menu, X, Receipt, PiggyBank, BarChart3, Wallet, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

const NAV_ITEMS = [
  { path: '/', label: '总账目', icon: Receipt },
  { path: '/budgets', label: '预算', icon: PiggyBank },
  { path: '/forecast', label: '预期账单', icon: CalendarClock },
  { path: '/statistics', label: '统计', icon: BarChart3 },
  { path: '/accounts', label: '账户', icon: Wallet },
] as const;

export default function Header() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b border-border/30">
      <div className="max-w-7xl mx-auto px-4 md:px-6 flex h-14 items-center justify-between">
        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2 shrink-0">
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
            <Receipt className="size-4 text-primary-foreground" />
          </div>
          <span className="text-base font-semibold text-foreground hidden sm:block">
            我的账本
          </span>
        </NavLink>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === '/'
                ? pathname === '/'
                : pathname === item.path || pathname.startsWith(`${item.path}/`);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive: linkActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    linkActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`
                }
              >
                <Icon className="size-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Mobile Menu */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="打开菜单">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64 pt-12">
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.path === '/'
                    ? pathname === '/'
                    : pathname === item.path || pathname.startsWith(`${item.path}/`);
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    onClick={() => setOpen(false)}
                    className={({ isActive: linkActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                        linkActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                      }`
                    }
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
