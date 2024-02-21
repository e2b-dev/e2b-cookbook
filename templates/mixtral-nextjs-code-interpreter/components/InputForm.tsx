export interface Props {
  handleSubmit: (e: any) => void
  input: string
  handleInputChange: (e: any) => void
}


export function InputForm({
  handleSubmit,
  input,
  handleInputChange,
}: Props) {
  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl flex align-center justify-between gap-2 relative mb-8">
      <input
        className="flex-1 border border-gray-300 rounded p-2 w-full pl-8 outline-none"
        value={input}
        onChange={handleInputChange}
        placeholder="Ask AI Developer..."
        autoFocus
      />
      <span className="text-gray-400 font-bold absolute left-4 top-1/2 -translate-y-1/2">{`>`}</span>
      <button type="submit" className="absolute top-0 left-[calc(100%+8px)] bottoms-0 border border-gray-300 rounded p-2">Send</button>
    </form>
  )
}