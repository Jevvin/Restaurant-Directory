
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Button } from './components/Button';
import { Footer } from './components/Footer';
import { StarRating } from './components/StarRating';
import { Restaurant, UserRole, Reservation, Review, QAItem, GalleryImage, MenuItem } from './types';
import { 
  MapPin, Heart, Share2, MessageSquare, Camera, ChevronRight, Phone, 
  Globe, Clock, CheckCircle, XCircle, Plus, Image as ImageIcon, 
  Calendar, Search, ArrowLeft, ChefHat, DollarSign, List, User, Navigation,
  Edit, Trash2, Save, X, Lock, Loader2, Upload, Mail, Facebook, Instagram, Layout, Eye,
  ChevronLeft, Star
} from 'lucide-react';
import { generateAIAnswer } from './services/geminiService';
import { supabase, isSupabaseConfigured } from './lib/supabase';

// --- MOCK DATA (Fallback & Initial Structure) ---
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

// --- HELPER FUNCTION FOR DISTANCE ---
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  var R = 6371; 
  var dLat = deg2rad(lat2-lat1);
  var dLon = deg2rad(lon2-lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; 
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI/180)
}

// --- HELPER FOR IMAGE PROCESSING ---

// 1. Optimize Image: Resize & Convert to WebP
const optimizeImage = (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1280; // Good balance for web
        const scaleSize = MAX_WIDTH / img.width;
        const width = scaleSize < 1 ? MAX_WIDTH : img.width;
        const height = scaleSize < 1 ? img.height * scaleSize : img.height;

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
             resolve(file); // Fallback to original if canvas fails
             return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // Export as WebP with 0.8 quality
        canvas.toBlob((blob) => {
          if (blob) {
            const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
              type: 'image/webp',
              lastModified: Date.now(),
            });
            resolve(newFile);
          } else {
            resolve(file);
          }
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
        // Sanitize filename
        const fileExt = file.name.split('.').pop();
        const randomName = Math.random().toString(36).substring(2, 15);
        const timestamp = Date.now();
        const fileName = `${timestamp}_${randomName}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('restaurants')
            .upload(filePath, file, {
                cacheControl: '31536000', // Aggressive caching for images
                upsert: false,
                contentType: file.type
            });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('restaurants').getPublicUrl(filePath);
        return data.publicUrl;
    } catch (error: any) {
        console.error("Upload error:", error);
        return null;
    }
}

// --- HELPER COMPONENTS ---

const Tag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-medium rounded-md mr-2 mb-2 inline-block border border-gray-200 dark:border-gray-700">
    {children}
  </span>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 mt-2 border-l-4 border-[#00AA6C] pl-3">{children}</h2>
);

// --- MAIN APP ---

function App() {
  // --- THEME STATE ---
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) return savedTheme as 'light' | 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  // --- APP STATE ---
  const [currentView, setCurrentView] = useState('home');
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(UserRole.GUEST);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Data State
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false); // Independent saving state
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]); 
  const [userLists, setUserLists] = useState<{id: string, name: string, restaurantIds: string[]}[]>([
    { id: 'l1', name: 'Cena Romántica', restaurantIds: [] }
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [filterNearMe, setFilterNearMe] = useState(false);

  // Admin State
  const [editingRestaurant, setEditingRestaurant] = useState<Partial<Restaurant>>({});
  const [editTab, setEditTab] = useState<'basic' | 'contact' | 'menu' | 'gallery'>('basic');
  const [savingStatus, setSavingStatus] = useState<string>('');

  // Review Writing State
  const [isWritingReview, setIsWritingReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewFiles, setReviewFiles] = useState<File[]>([]);
  const [reviewPreviews, setReviewPreviews] = useState<string[]>([]);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Image Upload State (Deferred Uploads)
  const pendingUploads = useRef<Map<string, File>>(new Map());

  // Lightbox State
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Auth State
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // --- EFFECTS ---

  // Theme Effect
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Auth & Data Effect
  useEffect(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
         if (session) {
             setCurrentUserId(session.user.id);
             fetchUserRole(session.user.id, session.user);
         } else {
             setUserRole(UserRole.GUEST);
         }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session) {
           setCurrentUserId(session.user.id);
           
           if (event === 'SIGNED_IN') {
              const metaRole = session.user.user_metadata?.role;
              if (metaRole === 'ADMIN') {
                setUserRole(UserRole.ADMIN);
                if (currentView === 'admin-login') {
                    setCurrentView('dashboard-admin');
                }
              } else {
                  setUserRole(UserRole.USER);
                  if (currentView === 'admin-login') {
                    setCurrentView('dashboard-user');
                }
              }
           }
           
           await fetchUserRole(session.user.id, session.user);

        } else {
           setCurrentUserId(null);
           setUserRole(UserRole.GUEST);
           if (currentView.includes('dashboard') || currentView === 'admin-edit-restaurant') {
             setCurrentView('home');
           }
        }
      });

      fetchData();

      return () => subscription.unsubscribe();
  }, [currentView]);

  // Keyboard support for lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightboxOpen) return;
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowRight') setLightboxIndex(prev => prev + 1); 
      if (e.key === 'ArrowLeft') setLightboxIndex(prev => prev - 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen]);


  const fetchUserRole = async (userId: string, authUser?: any) => {
      if (!supabase) return;
      try {
          const { data, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .single();
          
          if (data && data.role) {
              setUserRole(data.role as UserRole);
          } else {
              const metadataRole = authUser?.user_metadata?.role || 'USER';
              console.log(`Profile missing, self-healing as ${metadataRole}...`);
              const { error: insertError } = await supabase.from('profiles').upsert({
                  id: userId,
                  email: authUser?.email || '',
                  role: metadataRole, 
                  full_name: authUser?.email?.split('@')[0]
              }, { onConflict: 'id' });
              
              if (!insertError) {
                  setUserRole(metadataRole as UserRole);
              } else {
                  if (metadataRole) setUserRole(metadataRole as UserRole);
              }
          }
      } catch (e) {
          console.error("Error fetching role:", e);
      }
  };

  const handleLogout = async () => {
      await supabase.auth.signOut();
      setUserRole(UserRole.GUEST);
      setCurrentView('home');
      alert("Sesión cerrada correctamente.");
  };

  const fetchData = async () => {
      setIsLoading(true);
      
      if (!isSupabaseConfigured() || !supabase) {
        setRestaurants(MOCK_RESTAURANTS);
        setIsLoading(false);
        return;
      }

      try {
        let restData = null;
        try {
            const { data, error } = await supabase
            .from('restaurants')
            .select(`
                id, name, description, address, city, latitude, longitude,
                rating, review_count, price_level, cuisine, tags, cover_image, 
                owner_id, is_approved, phone, email, website, instagram, facebook,
                reviews_data:reviews (id, user_id, user_name, user_avatar, rating, text, created_at),
                qa_data:qa (id, user_id, user_name, question, answer, answer_source, created_at),
                photos_data:photos (id, url, uploader_name, type, created_at, review_id),
                menu_data:menu_items (id, name, description, price, category, image_url)
            `)
            .order('created_at', { ascending: false });
            
            if (error) throw error;
            restData = data;

        } catch (complexError) {
            console.error("Complex fetch failed. Falling back to basic fetch.", complexError);
            const { data: basicData, error: basicError } = await supabase
                .from('restaurants')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (basicError) throw basicError;
            restData = basicData;
        }

        if (restData) {
          const transformed: Restaurant[] = restData.map((r: any) => {
            const reviewList = r.reviews_data ? r.reviews_data.map((rev:any) => ({
                id: rev.id,
                userId: rev.user_id,
                userName: rev.user_name,
                userAvatar: rev.user_avatar || 'https://i.pravatar.cc/150',
                rating: rev.rating,
                date: new Date(rev.created_at).toLocaleDateString(),
                text: rev.text,
                images: [] 
            })) : [];

            const qaList = r.qa_data ? r.qa_data.map((q:any) => ({
                id: q.id,
                userId: q.user_id,
                userName: q.user_name,
                question: q.question,
                date: new Date(q.created_at).toLocaleDateString(),
                answer: q.answer,
                answerSource: q.answer_source
            })) : [];

            const galleryList = r.photos_data ? r.photos_data.map((p:any) => ({
                url: p.url,
                uploaderName: p.uploader_name,
                uploadedAt: p.created_at,
                type: p.type
            })) : [];

            const menuList = r.menu_data ? r.menu_data.map((m:any) => ({
                id: m.id,
                name: m.name,
                description: m.description,
                price: m.price,
                category: m.category,
                imageUrl: m.image_url
            })) : [];

            return {
              id: r.id,
              name: r.name,
              description: r.description || '',
              address: r.address,
              city: r.city,
              latitude: r.latitude,
              longitude: r.longitude,
              rating: r.rating || 0,
              reviewCount: reviewList.length || r.review_count || 0,
              priceLevel: r.price_level || '$$',
              cuisine: r.cuisine || [],
              tags: r.tags || [],
              coverImage: r.cover_image || 'https://via.placeholder.com/800x600',
              gallery: galleryList,
              menu: menuList, 
              reviews: reviewList,
              qa: qaList,
              ownerId: r.owner_id,
              isApproved: r.is_approved !== undefined ? r.is_approved : true,
              phone: r.phone,
              email: r.email,
              website: r.website,
              instagram: r.instagram,
              facebook: r.facebook
            };
          });
          
          if (restData[0] && restData[0].photos_data) {
              transformed.forEach(rest => {
                 const originalRecord = restData.find((d:any) => d.id === rest.id);
                 const allPhotos = originalRecord?.photos_data || [];
                 rest.reviews.forEach(rev => {
                     const reviewPhotos = allPhotos.filter((p:any) => p.review_id === rev.id);
                     rev.images = reviewPhotos.map((p:any) => p.url);
                 });
              });
          }
          setRestaurants(transformed);
        }

        try {
            const { data: resData } = await supabase.from('reservations').select('*');
            if (resData) {
                const transformedRes: Reservation[] = resData.map((r: any) => ({
                    id: r.id,
                    restaurantId: r.restaurant_id,
                    restaurantName: r.restaurant_name,
                    userId: r.user_id,
                    userName: r.user_name,
                    date: r.date,
                    time: r.time,
                    people: r.people,
                    status: r.status as any
                }));
                setReservations(transformedRes);
            }
        } catch (resErr) {}

      } catch (err) {
        console.error("Error fetching:", err);
        if (restaurants.length === 0) setRestaurants(MOCK_RESTAURANTS);
      } finally {
        setIsLoading(false);
      }
    };

  const handleGetLocation = () => {
     if ("geolocation" in navigator) {
         navigator.geolocation.getCurrentPosition((position) => {
             setUserLocation({
                 lat: position.coords.latitude,
                 lng: position.coords.longitude
             });
             setFilterNearMe(true);
         }, (error) => {
             alert("Activa la ubicación para encontrar restaurantes cercanos.");
         });
     }
  };

  const selectedRestaurant = useMemo(() => 
    restaurants.find(r => r.id === selectedRestaurantId), 
    [restaurants, selectedRestaurantId]
  );

  const filteredRestaurants = useMemo(() => {
    let filtered = userRole === UserRole.ADMIN 
        ? restaurants 
        : restaurants.filter(r => r.isApproved);

    if (filterNearMe && userLocation) {
        filtered = filtered.filter(r => {
            if (!r.latitude || !r.longitude) return false;
            const dist = getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, r.latitude, r.longitude);
            return dist < 50; 
        });
    }

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(r => 
            r.name.toLowerCase().includes(q) || 
            r.city.toLowerCase().includes(q) || 
            r.cuisine.some(c => c.toLowerCase().includes(q))
        );
    }
    return filtered;
  }, [restaurants, searchQuery, filterNearMe, userLocation, userRole]);

  const handleNavigate = (view: string, id?: string) => {
    if (id) setSelectedRestaurantId(id);
    setCurrentView(view);
    window.scrollTo(0, 0);
    setLightboxOpen(false);
    // Clear pending uploads when navigating away to prevent ghost uploads
    pendingUploads.current.clear();
    // Reset Review Form
    setIsWritingReview(false);
    setReviewRating(0);
    setReviewText('');
    setReviewFiles([]);
    setReviewPreviews([]);
  };

  const toggleFavorite = (id: string) => {
    if (userRole === UserRole.GUEST) {
        alert("Inicia sesión para guardar favoritos.");
        setCurrentView('admin-login');
        return;
    }
    setFavorites(prev => prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]);
  };

  const handleReservation = async (date: string, time: string, people: number) => {
    if (!selectedRestaurant) return;
    if (userRole === UserRole.GUEST) {
        alert("Debes iniciar sesión para reservar.");
        setCurrentView('admin-login');
        return;
    }
    if (isSupabaseConfigured() && supabase) {
        try {
            const { data, error } = await supabase.from('reservations').insert({
                restaurant_id: selectedRestaurant.id,
                restaurant_name: selectedRestaurant.name,
                user_id: currentUserId,
                user_name: authEmail.split('@')[0] || 'Usuario',
                date,
                time,
                people,
                status: 'CONFIRMED'
            }).select();
            if (!error && data) {
                setReservations([ ...reservations, {
                    id: data[0].id,
                    restaurantId: selectedRestaurant.id,
                    restaurantName: selectedRestaurant.name,
                    userId: currentUserId || '',
                    userName: authEmail.split('@')[0],
                    date,
                    time,
                    people,
                    status: 'CONFIRMED'
                }]);
                handleNavigate('dashboard-user');
            }
        } catch(e) {}
    }
  };

  const handleReviewImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      const newFiles = Array.from(e.target.files);
      
      // Optimize and create previews for all
      for (const file of newFiles) {
          const optimized = await optimizeImage(file);
          setReviewFiles(prev => [...prev, optimized]);
          setReviewPreviews(prev => [...prev, URL.createObjectURL(optimized)]);
      }
      e.target.value = ''; // Reset input
  };

  const handleRemoveReviewImage = (index: number) => {
      setReviewFiles(prev => prev.filter((_, i) => i !== index));
      setReviewPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitReview = async () => {
     if(!selectedRestaurant) return;
     if (userRole === UserRole.GUEST) {
         alert("Inicia sesión para dejar una reseña.");
         setCurrentView('admin-login');
         return;
     }
     
     if (reviewRating === 0) {
         alert("Por favor selecciona una calificación de estrellas.");
         return;
     }

     if (!reviewText.trim()) {
         alert("Por favor escribe tu opinión.");
         return;
     }

     setIsSubmittingReview(true);

     if (isSupabaseConfigured() && supabase) {
        try {
            // 1. Insert Review
            const { data: reviewData, error: reviewError } = await supabase.from('reviews').insert({
                restaurant_id: selectedRestaurant.id,
                user_id: currentUserId,
                user_name: authEmail.split('@')[0] || 'Usuario',
                rating: reviewRating,
                text: reviewText
            }).select();

            if (reviewError) throw reviewError;
            const reviewId = reviewData[0].id;

            // 2. Upload Images and Link to Review
            if (reviewFiles.length > 0) {
                const uploadPromises = reviewFiles.map(async (file) => {
                    const publicUrl = await uploadImageToSupabase(file);
                    if (publicUrl) {
                        return {
                            restaurant_id: selectedRestaurant.id,
                            review_id: reviewId,
                            url: publicUrl,
                            uploader_name: authEmail.split('@')[0] || 'Usuario',
                            type: 'USER'
                        };
                    }
                    return null;
                });

                const photosToInsert = (await Promise.all(uploadPromises)).filter(p => p !== null);
                
                if (photosToInsert.length > 0) {
                    await supabase.from('photos').insert(photosToInsert);
                }
            }

            // 3. Refresh
            await fetchData();
            setIsWritingReview(false);
            setReviewRating(0);
            setReviewText('');
            setReviewFiles([]);
            setReviewPreviews([]);

        } catch (e: any) {
            alert("Error al enviar la reseña: " + e.message);
        } finally {
            setIsSubmittingReview(false);
        }
     }
  };

  const handleAskQuestion = async (question: string) => {
      if(!selectedRestaurant) return;
      if (userRole === UserRole.GUEST) {
          alert("Inicia sesión para preguntar.");
          return;
      }
      const context = `Restaurante: ${selectedRestaurant.name}. ${selectedRestaurant.description}`;
      const aiAnswer = await generateAIAnswer(question, context);
      
      if (isSupabaseConfigured() && supabase) {
          const { error } = await supabase.from('qa').insert({
              restaurant_id: selectedRestaurant.id,
              user_id: currentUserId,
              user_name: authEmail.split('@')[0] || 'Usuario',
              question,
              answer: aiAnswer,
              answer_source: 'AI'
          });
          if (!error) fetchData();
      }
  };

  const handleAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthLoading(true);
      const timeoutId = setTimeout(() => {
          if (authLoading) {
              setAuthLoading(false);
              alert("La solicitud tardó demasiado. Por favor intenta de nuevo.");
          }
      }, 15000);

      try {
          if (isRegistering) {
              const { data, error } = await supabase.auth.signUp({
                  email: authEmail,
                  password: authPassword,
                  options: {
                      data: {
                          full_name: authEmail.split('@')[0],
                          role: 'ADMIN' 
                      }
                  }
              });
              
              if (error) throw error;
              
              if (data.user) {
                  setUserRole(UserRole.ADMIN);
                  setCurrentView('dashboard-admin');
                  
                  supabase.from('profiles').upsert({
                      id: data.user.id,
                      email: authEmail,
                      role: 'ADMIN', 
                      full_name: authEmail.split('@')[0]
                  }).then(({error}) => {
                      if(error) console.warn("Background profile sync failed", error);
                  });

                  alert("Cuenta creada exitosamente.");
              }

          } else {
              const { data, error } = await supabase.auth.signInWithPassword({
                  email: authEmail,
                  password: authPassword,
              });
              
              if (error) throw error;
              
              if (data.user) {
                   const metaRole = data.user.user_metadata?.role;
                   if (metaRole === 'ADMIN') {
                       setUserRole(UserRole.ADMIN);
                       setCurrentView('dashboard-admin');
                   } else {
                       setUserRole(UserRole.USER);
                       setCurrentView('dashboard-user');
                   }
              }
          }
      } catch (error: any) {
          console.error("Auth error:", error);
          alert(error.message || "Error de autenticación");
      } finally {
          clearTimeout(timeoutId);
          setAuthLoading(false);
      }
  };

  // --- IMPROVED IMAGE UPLOAD LOGIC ---
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>, field: 'cover' | 'gallery' | 'menu', index?: number) => {
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      
      // 1. Optimize immediately
      const optimizedFile = await optimizeImage(file);

      // 2. Create temporary URL for preview
      const previewUrl = URL.createObjectURL(optimizedFile);

      // 3. Store in pending queue (Mapped by preview URL)
      pendingUploads.current.set(previewUrl, optimizedFile);

      // 4. Update UI immediately (Optimistic UI)
      if (field === 'cover') {
          setEditingRestaurant(prev => ({ ...prev, coverImage: previewUrl }));
      } else if (field === 'gallery') {
          const newImage: GalleryImage = {
              url: previewUrl,
              uploaderName: 'Owner',
              uploadedAt: new Date().toISOString(),
              type: 'OWNER'
          };
          setEditingRestaurant(prev => ({ ...prev, gallery: [...(prev.gallery || []), newImage] }));
      } else if (field === 'menu' && typeof index === 'number') {
            const newMenu = [...(editingRestaurant.menu || [])];
            newMenu[index] = { ...newMenu[index], imageUrl: previewUrl };
            setEditingRestaurant(prev => ({ ...prev, menu: newMenu }));
      }
      
      // Clear input
      e.target.value = '';
  };

  const handleAdminSave = async () => {
    if (!supabase) return;
    const r = { ...editingRestaurant }; // Clone state
    if(!r.name || !r.address) { alert("Faltan campos obligatorios"); return; }
    
    // Use independent saving state to avoid conflict with background fetching
    setIsSaving(true);
    setSavingStatus('Procesando imágenes...');

    // --- UPLOAD PENDING IMAGES ---
    // 1. Check Cover
    if (r.coverImage && pendingUploads.current.has(r.coverImage)) {
         const file = pendingUploads.current.get(r.coverImage);
         if (file instanceof File) {
             const publicUrl = await uploadImageToSupabase(file);
             if (publicUrl) r.coverImage = publicUrl;
         }
    }

    // 2. Check Gallery
    if (r.gallery && r.gallery.length > 0) {
        const updatedGallery = await Promise.all(r.gallery.map(async (img) => {
            if (pendingUploads.current.has(img.url)) {
                const file = pendingUploads.current.get(img.url);
                if (file instanceof File) {
                    const publicUrl = await uploadImageToSupabase(file);
                    if (publicUrl) return { ...img, url: publicUrl };
                }
            }
            return img;
        }));
        r.gallery = updatedGallery;
    }

    // 3. Check Menu
    if (r.menu && r.menu.length > 0) {
        const updatedMenu = await Promise.all(r.menu.map(async (item) => {
            if (item.imageUrl && pendingUploads.current.has(item.imageUrl)) {
                const file = pendingUploads.current.get(item.imageUrl);
                if (file instanceof File) {
                    const publicUrl = await uploadImageToSupabase(file);
                    if (publicUrl) return { ...item, imageUrl: publicUrl };
                }
            }
            return item;
        }));
        r.menu = updatedMenu;
    }

    // Clear pending queue
    pendingUploads.current.clear();
    setSavingStatus('Guardando datos...');

    // --- SAVE TO DB ---
    const payload = {
        name: r.name,
        description: r.description,
        address: r.address,
        city: r.city,
        price_level: r.priceLevel,
        cuisine: r.cuisine,
        tags: r.tags,
        cover_image: r.coverImage,
        is_approved: r.isApproved,
        phone: r.phone,
        email: r.email,
        website: r.website,
        instagram: r.instagram,
        facebook: r.facebook,
        rating: r.rating || 0,
        review_count: r.reviewCount || 0,
        latitude: r.latitude || 40.4168,
        longitude: r.longitude || -3.7038
    };

    try {
        let restaurantId = r.id;

        if (r.id) {
            const { error } = await supabase.from('restaurants').update(payload).eq('id', r.id);
            if (error) throw error;
        } else {
            const { data, error } = await supabase.from('restaurants').insert([payload]).select();
            if (error) throw error;
            restaurantId = data[0].id;
        }

        if (restaurantId) {
            try {
                await supabase.from('menu_items').delete().eq('restaurant_id', restaurantId);
                if (r.menu && r.menu.length > 0) {
                    const menuPayload = r.menu.map(m => ({
                        restaurant_id: restaurantId,
                        name: m.name,
                        description: m.description,
                        price: m.price,
                        category: m.category,
                        image_url: m.imageUrl
                    }));
                    await supabase.from('menu_items').insert(menuPayload);
                }
            } catch (e) {}

            try {
                await supabase.from('photos').delete().eq('restaurant_id', restaurantId).eq('type', 'OWNER');
                if (r.gallery) {
                    const ownerPhotos = r.gallery.filter(p => p.type === 'OWNER').map(p => ({
                        restaurant_id: restaurantId,
                        url: p.url,
                        uploader_name: 'Owner',
                        type: 'OWNER'
                    }));
                    if (ownerPhotos.length > 0) {
                        await supabase.from('photos').insert(ownerPhotos);
                    }
                }
            } catch (e) {}
        }

        // Important: Await the fetch to ensure UI is consistent before navigating
        await fetchData();
        
        setCurrentView('dashboard-admin');
        alert("Restaurante guardado exitosamente.");
    } catch (e: any) {
        alert("Error guardando restaurante: " + (e.message || JSON.stringify(e)));
    } finally {
        setIsSaving(false);
        setSavingStatus('');
    }
  };

  const handleAdminDelete = async (id: string) => {
      if (!confirm("¿Estás seguro de eliminar este restaurante?")) return;
      if (!supabase) return;
      const { error } = await supabase.from('restaurants').delete().eq('id', id);
      if (!error) fetchData();
      else alert("Error eliminando");
  };

  // --- VIEWS ---

  const renderHome = () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      <header className="relative h-[400px] flex items-center justify-center bg-cover bg-center" style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=2000")' }}>
        <div className="absolute inset-0 bg-black bg-opacity-50"></div>
        <div className="relative z-10 w-full max-w-3xl px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 drop-shadow-lg">Descubre y Reserva en los Mejores Restaurantes</h1>
          <div className="flex flex-col md:flex-row bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden p-2 gap-2 transition-colors duration-300">
            <div className="flex-1 flex items-center px-4 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700">
              <Search className="text-gray-400 w-5 h-5 mr-2" />
              <input 
                type="text" 
                placeholder="Restaurante, cocina o ciudad..." 
                className="w-full py-3 outline-none text-gray-700 dark:text-white bg-transparent placeholder-gray-400 dark:placeholder-gray-500"
                value={searchQuery}
                onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value === '') setFilterNearMe(false);
                }}
              />
            </div>
            <Button size="lg" onClick={() => {}}>Buscar</Button>
          </div>
        </div>
      </header>

      <nav aria-label="Filtros" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-20 mb-12">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 flex flex-wrap gap-4 justify-center items-center transition-colors duration-300 border border-gray-100 dark:border-gray-700">
          <button 
            onClick={handleGetLocation}
            className={`px-4 py-2 rounded-full border transition-colors text-sm font-medium flex items-center gap-2 ${filterNearMe ? 'bg-[#00AA6C] text-white border-[#00AA6C]' : 'border-gray-200 dark:border-gray-600 hover:border-[#00AA6C] text-gray-700 dark:text-gray-200 hover:bg-green-50 dark:hover:bg-green-900/20'}`}
          >
             <Navigation className="w-4 h-4" /> Cerca de mí
          </button>
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-2 hidden md:block"></div>
          {['Italiana', 'Japonesa', 'Mexicana', 'Terraza', 'Romántico'].map(tag => (
            <button key={tag} onClick={() => setSearchQuery(tag)} className="px-4 py-2 rounded-full border border-gray-200 dark:border-gray-600 hover:border-[#00AA6C] hover:text-[#00AA6C] hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200">
               {tag}
            </button>
          ))}
        </div>
      </nav>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            {filterNearMe ? 'Restaurantes Cerca de Ti' : 'Restaurantes Destacados'}
        </h2>
        {isLoading ? (
            <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00AA6C]"></div></div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredRestaurants.length === 0 ? (
                <div className="col-span-full text-center py-10 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 transition-colors">
                    <Search className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-2"/>
                    <p className="text-lg">No se encontraron restaurantes.</p>
                </div>
            ) : (
                filteredRestaurants.map(restaurant => (
                    <article key={restaurant.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group border border-gray-100 dark:border-gray-700 cursor-pointer flex flex-col h-full" onClick={() => handleNavigate('details', restaurant.id)}>
                    <div className="relative h-56 overflow-hidden">
                        <img src={restaurant.coverImage} alt={restaurant.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        <button 
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(restaurant.id); }}
                        className={`absolute top-3 right-3 p-2 rounded-full bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm shadow-sm hover:bg-white dark:hover:bg-gray-800 transition-colors ${favorites.includes(restaurant.id) ? 'text-red-500' : 'text-gray-400 dark:text-gray-300'}`}
                        >
                        <Heart className={`w-5 h-5 ${favorites.includes(restaurant.id) ? 'fill-current' : ''}`} />
                        </button>
                        {userRole === UserRole.ADMIN && !restaurant.isApproved && (
                            <div className="absolute top-3 left-3 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded shadow">Pendiente</div>
                        )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-2">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white line-clamp-1">{restaurant.name}</h3>
                        <span className="text-gray-600 dark:text-gray-300 text-sm font-medium bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{restaurant.priceLevel}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                        <StarRating rating={restaurant.rating} size="sm" />
                        <span className="text-sm text-gray-500 dark:text-gray-400">({restaurant.reviewCount} opiniones)</span>
                        </div>
                        <div className="flex items-center text-gray-500 dark:text-gray-400 text-sm mb-4">
                        <MapPin className="w-4 h-4 mr-1 flex-shrink-0" />
                        <span className="truncate">{restaurant.city} • {restaurant.cuisine[0]}</span>
                        </div>
                        <div className="mt-auto flex flex-wrap gap-2">
                        {restaurant.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs rounded-md font-medium border border-green-100 dark:border-green-800">{tag}</span>
                        ))}
                        </div>
                    </div>
                    </article>
                ))
            )}
            </div>
        )}
      </section>
    </div>
  );

  const renderLightbox = (images: GalleryImage[]) => {
      if (!lightboxOpen || images.length === 0) return null;
      
      // Safety check: Ensure index is always valid using modulo
      const safeIndex = (lightboxIndex + images.length) % images.length;
      const currentImage = images[safeIndex];

      if (!currentImage) return null;

      const nextImage = (e: React.MouseEvent) => {
          e.stopPropagation();
          setLightboxIndex((prev) => (prev + 1) % images.length);
      };

      const prevImage = (e: React.MouseEvent) => {
          e.stopPropagation();
          setLightboxIndex((prev) => (prev - 1 + images.length) % images.length);
      };

      return (
          <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center animate-fadeIn" onClick={() => setLightboxOpen(false)}>
              <button className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-white/10 rounded-full transition-colors z-[101]">
                  <X className="w-6 h-6" />
              </button>
              
              <div className="relative max-w-7xl w-full h-full flex items-center justify-center p-4 md:p-12">
                  <img 
                      src={currentImage.url} 
                      alt="Visor" 
                      className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-sm"
                      onClick={(e) => e.stopPropagation()}
                  />
                  
                  {images.length > 1 && (
                      <>
                          <button 
                              onClick={prevImage}
                              className="absolute left-2 md:left-6 p-3 rounded-full bg-black/50 text-white hover:bg-white hover:text-black transition-all"
                          >
                              <ChevronLeft className="w-6 h-6" />
                          </button>
                          <button 
                              onClick={nextImage}
                              className="absolute right-2 md:right-6 p-3 rounded-full bg-black/50 text-white hover:bg-white hover:text-black transition-all"
                          >
                              <ChevronRight className="w-6 h-6" />
                          </button>
                      </>
                  )}
              </div>

              {/* Metadata Bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6 pb-8 text-white">
                  <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-end md:items-center gap-2">
                      <div>
                          <h3 className="font-bold text-lg">
                            {currentImage.type === 'OWNER' 
                                ? `Foto oficial de ${selectedRestaurant?.name}`
                                : `Foto compartida por ${currentImage.uploaderName}`
                            }
                          </h3>
                          <p className="text-xs text-gray-300 flex items-center gap-2">
                             <span>{new Date(currentImage.uploadedAt).toLocaleDateString()}</span>
                             {currentImage.type === 'OWNER' && (
                                 <span className="bg-[#00AA6C] px-2 py-0.5 rounded text-[10px] font-bold text-white flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Propietario</span>
                             )}
                          </p>
                      </div>
                      <div className="text-sm font-medium text-gray-400">
                          {safeIndex + 1} / {images.length}
                      </div>
                  </div>
              </div>
          </div>
      );
  };
  
  const renderDetails = () => {
      if (!selectedRestaurant) return null;
      
      // Prepare all images
      const reviewImages = selectedRestaurant.reviews.flatMap(r => 
        r.images.map(img => ({ url: img, uploaderName: r.userName, uploadedAt: r.date, type: 'USER' as const }))
      );
      const allImages: GalleryImage[] = [...selectedRestaurant.gallery, ...reviewImages];
      
      // Add default image if empty
      if (allImages.length === 0) {
          allImages.push({
              url: selectedRestaurant.coverImage, 
              type: 'OWNER', 
              uploaderName: 'Owner', 
              uploadedAt: new Date().toISOString()
          });
      }

      // Display logic for grid
      // We now determine the grid layout based on how many images we actually have.
      // Max 5 displayed slots.
      const maxDisplay = 5;
      const displayImages = allImages.slice(0, maxDisplay);
      const remainingCount = Math.max(0, allImages.length - maxDisplay);

      // Determine Grid Classes
      let gridClass = "";
      if (displayImages.length === 1) gridClass = "grid-cols-1";
      else if (displayImages.length === 2) gridClass = "grid-cols-2";
      else if (displayImages.length === 3) gridClass = "grid-cols-3"; // Custom handling for span needed
      else if (displayImages.length === 4) gridClass = "grid-cols-2 grid-rows-2"; // 2x2 Grid
      else gridClass = "grid-cols-4 grid-rows-2"; // Standard Bento (1 big, 4 small)

      // Function to handle smooth scrolling with offset for sticky header
      const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
        e.preventDefault();
        const element = document.getElementById(id);
        if (element) {
            // Ajuste para el header pegajoso (Navbar 64px + Submenu ~60px = ~124px)
            const offset = 130; 
            const bodyRect = document.body.getBoundingClientRect().top;
            const elementRect = element.getBoundingClientRect().top;
            const elementPosition = elementRect - bodyRect;
            const offsetPosition = elementPosition - offset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
      };

      // Group Menu by Category
      const groupedMenu = selectedRestaurant.menu.reduce((acc, item) => {
          const cat = item.category || 'Otros';
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(item);
          return acc;
      }, {} as Record<string, MenuItem[]>);

      // Preferred sort order
      const categoryOrder = ['Entrante', 'Principal', 'Postre', 'Bebida'];
      
      const sortedCategories = Object.keys(groupedMenu).sort((a, b) => {
          const indexA = categoryOrder.indexOf(a);
          const indexB = categoryOrder.indexOf(b);
          // If both are in the list, sort by index
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          // If only A is in the list, it comes first
          if (indexA !== -1) return -1;
          // If only B is in the list, it comes first
          if (indexB !== -1) return 1;
          // Otherwise alphabetical
          return a.localeCompare(b);
      });

      return (
        <div className="bg-white dark:bg-gray-900 min-h-screen pb-20 transition-colors duration-300">
          {renderLightbox(allImages)}

          <nav aria-label="Navegación" className="max-w-7xl mx-auto px-4 py-4 text-sm text-gray-500 dark:text-gray-400 flex items-center">
             <button onClick={() => handleNavigate('home')} className="hover:text-[#00AA6C] flex items-center font-medium transition-colors"><ArrowLeft className="w-4 h-4 mr-1"/> Volver al listado</button>
             <span className="mx-2 text-gray-300 dark:text-gray-600">/</span>
             <span>{selectedRestaurant.city}</span>
             <span className="mx-2 text-gray-300 dark:text-gray-600">/</span>
             <span className="font-medium text-gray-900 dark:text-white truncate">{selectedRestaurant.name}</span>
          </nav>

          <header className="max-w-7xl mx-auto px-4 mb-6">
            <h1 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">{selectedRestaurant.name}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
              <div className="flex items-center gap-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-1 rounded transition">
                 <StarRating rating={selectedRestaurant.rating} showCount count={selectedRestaurant.reviewCount} />
              </div>
              <span className="hidden md:inline text-gray-300 dark:text-gray-600">|</span>
              <span className="flex items-center gap-1"><DollarSign className="w-4 h-4"/> {selectedRestaurant.priceLevel}</span>
              <span className="hidden md:inline text-gray-300 dark:text-gray-600">|</span>
              <span className="flex items-center gap-1"><ChefHat className="w-4 h-4"/> {selectedRestaurant.cuisine.join(', ')}</span>
              <span className="hidden md:inline text-gray-300 dark:text-gray-600">|</span>
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4"/> {selectedRestaurant.address}</span>
            </div>
          </header>

          <section className="max-w-7xl mx-auto px-4 mb-8" aria-label="Galería de fotos">
              <div className={`grid gap-2 h-[300px] md:h-[450px] rounded-2xl overflow-hidden relative group ${gridClass}`}>
                  {displayImages.map((img, idx) => {
                      // Calculate spans based on total count
                      let spanClass = "";
                      if (displayImages.length === 3 && idx === 0) spanClass = "col-span-2 row-span-2"; // 1 big left, 2 small right
                      else if (displayImages.length >= 5 && idx === 0) spanClass = "col-span-2 row-span-2"; // 1 big left, 4 small right
                      else spanClass = "col-span-1 row-span-1";

                      // Last image check for overlay
                      const isLastVisible = idx === displayImages.length - 1;

                      return (
                        <div 
                            key={idx}
                            className={`relative overflow-hidden cursor-pointer ${spanClass}`}
                            onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
                        >
                            <img src={img.url} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" alt={`Galería ${idx}`} />
                            
                            {/* +N Photos Overlay: Only on the LAST visible image if there are remaining photos */}
                            {isLastVisible && remainingCount > 0 && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center group-hover:bg-black/60 transition-colors">
                                    <span className="text-white font-bold flex items-center gap-2 text-lg"><ImageIcon className="w-6 h-6"/> +{remainingCount} fotos</span>
                                </div>
                            )}
                        </div>
                      );
                  })}
              </div>
          </section>

          <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2 space-y-12">
              <nav className="sticky top-16 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-gray-900/60 py-4 border-b border-gray-200 dark:border-gray-700 flex gap-8 text-sm font-bold text-gray-600 dark:text-gray-400 overflow-x-auto no-scrollbar transition-colors duration-300">
                  <a href="#overview" onClick={(e) => scrollToSection(e, 'overview')} className="text-[#00AA6C] border-b-2 border-[#00AA6C] pb-4 -mb-4 whitespace-nowrap hover:text-[#008f5a] transition-colors">Resumen</a>
                  <a href="#menu" onClick={(e) => scrollToSection(e, 'menu')} className="hover:text-gray-900 dark:hover:text-white pb-4 whitespace-nowrap transition-colors">Menú</a>
                  <a href="#reviews" onClick={(e) => scrollToSection(e, 'reviews')} className="hover:text-gray-900 dark:hover:text-white pb-4 whitespace-nowrap transition-colors">Opiniones ({selectedRestaurant.reviewCount})</a>
                  <a href="#qa" onClick={(e) => scrollToSection(e, 'qa')} className="hover:text-gray-900 dark:hover:text-white pb-4 whitespace-nowrap transition-colors">Preguntas</a>
              </nav>

              <section id="overview" className="animate-fadeIn">
                  <SectionTitle>Sobre {selectedRestaurant.name}</SectionTitle>
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg">{selectedRestaurant.description}</p>
                  <div className="mt-6 flex gap-2 flex-wrap">
                      {selectedRestaurant.tags.map(t => <Tag key={t}>{t}</Tag>)}
                  </div>
                  <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {selectedRestaurant.website && (
                          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-transparent dark:border-gray-700 transition-colors">
                              <Globe className="w-5 h-5 text-[#00AA6C]"/> 
                              <a href={selectedRestaurant.website} target="_blank" rel="noreferrer" className="text-gray-700 dark:text-gray-300 hover:text-[#00AA6C] hover:underline truncate">{selectedRestaurant.website}</a>
                          </div>
                      )}
                       {selectedRestaurant.phone && (
                          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-transparent dark:border-gray-700 transition-colors">
                              <Phone className="w-5 h-5 text-[#00AA6C]"/> 
                              <span className="text-gray-700 dark:text-gray-300">{selectedRestaurant.phone}</span>
                          </div>
                      )}
                       {selectedRestaurant.email && (
                          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-transparent dark:border-gray-700 transition-colors">
                              <Mail className="w-5 h-5 text-[#00AA6C]"/> 
                              <span className="text-gray-700 dark:text-gray-300 truncate">{selectedRestaurant.email}</span>
                          </div>
                      )}
                  </div>
              </section>

              <section id="menu">
                  <SectionTitle>Menú del Restaurante</SectionTitle>
                  {sortedCategories.length === 0 ? (
                      <p className="text-gray-500 dark:text-gray-400 italic">El menú estará disponible pronto.</p>
                  ) : (
                      <div className="space-y-8">
                          {sortedCategories.map(category => (
                              <div key={category}>
                                  <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">{category}s</h3>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      {groupedMenu[category].map((item, idx) => (
                                          <article key={idx} className="border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl p-4 flex gap-4 hover:shadow-md transition-all items-center">
                                              {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="w-24 h-24 rounded-lg object-cover flex-shrink-0 shadow-sm" />}
                                              <div className="flex-1">
                                                  <div className="flex justify-between items-start">
                                                      <h4 className="font-bold text-gray-900 dark:text-white text-lg">{item.name}</h4>
                                                      <span className="font-bold text-[#00AA6C] bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-md ml-2">{item.price}€</span>
                                                  </div>
                                                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{item.description}</p>
                                              </div>
                                          </article>
                                      ))}
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </section>

              <section id="reviews">
                  <div className="flex justify-between items-center mb-6">
                      <SectionTitle>Opiniones de la Comunidad</SectionTitle>
                      {!isWritingReview && (
                        <Button onClick={() => {
                            if(userRole === UserRole.GUEST) {
                                alert("Inicia sesión para escribir una opinión.");
                                setCurrentView('admin-login');
                            } else {
                                setIsWritingReview(true);
                            }
                        }}>Escribir opinión</Button>
                      )}
                  </div>

                  {/* REVIEW FORM */}
                  {isWritingReview && (
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-8 shadow-sm animate-fadeIn transition-colors">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Comparte tu experiencia</h3>
                          
                          <div className="mb-4">
                              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Tu Calificación</label>
                              <div className="flex gap-1">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                      <button 
                                        key={star} 
                                        onClick={() => setReviewRating(star)}
                                        className="focus:outline-none transition-transform hover:scale-110"
                                      >
                                          <Star 
                                            className={`w-8 h-8 ${star <= reviewRating ? 'fill-[#00AA6C] text-[#00AA6C]' : 'text-gray-300'}`} 
                                          />
                                      </button>
                                  ))}
                              </div>
                          </div>

                          <div className="mb-4">
                              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Tu Opinión</label>
                              <textarea 
                                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#00AA6C] outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                  rows={4}
                                  placeholder="¿Qué te pareció la comida, el servicio y el ambiente?"
                                  value={reviewText}
                                  onChange={(e) => setReviewText(e.target.value)}
                              />
                          </div>

                          <div className="mb-6">
                              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Añadir Fotos</label>
                              <div className="flex items-center gap-4">
                                  <label className="cursor-pointer flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
                                      <Camera className="w-5 h-5"/>
                                      <span>Subir fotos</span>
                                      <input 
                                        type="file" 
                                        multiple 
                                        accept="image/*" 
                                        className="hidden" 
                                        onChange={handleReviewImageSelect}
                                      />
                                  </label>
                              </div>
                              {reviewPreviews.length > 0 && (
                                  <div className="flex gap-3 mt-4 overflow-x-auto pb-2">
                                      {reviewPreviews.map((src, idx) => (
                                          <div key={idx} className="relative w-20 h-20 flex-shrink-0">
                                              <img src={src} alt="Preview" className="w-full h-full object-cover rounded-lg border border-gray-200 dark:border-gray-700"/>
                                              <button 
                                                onClick={() => handleRemoveReviewImage(idx)}
                                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:bg-red-600"
                                              >
                                                  <X className="w-3 h-3"/>
                                              </button>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>

                          <div className="flex gap-3 justify-end">
                              <Button variant="outline" onClick={() => setIsWritingReview(false)} disabled={isSubmittingReview}>Cancelar</Button>
                              <Button onClick={handleSubmitReview} disabled={isSubmittingReview}>
                                  {isSubmittingReview ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : null}
                                  Publicar Opinión
                              </Button>
                          </div>
                      </div>
                  )}

                  <div className="space-y-8">
                      {selectedRestaurant.reviews.map(review => (
                          <article key={review.id} className="border-b border-gray-100 dark:border-gray-700 pb-8 last:border-0">
                              <div className="flex items-center gap-4 mb-4">
                                  <img src={review.userAvatar} alt={review.userName} className="w-12 h-12 rounded-full border border-gray-100 dark:border-gray-700" />
                                  <div>
                                      <div className="font-bold text-gray-900 dark:text-white">{review.userName}</div>
                                      <div className="text-xs text-gray-400 flex items-center gap-1">
                                          <span>{review.date}</span>
                                          <span>•</span>
                                          <span className="text-green-600 dark:text-green-400 flex items-center"><CheckCircle className="w-3 h-3 mr-0.5"/> Visita verificada</span>
                                      </div>
                                  </div>
                              </div>
                              <div className="mb-3"><StarRating rating={review.rating} size="sm" /></div>
                              <p className="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">{review.text}</p>
                              {review.images.length > 0 && (
                                  <div className="flex gap-3 overflow-x-auto pb-2">
                                      {review.images.map((img, i) => (
                                          <img 
                                            key={i} 
                                            src={img} 
                                            alt="Foto de reseña" 
                                            className="w-24 h-24 object-cover rounded-xl cursor-pointer hover:opacity-90 shadow-sm" 
                                            // Find the index in the MAIN allImages array to open lightbox correctly
                                            onClick={() => {
                                                const realIndex = allImages.findIndex(ai => ai.url === img);
                                                if (realIndex !== -1) {
                                                    setLightboxIndex(realIndex);
                                                    setLightboxOpen(true);
                                                }
                                            }}
                                          />
                                      ))}
                                  </div>
                              )}
                          </article>
                      ))}
                  </div>
              </section>

              <section id="qa">
                   <div className="flex justify-between items-center mb-6">
                      <SectionTitle>Preguntas y Respuestas</SectionTitle>
                      <Button variant="outline" onClick={() => {
                          const q = prompt("¿Tienes alguna duda sobre el restaurante?");
                          if (q) handleAskQuestion(q);
                      }}>Preguntar</Button>
                  </div>
                  <div className="space-y-4">
                      {selectedRestaurant.qa.map(qa => (
                          <article key={qa.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 rounded-xl shadow-sm transition-colors">
                              <div className="flex gap-4">
                                  <div className="mt-1 bg-gray-100 dark:bg-gray-700 p-2 rounded-full h-fit"><MessageSquare className="w-5 h-5 text-gray-500 dark:text-gray-400"/></div>
                                  <div className="flex-1">
                                      <h4 className="font-bold text-gray-900 dark:text-white text-lg">{qa.question}</h4>
                                      <div className="text-xs text-gray-400 mt-1 mb-3">{qa.userName} • {qa.date}</div>
                                      {qa.answer ? (
                                          <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border-l-4 border-[#00AA6C]">
                                              <p className="text-gray-800 dark:text-gray-300 text-sm leading-relaxed">{qa.answer}</p>
                                              <div className="text-xs font-bold mt-2 flex items-center gap-2 uppercase tracking-wider">
                                                  {qa.answerSource === 'AI' && <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1"><span className="bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded">IA</span> Asistente Virtual</span>}
                                                  {qa.answerSource === 'OWNER' && <span className="text-[#00AA6C] flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Propietario</span>}
                                              </div>
                                          </div>
                                      ) : (
                                          <p className="text-sm text-gray-400 italic">Esperando respuesta...</p>
                                      )}
                                  </div>
                              </div>
                          </article>
                      ))}
                  </div>
              </section>
            </div>
            <aside className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 p-6 overflow-hidden transition-colors">
                      <div className="bg-[#00AA6C] -mx-6 -mt-6 p-4 mb-6 text-white text-center">
                          <h3 className="font-bold text-lg">Reservar Mesa</h3>
                          <p className="text-xs opacity-90">Confirmación inmediata</p>
                      </div>
                      <div className="space-y-4">
                          <Button className="w-full font-bold text-lg shadow-lg shadow-green-200 dark:shadow-green-900/30 py-4" onClick={() => handleReservation('2023-12-20', '20:30', 2)}>
                              Completar Reserva
                          </Button>
                      </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-2 divide-y divide-gray-100 dark:divide-gray-700 transition-colors">
                       <button 
                          className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors rounded-lg group"
                          onClick={() => toggleFavorite(selectedRestaurant.id)}
                       >
                           <span className="font-medium text-gray-700 dark:text-gray-300 text-sm group-hover:text-[#00AA6C]">Guardar en Favoritos</span>
                           <Heart className={`w-5 h-5 ${favorites.includes(selectedRestaurant.id) ? 'fill-red-500 text-red-500' : 'text-gray-300 group-hover:text-red-500'}`} />
                       </button>
                  </div>
              </div>
            </aside>
          </div>
        </div>
      );
  };
  
  const renderDashboardUser = () => (
      <div className="max-w-5xl mx-auto px-4 py-8 min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">Mi Panel de Usuario</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <section className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 md:col-span-3 grid grid-cols-3 gap-4 text-center transition-colors">
                  <div className="p-4">
                      <div className="text-4xl font-bold text-[#00AA6C]">{reservations.length}</div>
                      <div className="text-gray-500 dark:text-gray-400 font-medium mt-1">Reservas Activas</div>
                  </div>
                  <div className="p-4 border-l border-gray-100 dark:border-gray-700">
                      <div className="text-4xl font-bold text-[#00AA6C]">{favorites.length}</div>
                      <div className="text-gray-500 dark:text-gray-400 font-medium mt-1">Favoritos</div>
                  </div>
                  <div className="p-4 border-l border-gray-100 dark:border-gray-700">
                      <div className="text-4xl font-bold text-[#00AA6C]">{userLists.length}</div>
                      <div className="text-gray-500 dark:text-gray-400 font-medium mt-1">Listas</div>
                  </div>
              </section>

              <section className="md:col-span-2 space-y-6">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">Próximas Reservas</h2>
                  {reservations.length === 0 ? (
                      <div className="bg-gray-50 dark:bg-gray-800/50 p-8 rounded-xl text-center text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700">No tienes reservas activas.</div>
                  ) : (
                      reservations.map(res => (
                          <article key={res.id} className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4 transition-colors">
                              <div>
                                  <h3 className="font-bold text-lg text-gray-900 dark:text-white">{res.restaurantName}</h3>
                                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mt-2">
                                      <span className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded"><Calendar className="w-4 h-4"/> {res.date}</span>
                                      <span className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded"><Clock className="w-4 h-4"/> {res.time}</span>
                                      <span className="flex items-center gap-1"><User className="w-4 h-4"/> {res.people} pers.</span>
                                  </div>
                              </div>
                              <span className="px-4 py-1.5 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-full text-xs font-bold shadow-sm ring-1 ring-green-200 dark:ring-green-800">{res.status}</span>
                          </article>
                      ))
                  )}
              </section>
              <aside className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 h-fit shadow-sm transition-colors">
                  <h2 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><Heart className="w-5 h-5 text-red-500"/> Favoritos</h2>
                  <ul className="space-y-4">
                      {restaurants.filter(r => favorites.includes(r.id)).map(r => (
                          <li key={r.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 -mx-2 rounded-lg transition-colors" onClick={() => handleNavigate('details', r.id)}>
                              <img src={r.coverImage} className="w-14 h-14 rounded-lg object-cover shadow-sm" alt={r.name} />
                              <div className="overflow-hidden">
                                  <div className="font-bold text-gray-800 dark:text-gray-200 truncate">{r.name}</div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><MapPin className="w-3 h-3"/> {r.city}</div>
                              </div>
                          </li>
                      ))}
                  </ul>
              </aside>
          </div>
      </div>
  );

  const renderAdminLogin = () => (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4 py-12 transition-colors duration-300">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-gray-100 dark:border-gray-700 transition-colors">
              <div className="bg-[#00AA6C] p-6 text-center">
                  <div className="mx-auto bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
                      <Lock className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">
                      {isRegistering ? 'Crear Cuenta' : 'Iniciar Sesión'}
                  </h2>
              </div>
              <div className="p-8">
                  <div className="flex gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg mb-8 transition-colors">
                      <button className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${!isRegistering ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`} onClick={() => setIsRegistering(false)}>Entrar</button>
                      <button className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${isRegistering ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`} onClick={() => setIsRegistering(true)}>Registrarse</button>
                  </div>
                  <form onSubmit={handleAuth} className="space-y-4">
                      <div>
                          <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Correo Electrónico</label>
                          <input 
                            type="email" 
                            className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-[#00AA6C] bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors" 
                            value={authEmail} 
                            onChange={(e) => setAuthEmail(e.target.value)} 
                            required 
                            placeholder="usuario@ejemplo.com"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Contraseña</label>
                          <input 
                            type="password" 
                            className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-[#00AA6C] bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors" 
                            value={authPassword} 
                            onChange={(e) => setAuthPassword(e.target.value)} 
                            required 
                            placeholder="••••••••"
                          />
                      </div>
                      <div className="pt-4">
                          <Button className="w-full py-3 font-bold text-lg disabled:opacity-70" disabled={authLoading}>
                              {authLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto"/> : (isRegistering ? 'Crear Cuenta' : 'Acceder')}
                          </Button>
                      </div>
                  </form>
              </div>
          </div>
      </div>
  );

  const renderAdminEditRestaurant = () => {
      const TABS = [
          { id: 'basic', label: 'Información Básica', icon: Layout },
          { id: 'contact', label: 'Contacto', icon: Phone },
          { id: 'menu', label: 'Menú', icon: ChefHat },
          { id: 'gallery', label: 'Galería', icon: ImageIcon },
      ];

      return (
          <div className="min-h-screen bg-gray-100 dark:bg-gray-900 pb-20 transition-colors duration-300">
              <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-16 z-20 shadow-sm transition-colors">
                  <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                          <button onClick={() => handleNavigate('dashboard-admin')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300 transition-colors"><ArrowLeft className="w-5 h-5"/></button>
                          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{editingRestaurant.id ? `Editando: ${editingRestaurant.name}` : 'Nuevo Restaurante'}</h1>
                      </div>
                      <div className="flex gap-3 items-center">
                          <Button variant="outline" onClick={() => handleNavigate('dashboard-admin')} className="dark:bg-transparent dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</Button>
                          <Button onClick={handleAdminSave} disabled={isSaving}>
                              {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                              {isSaving && savingStatus ? savingStatus : 'Guardar Cambios'}
                          </Button>
                      </div>
                  </div>
              </div>

              <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-12 gap-8">
                  {/* Sidebar Navigation */}
                  <div className="col-span-12 md:col-span-3">
                      <nav className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden sticky top-36 transition-colors">
                          {TABS.map(tab => (
                              <button
                                key={tab.id}
                                onClick={() => setEditTab(tab.id as any)}
                                className={`w-full flex items-center gap-3 p-4 text-left font-medium transition-colors ${editTab === tab.id ? 'bg-green-50 dark:bg-green-900/20 text-[#00AA6C] border-l-4 border-[#00AA6C]' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-l-4 border-transparent'}`}
                              >
                                  <tab.icon className="w-5 h-5"/>
                                  {tab.label}
                              </button>
                          ))}
                      </nav>
                  </div>

                  {/* Content Area */}
                  <div className="col-span-12 md:col-span-9 space-y-6">
                      
                      {/* BASIC INFO TAB */}
                      {editTab === 'basic' && (
                          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 space-y-6 animate-fadeIn transition-colors">
                              <SectionTitle>Detalles Principales</SectionTitle>
                              
                              {/* Image Upload Cover */}
                              <div>
                                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Imagen de Portada</label>
                                  <div className="relative h-48 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex flex-col items-center justify-center overflow-hidden group">
                                      {editingRestaurant.coverImage ? (
                                          <>
                                            <img src={editingRestaurant.coverImage} className="w-full h-full object-cover" alt="Cover" />
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <p className="text-white font-bold">Cambiar Imagen</p>
                                            </div>
                                          </>
                                      ) : (
                                          <div className="text-center p-4">
                                              <Camera className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2"/>
                                              <p className="text-sm text-gray-500 dark:text-gray-400">Click para subir imagen</p>
                                          </div>
                                      )}
                                      <input 
                                        type="file" 
                                        className="absolute inset-0 opacity-0 cursor-pointer" 
                                        onChange={(e) => handleImageSelect(e, 'cover')}
                                        accept="image/*"
                                      />
                                  </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div>
                                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Nombre del Restaurante</label>
                                      <input 
                                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#00AA6C] outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                          value={editingRestaurant.name || ''}
                                          onChange={e => setEditingRestaurant({...editingRestaurant, name: e.target.value})}
                                          placeholder="Ej. La Casa del Sabor"
                                      />
                                  </div>
                                  <div>
                                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Ciudad</label>
                                      <input 
                                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#00AA6C] outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                          value={editingRestaurant.city || ''}
                                          onChange={e => setEditingRestaurant({...editingRestaurant, city: e.target.value})}
                                          placeholder="Ej. Madrid"
                                      />
                                  </div>
                              </div>
                              
                              <div>
                                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Dirección Completa</label>
                                  <input 
                                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#00AA6C] outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                      value={editingRestaurant.address || ''}
                                      onChange={e => setEditingRestaurant({...editingRestaurant, address: e.target.value})}
                                      placeholder="Calle, Número, Código Postal"
                                  />
                              </div>

                              <div>
                                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
                                  <textarea 
                                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#00AA6C] outline-none h-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                      value={editingRestaurant.description || ''}
                                      onChange={e => setEditingRestaurant({...editingRestaurant, description: e.target.value})}
                                      placeholder="Cuenta la historia y el estilo de tu restaurante..."
                                  />
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div>
                                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Rango de Precio</label>
                                      <select 
                                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#00AA6C] outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                          value={editingRestaurant.priceLevel || '$$'}
                                          onChange={e => setEditingRestaurant({...editingRestaurant, priceLevel: e.target.value as any})}
                                      >
                                          <option value="$">Barato ($)</option>
                                          <option value="$$">Moderado ($$)</option>
                                          <option value="$$$">Caro ($$$)</option>
                                          <option value="$$$$">Exclusivo ($$$$)</option>
                                      </select>
                                  </div>
                                  <div>
                                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Tipos de Cocina (separados por coma)</label>
                                      <input 
                                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#00AA6C] outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                          value={editingRestaurant.cuisine?.join(', ') || ''}
                                          onChange={e => setEditingRestaurant({...editingRestaurant, cuisine: e.target.value.split(',').map(s => s.trim())})}
                                          placeholder="Ej. Italiana, Pizza, Pasta"
                                      />
                                  </div>
                              </div>

                              <div>
                                   <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Etiquetas (Tags)</label>
                                   <input 
                                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#00AA6C] outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                          value={editingRestaurant.tags?.join(', ') || ''}
                                          onChange={e => setEditingRestaurant({...editingRestaurant, tags: e.target.value.split(',').map(s => s.trim())})}
                                          placeholder="Ej. Romántico, Terraza, Música en vivo"
                                    />
                              </div>

                              <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                                  <input 
                                      type="checkbox" 
                                      id="isApproved"
                                      className="w-5 h-5 text-[#00AA6C] focus:ring-[#00AA6C] border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                                      checked={editingRestaurant.isApproved || false}
                                      onChange={e => setEditingRestaurant({...editingRestaurant, isApproved: e.target.checked})}
                                  />
                                  <label htmlFor="isApproved" className="text-gray-900 dark:text-gray-200 font-medium">Restaurante Aprobado (Visible al público)</label>
                              </div>
                          </div>
                      )}

                      {/* CONTACT TAB */}
                      {editTab === 'contact' && (
                          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 space-y-6 animate-fadeIn transition-colors">
                              <SectionTitle>Información de Contacto</SectionTitle>
                              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Esta información aparecerá en la ficha del restaurante para que los clientes puedan contactarte.</p>
                              
                              <div className="space-y-4">
                                  <div>
                                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Número de Teléfono</label>
                                      <div className="relative">
                                          <Phone className="absolute left-3 top-3 w-5 h-5 text-gray-400 dark:text-gray-500"/>
                                          <input 
                                              className="w-full pl-10 p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#00AA6C] outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                              value={editingRestaurant.phone || ''}
                                              onChange={e => setEditingRestaurant({...editingRestaurant, phone: e.target.value})}
                                              placeholder="+34 600 000 000"
                                          />
                                      </div>
                                  </div>
                                  <div>
                                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Correo Electrónico</label>
                                      <div className="relative">
                                          <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400 dark:text-gray-500"/>
                                          <input 
                                              className="w-full pl-10 p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#00AA6C] outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                              value={editingRestaurant.email || ''}
                                              onChange={e => setEditingRestaurant({...editingRestaurant, email: e.target.value})}
                                              placeholder="contacto@restaurante.com"
                                          />
                                      </div>
                                  </div>
                                  <div>
                                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Sitio Web</label>
                                      <div className="relative">
                                          <Globe className="absolute left-3 top-3 w-5 h-5 text-gray-400 dark:text-gray-500"/>
                                          <input 
                                              className="w-full pl-10 p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#00AA6C] outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                              value={editingRestaurant.website || ''}
                                              onChange={e => setEditingRestaurant({...editingRestaurant, website: e.target.value})}
                                              placeholder="https://www.turestaurante.com"
                                          />
                                      </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Instagram</label>
                                        <div className="relative">
                                            <Instagram className="absolute left-3 top-3 w-5 h-5 text-gray-400 dark:text-gray-500"/>
                                            <input 
                                                className="w-full pl-10 p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#00AA6C] outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                                value={editingRestaurant.instagram || ''}
                                                onChange={e => setEditingRestaurant({...editingRestaurant, instagram: e.target.value})}
                                                placeholder="@usuario"
                                            />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Facebook</label>
                                        <div className="relative">
                                            <Facebook className="absolute left-3 top-3 w-5 h-5 text-gray-400 dark:text-gray-500"/>
                                            <input 
                                                className="w-full pl-10 p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#00AA6C] outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                                value={editingRestaurant.facebook || ''}
                                                onChange={e => setEditingRestaurant({...editingRestaurant, facebook: e.target.value})}
                                                placeholder="facebook.com/usuario"
                                            />
                                        </div>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      )}

                      {/* MENU TAB */}
                      {editTab === 'menu' && (
                          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 space-y-6 animate-fadeIn transition-colors">
                               <div className="flex justify-between items-center">
                                  <SectionTitle>Menú del Restaurante</SectionTitle>
                                  <Button onClick={() => {
                                      const newItem: MenuItem = { name: '', description: '', price: 0, category: 'Principal' };
                                      setEditingRestaurant(prev => ({...prev, menu: [...(prev.menu || []), newItem]}));
                                  }} size="sm"><Plus className="w-4 h-4"/> Añadir Plato</Button>
                               </div>
                               
                               {(!editingRestaurant.menu || editingRestaurant.menu.length === 0) && (
                                   <div className="text-center py-8 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400">
                                       Aún no hay platos en el menú.
                                   </div>
                               )}

                               <div className="space-y-6">
                                   {editingRestaurant.menu?.map((item, idx) => (
                                       <div key={idx} className="flex gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-700/50 relative group transition-colors">
                                            <button 
                                                onClick={() => {
                                                    const newMenu = editingRestaurant.menu?.filter((_, i) => i !== idx);
                                                    setEditingRestaurant({...editingRestaurant, menu: newMenu});
                                                }}
                                                className="absolute top-2 right-2 p-1.5 bg-white dark:bg-gray-800 rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="w-4 h-4"/>
                                            </button>
                                            
                                            {/* Image Upload for Item */}
                                            <div className="w-24 h-24 flex-shrink-0 relative rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-600 border border-gray-300 dark:border-gray-500">
                                                {item.imageUrl ? (
                                                    <img src={item.imageUrl} alt="plato" className="w-full h-full object-cover"/>
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500"><ImageIcon className="w-8 h-8"/></div>
                                                )}
                                                <input 
                                                    type="file" 
                                                    className="absolute inset-0 opacity-0 cursor-pointer" 
                                                    onChange={(e) => handleImageSelect(e, 'menu', idx)}
                                                    accept="image/*"
                                                />
                                            </div>

                                            <div className="flex-1 space-y-3">
                                                <div className="grid grid-cols-3 gap-3">
                                                    <div className="col-span-2">
                                                        <input 
                                                            className="w-full p-2 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm font-bold text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                                            placeholder="Nombre del plato"
                                                            value={item.name}
                                                            onChange={e => {
                                                                const newMenu = [...(editingRestaurant.menu || [])];
                                                                newMenu[idx].name = e.target.value;
                                                                setEditingRestaurant({...editingRestaurant, menu: newMenu});
                                                            }}
                                                        />
                                                    </div>
                                                    <div>
                                                         <input 
                                                            className="w-full p-2 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                                            type="number"
                                                            placeholder="Precio"
                                                            value={item.price}
                                                            onChange={e => {
                                                                const newMenu = [...(editingRestaurant.menu || [])];
                                                                newMenu[idx].price = parseFloat(e.target.value);
                                                                setEditingRestaurant({...editingRestaurant, menu: newMenu});
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                <textarea 
                                                    className="w-full p-2 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                                    placeholder="Descripción del plato"
                                                    value={item.description}
                                                    onChange={e => {
                                                        const newMenu = [...(editingRestaurant.menu || [])];
                                                        newMenu[idx].description = e.target.value;
                                                        setEditingRestaurant({...editingRestaurant, menu: newMenu});
                                                    }}
                                                />
                                                <select 
                                                     className="p-2 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                                                     value={item.category}
                                                     onChange={e => {
                                                        const newMenu = [...(editingRestaurant.menu || [])];
                                                        newMenu[idx].category = e.target.value;
                                                        setEditingRestaurant({...editingRestaurant, menu: newMenu});
                                                    }}
                                                >
                                                    <option>Entrante</option>
                                                    <option>Principal</option>
                                                    <option>Postre</option>
                                                    <option>Bebida</option>
                                                </select>
                                            </div>
                                       </div>
                                   ))}
                               </div>
                          </div>
                      )}

                      {/* GALLERY TAB */}
                      {editTab === 'gallery' && (
                          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 space-y-6 animate-fadeIn transition-colors">
                               <SectionTitle>Galería de Imágenes</SectionTitle>
                               
                               <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center bg-gray-50 dark:bg-gray-700/50 hover:bg-green-50 dark:hover:bg-green-900/20 hover:border-[#00AA6C] transition-colors cursor-pointer relative">
                                   <Upload className="w-10 h-10 text-[#00AA6C] mx-auto mb-2"/>
                                   <p className="font-bold text-gray-700 dark:text-gray-300">Subir nuevas fotos</p>
                                   <p className="text-sm text-gray-500 dark:text-gray-400">Arrastra imágenes o haz click aquí</p>
                                   <input 
                                        type="file" 
                                        className="absolute inset-0 opacity-0 cursor-pointer" 
                                        onChange={(e) => handleImageSelect(e, 'gallery')}
                                        accept="image/*"
                                    />
                               </div>

                               <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                                   {editingRestaurant.gallery?.map((img, idx) => (
                                       <div key={idx} className="relative aspect-square rounded-lg overflow-hidden group">
                                           <img src={img.url} alt="gallery" className="w-full h-full object-cover"/>
                                           <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                               <button 
                                                   onClick={() => {
                                                       const newGallery = editingRestaurant.gallery?.filter((_, i) => i !== idx);
                                                       setEditingRestaurant({...editingRestaurant, gallery: newGallery});
                                                   }}
                                                   className="p-2 bg-white rounded-full text-red-500"
                                               >
                                                   <Trash2 className="w-5 h-5"/>
                                               </button>
                                           </div>
                                           {img.type === 'USER' && (
                                               <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded">De Usuario</span>
                                           )}
                                       </div>
                                   ))}
                               </div>
                          </div>
                      )}

                  </div>
              </div>
          </div>
      );
  };

  const renderDashboardAdmin = () => (
      <div className="max-w-7xl mx-auto px-4 py-8 min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
          <div className="flex justify-between items-center mb-8">
              <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Panel de Administración</h1>
                  <p className="text-gray-500 dark:text-gray-400 mt-1">Gestiona los restaurantes y contenidos de la plataforma.</p>
              </div>
              <Button onClick={() => {
                  setEditingRestaurant({ isApproved: true, cuisine: [], tags: [], gallery: [], menu: [] });
                  handleNavigate('admin-edit-restaurant');
              }}>
                  <Plus className="w-4 h-4"/> Agregar Restaurante
              </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-colors">
                  <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Restaurantes</h3>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{restaurants.length}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-colors">
                   <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Pendientes</h3>
                  <p className="text-3xl font-bold text-yellow-600 mt-2">{restaurants.filter(r => !r.isApproved).length}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-colors">
                   <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Reservas Totales</h3>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{reservations.length}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-colors">
                   <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Usuarios</h3>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">1,204</p>
              </div>
          </div>

          {/* Restaurants Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
              <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium border-b border-gray-200 dark:border-gray-700">
                          <tr>
                              <th className="px-6 py-4">Restaurante</th>
                              <th className="px-6 py-4">Ubicación</th>
                              <th className="px-6 py-4">Categoría</th>
                              <th className="px-6 py-4 text-center">Rating</th>
                              <th className="px-6 py-4 text-center">Estado</th>
                              <th className="px-6 py-4 text-right">Acciones</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {restaurants.map(r => (
                              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                  <td className="px-6 py-4">
                                      <div className="flex items-center gap-3">
                                          <img src={r.coverImage} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100 dark:bg-gray-600" />
                                          <div>
                                              <div className="font-bold text-gray-900 dark:text-white">{r.name}</div>
                                              <div className="text-gray-500 dark:text-gray-400 text-xs">{r.priceLevel}</div>
                                          </div>
                                      </div>
                                  </td>
                                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{r.city}<br/><span className="text-xs text-gray-400 dark:text-gray-500">{r.address}</span></td>
                                  <td className="px-6 py-4">
                                      <div className="flex flex-wrap gap-1">
                                          {r.cuisine.slice(0, 2).map(c => (
                                              <span key={c} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded-md">{c}</span>
                                          ))}
                                      </div>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                      <div className="inline-flex items-center gap-1 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-md text-green-700 dark:text-green-400 font-bold">
                                          {r.rating} <StarRating rating={1} size="sm" showCount={false} />
                                      </div>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                      {r.isApproved ? (
                                          <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-bold bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full"><CheckCircle className="w-3 h-3"/> Activo</span>
                                      ) : (
                                          <span className="inline-flex items-center gap-1 text-yellow-600 dark:text-yellow-400 text-xs font-bold bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded-full">Pendiente</span>
                                      )}
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="flex justify-end gap-2">
                                          <button 
                                              onClick={() => handleNavigate('details', r.id)} 
                                              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-green-600 dark:text-green-400 transition-colors" 
                                              title="Ver página pública"
                                          >
                                              <Eye className="w-4 h-4"/>
                                          </button>
                                          <button onClick={() => { setEditingRestaurant(r); handleNavigate('admin-edit-restaurant'); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-blue-600 dark:text-blue-400 transition-colors" title="Editar"><Edit className="w-4 h-4"/></button>
                                          <button onClick={() => handleAdminDelete(r.id)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full text-red-600 dark:text-red-400 transition-colors" title="Eliminar"><Trash2 className="w-4 h-4"/></button>
                                      </div>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      </div>
  );

  return (
    <div className="font-sans text-gray-900 dark:text-white bg-white dark:bg-gray-900 selection:bg-green-100 selection:text-green-900 flex flex-col min-h-screen transition-colors duration-300">
      <Navbar currentUserRole={userRole} onNavigate={handleNavigate} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />
      <main className="flex-grow">
        {currentView === 'home' && renderHome()}
        {currentView === 'details' && renderDetails()}
        {currentView === 'dashboard-user' && renderDashboardUser()}
        {currentView === 'dashboard-admin' && renderDashboardAdmin()}
        {currentView === 'admin-edit-restaurant' && renderAdminEditRestaurant()}
        {currentView === 'admin-login' && renderAdminLogin()}
      </main>
      {currentView !== 'dashboard-admin' && currentView !== 'admin-edit-restaurant' && <Footer onNavigate={handleNavigate} />}
    </div>
  );
}

export default App;
