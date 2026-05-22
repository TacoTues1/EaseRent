export const MAX_IMAGE_UPLOAD_BYTES = 3 * 1024 * 1024
export const MAX_IMAGE_INPUT_BYTES = 20 * 1024 * 1024

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to read image file'))
    }
    img.src = objectUrl
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Image compression failed'))
        return
      }
      resolve(blob)
    }, type, quality)
  })
}

function asJpegFile(blob, originalName) {
  const baseName = (originalName || 'image').replace(/\.[^/.]+$/, '')
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

export async function compressImageToMaxSize(file, options = {}) {
  const {
    maxBytes = MAX_IMAGE_UPLOAD_BYTES,
    maxWidth = 1920,
    maxHeight = 1920,
    initialQuality = 0.90,
    minQuality = 0.70,
    maxIterations = 14,
  } = options

  if (!file?.type?.startsWith('image/')) {
    throw new Error('Only image files can be compressed')
  }

  if (file.type === 'image/gif' && file.size > maxBytes) {
    throw new Error('GIF files larger than 2MB are not supported. Please upload a smaller GIF.')
  }

  if (typeof window === 'undefined') {
    return file
  }

  const image = await loadImageFromFile(file)
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height

  const ratio = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight)
  let targetWidth = Math.max(1, Math.round(sourceWidth * ratio))
  let targetHeight = Math.max(1, Math.round(sourceHeight * ratio))
  let quality = initialQuality

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) {
    throw new Error('Image compression is not supported in this browser')
  }

  const draw = () => {
    canvas.width = targetWidth
    canvas.height = targetHeight
    ctx.clearRect(0, 0, targetWidth, targetHeight)
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight)
  }

  draw()

  let blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  if (blob.size <= maxBytes) {
    return asJpegFile(blob, file.name)
  }

  for (let i = 0; i < maxIterations; i += 1) {
    quality = Math.max(minQuality, quality - 0.08)
    blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    if (blob.size <= maxBytes) {
      return asJpegFile(blob, file.name)
    }

    if (quality <= minQuality) {
      const nextWidth = Math.max(1, Math.floor(targetWidth * 0.9))
      const nextHeight = Math.max(1, Math.floor(targetHeight * 0.9))

      if (nextWidth === targetWidth || nextHeight === targetHeight) {
        break
      }

      targetWidth = nextWidth
      targetHeight = nextHeight
      quality = initialQuality
      draw()
    }
  }

  throw new Error('Unable to compress image below 3MB. Please use a smaller image.')
}

export async function normalizeImageForUpload(file, options = {}) {
  const {
    maxBytes = MAX_IMAGE_UPLOAD_BYTES,
    maxInputBytes = MAX_IMAGE_INPUT_BYTES,
  } = options

  if (!file?.type?.startsWith('image/')) {
    throw new Error('Please upload an image file')
  }

  if (file.size <= maxBytes) {
    return file
  }

  return compressImageToMaxSize(file, { maxBytes })
}