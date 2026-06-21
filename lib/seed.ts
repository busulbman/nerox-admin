import { addDoc, getDocs } from "firebase/firestore";
import { rc } from "@/lib/firebase";

const CATEGORIES = [
  { name: "Sıcak İçecekler", order: 1 },
  { name: "Soğuk İçecekler", order: 2 },
  { name: "Çikolata Özel", order: 3 },
  { name: "Tatlılar", order: 4 },
  { name: "Hafif Atıştırmalık", order: 5 },
];

const PRODUCTS_BY_CAT: Record<
  string,
  Array<{ name: string; description: string; price: number }>
> = {
  "Sıcak İçecekler": [
    {
      name: "Sıcak Çikolata",
      description: "Gerçek çikolata ile hazırlanan kremsi içecek",
      price: 85,
    },
    {
      name: "Türk Kahvesi",
      description: "Geleneksel usul pişirilmiş Türk kahvesi",
      price: 55,
    },
    {
      name: "Filtre Kahve",
      description: "Özenle seçilmiş çekirdeklerden filtre kahve",
      price: 65,
    },
    { name: "Latte", description: "Espresso ve sütlü köpük", price: 85 },
    {
      name: "Cappuccino",
      description: "Espresso, sıcak süt ve süt köpüğü",
      price: 85,
    },
    {
      name: "Salep",
      description: "Geleneksel salep, tarçın ile servis edilir",
      price: 75,
    },
  ],
  "Soğuk İçecekler": [
    {
      name: "Soğuk Çikolata",
      description: "Buzlu çikolatalı içecek",
      price: 95,
    },
    { name: "Iced Latte", description: "Buzlu espresso latte", price: 92 },
    { name: "Frappuccino", description: "Blended buzlu kahve", price: 98 },
    {
      name: "Çikolatalı Milkshake",
      description: "Dondurma ve çikolata ile milkshake",
      price: 110,
    },
    { name: "Limonata", description: "Taze sıkılmış limonata", price: 75 },
  ],
  "Çikolata Özel": [
    {
      name: "Mrs.Simone Signature",
      description: "El yapımı özel çikolata, Mrs.Simone'a özgü tat",
      price: 125,
    },
    {
      name: "Çikolata Fondue",
      description: "2 kişilik çikolata fondü, mevsim meyveleri ile",
      price: 180,
    },
    {
      name: "Pralin Tabağı",
      description: "Seçme pralinlerden oluşan tabak",
      price: 150,
    },
    {
      name: "El Yapımı Trüf",
      description: "6 adet el yapımı trüf çikolata",
      price: 120,
    },
  ],
  Tatlılar: [
    {
      name: "Çikolatalı Fondant",
      description: "İçi sıvı çikolatalı sıcak kek, dondurma ile",
      price: 120,
    },
    {
      name: "Brownie",
      description: "Yoğun çikolatalı brownie, fındıklı",
      price: 95,
    },
    { name: "Cheesecake", description: "Günlük taze cheesecake", price: 125 },
    {
      name: "Vafle",
      description: "Taze pişmiş vafle, çikolata sos ile",
      price: 115,
    },
    {
      name: "Sufle",
      description: "Fırından yeni çıkmış çikolatalı sufle",
      price: 130,
    },
  ],
  "Hafif Atıştırmalık": [
    { name: "Kruvasan", description: "Tereyağlı Fransız kruvasan", price: 65 },
    { name: "Tost", description: "Karışık malzemelerin tost", price: 75 },
    {
      name: "Granola Kasesi",
      description: "Yoğurt ve mevsim meyveleriyle granola",
      price: 85,
    },
    {
      name: "Çikolatalı Kek Dilimi",
      description: "Günlük taze pişirilmiş çikolatalı kek",
      price: 85,
    },
  ],
};

export async function seedmrssimoneChocolate() {
  const existingCats = await getDocs(rc("categories"));
  if (!existingCats.empty) {
    throw new Error("Menü verisi zaten mevcut. Önce mevcut veriyi silin.");
  }

  const categoryIds: Record<string, string> = {};
  for (const cat of CATEGORIES) {
    const ref = await addDoc(rc("categories"), cat);
    categoryIds[cat.name] = ref.id;
  }

  for (const [catName, products] of Object.entries(PRODUCTS_BY_CAT)) {
    const categoryId = categoryIds[catName];
    for (const product of products) {
      await addDoc(rc("products"), { ...product, categoryId, available: true });
    }
  }

  const demoCalls = [
    {
      tableId: "3",
      restaurantId: "mrssimone",
      tip: "yardım",
      durum: "bekliyor",
      note: "",
      createdAt: Date.now() - 180000,
    },
    {
      tableId: "7",
      restaurantId: "mrssimone",
      tip: "hesap",
      durum: "bekliyor",
      note: "Nakit ödeyecek",
      createdAt: Date.now() - 90000,
    },
    {
      tableId: "1",
      restaurantId: "mrssimone",
      tip: "sipariş",
      durum: "bekliyor",
      note: "Bir Fondant, bir Sıcak Çikolata",
      createdAt: Date.now() - 45000,
    },
  ];
  for (const call of demoCalls) {
    await addDoc(rc("calls"), call);
  }
}
