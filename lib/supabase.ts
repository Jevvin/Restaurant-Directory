
import { createClient } from '@supabase/supabase-js';

// Credenciales de Supabase configuradas
const supabaseUrl = 'https://tipovqhbloiwkgsodapw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpcG92cWhibG9pd2tnc29kYXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2NjY4NDIsImV4cCI6MjA3OTI0Mjg0Mn0.ytKLr6oWHWcKSQp42lY0-mkKy-GG9W2skSj1H53wE_g';

// Creamos el cliente
export const supabase = createClient(supabaseUrl, supabaseKey);

// Helper para saber si está activo
export const isSupabaseConfigured = () => true;

/* 
  === 🚨 GUÍA DE CONFIGURACIÓN BASE DE DATOS 🚨 ===
  
  1. TABLAS Y PERMISOS (Profiles):
  Copia y pega esto en el SQL Editor para arreglar permisos de usuarios:

  ```sql
  create table if not exists public.profiles (
    id uuid references auth.users on delete cascade primary key,
    email text,
    full_name text,
    role text default 'USER',
    created_at timestamp with time zone default timezone('utc'::text, now())
  );
  alter table public.profiles enable row level security;
  
  -- Políticas de Perfiles
  create policy "Enable read access for all users" on profiles for select using ( true );
  create policy "Enable insert for users based on user_id" on profiles for insert with check ( auth.uid() = id );
  create policy "Enable update for users based on user_id" on profiles for update using ( auth.uid() = id );
  ```

  2. ALMACENAMIENTO DE IMÁGENES (Storage):
  Copia y pega esto para habilitar la subida de fotos:

  ```sql
  -- Crear Bucket Público
  insert into storage.buckets (id, name, public) values ('restaurants', 'restaurants', true);

  -- Políticas de Storage
  create policy "Public Access" on storage.objects for select using ( bucket_id = 'restaurants' );
  create policy "Authenticated Insert" on storage.objects for insert with check ( bucket_id = 'restaurants' and auth.role() = 'authenticated' );
  create policy "Authenticated Update" on storage.objects for update using ( bucket_id = 'restaurants' and auth.role() = 'authenticated' );
  create policy "Authenticated Delete" on storage.objects for delete using ( bucket_id = 'restaurants' and auth.role() = 'authenticated' );
  ```
*/