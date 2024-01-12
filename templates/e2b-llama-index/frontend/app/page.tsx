import Header from "@/app/components/header";
import ChatSection from "./components/chat-section";

export default function Home() {
  const chatID = crypto.randomUUID();

  return (
    <main className="flex min-h-screen flex-col items-center gap-10 p-24 background-gradient">
      <Header />
      <ChatSection chatID={chatID} />
    </main>
  );
}
