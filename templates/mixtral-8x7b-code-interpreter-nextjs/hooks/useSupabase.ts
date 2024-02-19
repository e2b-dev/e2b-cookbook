import {
  useContext,
  createContext,
} from 'react'
import { SupabaseClient } from '@supabase/supabase-js'


export const Context = createContext<SupabaseClient | undefined>(undefined)
export const SupabaseProvider = Context.Provider
export const Consumer = Context.Consumer
Context.displayName = 'SupabaseContext'

export function useSupabase(): SupabaseClient {
  const client = useContext(Context)
  if (client === undefined)
    throw Error('No client has been specified using Provider.')
  return client
}