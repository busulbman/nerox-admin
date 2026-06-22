import type { Metadata } from 'next'
import LegalDocumentPage from '@/components/LegalDocumentPage'

export const metadata: Metadata = {
  title: 'KVKK Aydınlatma Metni | Nerox Studio',
  description: 'Nerox Studio KVKK aydınlatma metni ve kişisel veri işleme bilgilendirmesi.',
}

const sections = [
  {
    title: 'Veri Sorumlusu',
    paragraphs: [
      'Bu aydınlatma metni, Nerox Studio tarafından sunulan QR menü, sipariş ve panel hizmetleri kapsamında işlenen kişisel verilere ilişkin genel bilgilendirme sağlamak amacıyla hazırlanmıştır.',
      'Nerox Studio, hizmetin kurulumu, işletilmesi ve destek süreçlerinde veri sorumlusu veya ilgili iş ortaklarıyla birlikte hareket eden hizmet sağlayıcı sıfatıyla işlem yapabilir.',
    ],
  },
  {
    title: 'İşlenen Veriler',
    paragraphs: [
      'Hizmetin kullanımına göre ad, e-posta adresi, telefon numarası, işletme bilgileri, oturum kayıtları, çağrı hareketleri ve teknik kullanım verileri işlenebilir.',
      'Sistem güvenliği ve hizmet sürekliliği için IP bilgisi, cihaz tipi, tarayıcı bilgisi ve hata kayıtları gibi sınırlı teknik veriler de tutulabilir.',
    ],
  },
  {
    title: 'İşleme Amaçları',
    paragraphs: [
      'Kişisel veriler; kullanıcı hesabı oluşturma, giriş doğrulama, işletme yönetimi, destek süreçleri, hizmet güvenliği, performans takibi ve yasal yükümlülüklerin yerine getirilmesi amaçlarıyla işlenir.',
      'Veriler, yalnızca hizmetin sunulması için gerekli kapsamda değerlendirilir ve amaç dışında kullanılmaz.',
    ],
  },
  {
    title: 'Aktarım ve Saklama',
    paragraphs: [
      'Veriler, altyapı sağlayıcıları, barındırma hizmetleri ve teknik destek süreçlerinde görev alan çözüm ortaklarıyla sınırlı olarak paylaşılabilir.',
      'İlgili kayıtlar, hizmet süresi boyunca ve yürürlükteki mevzuatın gerektirdiği saklama süreleri kadar korunur; süresi dolan veriler silinir, yok edilir veya anonim hale getirilir.',
    ],
  },
  {
    title: 'Haklarınız',
    paragraphs: [
      'KVKK kapsamındaki erişim, düzeltme, silme, işleme itiraz etme ve bilgi talep etme haklarınızı kullanmak için Nerox Studio ile iletişime geçebilirsiniz.',
      'Başvurular, talebin niteliğine göre makul süre içinde değerlendirilir ve ilgili mevzuata uygun şekilde sonuçlandırılır.',
    ],
  },
] as const

export default function KvkkPage() {
  return (
    <LegalDocumentPage
      label="Yasal Bilgilendirme"
      title="KVKK Aydınlatma Metni"
      description="Nerox Studio hizmetleri kapsamında hangi verilerin hangi amaçlarla işlendiğini genel hatlarıyla açıklar."
      sections={[...sections]}
    />
  )
}
