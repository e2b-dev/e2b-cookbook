import { CodeResults } from '@/app/components/ui/chat/chat.interface'
import { Dispatch, SetStateAction } from 'react'
import { API_URL } from '@/app/utils/constants'

export const updateCodeResults = async (chatID: string, codeID: string, setCodeResults: Dispatch<SetStateAction<CodeResults>>, setDelay: Dispatch<SetStateAction<number | null >>, delay: number | null) => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      operation: 'code_result',
      chat_id: chatID,
      code_id: codeID,
    }),
  })
  if (response.ok) {
    const data = await response.json()
    if (data.result) {
      setDelay(null)
      setCodeResults((prevCodeResults) => {
        return {
          ...prevCodeResults,
          [codeID]: data.result,
        }
      })
      return
    }
  }
}
