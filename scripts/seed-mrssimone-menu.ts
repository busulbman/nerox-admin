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
}

type SeedCategory = {
  name: string
  items: SeedProduct[]
}

const RESTAURANT_ID = 'mrssimone'

const MENU_SEED: SeedCategory[] = [
  {
    name: 'KAHVALTI',
    items: [
      {
        name: 'Simone Kahvaltı (2 kişilik)',
        description: 'Yöresel mezelerimiz, avokado, çırpılmış yumurta, söğüş tabağı...',
        price: 1790,
      },
      {
        name: 'Salata',
        description: 'Akdeniz yeşilliği üzerine avokado ve 2 adet haşlanmış yumurta ile',
        price: 490,
      },
    ],
  },
  {
    name: 'KRUVASAN',
    items: [
      { name: 'Sade Kruvasan', description: 'Tereyağlı sade kruvasan', price: 200 },
      { name: 'Avokadolu Kruvasan', description: 'Avokado sosu, pestolu sos, hindi füme, chedar peyniri, turşu...', price: 570 },
      { name: 'Köz Biberli Kruvasan', description: 'Labneli sos, roka, ceviz, kırmızı köz biber ve yumurta', price: 570 },
      { name: 'Mr. Simone Special', description: 'Tuzlu yoğurt, cevizli biber ezmesi, akdeniz yeşilliği ve yumurta', price: 570 },
      { name: 'Dana Bacon Kruvasan', description: 'Ispanak, dana bacon, hollandez sos ve yumurta', price: 640 },
      { name: 'Mozeralla Kruvasan', description: 'Pestolu sos, mozarella peyniri ve domates', price: 520 },
      { name: 'Meyveli Kruvasan', description: 'Çilek, muz, pastacı kreması ve üzerine belçika çikolatası', price: 490 },
    ],
  },
  {
    name: 'TATLILAR',
    items: [
      { name: 'Orman Meyveli Cheesecake', description: '', price: 390 },
      { name: 'Lotuslu Cheesecake', description: '', price: 440 },
      { name: 'San Sebastian', description: '', price: 460 },
      { name: 'Tava Cookie', description: 'Tavada gelen sıcak klasik cookie üzerine belçika çikolatası ve yanına 1 top sade dondurma ile', price: 440 },
      { name: 'Browni', description: '', price: 440 },
      { name: 'Profiterol', description: '', price: 370 },
      { name: 'Tiramisu', description: '', price: 420 },
      { name: 'Çilekli Magnolya', description: '', price: 300 },
      { name: 'Lotuslu Magnolya', description: '', price: 340 },
      { name: 'Kruvasanlı Magnolya', description: 'Kruvasan parçacıkları üzerine magnolya kreması, çikolata sosu ve orman meyveleri', price: 340 },
      { name: 'Dubai Magnolya', description: 'Magnolya kreması, kadayıflı fıstık ezmesi ve çikolata sosu', price: 340 },
      { name: 'Simone Krep', description: 'Kakaolu krep içerisinde çilek, muz, pastacı kreması ve üzerine belçika çikolatası ile servis', price: 420 },
      { name: 'Rulo Krep', description: 'İçerisinde muz, brownie, pastacı kreması ve üzerine belçika çikolatası', price: 470 },
      { name: 'Dubai Çikolatası', description: 'Belçika çikolatası içerisinde bol kadayıf ve fıstık ezmesi', price: 500 },
      { name: 'Dubai Browni', description: 'Brownie üzerine kadayıflı fıstık ezmesi ve üzerine belçika çikolatası', price: 470 },
      { name: 'Çubuk Waffle', description: '3 tane stick waffle, çilek, muz ve yanına belçika çikolatası ile servis edilir', price: 450 },
      { name: 'Meyveli Kruvasan', description: 'Kruvasan içerisinde çilek, muz, pastacı kreması ve üzerine belçika çikolatası', price: 490 },
      { name: 'Çilekli Rulo Pasta', description: '', price: 420 },
      { name: 'Cookie', description: 'Klasik ve kakaolu seçenekleri ile', price: 290 },
      { name: 'Tart', description: '', price: 320 },
    ],
  },
  {
    name: 'SICAK İÇECEKLER',
    items: [
      { name: 'Espresso', description: '', price: 110 },
      { name: 'Americano', description: '', price: 150 },
      { name: 'Filtre Kahve', description: '', price: 140 },
      { name: 'Türk Kahvesi', description: '', price: 120 },
      { name: 'Espresso Macchiato', description: '', price: 140 },
      { name: 'Cafe Latte', description: '', price: 190 },
      { name: 'Cappuccino', description: '', price: 190 },
      { name: 'Flat White', description: '', price: 190 },
      { name: 'Cortado', description: '', price: 170 },
      { name: 'Latte Macchiato', description: '', price: 190 },
      { name: 'Caramel Macchiato', description: '', price: 220 },
      { name: 'White Chocolate Mocha', description: '', price: 240 },
      { name: 'Caffe Mocha', description: '', price: 240 },
      { name: 'Çay', description: '', price: 60 },
      { name: 'Fincan Çay', description: '', price: 70 },
      { name: 'Bitki Çayı', description: 'Ihlamur, Kış Çayı, Nane Limon, Yeşilçay', price: 180 },
    ],
  },
  {
    name: 'SOĞUK KAHVELER',
    items: [
      { name: 'Ice Americano', description: '', price: 180 },
      { name: 'Ice Filtre Coffee', description: '', price: 170 },
      { name: 'Ice Latte', description: '', price: 220 },
      { name: 'Ice Caramel Latte', description: '', price: 250 },
      { name: 'Ice Mocha', description: '', price: 270 },
      { name: 'Frappe', description: '', price: 220 },
      { name: 'Frappechino', description: '', price: 230 },
      { name: 'Ice White Chocolate Mocha', description: '', price: 270 },
      { name: 'Affogato', description: '', price: 240 },
    ],
  },
  {
    name: 'KOKTEYL',
    items: [
      { name: 'Frozen', description: 'Red Beries, Orange&Mango, Karpuz&Çilek, Yeşil Elma, Çilek, Ananas, Mango', price: 220 },
      { name: 'Smoothie', description: 'Karamel, Çilek, Mango', price: 250 },
      { name: 'Milkshake', description: 'Çilek, Çikolata, Vanilya, Karamel', price: 250 },
      { name: 'Berry Hibiscus', description: '', price: 200 },
      { name: 'Cool Lime', description: '', price: 200 },
      { name: 'Mango', description: '', price: 200 },
      { name: 'Guava', description: '', price: 200 },
      { name: 'Sakura', description: '', price: 200 },
      { name: 'Dragon & Mango', description: '', price: 200 },
      { name: 'Mojito', description: '', price: 240 },
    ],
  },
  {
    name: 'SOĞUK İÇECEKLER',
    items: [
      { name: 'Su', description: '', price: 30 },
      { name: 'Soda', description: '', price: 80 },
      { name: 'Portakal Suyu', description: '', price: 180 },
      { name: 'Limonata', description: '', price: 150 },
      { name: 'Çilekli Limonata', description: '', price: 170 },
    ],
  },
  {
    name: 'DONDURMA',
    items: [
      {
        name: '1 top dondurma',
        description: 'Seçenekler: kaymak, çikolata, limon, çilek, kuzu kulağı yeşil elma, mocha, italyan...',
        price: 90,
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
      'Client SDK ile seed için admin oturumu gerekli. TTY yoksa FIREBASE_SEED_EMAIL ve FIREBASE_SEED_PASSWORD env değişkenlerini verin.',
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
    const restaurantSnap = await getDoc(restaurantRef)

    if (!restaurantSnap.exists()) {
      throw new Error(`restaurants/${RESTAURANT_ID} bulunamadı. Önce işletmeyi oluşturun.`)
    }

    const categoriesRef = collection(db, 'restaurants', RESTAURANT_ID, 'categories')
    const productsRef = collection(db, 'restaurants', RESTAURANT_ID, 'products')

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

    MENU_SEED.forEach((category, index) => {
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

    MENU_SEED.forEach((category) => {
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
          image: '',
          createdAt: serverTimestamp(),
        })
        productMap.set(productKey, newProductRef)
        productsCreated += 1
      })
    })

    await productBatch.commit()

    console.log('Mrs.Simone menü seed tamamlandı.')
    console.log(`Kategori path: restaurants/${RESTAURANT_ID}/categories`)
    console.log(`Ürün path: restaurants/${RESTAURANT_ID}/products`)
    console.log(`Kategoriler: ${categoriesCreated} oluşturuldu, ${categoriesUpdated} güncellendi.`)
    console.log(`Ürünler: ${productsCreated} oluşturuldu, ${productsUpdated} güncellendi.`)
  } finally {
    await signOut(auth).catch(() => {})
  }
}

void main().catch((error) => {
  console.error('Mrs.Simone menü seed hatası:', error)
  process.exitCode = 1
})
