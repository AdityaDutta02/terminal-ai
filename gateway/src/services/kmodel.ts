interface Model {
  provider: string
  model: string
}
interface Message {
  role: string
  content: string
}
type LLMCallFn = (model: Model, messages: Message[]) => Promise<string>
interface VoteResult {
  response: string
  votes: Record<string, number>
  allResponses: string[]
}
interface JudgeResult {
  response: string
  judgeReasoning?: string
}
export async function kmodelVote(
  models: Model[],
  messages: Message[],
  callLLM: LLMCallFn
): Promise<VoteResult> {
  const responses = await Promise.all(models.map((m) => callLLM(m, messages)))
  const votes: Record<string, number> = {}
  for (const response of responses) {
    if (votes[response] === undefined) votes[response] = 0
    votes[response]++
  }
  const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1])
  const winner = sorted[0][0]
  return { response: winner, votes, allResponses: responses }
}
function buildJudgeContent(candidates: string[]): string {
  const numbered = candidates.map((c, i) => `--- Candidate ${i + 1} ---\n${c}`).join('\n\n')
  return `I have ${candidates.length} candidate responses to the above. Select the BEST one and respond with ONLY that response, unchanged:\n\n${numbered}`
}
export async function kmodelJudge(
  models: Model[],
  judgeModel: Model,
  messages: Message[],
  callLLM: LLMCallFn
): Promise<JudgeResult> {
  const candidates = await Promise.all(models.map((m) => callLLM(m, messages)))
  const judgePrompt: Message[] = [
    ...messages,
    { role: 'user', content: buildJudgeContent(candidates) },
  ]
  const judgeResponse = await callLLM(judgeModel, judgePrompt)
  return { response: judgeResponse }
}
