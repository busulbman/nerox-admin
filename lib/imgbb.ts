const IMGBB_API_KEY = process.env.NEXT_PUBLIC_IMGBB_API_KEY?.trim() || ''

export type ImgBbUploadResult =
  | { success: true; url: string }
  | { success: false; error: string }

export function isImgBbConfigured() {
  return IMGBB_API_KEY.length > 0
}

export async function uploadImageToImgBB(file: File): Promise<ImgBbUploadResult> {
  if (!isImgBbConfigured()) {
    return { success: false, error: 'ImgBB API anahtarı ayarlanmamış.' }
  }

  if (!file.type.startsWith('image/')) {
    return { success: false, error: 'Lütfen bir görsel dosyası seçin.' }
  }

  const formData = new FormData()
  formData.append('image', file)

  try {
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      return { success: false, error: 'Fotoğraf yüklenemedi. Lütfen tekrar deneyin.' }
    }

    const payload = await response.json()
    const url = payload.data?.url
    if (typeof url !== 'string' || !url.trim()) {
      return { success: false, error: 'Fotoğraf yüklenemedi. Yanıt geçersiz.' }
    }

    return { success: true, url }
  } catch (error) {
    console.error('ImgBB upload error:', error)
    return { success: false, error: 'Fotoğraf yüklenirken bir hata oluştu.' }
  }
}
