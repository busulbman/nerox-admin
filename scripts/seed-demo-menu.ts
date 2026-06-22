import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { loadEnvConfig } from '@next/env'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore/lite'

type SeedProduct = {
  name: string
  description: string
  price: number
  image: string
}

type SeedCategory = {
  name: string
  items: SeedProduct[]
}

const RESTAURANT_ID = 'demo'
const RESTAURANT_NAME = 'Nerox Demo Cafe'
const RESTAURANT_PRIMARY_COLOR = '#7c3aed'
const MENU_PRIMARY_COLOR = '#8b5cf6'
const DEMO_TABLE_NUMBERS = [1, 2, 3, 4, 5, 6] as const

const DEMO_MENU_SEED: SeedCategory[] = [
  {
    name: 'KAHVALTI',
    items: [
      {
        name: 'Avokadolu Tost',
        description: 'Ekşi mayalı ekmek üzerinde avokado, beyaz peynir ve taze yeşillikler.',
        price: 310,
        image: 'https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?auto=format&fit=crop&w=1200&q=80',
      },
      {
        name: 'Mini Kahvaltı Tabağı',
        description: 'Peynir, zeytin, domates, reçel ve sıcak kruvasan ile hafif kahvaltı.',
        price: 420,
        image: 'https://images.unsplash.com/photo-1533089860892-a9b969df67fa?auto=format&fit=crop&w=1200&q=80',
      },
      {
        name: 'Menemen Bowl',
        description: 'Kavrulmuş biber, domates sosu ve yumuşak yumurta ile servis edilir.',
        price: 360,
        image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=1200&q=80',
      },
      {
        name: 'Granola Yoğurt',
        description: 'Ev yapımı granola, süzme yoğurt ve mevsim meyveleri ile.',
        price: 240,
        image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1200&q=80',
      },
    ],
  },
  {
    name: 'SANDVİÇ & ATIŞTIRMALIK',
    items: [
      {
        name: 'Füme Hindi Sandviç',
        description: 'Cheddar, kornişon turşu ve hardal mayonez ile sıcak servis.',
        price: 390,
        image: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=1200&q=80',
      },
      {
        name: 'Tavuklu Wrap',
        description: 'Izgara tavuk, iceberg, ranch sos ve köz biber ile hazırlanır.',
        price: 430,
        image: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=1200&q=80',
      },
      {
        name: 'Trüf Patates',
        description: 'Parmesan, trüf aroması ve özel mayonez ile servis edilir.',
        price: 250,
        image: 'https://images.unsplash.com/photo-1518013431117-eb1465fa5752?auto=format&fit=crop&w=1200&q=80',
      },
    ],
  },
  {
    name: 'KAHVELER',
    items: [
      {
        name: 'Espresso',
        description: 'Yoğun aromalı tek shot espresso.',
        price: 120,
        image: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?auto=format&fit=crop&w=1200&q=80',
      },
      {
        name: 'Cafe Latte',
        description: 'Kadifemsi süt köpüğü ile yumuşak içimli espresso bazlı kahve.',
        price: 190,
        image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80',
      },
      {
        name: 'Flat White',
        description: 'Çift shot espresso ve mikro köpüklü süt dengesi.',
        price: 200,
        image: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=1200&q=80',
      },
      {
        name: 'Cold Brew',
        description: 'Uzun demleme yöntemiyle hazırlanan ferah soğuk kahve.',
        price: 210,
        image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=1200&q=80',
      },
    ],
  },
  {
    name: 'SOĞUK İÇECEKLER',
    items: [
      {
        name: 'Çilekli Limonata',
        description: 'Taze limon suyu, çilek püresi ve hafif nane dokunuşu.',
        price: 180,
        image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=80',
      },
      {
        name: 'Peach Ice Tea',
        description: 'Şeftali aromalı soğuk çay ve buz ile hafif içim.',
        price: 160,
        image: 'https://images.unsplash.com/photo-1497534446932-c925b458314e?auto=format&fit=crop&w=1200&q=80',
      },
      {
        name: 'Berry Soda',
        description: 'Orman meyveli soda, lime ve taze biberiye ile hazırlanır.',
        price: 175,
        image: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=1200&q=80',
      },
    ],
  },
  {
    name: 'TATLILAR',
    items: [
      {
        name: 'San Sebastian',
        description: 'Akışkan dokulu cheesecake ve hafif karamelize üst yüzey.',
        price: 290,
        image: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=1200&q=80',
      },
      {
        name: 'Lotus Cheesecake',
        description: 'Bisküvi kreması ile hazırlanan yoğun kıvamlı dilim cheesecake.',
        price: 320,
        image: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=1200&q=80',
      },
      {
        name: 'Brownie Cup',
        description: 'Ilık brownie parçaları ve vanilyalı krema ile servis edilir.',
        price: 260,
        image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=1200&q=80',
      },
      {
        name: 'Cookie Plate',
        description: 'İki farklı kurabiye, çikolata sosu ve mevsim meyvesi ile.',
        price: 220,
        image: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=1200&q=80',
      },
    ],
  },
]

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} env değişkeni eksik.`)
  }

  return value
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr')
}

async function readCredentials() {
  const seededEmail = process.env.FIREBASE_SEED_EMAIL?.trim()
  const seededPassword = process.env.FIREBASE_SEED_PASSWORD ?? ''

  if (seededEmail && seededPassword) {
    return {
      email: seededEmail,
      password: seededPassword,
    }
  }

  if (!input.isTTY || !output.isTTY) {
    throw new Error(
      'Client SDK ile demo seed için admin oturumu gerekli. TTY yoksa FIREBASE_SEED_EMAIL ve FIREBASE_SEED_PASSWORD env değişkenlerini verin.',
    )
  }

  const rl = createInterface({ input, output })

  try {
    const email = (await rl.question('Admin e-posta: ')).trim()
    const password = await rl.question('Admin şifre: ')

    if (!email || !password) {
      throw new Error('Admin e-posta ve şifre gerekli.')
    }

    return {
      email,
      password,
    }
  } finally {
    rl.close()
  }
}

function getFirebaseApp() {
  loadEnvConfig(process.cwd())

  const firebaseConfig = {
    apiKey: getRequiredEnv('NEXT_PUBLIC_FIREBASE_API_KEY'),
    authDomain: getRequiredEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: getRequiredEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: getRequiredEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getRequiredEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getRequiredEnv('NEXT_PUBLIC_FIREBASE_APP_ID'),
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim() || undefined,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL?.trim() || undefined,
  }

  if (getApps().length > 0) {
    return getApp()
  }

  return initializeApp(firebaseConfig)
}

async function signInAdmin() {
  const app = getFirebaseApp()
  const auth = getAuth(app)
  const { email, password } = await readCredentials()

  await signInWithEmailAndPassword(auth, email, password)
  return auth
}

async function main() {
  const auth = await signInAdmin()
  const db = getFirestore(auth.app)

  try {
    const restaurantRef = doc(db, 'restaurants', RESTAURANT_ID)
    const categoriesRef = collection(db, 'restaurants', RESTAURANT_ID, 'categories')
    const productsRef = collection(db, 'restaurants', RESTAURANT_ID, 'products')
    const generalSettingsRef = doc(db, 'restaurants', RESTAURANT_ID, 'settings', 'general')
    const menuSettingsRef = doc(db, 'restaurants', RESTAURANT_ID, 'settings', 'menu')

    const infraBatch = writeBatch(db)
    infraBatch.set(
      restaurantRef,
      {
        name: RESTAURANT_NAME,
        slug: RESTAURANT_ID,
        logoUrl: '',
        primaryColor: RESTAURANT_PRIMARY_COLOR,
        status: 'active',
        phone: '',
        adminEmail: '',
        subscriptionExpiresAt: new Date('2099-12-31T23:59:59.999Z'),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    )
    infraBatch.set(
      generalSettingsRef,
      {
        businessName: RESTAURANT_NAME,
        slug: RESTAURANT_ID,
        logoUrl: '',
        primaryColor: RESTAURANT_PRIMARY_COLOR,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    )
    infraBatch.set(
      menuSettingsRef,
      {
        displayName: 'Nerox Demo Menü',
        logoUrl: '',
        primaryColor: RESTAURANT_PRIMARY_COLOR,
        menuPrimaryColor: MENU_PRIMARY_COLOR,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    )

    for (const tableNumber of DEMO_TABLE_NUMBERS) {
      infraBatch.set(
        doc(db, 'restaurants', RESTAURANT_ID, 'tables', String(tableNumber)),
        {
          number: tableNumber,
          status: 'boş',
          sessionId: null,
          openedAt: null,
          lastPaymentCompletedAt: null,
          lastPaymentWaiterName: null,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      )
    }

    await infraBatch.commit()

    const restaurantSnap = await getDoc(restaurantRef)
    if (!restaurantSnap.exists()) {
      throw new Error(`restaurants/${RESTAURANT_ID} oluşturulamadı.`)
    }

    const [existingCategoriesSnap, existingProductsSnap] = await Promise.all([
      getDocs(categoriesRef),
      getDocs(productsRef),
    ])

    const categoryMap = new Map<string, { id: string; ref: DocumentReference }>()

    for (const categoryDoc of existingCategoriesSnap.docs) {
      const data = categoryDoc.data()
      const name = typeof data.name === 'string' ? data.name : ''
      if (!name.trim()) continue

      const normalizedName = normalizeName(name)
      if (!categoryMap.has(normalizedName)) {
        categoryMap.set(normalizedName, { id: categoryDoc.id, ref: categoryDoc.ref })
      }
    }

    let categoriesCreated = 0
    let categoriesUpdated = 0
    const categoryBatch = writeBatch(db)

    DEMO_MENU_SEED.forEach((category, index) => {
      const normalizedCategoryName = normalizeName(category.name)
      const existingCategory = categoryMap.get(normalizedCategoryName)
      const nextOrder = index + 1

      if (existingCategory) {
        categoryBatch.set(
          existingCategory.ref,
          {
            name: category.name,
            order: nextOrder,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
        categoriesUpdated += 1
        return
      }

      const newCategoryRef = doc(categoriesRef)
      categoryBatch.set(newCategoryRef, {
        name: category.name,
        order: nextOrder,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      categoryMap.set(normalizedCategoryName, { id: newCategoryRef.id, ref: newCategoryRef })
      categoriesCreated += 1
    })

    await categoryBatch.commit()

    const productMap = new Map<string, DocumentReference>()

    for (const productDoc of existingProductsSnap.docs) {
      const data = productDoc.data()
      const productName = typeof data.name === 'string' ? data.name : ''
      const categoryId = typeof data.categoryId === 'string' ? data.categoryId : ''

      if (!productName.trim() || !categoryId) continue

      const productKey = `${categoryId}::${normalizeName(productName)}`
      if (!productMap.has(productKey)) {
        productMap.set(productKey, productDoc.ref)
      }
    }

    let productsCreated = 0
    let productsUpdated = 0
    const productBatch = writeBatch(db)

    DEMO_MENU_SEED.forEach((category) => {
      const categoryBinding = categoryMap.get(normalizeName(category.name))
      if (!categoryBinding) {
        throw new Error(`Kategori eşleşmedi: ${category.name}`)
      }

      category.items.forEach((item) => {
        const productKey = `${categoryBinding.id}::${normalizeName(item.name)}`
        const existingProductRef = productMap.get(productKey)
        const baseProductData = {
          name: item.name,
          description: item.description,
          price: item.price,
          categoryId: categoryBinding.id,
          available: true,
          image: item.image,
          updatedAt: serverTimestamp(),
        }

        if (existingProductRef) {
          productBatch.set(existingProductRef, baseProductData, { merge: true })
          productsUpdated += 1
          return
        }

        const newProductRef = doc(productsRef)
        productBatch.set(newProductRef, {
          ...baseProductData,
          createdAt: serverTimestamp(),
        })
        productMap.set(productKey, newProductRef)
        productsCreated += 1
      })
    })

    await productBatch.commit()

    console.log('Demo menü seed tamamlandı.')
    console.log(`Restaurant path: restaurants/${RESTAURANT_ID}`)
    console.log(`Kategori path: restaurants/${RESTAURANT_ID}/categories`)
    console.log(`Ürün path: restaurants/${RESTAURANT_ID}/products`)
    console.log(`Ayar path: restaurants/${RESTAURANT_ID}/settings/general`)
    console.log(`Masa path: restaurants/${RESTAURANT_ID}/tables`)
    console.log(`Kategoriler: ${categoriesCreated} oluşturuldu, ${categoriesUpdated} güncellendi.`)
    console.log(`Ürünler: ${productsCreated} oluşturuldu, ${productsUpdated} güncellendi.`)
  } finally {
    await signOut(auth).catch(() => {})
  }
}

void main().catch((error) => {
  console.error('Demo menü seed hatası:', error)
  process.exitCode = 1
})
