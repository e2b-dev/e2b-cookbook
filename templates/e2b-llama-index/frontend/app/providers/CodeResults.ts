import { CodeResults } from '@/app/components/ui/chat/chat.interface'
import { createContext } from 'react'

export const CodeBlocksContexts = createContext<CodeResults>({});

