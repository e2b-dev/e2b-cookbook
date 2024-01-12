import { CodeResults } from '@/app/components/ui/chat/chat.interface'
import { createContext, Dispatch, SetStateAction } from 'react'


interface CodeResultsInterface  {
  setCodeResults: Dispatch<SetStateAction<CodeResults>>
  codeResults: CodeResults
}
export const CodeResultsContext = createContext<CodeResultsInterface>({codeResults: {}, setCodeResults: () => {}} );
