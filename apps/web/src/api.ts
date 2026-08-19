import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { appContract, type AppContract } from '@markflow/contract'

const link = new RPCLink({
  url: '/rpc',
})

const client: ContractRouterClient<AppContract> = createORPCClient(link)

export async function listNotes(input: { limit?: number; cursor?: string } = {}) {
  return client.note.list(input)
}

export async function getNote(id: string) {
  return client.note.get({ id })
}

export async function createNote(content: string, sourceUrl?: string) {
  return client.note.create({ content, sourceUrl })
}

export async function updateNote(id: string, content: string) {
  return client.note.update({ id, content })
}

export async function deleteNote(id: string) {
  return client.note.delete({ id })
}
