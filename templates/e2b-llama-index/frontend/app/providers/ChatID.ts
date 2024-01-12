import { createContext } from 'react'


export const ChatIDContext = createContext<string>(crypto.randomUUID() );
