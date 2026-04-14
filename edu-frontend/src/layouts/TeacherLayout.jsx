import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  GraduationCap,
  BarChart3,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggle from '../components/shared/ThemeToggle';

const drawerWidth = 260;

const TeacherLayout = () => {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileDrawerOpen(!mobileDrawerOpen);
  };

  const handleLogout = () => {
    setUserMenuOpen(false);
    logout();
    navigate('/login');
  };

  const handleNavigation = (path) => {
    navigate(path);
    setMobileDrawerOpen(false);
  };

  // Teacher sidebar menu items
  const menuItems = [
    { label: 'Dashboard', path: '/teacher/dashboard', icon: LayoutDashboard },
    { label: 'Upload Marks', path: '/teacher/upload', icon: Upload },
    { label: 'CO Generator', path: '/teacher/co-generator', icon: Sparkles },
    { label: 'Courses', path: '/teacher/courses', icon: GraduationCap },
    { label: 'Analytics', path: '/teacher/analytics', icon: BarChart3 },
    { label: 'Student Analysis', path: '/teacher/student-analysis', icon: FileText },
    { label: 'Student Progression', path: '/teacher/student-progression', icon: TrendingUp },
    { label: 'Settings', path: '/teacher/settings', icon: Settings },
  ];

  const isActive = (path) => location.pathname === path;

  // Sidebar content
  const SidebarContent = () => (
    <div className="h-full flex flex-col bg-white dark:bg-dark-card border-r border-neutral-200 dark:border-dark-border">
      {/* Sidebar Header */}
      <div className="p-6 bg-gradient-to-br from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">SkillSync</h2>
              <p className="text-xs text-white/80">Teacher Portal</p>
            </div>
          </div>
          <button
            onClick={handleDrawerToggle}
            className="md:hidden text-white hover:bg-white/20 p-1.5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-1">
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <motion.li
                key={item.path}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
              >
                <button
                  onClick={() => handleNavigation(item.path)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                    transition-all duration-200 group
                    ${active
                      ? 'bg-gradient-to-r from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600 text-white shadow-md'
                      : 'text-neutral-700 dark:text-dark-text-primary hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary'
                    }
                  `}
                >
                  <Icon
                    className={`w-5 h-5 transition-transform group-hover:scale-110 ${
                      active ? 'text-white' : 'text-neutral-600 dark:text-dark-text-secondary'
                    }`}
                  />
                  <span className={`text-sm font-medium ${active ? 'font-semibold' : ''}`}>
                    {item.label}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </ul>
      </nav>

      {/* User Info at Bottom */}
      <div className="p-4 border-t border-neutral-200 dark:border-dark-border bg-neutral-50 dark:bg-dark-bg-secondary">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary truncate">
              {user?.name}
            </p>
            <p className="text-xs text-neutral-600 dark:text-dark-text-secondary truncate">
              {user?.email}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-neutral-100 dark:bg-dark-bg-primary">
      {/* Top AppBar */}
      <header
        className="fixed top-0 right-0 z-30 bg-white dark:bg-dark-card border-b border-neutral-200 dark:border-dark-border shadow-sm"
        style={{ width: 'calc(100% - 0px)', left: '0' }}
      >
        <div className="h-16 px-4 flex items-center justify-between md:ml-[260px]">
          <div className="flex items-center gap-4">
            <button
              onClick={handleDrawerToggle}
              className="md:hidden p-2 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5 text-neutral-700 dark:text-dark-text-primary" />
            </button>

            <div className="hidden md:flex items-center gap-3">
              <GraduationCap className="w-8 h-8 text-primary-500 dark:text-dark-green-500" />
              <h1 className="text-lg font-bold bg-gradient-to-r from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600 bg-clip-text text-transparent">
                Skill-Sync : A detailed Analysis System
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600 flex items-center justify-center text-white font-bold text-sm shadow-md hover:shadow-lg transition-shadow"
              >
                {user?.name?.charAt(0).toUpperCase()}
              </button>

              {/* User Dropdown Menu */}
              <AnimatePresence>
                {userMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setUserMenuOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-56 bg-white dark:bg-dark-card rounded-xl shadow-lg border border-neutral-200 dark:border-dark-border overflow-hidden z-50"
                    >
                      <div className="px-4 py-3 border-b border-neutral-200 dark:border-dark-border">
                        <p className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">
                          {user?.name}
                        </p>
                        <p className="text-xs text-neutral-600 dark:text-dark-text-secondary truncate">
                          {user?.email}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate('/teacher/profile');
                        }}
                        className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-neutral-700 dark:text-dark-text-primary hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary transition-colors"
                      >
                        <User className="w-4 h-4" />
                        Profile
                      </button>
                      <button
                        onClick={handleLogout}
                        className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-error-600 dark:text-error-500 hover:bg-error-50 dark:hover:bg-error-900/20 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {mobileDrawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleDrawerToggle}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Desktop: Fixed, Mobile: Slide-in */}
      <aside className="hidden md:block fixed left-0 top-0 h-full w-[260px] z-20">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {mobileDrawerOpen && (
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="md:hidden fixed left-0 top-0 h-full w-[260px] z-50"
          >
            <SidebarContent />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 md:ml-[260px] mt-16 min-h-screen bg-neutral-100 dark:bg-dark-bg-primary">
        <Outlet />
      </main>
    </div>
  );
};

export default TeacherLayout;
