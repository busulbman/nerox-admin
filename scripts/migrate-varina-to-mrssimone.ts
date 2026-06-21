import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Usage:
// GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run migrate:mrssimone
// GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run migrate:mrssimone -- --dry-run
// GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run migrate:mrssimone -- --allow-overwrite

const SOURCE_RESTAURANT_ID = 'varina'
const TARGET_RESTAURANT_ID = 'mrssimone'
const TARGET_RESTAURANT_NAME = 'Mrs.Simone'
const COPY_COLLECTIONS = ['categories', 'products', 'tables', 'settings'] as const
const COMMIT_BATCH_SIZE = 400
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore'

type CopyCollectionName = (typeof COPY_COLLECTIONS)[number]

type ServiceAccount = {
  client_email: string
  private_key: string
  project_id?: string
}

type FirestoreFields = Record<string, unknown>

type FirestoreDocument = {
  name: string
  fields?: FirestoreFields
}

type ListDocumentsResponse = {
  documents?: FirestoreDocument[]
  nextPageToken?: string
}

type RunQueryResponseRow = {
  document?: FirestoreDocument
}

type CommitWrite = {
  update: {
    name: string
    fields?: FirestoreFields
  }
  updateMask?: {
    fieldPaths: string[]
  }
}

type MigrationStats = Record<CopyCollectionName, number> & {
  users: number
}

function parseArgs() {
  return {
    allowOverwrite: process.argv.includes('--allow-overwrite'),
    dryRun: process.argv.includes('--dry-run'),
  }
}

function loadServiceAccount(): ServiceAccount {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (rawJson) {
    return normalizeServiceAccount(JSON.parse(rawJson) as Record<string, unknown>)
  }

  const candidatePaths = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  ].filter((value): value is string => !!value?.trim())

  for (const candidatePath of candidatePaths) {
    const absolutePath = resolve(candidatePath)
    const fileContents = readFileSync(absolutePath, 'utf8')
    return normalizeServiceAccount(JSON.parse(fileContents) as Record<string, unknown>)
  }

  throw new Error(
    'Servis hesabı bulunamadı. GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_SERVICE_ACCOUNT_PATH veya FIREBASE_SERVICE_ACCOUNT_JSON tanımlayın.'
  )
}

function normalizeServiceAccount(input: Record<string, unknown>): ServiceAccount {
  const clientEmail = typeof input.client_email === 'string' ? input.client_email.trim() : ''
  const privateKey = typeof input.private_key === 'string' ? input.private_key : ''
  const projectId = typeof input.project_id === 'string' ? input.project_id.trim() : undefined

  if (!clientEmail || !privateKey) {
    throw new Error('Servis hesabında client_email veya private_key eksik.')
  }

  return {
    client_email: clientEmail,
    private_key: privateKey,
    project_id: projectId,
  }
}

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

async function createAccessToken(serviceAccount: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000)
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claimSet = encodeBase64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      scope: FIRESTORE_SCOPE,
      iat: now,
      exp: now + 3600,
    })
  )

  const unsignedToken = `${header}.${claimSet}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsignedToken)
  signer.end()
  const signature = encodeBase64Url(signer.sign(serviceAccount.private_key))
  const assertion = `${unsignedToken}.${signature}`

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!response.ok) {
    throw new Error(`OAuth token alınamadı: ${response.status} ${await response.text()}`)
  }

  const payload = await response.json() as { access_token?: string }
  if (!payload.access_token) {
    throw new Error('OAuth token cevabında access_token yok.')
  }

  return payload.access_token
}

class FirestoreRestClient {
  constructor(
    private readonly projectId: string,
    private readonly accessToken: string
  ) {}

  private async request<T>(
    url: string,
    init?: RequestInit,
    options?: { allowNotFound?: boolean }
  ): Promise<T | null> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })

    if (response.status === 404 && options?.allowNotFound) {
      return null
    }

    if (!response.ok) {
      throw new Error(`Firestore isteği başarısız oldu (${response.status}): ${await response.text()}`)
    }

    return await response.json() as T
  }

  private get documentsBaseUrl() {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`
  }

  async listDocuments(relativePath: string) {
    const documents: FirestoreDocument[] = []
    let nextPageToken: string | undefined

    do {
      const params = new URLSearchParams({ pageSize: '500' })
      if (nextPageToken) params.set('pageToken', nextPageToken)

      const response = await this.request<ListDocumentsResponse>(
        `${this.documentsBaseUrl}/${relativePath}?${params.toString()}`,
        { method: 'GET' },
        { allowNotFound: true }
      )

      if (!response) {
        return documents
      }

      documents.push(...(response.documents ?? []))
      nextPageToken = response.nextPageToken
    } while (nextPageToken)

    return documents
  }

  async runUsersByRestaurantQuery(restaurantId: string) {
    const response = (await this.request<RunQueryResponseRow[]>(
      `${this.documentsBaseUrl}:runQuery`,
      {
        method: 'POST',
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'users' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'restaurantId' },
                op: 'EQUAL',
                value: { stringValue: restaurantId },
              },
            },
          },
        }),
      }
    )) ?? []

    return response
      .map((row) => row.document)
      .filter((document): document is FirestoreDocument => !!document)
  }

  async commitWrites(writes: CommitWrite[]) {
    if (writes.length === 0) return

    await this.request<{ writeResults?: unknown[] }>(
      `${this.documentsBaseUrl}:commit`,
      {
        method: 'POST',
        body: JSON.stringify({ writes }),
      }
    )
  }
}

function extractDocumentId(documentName: string) {
  const parts = documentName.split('/')
  return parts[parts.length - 1] ?? ''
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function createRootRestaurantWrite(projectId: string): CommitWrite {
  return {
    update: {
      name: `projects/${projectId}/databases/(default)/documents/restaurants/${TARGET_RESTAURANT_ID}`,
      fields: {
        name: { stringValue: TARGET_RESTAURANT_NAME },
        slug: { stringValue: TARGET_RESTAURANT_ID },
        status: { stringValue: 'active' },
      },
    },
    updateMask: {
      fieldPaths: ['name', 'slug', 'status'],
    },
  }
}

function createCopyWrite(
  projectId: string,
  collectionName: CopyCollectionName,
  sourceDocument: FirestoreDocument
): CommitWrite {
  const documentId = extractDocumentId(sourceDocument.name)

  return {
    update: {
      name: `projects/${projectId}/databases/(default)/documents/restaurants/${TARGET_RESTAURANT_ID}/${collectionName}/${documentId}`,
      fields: sourceDocument.fields ?? {},
    },
  }
}

function createUserRestaurantWrite(userDocumentName: string): CommitWrite {
  return {
    update: {
      name: userDocumentName,
      fields: {
        restaurantId: { stringValue: TARGET_RESTAURANT_ID },
      },
    },
    updateMask: {
      fieldPaths: ['restaurantId'],
    },
  }
}

async function detectOverlaps(
  firestore: FirestoreRestClient,
  sourceDocsByCollection: Record<CopyCollectionName, FirestoreDocument[]>
) {
  const overlaps: Partial<Record<CopyCollectionName, string[]>> = {}

  for (const collectionName of COPY_COLLECTIONS) {
    const destinationDocs = await firestore.listDocuments(
      `restaurants/${TARGET_RESTAURANT_ID}/${collectionName}`
    )
    const destinationIds = new Set(destinationDocs.map((document) => extractDocumentId(document.name)))

    const collidingIds = sourceDocsByCollection[collectionName]
      .map((document) => extractDocumentId(document.name))
      .filter((documentId) => destinationIds.has(documentId))

    if (collidingIds.length > 0) {
      overlaps[collectionName] = collidingIds
    }
  }

  return overlaps
}

function printOverlapSummary(overlaps: Partial<Record<CopyCollectionName, string[]>>) {
  console.log('Hedef tenant altında aynı ID ile mevcut dokümanlar bulundu:')

  for (const collectionName of COPY_COLLECTIONS) {
    const collidingIds = overlaps[collectionName]
    if (!collidingIds || collidingIds.length === 0) continue
    console.log(`- ${collectionName}: ${collidingIds.length} çakışma`)
    console.log(`  ${collidingIds.join(', ')}`)
  }
}

async function main() {
  const { allowOverwrite, dryRun } = parseArgs()
  const serviceAccount = loadServiceAccount()
  const projectId = serviceAccount.project_id?.trim() || process.env.FIREBASE_PROJECT_ID?.trim()

  if (!projectId) {
    throw new Error('project_id bulunamadı. Servis hesabı JSON içinde veya FIREBASE_PROJECT_ID env içinde olmalı.')
  }

  const accessToken = await createAccessToken(serviceAccount)
  const firestore = new FirestoreRestClient(projectId, accessToken)

  console.log(`Proje: ${projectId}`)
  console.log(`Kaynak tenant: ${SOURCE_RESTAURANT_ID}`)
  console.log(`Hedef tenant: ${TARGET_RESTAURANT_ID}`)
  console.log(`Overwrite izni: ${allowOverwrite ? 'açık' : 'kapalı'}`)
  console.log(`Dry run: ${dryRun ? 'açık' : 'kapalı'}`)

  const sourceDocsByCollection = {} as Record<CopyCollectionName, FirestoreDocument[]>
  for (const collectionName of COPY_COLLECTIONS) {
    const documents = await firestore.listDocuments(`restaurants/${SOURCE_RESTAURANT_ID}/${collectionName}`)
    sourceDocsByCollection[collectionName] = documents
    console.log(`Bulundu -> ${collectionName}: ${documents.length}`)
  }

  const overlaps = await detectOverlaps(firestore, sourceDocsByCollection)
  const hasOverlaps = Object.values(overlaps).some((collidingIds) => (collidingIds?.length ?? 0) > 0)

  if (hasOverlaps && !allowOverwrite) {
    printOverlapSummary(overlaps)
    throw new Error('Çakışan dokümanlar var. Overwrite için scripti --allow-overwrite ile tekrar çalıştırın.')
  }

  const usersToUpdate = await firestore.runUsersByRestaurantQuery(SOURCE_RESTAURANT_ID)
  console.log(`Bulundu -> users: ${usersToUpdate.length}`)

  const stats: MigrationStats = {
    categories: sourceDocsByCollection.categories.length,
    products: sourceDocsByCollection.products.length,
    tables: sourceDocsByCollection.tables.length,
    settings: sourceDocsByCollection.settings.length,
    users: usersToUpdate.length,
  }

  if (dryRun) {
    console.log('Dry run tamamlandı. Yazma işlemi yapılmadı.')
    console.log(JSON.stringify(stats, null, 2))
    return
  }

  const writes: CommitWrite[] = [createRootRestaurantWrite(projectId)]

  for (const collectionName of COPY_COLLECTIONS) {
    for (const document of sourceDocsByCollection[collectionName]) {
      writes.push(createCopyWrite(projectId, collectionName, document))
    }
  }

  for (const userDocument of usersToUpdate) {
    writes.push(createUserRestaurantWrite(userDocument.name))
  }

  const batches = chunkArray(writes, COMMIT_BATCH_SIZE)
  for (let index = 0; index < batches.length; index += 1) {
    const batchNumber = index + 1
    console.log(`Batch ${batchNumber}/${batches.length} yazılıyor... (${batches[index].length} işlem)`)
    await firestore.commitWrites(batches[index])
  }

  console.log('Migration tamamlandı.')
  console.log(`Kategoriler kopyalandı: ${stats.categories}`)
  console.log(`Ürünler kopyalandı: ${stats.products}`)
  console.log(`Masalar kopyalandı: ${stats.tables}`)
  console.log(`Settings dokümanları kopyalandı: ${stats.settings}`)
  console.log(`User restaurantId güncellendi: ${stats.users}`)
}

main().catch((error) => {
  console.error('Migration başarısız:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
