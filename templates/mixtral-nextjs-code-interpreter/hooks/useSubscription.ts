import {
  useEffect,
  useRef,
} from 'react'
import { useIsomorphicLayoutEffect } from 'usehooks-ts'

import { useSupabase } from '@/hooks/useSupabase'


export function useCodeBlockInsertSubscription(hash: string, callback: (payload: any) => void) {
  const supabase = useSupabase()
  const savedCallback = useRef(callback)
  // const [inserted, setInserted] = useState(null);

  // Remember the latest callback if it changes.
  useIsomorphicLayoutEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    if (!hash) return

    const subscription = supabase
      .channel('code_blocks')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'code_blocks' }, payload => {
        if (payload.new.hash !== hash) return
        savedCallback.current(payload.new)
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [hash, supabase]);

  // return inserted;
}