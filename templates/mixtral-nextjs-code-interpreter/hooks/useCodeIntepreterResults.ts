import {
  useState,
  useEffect,
  useCallback,
} from 'react'
// import { supabase } from '@/lib/supabase'
import { useCodeBlockInsertSubscription } from '@/hooks/useSubscription'
// import { useFetch } from '@/hooks/useFetch'

export interface Opts {
  codeBlockID: string
}

export interface CodeBlock {
  hash: string
  stderr: string
  stdout: string
}


// function fetchCodeBlock(hash: string) {
//   return supabase
//     .from('code_blocks')
//     .select('stdout, stderr')
//     .eq('hash', hash)
// }

export function useCodeInterpreterResults(codeBlockHash: string) {
  const [stdout, setStdout] = useState<string>('')
  const [stderr, setStderr] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  // useFetch(codeBlockHash)



  const handleInserts = useCallback((codeBlock: any) => {
    console.log('insert', codeBlock)
    setStdout(codeBlock.stdout)
    setStderr(codeBlock.stderr)
    setIsLoading(false)
  }, [])
  useCodeBlockInsertSubscription(codeBlockHash, handleInserts)

  // const handleUpdates = useCallback((payload: any) => {
  //   console.log('update', payload)
  // }, [])

  // useEffect(function fetch() {
  //   async function f() {
  //     const result = await fetchCodeBlock(codeBlockHash)
  //     console.log('result', result)
  //   }

  //   if (!codeBlockHash) return
  //   f()
  // }, [codeBlockHash])

  // useEffect(function init() {
  //   supabase
  //     .channel('code_blocks')
  //     .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'code_blocks' }, handleInserts)
  //     .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'code_blocks' }, handleUpdates)
  //     .subscribe()
  // }, [handleUpdates, handleInserts])

  return {
    stdout,
    stderr,
    isLoading,
  }
}