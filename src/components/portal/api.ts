// Stand-ins for POST /api/feedback and POST /api/investigations. Phase 3
// replaces these with real requests; the return shapes match the handoff.

export interface FeedbackInput {
  topic: string
  siteId: string
  message: string
  callBack: boolean
}

export interface InvestigationInput {
  type: string
  timeline: 'standard' | 'urgent'
  location: string
  description: string
  contactMethod: 'phone' | 'email'
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function addBusinessDays(from: Date, days: number) {
  const d = new Date(from)
  while (days > 0) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) days--
  }
  return d
}

export async function submitFeedback(input: FeedbackInput, replyBusinessDays: number) {
  void input
  await wait(600)
  const replyBy = addBusinessDays(new Date(), replyBusinessDays)
  return {
    replyBy: replyBy.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  }
}

export async function submitInvestigation(input: InvestigationInput) {
  void input
  await wait(600)
  const n = String(Math.floor(Math.random() * 9000) + 1000)
  return { caseRef: `INV-${new Date().getFullYear()}-${n}` }
}
