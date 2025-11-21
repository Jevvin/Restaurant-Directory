
import React from 'react';
import { UserRole } from '../types';
import { User, Menu as MenuIcon, MapPin, LogOut, Moon, Sun } from 'lucide-react';

interface NavbarProps {
  currentUserRole: UserRole;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentUserRole, onNavigate, onLogout, theme, toggleTheme }) => {
  return (
    <nav className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center cursor-pointer" onClick={() => onNavigate('home')}>
            <div className="bg-[#00AA6C] p-1.5 rounded-full mr-2">
               <MapPin className="h-5 w-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">GastroGuide</span>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center space-x-8">
            <button onClick={() => onNavigate('home')} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium transition-colors">Explorar</button>
            <button onClick={() => onNavigate('favorites')} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium transition-colors">Favoritos</button>
            <button className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium transition-colors">Comunidad</button>
          </div>

          {/* Right Side: Account & Theme */}
          <div className="flex items-center space-x-4">
            
            {/* Theme Toggle */}
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none"
              title={theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}
            >
              {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </button>

            {currentUserRole !== UserRole.GUEST ? (
               <div className="flex items-center gap-3">
                 <button 
                  onClick={() => {
                     if(currentUserRole === UserRole.OWNER) onNavigate('dashboard-owner');
                     else if(currentUserRole === UserRole.ADMIN) onNavigate('dashboard-admin');
                     else onNavigate('dashboard-user');
                  }}
                  className="flex items-center bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-full text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition shadow-sm"
                 >
                   <User className="h-4 w-4 mr-2" />
                   Mi Cuenta {currentUserRole === UserRole.ADMIN && '(Admin)'}
                 </button>
                 <button 
                    onClick={onLogout}
                    className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    title="Cerrar Sesión"
                 >
                    <LogOut className="h-5 w-5" />
                 </button>
               </div>
            ) : (
              <button 
                onClick={() => onNavigate('login')}
                className="bg-[#00AA6C] text-white px-5 py-2 rounded-full font-bold text-sm hover:bg-[#008f5a] transition shadow-sm"
              >
                Iniciar Sesión
              </button>
            )}
            
            <div className="md:hidden">
                <MenuIcon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};
