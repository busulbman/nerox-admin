'use client'

import { useState, useEffect } from 'react'
import { collection, onSnapshot, setDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore'
import { db, createFirebaseUser, RESTAURANT_ID } from '@/lib/firebase'
import type { UserProfile } from '@/lib/types'

const BROWN = '#3d2b1f'
const GOLD  = '#d4a017'

type WaiterForm = { name: string; email: string; password: string }
const EMPTY_FORM: WaiterForm = { name: '', email: '', password: '' }

function tsToMs(ts: unknown): number {
  if (!ts) return 0
  if (typeof ts === 'number') return ts
  if (typeof (ts as { toMillis?: unknown }).toMillis === 'function') return (ts as { toMillis(): number }).toMillis()
  if (typeof (ts as { toDate?: unknown }).toDate === 'function') return (ts as { toDate(): Date }).toDate().getTime()
  return 0
}

function formatLastSeen(ts: unknown): string {
  const ms = tsToMs(ts)
  if (!ms) return 'bilinmiyor'
  const m = Math.floor((Date.now() - ms) / 60000)
  if (m < 1) return 'az önce'
  if (m < 60) return `${m} dk önce`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} sa önce`
  return `${Math.floor(h / 24)} gün önce`
}

const inputCls =
  'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4a017] focus:ring-1 focus:ring-[#d4a017]'

export default function WaitersPage() {
  const [waiters,    setWaiters]    = useState<UserProfile[]>([])
  const [form,       setForm]       = useState<WaiterForm>(EMPTY_FORM)
  const [adding,     setAdding]     = useState(false)
  const [addError,   setAddError]   = useState('')
  const [showForm,   setShowForm]   = useState(false)

  // Edit modal
  const [editingWaiter, setEditingWaiter] = useState<UserProfile | null>(null)
  const [editName,      setEditName]      = useState('')
  const [editEmail,     setEditEmail]     = useState('')
  const [editSaving,    setEditSaving]    = useState(false)
  const [editError,     setEditError]     = useState('')

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('restaurantId', '==', RESTAURANT_ID),
      where('role', '==', 'waiter')
    )
    return onSnapshot(q, (snap) => {
      setWaiters(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile)))
    })
  }, [])

  async function handleAdd() {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
      setAddError('İsim, geçerli e-posta ve en az 6 karakterli şifre gerekli.')
      return
    }
    setAdding(true)
    setAddError('')
    try {
      const uid = await createFirebaseUser(form.email.trim(), form.password)
      await setDoc(doc(db, 'users', uid), {
        uid,
        email: form.email.trim(),
        role: 'waiter',
        name: form.name.trim(),
        restaurantId: RESTAURANT_ID,
        active: true,
        avgRating: 0,
        totalCalls: 0,
        isOnline: false,
      })
      setForm(EMPTY_FORM)
      setShowForm(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Hata oluştu.'
      setAddError(msg.includes('email-already-in-use') ? 'Bu e-posta zaten kayıtlı.' : msg)
    } finally {
      setAdding(false)
    }
  }

  async function toggleActive(w: UserProfile) {
    try {
      await updateDoc(doc(db, 'users', w.uid), { active: !w.active })
    } catch (err) {
      console.error('Durum güncelleme hatası:', err)
    }
  }

  function openEdit(w: UserProfile) {
    setEditingWaiter(w)
    setEditName(w.name)
    setEditEmail(w.email)
    setEditError('')
  }

  async function handleEditSave() {
    if (!editingWaiter) return
    if (!editName.trim() || !editEmail.trim()) {
      setEditError('İsim ve e-posta zorunludur.')
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      await updateDoc(doc(db, 'users', editingWaiter.uid), {
        name: editName.trim(),
        email: editEmail.trim(),
      })
      setEditingWaiter(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Güncelleme başarısız.')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete(w: UserProfile) {
    if (!window.confirm(`${w.name} adlı garsonu silmek istediğinizden emin misiniz?\nFirestore kaydı silinir.`)) return
    setDeletingId(w.uid)
    try {
      await deleteDoc(doc(db, 'users', w.uid))
    } catch (err) {
      console.error('Garson silme hatası:', err)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-bold text-2xl" style={{ color: BROWN }}>Garson Yönetimi</h1>
            <p className="text-gray-400 text-sm mt-0.5">{waiters.length} garson kayıtlı</p>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setAddError(''); setForm(EMPTY_FORM) }}
            className="font-semibold px-5 py-2.5 rounded-lg text-sm"
            style={{ background: GOLD, color: BROWN }}
          >
            {showForm ? 'İptal' : '+ Garson Ekle'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6 max-w-lg">
            <h2 className="font-semibold mb-1" style={{ color: BROWN }}>Yeni Garson</h2>
            <p className="text-gray-400 text-xs mb-4">
              Firebase Auth kullanıcısı oluşturulur ve role = &quot;waiter&quot; atanır.
            </p>
            <div className="space-y-3">
              <input className={inputCls} placeholder="Ad Soyad *" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              <input type="email" className={inputCls} placeholder="E-posta *" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              <input type="password" className={inputCls} placeholder="Şifre (min. 6 karakter) *" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
            </div>
            {addError && <p className="text-red-500 text-sm mt-3">{addError}</p>}
            <button
              onClick={handleAdd}
              disabled={adding}
              className="mt-4 font-semibold px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
              style={{ background: GOLD, color: BROWN }}
            >
              {adding ? 'Oluşturuluyor...' : 'Garson Oluştur'}
            </button>
          </div>
        )}

        {waiters.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
            Henüz garson eklenmemiş.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 font-semibold">
                  <th className="text-left px-6 py-3">Garson</th>
                  <th className="text-left px-6 py-3 hidden md:table-cell">E-posta</th>
                  <th className="text-center px-4 py-3">Puan</th>
                  <th className="text-center px-4 py-3">Çağrı</th>
                  <th className="text-center px-4 py-3">Durum</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {waiters.map((w) => (
                  <tr key={w.uid} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                            style={{ background: w.active ? BROWN : '#9ca3af' }}
                          >
                            {w.name.charAt(0).toUpperCase()}
                          </div>
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                            style={{ background: w.isOnline ? '#22c55e' : '#ef4444' }}
                          />
                        </div>
                        <div>
                          <p className="font-medium" style={{ color: BROWN }}>{w.name}</p>
                          <p className="text-xs mt-0.5" style={{ color: w.isOnline ? '#16a34a' : '#9ca3af' }}>
                            {w.isOnline
                              ? 'Çevrimiçi'
                              : w.lastSeen
                                ? formatLastSeen(w.lastSeen)
                                : 'Görülmedi'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500 hidden md:table-cell">{w.email}</td>
                    <td className="px-4 py-4 text-center font-medium" style={{ color: GOLD }}>
                      {(w.avgRating ?? 0) > 0 ? `${w.avgRating!.toFixed(1)} ★` : '—'}
                    </td>
                    <td className="px-4 py-4 text-center text-gray-600">{w.totalCalls ?? 0}</td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => toggleActive(w)}
                        className="text-xs font-semibold px-3 py-1 rounded-full"
                        style={w.active
                          ? { background: '#dcfce7', color: '#15803d' }
                          : { background: '#f3f4f6', color: '#6b7280' }
                        }
                      >
                        {w.active ? 'Aktif' : 'Pasif'}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => openEdit(w)}
                          className="text-gray-400 hover:text-blue-500 text-xs px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(w)}
                          disabled={deletingId === w.uid}
                          className="text-gray-400 hover:text-red-500 text-xs px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                          {deletingId === w.uid ? '...' : '🗑️'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Edit modal ── */}
      {editingWaiter && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditingWaiter(null) }}
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="font-bold text-lg mb-4" style={{ color: BROWN }}>Garson Düzenle</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-500">Ad Soyad</label>
                <input
                  className={inputCls}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-500">E-posta</label>
                <input
                  type="email"
                  className={inputCls}
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Not: E-posta değişikliği yalnızca Firestore kaydını günceller.
                </p>
              </div>
            </div>
            {editError && <p className="text-red-500 text-sm mt-3">{editError}</p>}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEditingWaiter(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: '#f3f4f6', color: '#6b7280' }}
              >
                İptal
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: GOLD, color: BROWN }}
              >
                {editSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
