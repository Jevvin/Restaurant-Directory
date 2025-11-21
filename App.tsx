import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Button } from './components/Button';
import { Footer } from './components/Footer';
import { StarRating } from './components/StarRating';
import { Restaurant, UserRole, Reservation, GalleryImage, MenuItem } from './types';
import { 
  MapPin, Heart, MessageSquare, Camera, ChevronRight, Phone, 
  Globe, Clock, CheckCircle, Plus, Image as ImageIcon, 
  Calendar, Search, ArrowLeft, ChefHat, DollarSign, 
  User, Navigation, Trash2, Save, X, Loader2, Upload, Mail, Facebook, Instagram, Layout, 
  ChevronLeft, Star, AlertCircle
} from 'lucide-react';
import { generateAIAnswer } from './services/geminiService';
import { supabase, isSupabaseConfigured } from './lib/supabase';

// --- MOCK DATA (Fallback) ---
const MOCK_RESTAURANTS: Restaurant[] = [
  {
    id: '1',
    name: 'El Jardín de los Sabores',
    description: 'Un oasis culinario en el corazón de la ciudad. Disfruta de una experiencia gastronómica única con ingredientes locales y técnicas modernas.',
    address: 'Calle Mayor 123',
    city: 'Madrid',
    latitude: 40.416775,
    longitude: -3.703790,
    rating: 4.8,
    reviewCount: 342,
    priceLevel: '$$$',
    cuisine: ['Mediterránea', 'Española'],
    tags: ['Romántico', 'Terraza'],
    coverImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1000',
    gallery: [],
    menu: [],
    reviews: [],
    qa: [],
    ownerId: 'owner1',
    isApproved: true
  }
];

// --- UTILS ---
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = (lat2-lat1) * (Math.PI/180);
  const dLon = (lon2-lon1) * (Math.PI/180); 
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

const optimizeImage = (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1280; 
        const scaleSize = MAX_WIDTH / img.width;
        const width = scaleSize < 1 ? MAX_WIDTH : img.width;
        const height = scaleSize < 1 ? img.height * scaleSize : img.height;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp', lastModified: Date.now() }));
          else resolve(file);
        }, 'image/webp', 0.8);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

async function uploadImageToSupabase(file: File): Promise<string | null> {
    if (!supabase) return null;
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
        const { error } = await supabase.storage.from('restaurants').upload(fileName, file, { cacheControl: '31536000', upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from('restaurants').getPublicUrl(fileName);
        return data.publicUrl;
    } catch (error) {
        console.error("Upload error:", error);
        return null;
    }
}

// --- COMPONENTS ---
const Tag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-medium rounded-md mr-2 mb-2 inline-block border border-gray-200 dark:border-gray-700">{children}</span>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 mt-2 border-l-4 border-[#00AA6C] pl-3">{children}</h2>
);

// --- MAIN APP ---
function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved as 'light' | 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  const [currentView, setCurrentView] = useState('home');
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(UserRole.GUEST);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]); 
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [filterNearMe, setFilterNearMe] = useState(false);

  // Editing / Form States
  const [editingRestaurant, setEditingRestaurant] = useState<Partial<Restaurant>>({});
  const [editTab, setEditTab] = useState<'basic' | 'contact' | 'menu' | 'gallery'>('basic');
  const [savingStatus, setSavingStatus] = useState<string>('');

  // Review States
  const [isWritingReview, setIsWritingReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewFiles, setReviewFiles] = useState<File[]>([]);
  const [reviewPreviews, setReviewPreviews] = useState<string[]>([]);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const pendingUploads = useRef<Map<string, File>>(new Map());

  // Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Auth States
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [pendingAction, setPendingAction] = useState<'none' | 'review' | 'reservation' | 'favorite'>('none');

  // --- EFFECTS ---
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
         if (session) {
             setCurrentUserId(session.user.id);
             fetchUserRole(session.user.id, session.user);
         }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session) {
           setCurrentUserId(session.user.id);
           await fetchUserRole(session.user.id, session.user);
        } else {
           setCurrentUserId(null);
           setUserRole(UserRole.GUEST);
           if (currentView.includes('dashboard') || currentView === 'admin-edit-restaurant') setCurrentView('home');
        }
      });

      fetchData(); // Load data once on mount
      return () => subscription.unsubscribe();
  }, []);

  // Lightbox Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxOpen) {
        if (e.key === 'Escape') setLightboxOpen(false);
        if (e.key === 'ArrowRight') setLightboxIndex(prev => prev + 1); 
        if (e.key === 'ArrowLeft') setLightboxIndex(prev => prev - 1);
      }
      if (showLoginModal && e.key === 'Escape') setShowLoginModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, showLoginModal]);

  // --- DATA FETCHING ---
  const fetchUserRole = async (userId: string, authUser?: any) => {
      if (!supabase) return;
      try {
          const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
          if (data?.role) {
              setUserRole(data.role as UserRole);
          } else {
              const metadataRole = authUser?.user_metadata?.role || 'USER';
              setUserRole(metadataRole as UserRole);
          }
      } catch (e) { console.error(e); }
  };

  const fetchData = async () => {
      setIsLoading(true);
      if (!isSupabaseConfigured() || !supabase) {
        setRestaurants(MOCK_RESTAURANTS);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
            .from('restaurants')
            .select(`*, reviews(*), qa(*), photos(*), menu_items(*)`)
            .order('created_at', { ascending: false });
        
        if (error) throw error;

        if (!data || data.length === 0) {
             // Fallback to Mock Data if DB is empty
             setRestaurants(MOCK_RESTAURANTS);
        } else {
             const transformed = data.map((r: any) => ({
                ...r,
                reviewCount: r.reviews ? r.reviews.length : 0,
                priceLevel: r.price_level,
                coverImage: r.cover_image,
                isApproved: r.is_approved,
                gallery: r.photos?.map((p:any) => ({ url: p.url, uploaderName: p.uploader_name, uploadedAt: p.created_at, type: p.type })) || [],
                menu: r.menu_items?.map((m:any) => ({ id: m.id, name: m.name, description: m.description, price: m.price, category: m.category, imageUrl: m.image_url })) || [],
                reviews: r.reviews?.map((rev:any) => ({
                    id: rev.id,
                    userId: rev.user_id,
                    userName: rev.user_name,
                    userAvatar: rev.user_avatar || 'https://i.pravatar.cc/150',
                    rating: rev.rating,
                    date: new Date(rev.created_at).toLocaleDateString(),
                    text: rev.text,
                    images: r.photos?.filter((p:any) => p.review_id === rev.id).map((p:any) => p.url) || []
                })) || [],
                qa: r.qa?.map((q:any) => ({
                    id: q.id,
                    userId: q.user_id,
                    userName: q.user_name,
                    question: q.question,
                    date: new Date(q.created_at).toLocaleDateString(),
                    answer: q.answer,
                    answerSource: q.answer_source
                })) || []
             }));
             setRestaurants(transformed);
        }

        const { data: resData } = await supabase.from('reservations').select('*').eq('user_id', currentUserId);
        if (resData) {
            setReservations(resData.map((r: any) => ({
                id: r.id,
                restaurantId: r.restaurant_id,
                restaurantName: r.restaurant_name,
                userId: r.user_id,
                userName: r.user_name,
                date: r.date,
                time: r.time,
                people: r.people,
                status: r.status
            })));
        }

      } catch (err) {
        console.error("Data fetch error, using mock:", err);
        setRestaurants(MOCK_RESTAURANTS);
      } finally {
        setIsLoading(false);
      }
  };

  const refreshData = useCallback(() => {
      fetchData();
  }, []);

  // --- AUTH ---
  const translateAuthError = (errorMsg: string): string => {
      if (errorMsg.includes("User already registered")) return "Ya existe una cuenta registrada con este correo.";
      if (errorMsg.includes("Invalid login credentials")) return "Correo o contraseña incorrectos.";
      if (errorMsg.includes("Password should be at least")) return "La contraseña debe tener al menos 6 caracteres.";
      return "Error de autenticación. Intenta de nuevo.";
  };

  const handleAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthLoading(true);
      setAuthError('');

      try {
          if (isRegistering) {
              const { error } = await supabase.auth.signUp({
                  email: authEmail,
                  password: authPassword,
                  options: { data: { role: 'USER' } }
              });
              if (error) throw error;
              alert("Registro exitoso! Por favor inicia sesión.");
              setIsRegistering(false);
          } else {
              const { error } = await supabase.auth.signInWithPassword({
                  email: authEmail,
                  password: authPassword
              });
              if (error) throw error;
              
              setShowLoginModal(false);
              setAuthEmail('');
              setAuthPassword('');
              
              if (pendingAction === 'review') setIsWritingReview(true);
              setPendingAction('none');
          }
      } catch (error: any) {
          setAuthError(translateAuthError(error.message));
      } finally {
          setAuthLoading(false);
      }
  };

  // --- ACTIONS ---
  const toggleFavorite = (id: string) => {
    if (userRole === UserRole.GUEST) { setPendingAction('favorite'); setShowLoginModal(true); return; }
    setFavorites(prev => prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]);
  };

  const handleReservation = async (date: string, time: string, people: number) => {
    if (userRole === UserRole.GUEST) { setPendingAction('reservation'); setShowLoginModal(true); return; }
    
    const rest = restaurants.find(r => r.id === selectedRestaurantId);
    if (!rest) return;

    if (supabase) {
        await supabase.from('reservations').insert({
            restaurant_id: rest.id,
            restaurant_name: rest.name,
            user_id: currentUserId,
            user_name: authEmail.split('@')[0] || 'Usuario',
            date, time, people,
            status: 'CONFIRMED'
        });
        refreshData();
        alert("Reserva confirmada");
        setCurrentView('dashboard-user');
    } else {
        alert("Reserva simulada confirmada");
    }
  };

  const handleSubmitReview = async () => {
      if (userRole === UserRole.GUEST) { setPendingAction('review'); setShowLoginModal(true); return; }
      if (!selectedRestaurantId) return;
      if (reviewRating === 0 || !reviewText.trim()) { alert("Calificación y texto son obligatorios"); return; }
      
      setIsSubmittingReview(true);
      try {
          if (supabase) {
             const { data: revData, error } = await supabase.from('reviews').insert({
                 restaurant_id: selectedRestaurantId,
                 user_id: currentUserId,
                 user_name: authEmail.split('@')[0] || 'Anon',
                 rating: reviewRating,
                 text: reviewText
             }).select().single();
             
             if (error) throw error;

             if (reviewFiles.length > 0 && revData) {
                 for (const file of reviewFiles) {
                     const url = await uploadImageToSupabase(file);
                     if (url) {
                         await supabase.from('photos').insert({
                             restaurant_id: selectedRestaurantId,
                             review_id: revData.id,
                             url,
                             uploader_name: authEmail.split('@')[0],
                             type: 'USER'
                         });
                     }
                 }
             }
             refreshData();
          }
          setIsWritingReview(false);
          setReviewText('');
          setReviewRating(0);
          setReviewFiles([]);
          setReviewPreviews([]);
          alert("¡Opinión enviada!");
      } catch (e) {
          alert("Error al enviar opinión");
      } finally {
          setIsSubmittingReview(false);
      }
  };

  const handleSaveRestaurant = async () => {
      if (!editingRestaurant.name) return alert("Nombre es obligatorio");
      setIsSaving(true);
      setSavingStatus("Guardando...");
      
      try {
          // Process uploads
          let coverUrl = editingRestaurant.coverImage;
          if (coverUrl && pendingUploads.current.has(coverUrl)) {
              const url = await uploadImageToSupabase(pendingUploads.current.get(coverUrl)!);
              if (url) coverUrl = url;
          }
          // Simple save logic for brevity - strictly assumes Supabase for admin
          if (supabase) {
              const payload = { ...editingRestaurant, cover_image: coverUrl };
              delete payload.gallery; 
              delete payload.menu;
              delete payload.reviews;
              delete payload.qa;

              let restId = editingRestaurant.id;
              if (restId) {
                  await supabase.from('restaurants').update(payload).eq('id', restId);
              } else {
                  const { data } = await supabase.from('restaurants').insert(payload).select().single();
                  if (data) restId = data.id;
              }
              refreshData();
              setCurrentView('dashboard-admin');
          } else {
              alert("Modo Mock: Restaurante guardado (no persistente)");
              setCurrentView('dashboard-admin');
          }
      } catch(e) { alert("Error al guardar"); } 
      finally { setIsSaving(false); setSavingStatus(""); }
  };

  // --- FILTERING ---
  const filteredRestaurants = useMemo(() => {
    let filtered = userRole === UserRole.ADMIN ? restaurants : restaurants.filter(r => r.isApproved);
    if (filterNearMe && userLocation) {
        filtered = filtered.filter(r => r.latitude && r.longitude && getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, r.latitude, r.longitude) < 50);
    }
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(r => r.name.toLowerCase().includes(q) || r.city.toLowerCase().includes(q) || r.cuisine.some(c => c.toLowerCase().includes(q)));
    }
    return filtered;
  }, [restaurants, searchQuery, filterNearMe, userLocation, userRole]);

  const selectedRestaurant = useMemo(() => restaurants.find(r => r.id === selectedRestaurantId), [restaurants, selectedRestaurantId]);

  // --- RENDERERS ---
  
  const renderLoginModal = () => {
    if (!showLoginModal) return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden relative animate-fade-in">
          <button onClick={() => { setShowLoginModal(false); setAuthError(''); }} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X className="w-6 h-6" /></button>
          <div className="p-8">
            <div className="text-center mb-6">
                <div className="bg-[#00AA6C] w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"><User className="text-white w-6 h-6" /></div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{isRegistering ? 'Únete a GastroGuide' : 'Bienvenido de nuevo'}</h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">Accede para reseñar y reservar.</p>
            </div>
            {authError && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200 flex gap-2"><AlertCircle className="w-4 h-4"/>{authError}</div>}
            <form onSubmit={handleAuth} className="space-y-4">
                <input type="email" required className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00AA6C]" value={authEmail} onChange={(e) => { setAuthEmail(e.target.value); setAuthError(''); }} placeholder="Correo electrónico" />
                <input type="password" required className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00AA6C]" value={authPassword} onChange={(e) => { setAuthPassword(e.target.value); setAuthError(''); }} placeholder="Contraseña" minLength={6} />
                <Button type="submit" className="w-full py-3 mt-2" disabled={authLoading}>{authLoading ? <Loader2 className="animate-spin h-5 w-5" /> : (isRegistering ? 'Registrarse' : 'Iniciar Sesión')}</Button>
            </form>
            <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
                {isRegistering ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}
                <button onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }} className="ml-1 text-[#00AA6C] font-semibold hover:underline">{isRegistering ? 'Inicia sesión' : 'Regístrate gratis'}</button>
            </div>
          </div>
        </div>
      </div>
    )
  };

  const renderHome = () => (
      <main className="min-h-screen pb-20">
        <section className="relative bg-gray-900 text-white py-24 px-4 overflow-hidden">
           <div className="absolute inset-0 z-0"><img src="https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1920" className="w-full h-full object-cover opacity-40" alt="Background"/><div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent"></div></div>
           <div className="relative z-10 max-w-4xl mx-auto text-center">
             <h1 className="text-5xl md:text-6xl font-bold mb-6 tracking-tight">Descubre tu próxima gran comida</h1>
             <div className="bg-white dark:bg-gray-800 p-2 rounded-full shadow-xl max-w-2xl mx-auto flex flex-col md:flex-row items-center">
                <div className="flex-1 flex items-center px-4 w-full mb-2 md:mb-0"><Search className="text-gray-400 w-5 h-5 mr-2" /><input type="text" placeholder="Restaurante, cocina o ciudad..." className="w-full py-3 bg-transparent border-none focus:ring-0 text-gray-800 dark:text-white placeholder-gray-500 outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}/></div>
                <Button onClick={() => {}} className="w-full md:w-auto rounded-full px-8 py-3 shadow-md">Buscar</Button>
             </div>
           </div>
        </section>
        <section className="max-w-7xl mx-auto px-4 py-12">
            <div className="flex flex-wrap justify-center gap-4">
                {['Italiana', 'Mexicana', 'Japonesa', 'Española', 'Mariscos', 'Vegetariana'].map(cat => (
                    <button key={cat} onClick={() => setSearchQuery(cat)} className="px-6 py-2 bg-white dark:bg-gray-800 rounded-full shadow-sm hover:shadow-md transition border border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">{cat}</button>
                ))}
            </div>
        </section>
        <section className="max-w-7xl mx-auto px-4 pb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Restaurantes Destacados</h2>
            {isLoading ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin w-10 h-10 text-[#00AA6C]" /></div>
            ) : filteredRestaurants.length === 0 ? (
                <div className="text-center py-10 text-gray-500">No se encontraron restaurantes.</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {filteredRestaurants.map(r => (
                        <div key={r.id} onClick={() => { setSelectedRestaurantId(r.id); setCurrentView('details'); window.scrollTo(0,0); }} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group border border-gray-100 dark:border-gray-700 overflow-hidden">
                            <div className="relative h-56 overflow-hidden">
                                <img src={r.coverImage} alt={r.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                <button onClick={(e) => { e.stopPropagation(); toggleFavorite(r.id); }} className="absolute top-3 right-3 p-2 bg-white/90 dark:bg-black/60 rounded-full hover:bg-white transition">
                                    <Heart className={`w-5 h-5 ${favorites.includes(r.id) ? 'text-red-500 fill-red-500' : 'text-gray-600 dark:text-gray-300'}`} />
                                </button>
                            </div>
                            <div className="p-5">
                                <div className="flex justify-between items-start mb-2"><h3 className="text-xl font-bold text-gray-900 dark:text-white line-clamp-1">{r.name}</h3><span className="text-xs font-bold text-[#00AA6C] bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded">{r.rating}</span></div>
                                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-3"><MapPin className="w-4 h-4 mr-1" /><span className="truncate">{r.city} • {r.cuisine[0]} • {r.priceLevel}</span></div>
                                <div className="flex flex-wrap gap-1 mb-4">{r.tags.slice(0, 3).map(tag => (<span key={tag} className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">{tag}</span>))}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
      </main>
  );

  const renderRestaurantDetail = () => {
    if (!selectedRestaurant) return null;
    return (
      <div className="min-h-screen pb-20 bg-white dark:bg-gray-900 animate-fade-in">
         <div className="relative h-[400px] md:h-[500px] bg-gray-200 grid grid-cols-4 grid-rows-2 gap-1">
            <div className="col-span-2 row-span-2 relative">
               <img src={selectedRestaurant.coverImage} className="w-full h-full object-cover" alt="Main" />
               <button onClick={() => setCurrentView('home')} className="absolute top-4 left-4 bg-white/90 p-2 rounded-full hover:bg-white text-gray-800 shadow-md z-10"><ArrowLeft className="w-5 h-5" /></button>
            </div>
            {selectedRestaurant.gallery.slice(0, 4).map((img, idx) => (<div key={idx} className="relative hidden md:block"><img src={img.url} className="w-full h-full object-cover" alt={`Galeria ${idx}`} /></div>))}
         </div>
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 relative z-10">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 md:p-8 flex flex-col md:flex-row gap-8 border border-gray-100 dark:border-gray-700">
                <div className="flex-1">
                   <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">{selectedRestaurant.name}</h1>
                   <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-4">
                      <StarRating rating={selectedRestaurant.rating} showCount count={selectedRestaurant.reviewCount} /> • {selectedRestaurant.priceLevel} • {selectedRestaurant.cuisine.join(', ')}
                   </div>
                   <div className="flex gap-3 mb-8">
                      <Button onClick={() => { if(userRole===UserRole.GUEST){setPendingAction('review');setShowLoginModal(true);}else{setIsWritingReview(true);} }} className="flex-1 md:flex-none"><Star className="w-4 h-4" /> Escribir opinión</Button>
                      <Button variant="outline" onClick={() => toggleFavorite(selectedRestaurant.id)} className="flex-1 md:flex-none"><Heart className={`w-4 h-4 ${favorites.includes(selectedRestaurant.id) ? 'fill-red-500 text-red-500' : ''}`} /> Guardar</Button>
                   </div>
                   <div className="border-t border-gray-200 dark:border-gray-700 py-6">
                      <SectionTitle>Sobre el restaurante</SectionTitle>
                      <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">{selectedRestaurant.description}</p>
                   </div>
                   <div className="border-t border-gray-200 dark:border-gray-700 py-6">
                      <SectionTitle>Opiniones</SectionTitle>
                      {isWritingReview && (
                         <div className="bg-gray-50 dark:bg-gray-750 p-6 rounded-xl mb-8 border border-gray-200 dark:border-gray-700">
                            <h3 className="font-bold text-lg mb-4">Escribe tu opinión</h3>
                            <div className="flex gap-2 mb-4">{[1,2,3,4,5].map(star => (<Star key={star} className={`w-8 h-8 cursor-pointer transition ${reviewRating >= star ? 'fill-[#00AA6C] text-[#00AA6C]' : 'text-gray-300'}`} onClick={() => setReviewRating(star)}/>))}</div>
                            <textarea className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg mb-4 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-[#00AA6C] outline-none" rows={4} value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Cuéntanos tu experiencia..."></textarea>
                            <div className="flex justify-end gap-3">
                               <Button variant="ghost" onClick={() => setIsWritingReview(false)}>Cancelar</Button>
                               <Button onClick={handleSubmitReview} disabled={isSubmittingReview}>{isSubmittingReview ? <Loader2 className="animate-spin"/> : "Publicar"}</Button>
                            </div>
                         </div>
                      )}
                      <div className="space-y-6">
                         {selectedRestaurant.reviews.map(review => (
                            <div key={review.id} className="border-b border-gray-100 dark:border-gray-800 pb-6 last:border-0">
                               <div className="flex items-center gap-3 mb-3"><img src={review.userAvatar} className="w-10 h-10 rounded-full" alt={review.userName} /><div><p className="text-sm font-bold text-gray-900 dark:text-white">{review.userName}</p><p className="text-xs text-gray-500">{review.date}</p></div></div>
                               <div className="flex mb-2"><StarRating rating={review.rating} size="sm" /></div>
                               <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed mb-3">{review.text}</p>
                            </div>
                         ))}
                      </div>
                   </div>
                </div>
                <div className="w-full md:w-80 shrink-0">
                    <div className="sticky top-24 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-lg">
                       <h3 className="font-bold text-xl text-center mb-6 text-gray-900 dark:text-white">Hacer una reserva</h3>
                       <div className="space-y-4">
                          <div className="relative"><User className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><select className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-lg outline-none"><option>2 personas</option><option>3 personas</option></select></div>
                          <div className="relative"><Calendar className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input type="date" className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-lg outline-none" /></div>
                          <Button className="w-full py-3" onClick={() => handleReservation('2024-01-01', '20:00', 2)}>Reservar mesa</Button>
                       </div>
                    </div>
                </div>
            </div>
         </div>
      </div>
    );
  };

  // --- DASHBOARDS & ADMIN ---
  // Simplified for optimization - logic preserved
  const renderDashboard = () => (
      <div className="max-w-7xl mx-auto px-4 py-12 min-h-screen">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">Panel {userRole}</h1>
          {userRole === UserRole.ADMIN && (
             <div className="mb-8"><Button onClick={() => { setEditingRestaurant({}); setCurrentView('admin-edit-restaurant'); }}><Plus className="w-4 h-4"/> Añadir Restaurante</Button></div>
          )}
          {userRole === UserRole.USER ? (
              <div className="grid gap-6">{reservations.length===0 ? "No tienes reservas." : reservations.map(r => <div key={r.id} className="p-4 border rounded-lg bg-white dark:bg-gray-800">{r.restaurantName} - {r.date}</div>)}</div>
          ) : (
              <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-left p-4">
                      <thead><tr className="bg-gray-50 dark:bg-gray-700"><th className="p-4">Nombre</th><th className="p-4">Estado</th><th className="p-4">Acciones</th></tr></thead>
                      <tbody>{restaurants.map(r => (
                          <tr key={r.id} className="border-t dark:border-gray-700">
                              <td className="p-4 font-medium">{r.name}</td>
                              <td className="p-4">{r.isApproved ? <span className="text-green-600">Aprobado</span> : <span className="text-yellow-600">Pendiente</span>}</td>
                              <td className="p-4"><button onClick={() => { setEditingRestaurant(r); setCurrentView('admin-edit-restaurant'); }} className="text-blue-500 hover:underline">Editar</button></td>
                          </tr>
                      ))}</tbody>
                  </table>
              </div>
          )}
      </div>
  );

  const renderAdminEdit = () => (
      <div className="max-w-4xl mx-auto px-4 py-12 min-h-screen">
          <div className="flex justify-between mb-6"><h1 className="text-2xl font-bold">Editor</h1><div className="flex gap-2"><Button variant="outline" onClick={() => setCurrentView('dashboard-admin')}>Cancelar</Button><Button onClick={handleSaveRestaurant} disabled={isSaving}>{isSaving ? "Guardando..." : "Guardar"}</Button></div></div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow space-y-4 border border-gray-200 dark:border-gray-700">
               <input className="w-full p-3 border rounded" placeholder="Nombre" value={editingRestaurant.name||''} onChange={e=>setEditingRestaurant({...editingRestaurant, name: e.target.value})}/>
               <textarea className="w-full p-3 border rounded" placeholder="Descripción" value={editingRestaurant.description||''} onChange={e=>setEditingRestaurant({...editingRestaurant, description: e.target.value})}/>
               <input className="w-full p-3 border rounded" placeholder="Ciudad" value={editingRestaurant.city||''} onChange={e=>setEditingRestaurant({...editingRestaurant, city: e.target.value})}/>
               <div className="flex items-center gap-2"><input type="checkbox" checked={editingRestaurant.isApproved||false} onChange={e=>setEditingRestaurant({...editingRestaurant, isApproved: e.target.checked})}/> <label>Aprobado</label></div>
          </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-[#f2f2f2] dark:bg-gray-950 transition-colors duration-300 flex flex-col font-sans text-gray-900 dark:text-white">
      <Navbar currentUserRole={userRole} onNavigate={setCurrentView} onLogout={async () => { await supabase.auth.signOut(); setCurrentView('home'); }} theme={theme} toggleTheme={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')} />
      {renderLoginModal()}
      <div className="flex-grow">
        {currentView === 'home' && renderHome()}
        {currentView === 'details' && renderRestaurantDetail()}
        {(currentView.startsWith('dashboard')) && renderDashboard()}
        {currentView === 'admin-edit-restaurant' && renderAdminEdit()}
      </div>
      <Footer onNavigate={setCurrentView} />
    </div>
  );
}

export default App;