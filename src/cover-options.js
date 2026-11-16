export const COVER_PROVIDERS = [
  { id: 'ark', name: '火山方舟' },
  { id: 'bailian', name: '阿里云百炼' },
]

export const COVER_MODELS = [
  { id: 'doubao-seedream-5-5-261028', name: 'Doubao Seedream 5.5', provider: 'ark' },
  { id: 'qwen-image-2.1-pro', name: 'Qwen-Image 2.1 Pro', provider: 'bailian' },
  { id: 'qwen-image-3.0-pro', name: 'Qwen-Image 3.0 Pro', provider: 'bailian' },
  { id: 'wan2.7-image-pro', name: '通义万相 2.7 Pro', provider: 'bailian' },
  { id: 'wan2.7-image', name: '通义万相 2.7', provider: 'bailian' },
]

export const modelsFor = provider => COVER_MODELS.filter(model => model.provider === provider)

export const COVER_RESOLUTIONS = ['1K', '1.5K', '2K']
export const COVER_FORMATS = ['png', 'jpeg']
export const MAX_COVER_COUNT = 4

// 百炼只回 PNG；带参考图时万相的 1K/2K 缩写会跟随参考图比例，所以统一显式传宽*高，
// 比例取 47:20，和 saveCover 的裁切一致，避免中心裁切切掉构图。
export const BAILIAN_SIZES = { '1K': '1504*640', '1.5K': '1880*800', '2K': '2048*872' }
export const INLINE_IMAGE_SIZES = { ark: '2048x1152', bailian: '2048*1152' }
export const providerFormats = provider => (provider === 'bailian' ? ['png'] : COVER_FORMATS)
