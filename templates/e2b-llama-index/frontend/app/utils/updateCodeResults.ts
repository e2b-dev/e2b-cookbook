import { CodeResults } from '@/app/components/ui/chat/chat.interface'
import { Dispatch, SetStateAction } from 'react'
import { API_URL } from '@/app/utils/constants'

export const updateCodeResults = (chatID: string, codeID: string, setCodeResults: Dispatch<SetStateAction<CodeResults>>) => {
  fetch(`${API_URL}/chats/${chatID}/code/${codeID}`).then(
    (res) => {
      if (res.status === 200) {
        res.json().then((data) => {
          setCodeResults((prevCodeResults) => {
            return {
              ...prevCodeResults,
              [codeID]: data.result,
            }
          })
        })
      }
    },
  )
}
