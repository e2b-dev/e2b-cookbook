import crypto from 'node:crypto'

export function calculateHash(inputString: string): string {
  return crypto.createHash('sha256').update(inputString).digest('hex');
}

