'use client'

import { useState, useEffect } from 'react'
import { collection, onSnapshot, setDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore'
import { db, createFirebaseUser, RESTAURANT_ID } from '@/lib/firebase'
import type { UserProfile } from '@/lib/types'

const BROWN = '#3d2b1f'
const GOLD  = '#d4a017'

type WaiterForm = { name: string; email: string; password: string }
const EMPTY_FORM: WaiterForm = { name: '', email: '', password: '' }

export default function WaitersPage() {
  const [waiters, setWaiters] = useState<UserProfile[]>([])
  const [form, setForm] = useState<WaiterForm>(EMPTY_FORM)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  // Sadece bu restaurant'ın garsonlarını çek (users koleksiyonundan)
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
      setError('İsim, geçerli e-posta ve en az 6 karakterli şifre gerekli.')
      return
    }
    setAdding(true)
    setError('')
    try {
      const uid = await createFirebaseUser(form.email.trim(), form.password)

      // Canonical kaynak: users/{uid}
      await setDoc(doc(db, 'users', uid), {
        uid,
        email: form.email.trim(),
        role: 'waiter',
        name: form.name.trim(),
        restaurantId: RESTAURANT_ID,
        active: true,
        avgRating: 0,
        totalCalls: 0,
      } satisfies UserProfile & { avgRating: number; totalCalls: number })

      setForm(EMPTY_FORM)
      setShowForm(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Hata oluştu.'
      setError(msg.includes('email-already-in-use') ? 'Bu e-posta zaten kayıtlı.' : msg)
    } finally {
      setAdding(false)
    }
  }

  async function toggleActive(w: UserProfile) {
    await updateDoc(doc(db, 'users', w.uid), { active: !w.active })
  }

  async function handleDelete(w: UserProfile) {
    if (
      !confirm(
        `${w.name} isimli garsonu silmek istediğinizden emin misiniz?\n` +
        `Firebase Auth kaydı aktif kalır, sadece panel erişimi kaldırılır.`
      )
    )
      return
    await deleteDoc(doc(db, 'users', w.uid))
  }

  const inputCls =
    'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4a017] focus:ring-1 focus:ring-[#d4a017]'

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-bold text-2xl" style={{ color: BROWN }}>Garson Yönetimi</h1>
          <p className="text-gray-400 text-sm mt-0.5">{waiters.length} garson kayıtlı</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(''); setForm(EMPTY_FORM) }}
          className="font-semibold px-5 py-2.5 rounded-lg text-sm"
          style={{ background: GOLD, color: BROWN }}
        >
          {showForm ? 'İptal' : '+ Garson Ekle'}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6 max-w-lg">
          <h2 className="font-semibold mb-1" style={{ color: BROWN }}>Yeni Garson</h2>
          <p className="text-gray-400 text-xs mb-4">
            Firebase Auth kullanıcısı oluşturulur ve role = "waiter" atanır.
          </p>
          <div className="space-y-3">
            <input
              className={inputCls}
              placeholder="Ad Soyad *"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
            <input
              type="email"
              className={inputCls}
              placeholder="E-posta *"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
            <input
              type="password"
              className={inputCls}
              placeholder="Şifre (min. 6 karakter) *"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            />
          </div>
          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
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

      {/* List */}
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
                <th className="text-left px-6 py-3">E-posta</th>
                <th className="text-center px-6 py-3">Puan</th>
                <th className="text-center px-6 py-3">Çağrı</th>
                <th className="text-center px-6 py-3">Durum</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {waiters.map((w) => (
                <tr key={w.uid} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ background: w.active ? BROWN : '#9ca3af' }}
                      >
                        {w.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium" style={{ color: BROWN }}>{w.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{w.email}</td>
                  <td className="px-6 py-4 text-center font-medium" style={{ color: GOLD }}>
                    {(w.avgRating ?? 0) > 0 ? `${(w.avgRating!).toFixed(1)} ★` : '—'}
                  </td>
                  <td className="px-6 py-4 text-center text-gray-600">{w.totalCalls ?? 0}</td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => toggleActive(w)}
                      className="text-xs font-semibold px-3 py-1 rounded-full"
                      style={
                        w.active
                          ? { background: '#dcfce7', color: '#15803d' }
                          : { background: '#f3f4f6', color: '#6b7280' }
                      }
                    >
                      {w.active ? 'Aktif' : 'Pasif'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(w)}
                      className="text-gray-400 hover:text-red-500 text-xs px-2 py-1 rounded hover:bg-red-50"
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
