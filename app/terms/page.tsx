import type { Metadata } from 'next'
import LegalDocumentPage from '@/components/LegalDocumentPage'

export const metadata: Metadata = {
  title: 'Kullanım Şartları | Nerox Studio',
  description: 'Nerox Studio hizmetlerine ilişkin genel kullanım şartları.',
}

const sections = [
  {
    title: 'Hizmetin Kullanımı',
    paragraphs: [
      'Nerox Studio tarafından sunulan QR menü, sipariş ve yönetim paneli hizmetleri; yalnızca yasalara ve hizmet amacına uygun şekilde kullanılmalıdır.',
      'Kullanıcılar, kendi hesapları üzerinden gerçekleştirilen işlemlerden ve paylaşılan bilgilerin doğruluğundan sorumludur.',
    ],
  },
  {
    title: 'Hesap ve Erişim Sorumluluğu',
    paragraphs: [
      'Kullanıcı adı, şifre ve oturum erişim bilgilerinin güvenli şekilde saklanması kullanıcı sorumluluğundadır.',
      'Yetkisiz kullanım şüphesi oluştuğunda, erişim bilgilerinin güncellenmesi ve hizmet sağlayıcıya bildirim yapılması gerekir.',
    ],
  },
  {
    title: 'İçerik ve İşletme Verileri',
    paragraphs: [
      'Menü içerikleri, fiyatlar, görseller, masa bilgileri ve çalışan kayıtları ilgili işletme tarafından yönetilir.',
      'Nerox Studio, kullanıcı tarafından sisteme girilen içeriklerin doğruluğunu garanti etmez; içerik sorumluluğu ilgili hesap sahibine aittir.',
    ],
  },
  {
    title: 'Hizmet Sürekliliği ve Güncellemeler',
    paragraphs: [
      'Hizmet altyapısı, güvenlik ve performans amaçlarıyla zaman zaman güncellenebilir, iyileştirilebilir veya planlı bakım süreçlerine alınabilir.',
      'Nerox Studio, ürün özelliklerini geliştirme, değiştirme veya gerektiğinde sonlandırma hakkını saklı tutar.',
    ],
  },
  {
    title: 'Yasaklı Kullanımlar',
    paragraphs: [
      'Sistemin zarar verme amacıyla kullanılması, yetkisiz erişim denemeleri, veri kopyalama, hizmeti kesintiye uğratma girişimleri ve mevzuata aykırı işlemler yasaktır.',
      'Bu tür durumlarda hesap erişimi sınırlandırılabilir veya tamamen sonlandırılabilir.',
    ],
  },
  {
    title: 'Sorumluluk Sınırı',
    paragraphs: [
      'Nerox Studio, hizmetin kullanılmasından doğabilecek dolaylı zararlar, veri kaybı veya kesinti kaynaklı ticari sonuçlar için yürürlükteki hukuk çerçevesinde sınırlı sorumluluk taşır.',
      'Kullanıcı, hizmeti kullanmaya devam ederek bu koşulları kabul etmiş sayılır.',
    ],
  },
] as const

export default function TermsPage() {
  return (
    <LegalDocumentPage
      label="Sözleşme ve Kullanım"
      title="Kullanım Şartları"
      description="Nerox Studio hizmetlerinin kullanımına ilişkin temel kuralları ve hesap sahiplerinin sorumluluklarını açıklar."
      sections={[...sections]}
    />
  )
}
