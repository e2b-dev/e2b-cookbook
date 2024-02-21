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

      if (result.error) {
        console.error('Error fetching code block', result.error)
        return
      }

      const [{ stderr: err, stdout: out }] = result.data
      console.log('stdout', out)
      console.log('stderr', err)

    }
    f()
  }, [supabase, hash])

  return
}