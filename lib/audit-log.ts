import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export type AuditAction =
  | 'product_create'
  | 'product_update'
  | 'product_delete'
  | 'product_price_change'
  | 'category_create'
  | 'category_update'
  | 'category_delete'
  | 'waiter_create'
  | 'waiter_update'
  | 'waiter_delete'
  | 'campaign_create'
  | 'campaign_update'
  | 'campaign_delete'
  | 'settings_update'
  | 'table_create'
  | 'table_delete'
  | 'subscription_change'
  | 'plan_change'
  | 'reward_redeem'
  | 'customer_points_update'

export type AuditLogEntry = {
  actorId: string
  actorName: string
  actorRole: 'admin' | 'waiter' | 'super_admin'
  action: AuditAction
  targetPath: string
  targetId?: string
  targetName?: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
  createdAt: ReturnType<typeof serverTimestamp>
}

export async function createAuditLog(
  restaurantId: string,
  entry: Omit<AuditLogEntry, 'createdAt'>
): Promise<string | null> {
  try {
    const auditRef = collection(db, 'restaurants', restaurantId, 'auditLogs')
    const docRef = await addDoc(auditRef, {
      ...entry,
      createdAt: serverTimestamp(),
    })
    return docRef.id
  } catch (error) {
    console.error('[audit-log] Failed to create audit log:', error)
    return null
  }
}

export function buildPriceChangeLog(
  productName: string,
  oldPrice: number,
  newPrice: number
): Pick<AuditLogEntry, 'action' | 'before' | 'after' | 'metadata'> {
  return {
    action: 'product_price_change',
    before: { price: oldPrice },
    after: { price: newPrice },
    metadata: {
      productName,
      priceDiff: newPrice - oldPrice,
      changePercent: oldPrice > 0 ? Math.round(((newPrice - oldPrice) / oldPrice) * 100) : 0,
    },
  }
}

export function formatAuditAction(action: AuditAction): string {
  const labels: Record<AuditAction, string> = {
    product_create: 'Ürün eklendi',
    product_update: 'Ürün güncellendi',
    product_delete: 'Ürün silindi',
    product_price_change: 'Fiyat değiştirildi',
    category_create: 'Kategori eklendi',
    category_update: 'Kategori güncellendi',
    category_delete: 'Kategori silindi',
    waiter_create: 'Garson eklendi',
    waiter_update: 'Garson güncellendi',
    waiter_delete: 'Garson silindi',
    campaign_create: 'Kampanya oluşturuldu',
    campaign_update: 'Kampanya güncellendi',
    campaign_delete: 'Kampanya silindi',
    settings_update: 'Ayarlar güncellendi',
    table_create: 'Masa eklendi',
    table_delete: 'Masa silindi',
    subscription_change: 'Abonelik değiştirildi',
    plan_change: 'Plan değiştirildi',
    reward_redeem: 'Hediye kullandırıldı',
    customer_points_update: 'Müşteri puanı güncellendi',
  }
  return labels[action] || action
}
