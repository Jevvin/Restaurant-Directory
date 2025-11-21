
export enum UserRole {
  GUEST = 'GUEST',
  USER = 'USER',
  OWNER = 'OWNER',
  ADMIN = 'ADMIN'
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  role: UserRole;
  favorites: string[]; // List of restaurant IDs
  lists: { id: string; name: string; restaurantIds: string[] }[];
}

export interface MenuItem {
  id?: string; // Optional for new items
  name: string;
  description: string;
  price: number;
  category: string; // Entrante, Principal, Postre, Bebida
  imageUrl?: string;
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  rating: number;
  date: string;
  text: string;
  images: string[]; // URLs
}

export interface QAItem {
  id: string;
  userId: string;
  userName: string;
  question: string;
  date: string;
  answer?: string; // Owner or AI answer
  answerSource?: 'OWNER' | 'AI' | 'COMMUNITY';
}

export interface GalleryImage {
  url: string;
  uploaderName: string;
  uploadedAt: string;
  type: 'OWNER' | 'USER';
}

export interface Restaurant {
  id: string;
  name: string;
  description: string; // Detailed description
  address: string;
  city: string;
  latitude?: number;
  longitude?: number;
  rating: number; // 0-5
  reviewCount: number;
  priceLevel: '$$' | '$$$' | '$$$$';
  cuisine: string[]; // e.g., "Italiana", "Mexicana"
  tags: string[]; // e.g., "Romántico", "Terraza"
  coverImage: string;
  gallery: GalleryImage[];
  menu: MenuItem[];
  reviews: Review[];
  qa: QAItem[];
  ownerId: string;
  isApproved: boolean;
  // Contact Info
  phone?: string;
  email?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
}

export interface Reservation {
  id: string;
  restaurantId: string;
  restaurantName: string;
  userId: string;
  userName: string;
  date: string;
  time: string;
  people: number;
  status: 'CONFIRMED' | 'PENDING' | 'CANCELLED';
}
