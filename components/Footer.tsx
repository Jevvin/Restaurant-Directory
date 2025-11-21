import React from 'react';
import { MapPin, Facebook, Twitter, Instagram, Shield } from 'lucide-react';

interface FooterProps {
  onNavigate: (view: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="bg-[#FAF1ED] dark:bg-gray-950 text-gray-800 dark:text-gray-300 pt-16 pb-8 border-t border-gray-200 dark:border-gray-800 mt-auto transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top Grid: Links */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          
          {/* Column 1: About */}
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white mb-4 text-sm uppercase tracking-wider">Acerca de GastroGuide</h3>
            <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Quiénes somos</button></li>
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Prensa</button></li>
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Recursos y políticas</button></li>
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Trabaja con nosotros</button></li>
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Confianza y seguridad</button></li>
            </ul>
          </div>

          {/* Column 2: Explore */}
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white mb-4 text-sm uppercase tracking-wider">Explorar</h3>
            <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Escribir una opinión</button></li>
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Añadir un lugar</button></li>
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Unirse a la comunidad</button></li>
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Premios Travellers' Choice</button></li>
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Seguros de viaje</button></li>
            </ul>
          </div>

          {/* Column 3: Categories & Cities */}
          <div>
             <h3 className="font-bold text-gray-900 dark:text-white mb-4 text-sm uppercase tracking-wider">Cocinas Populares</h3>
             <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400 mb-6">
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Comida Italiana</button></li>
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Comida Mexicana</button></li>
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Asadores</button></li>
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Marisquerías</button></li>
            </ul>
          </div>

           {/* Column 4: Contact & Admin */}
           <div>
            <h3 className="font-bold text-gray-900 dark:text-white mb-4 text-sm uppercase tracking-wider">Ciudades Top</h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400 mb-6">
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Madrid</button></li>
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Barcelona</button></li>
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Sevilla</button></li>
              <li><button className="hover:underline hover:text-gray-900 dark:hover:text-white">Valencia</button></li>
            </ul>
            
            <div className="pt-4 border-t border-gray-300/50 dark:border-gray-700">
                 <button 
                    onClick={() => onNavigate('admin-login')}
                    className="text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-[#00AA6C] flex items-center gap-1 transition-colors"
                 >
                    <Shield className="w-3 h-3" /> Administración
                 </button>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-gray-300 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
                <div className="bg-[#00AA6C] p-1.5 rounded-full">
                   <MapPin className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-lg text-gray-900 dark:text-white">GastroGuide</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">© 2024 GastroGuide LLC. Todos los derechos reservados.</span>
            </div>

            <div className="flex gap-6">
                <select className="bg-transparent text-sm font-bold text-gray-700 dark:text-gray-300 border-none outline-none cursor-pointer dark:bg-gray-950">
                    <option>€ EUR</option>
                    <option>$ USD</option>
                </select>
                <select className="bg-transparent text-sm font-bold text-gray-700 dark:text-gray-300 border-none outline-none cursor-pointer dark:bg-gray-950">
                    <option>España</option>
                    <option>México</option>
                    <option>Argentina</option>
                </select>
                <div className="flex gap-4 text-gray-900 dark:text-gray-300">
                    <Facebook className="w-5 h-5 cursor-pointer hover:text-[#00AA6C]" />
                    <Twitter className="w-5 h-5 cursor-pointer hover:text-[#00AA6C]" />
                    <Instagram className="w-5 h-5 cursor-pointer hover:text-[#00AA6C]" />
                </div>
            </div>
        </div>
      </div>
    </footer>
  );
};