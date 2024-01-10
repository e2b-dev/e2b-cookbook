import { calculateHash } from '@/lib/hash'

export const runtime = 'edge'

export async function POST(req: Request) {
  const { input } = await req.json()

  const hash = calculateHash(input)
  return Response.json({ hash })
}