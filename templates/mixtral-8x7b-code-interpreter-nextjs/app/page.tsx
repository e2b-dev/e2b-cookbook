export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-start justify-start">
      <nav className="w-full flex justify-start items-start border-b p-2 space-y-4 bg-zinc-100 border border-zinc-300">
        <h1 className="text-sm font-medium text-zinc-600">Mixtral 8x7b Code Interpreter</h1>
      </nav>

      <div className="flex-1 flex flex-col items-start justify-start py-8 px-16">
        <div className="flex flex-col items-center max-w-md mx-auto rounded border p-6 space-y-4 border border-zinc-300 bg-zinc-100">
          content
        </div>
      </div>


      <div className="py-4 px-24 flex justify-between gap-2 w-full">
        <input className="border border-zinc-400 appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" />
        <button className="text-zinc-500 py-2 px-4 rounded border border-zinc-400" type="button">
          Send
        </button>
      </div>
    </main>
  )
}
