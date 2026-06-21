import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  type DocumentReference,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'

export const LEGACY_RESTAURANT_ID = 'varina'
export const TARGET_RESTAURANT_ID = 'mrssimone'

const COPY_COLLECTIONS = ['categories', 'products', 'settings', 'tables'] as const
const WRITE_BATCH_LIMIT = 400

type CopyCollectionName = (typeof COPY_COLLECTIONS)[number]

export type TenantMigrationStats = Record<CopyCollectionName, number> & {
  users: number
}

type BatchSetOperation = {
  ref: DocumentReference<DocumentData>
  data: DocumentData
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

async function commitSetOperations(db: Firestore, operations: BatchSetOperation[]) {
  for (const chunk of chunkItems(operations, WRITE_BATCH_LIMIT)) {
    const batch = writeBatch(db)
    for (const operation of chunk) {
      batch.set(operation.ref, operation.data)
    }
    await batch.commit()
  }
}

async function commitUserRestaurantUpdates(
  db: Firestore,
  userDocs: QueryDocumentSnapshot<DocumentData>[]
) {
  for (const chunk of chunkItems(userDocs, WRITE_BATCH_LIMIT)) {
    const batch = writeBatch(db)
    for (const userDoc of chunk) {
      batch.update(doc(db, 'users', userDoc.id), {
        restaurantId: TARGET_RESTAURANT_ID,
      })
    }
    await batch.commit()
  }
}

export async function migrateVarinaTenantToMrsSimone(
  db: Firestore,
  currentUserId: string
): Promise<TenantMigrationStats> {
  const [categoriesSnap, productsSnap, settingsSnap, tablesSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, 'restaurants', LEGACY_RESTAURANT_ID, 'categories')),
    getDocs(collection(db, 'restaurants', LEGACY_RESTAURANT_ID, 'products')),
    getDocs(collection(db, 'restaurants', LEGACY_RESTAURANT_ID, 'settings')),
    getDocs(collection(db, 'restaurants', LEGACY_RESTAURANT_ID, 'tables')),
    getDocs(
      query(
        collection(db, 'users'),
        where('restaurantId', '==', LEGACY_RESTAURANT_ID)
      )
    ),
  ])

  await setDoc(
    doc(db, 'restaurants', TARGET_RESTAURANT_ID),
    {
      name: 'Mrs.Simone',
      slug: TARGET_RESTAURANT_ID,
      status: 'active',
    },
    { merge: true }
  )

  const collectionDocs = {
    categories: categoriesSnap.docs,
    products: productsSnap.docs,
    settings: settingsSnap.docs,
    tables: tablesSnap.docs,
  } satisfies Record<CopyCollectionName, QueryDocumentSnapshot<DocumentData>[]>

  for (const collectionName of COPY_COLLECTIONS) {
    const operations = collectionDocs[collectionName].map((sourceDoc) => ({
      ref: doc(db, 'restaurants', TARGET_RESTAURANT_ID, collectionName, sourceDoc.id),
      data: sourceDoc.data(),
    }))

    await commitSetOperations(db, operations)
  }

  const currentUserDoc = usersSnap.docs.find((userDoc) => userDoc.id === currentUserId) ?? null
  const otherUserDocs = usersSnap.docs.filter((userDoc) => userDoc.id !== currentUserId)

  await commitUserRestaurantUpdates(db, otherUserDocs)
  if (currentUserDoc) {
    await commitUserRestaurantUpdates(db, [currentUserDoc])
  }

  return {
    categories: categoriesSnap.size,
    products: productsSnap.size,
    settings: settingsSnap.size,
    tables: tablesSnap.size,
    users: usersSnap.size,
  }
}
