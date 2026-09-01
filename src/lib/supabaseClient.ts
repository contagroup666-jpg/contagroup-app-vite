import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  // Falla rápido y con un mensaje claro en vez de un error críptico de fetch más adelante.
  throw new Error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia .env.example a .env.local y completa los valores.'
  )
}

// Nota de tipado: no pasamos el genérico <Database> aquí a propósito. La forma exacta que
// exige ese genérico cambia entre versiones de supabase-js (p.ej. requiere Views/Functions/
// __InternalSupabase según la versión) y acoplar el cliente a eso es frágil. En su lugar,
// cada módulo tipa explícitamente lo que lee/escribe con los tipos de src/types/database.ts
// (ver el patrón `as unknown as Fila` ya usado en los módulos existentes).
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
