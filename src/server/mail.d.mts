export function mailProvider(): 'graph' | 'smtp' | 'log'
export function addressList(...lists: (string | string[] | null | undefined)[]): string[]
export function deliver(
  to: string,
  subject: string,
  text: string,
  fetchImpl?: typeof fetch,
  options?: { cc?: string },
): Promise<'graph' | 'smtp' | 'log'>
export function resetMail(): void
