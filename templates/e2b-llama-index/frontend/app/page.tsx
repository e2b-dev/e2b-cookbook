"use client"

import Header from "@/app/components/header";
import ChatSection from "./components/chat-section";
import { ChatIDContext } from '@/app/providers/ChatID'

export default function Home() {
  const chatID = crypto.randomUUID();

  return (
    <main className="flex min-h-screen flex-col items-center gap-10 p-24 background-gradient">
      <Header />
      <ChatIDContext.Provider value={chatID}>
        <ChatSection />
      </ChatIDContext.Provider>
    </main>
  );
}
