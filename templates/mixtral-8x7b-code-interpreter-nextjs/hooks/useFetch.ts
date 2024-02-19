import {
  useState,
  useEffect,
} from 'react'
import { useSupabase } from '@/hooks/useSupabase'

export function useFetch(hash: string) {
  const [stdout, setStdout] = useState('')
  const [stderr, setStderr] = useState('')

  const supabase = useSupabase()
  useEffect(function fetch() {
    async function f() {
      const result = await supabase
        .from('code_blocks')
        .select('stdout, stderr')
        .eq('hash', hash)
      console.log('result', result)
    }
    f()
  }, [supabase, hash])
}