import type { Metadata } from 'next'
import LegalDocumentPage from '@/components/LegalDocumentPage'

export const metadata: Metadata = {
  title: 'Gizlilik Politikası | Nerox Studio',
  description: 'Nerox Studio gizlilik politikası ve veri güvenliği yaklaşımı.',
}

const sections = [
  {
    title: 'Politikanın Kapsamı',
    paragraphs: [
      'Bu gizlilik politikası, Nerox Studio web sitesi, yönetim paneli, garson paneli ve QR menü deneyimi dahil olmak üzere sunulan dijital hizmetler için geçerlidir.',
      'Politika; hangi bilgilerin toplandığını, nasıl korunduğunu ve kullanıcı deneyimini geliştirmek için nasıl kullanıldığını özetler.',
    ],
  },
  {
    title: 'Toplanan Bilgiler',
    paragraphs: [
      'Hesap oluşturma ve oturum yönetimi için e-posta adresi, kullanıcı adı, rol bilgisi ve işletme kayıtları tutulabilir.',
      'Sipariş, çağrı, masa hareketleri ve panel kullanımına dair operasyonel veriler, yalnızca ilgili işletmenin hizmet akışı içinde işlenir.',
    ],
  },
  {
    title: 'Çerezler ve Oturum Verileri',
    paragraphs: [
      'Sistemde oturum sürekliliği, güvenlik ve tercih hatırlama amacıyla tarayıcı depolama alanları veya benzer teknikler kullanılabilir.',
      'Bu veriler, kullanıcı deneyimini bozmayacak şekilde sınırlı tutulur ve hizmetin temel işlevleri için kullanılır.',
    ],
  },
  {
    title: 'Veri Güvenliği',
    paragraphs: [
      'Nerox Studio, kullanıcı ve işletme verilerini yetkisiz erişime karşı korumak amacıyla modern kimlik doğrulama, erişim kontrolü ve altyapı güvenliği yöntemlerinden yararlanır.',
      'Buna rağmen internet üzerinden yapılan hiçbir veri aktarımının mutlak güvenli olduğu garanti edilemez; olası riskleri azaltmak için düzenli iyileştirmeler yapılır.',
    ],
  },
  {
    title: 'Üçüncü Taraf Hizmetler',
    paragraphs: [
      'Barındırma, veritabanı, kimlik doğrulama ve medya servisleri gibi teknik altyapılarda üçüncü taraf sağlayıcılar kullanılabilir.',
      'Bu servisler, yalnızca hizmetin sunulması için gerekli olan verileri işler ve kendi güvenlik standartlarına göre koruma sağlar.',
    ],
  },
] as const

export default function PrivacyPage() {
  return (
    <LegalDocumentPage
      label="Gizlilik"
      title="Gizlilik Politikası"
      description="Nerox Studio, hizmet içinde işlenen verilerin güvenliği ve mahremiyeti için temel prensiplerini bu sayfada açıklar."
      sections={[...sections]}
    />
  )
}
