export function mailProvider(): 'graph' | 'smtp' | 'log'
export function deliver(to: string, subject: string, text: string, fetchImpl?: typeof fetch): Promise<'graph' | 'smtp' | 'log'>
export function resetMail(): void
