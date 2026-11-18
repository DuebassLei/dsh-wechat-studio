import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { MAX_LOCAL_IMAGE, uploadLocalImage } from '../src/cloudinary.js'

const CONFIG = { cloudName: 'demo', apiKey: 'cloud-key', apiSecret: 'cloud-secret' }
const PUBLIC_URL = 'https://res.cloudinary.com/demo/image/upload/v1/dsh-wechat-studio/local-demo.png'

const formats = [
  ['png', 'image/png', Buffer.from('89504e470d0a1a0a00000000', 'hex')],
  ['jpg', 'image/jpeg', Buffer.from('ffd8ff0000', 'hex')],
  ['gif', 'image/gif', Buffer.from('GIF89a0000', 'ascii')],
  ['webp', 'image/webp', Buffer.concat([Buffer.from('RIFF0000WEBP', 'ascii'), Buffer.alloc(2)])],
]

test('本地图片按内容命名并保留格式，重复内容使用同一图床资源', async () => {
  for (const [extension, type, image] of formats) {
    const url = PUBLIC_URL.replace(/\.png$/, `.${extension}`)
    let upload
    const result = await uploadLocalImage(image, CONFIG, async (target, init) => {
      assert.equal(target, 'https://api.cloudinary.com/v1_1/demo/image/upload')
      upload = init.body
      return Response.json({ secure_url: url })
    })
    assert.equal(result, url)
    assert.equal(upload.get('overwrite'), 'false')
    assert.equal(upload.get('file').type, type)
    assert.ok(upload.get('file').name.endsWith(`.${extension}`))
    const publicId = `dsh-wechat-studio/local-${createHash('sha256').update(image).digest('hex')}`
    assert.equal(upload.get('public_id'), publicId)
    const signature = createHash('sha256').update(`overwrite=false&public_id=${publicId}&timestamp=${upload.get('timestamp')}cloud-secret`).digest('hex')
    assert.equal(upload.get('signature'), signature)
  }
})

test('本地图片拒绝空文件、不支持的格式和超过 10 MB 的文件', async () => {
  const fetchImpl = async () => assert.fail('无效图片不应请求图床')
  await assert.rejects(uploadLocalImage(Buffer.from('not an image'), CONFIG, fetchImpl), /PNG、JPEG、GIF 或 WebP/)
  await assert.rejects(uploadLocalImage(Buffer.alloc(MAX_LOCAL_IMAGE + 1, 1), CONFIG, fetchImpl), /10 MB/)
  await assert.rejects(uploadLocalImage(formats[0][2], {}, fetchImpl), /配置 Cloudinary/)
})

test('本地图片上传失败时不返回不可验证的地址', async () => {
  await assert.rejects(uploadLocalImage(formats[0][2], CONFIG, async () => Response.json({}, { status: 401 })), /鉴权失败/)
  await assert.rejects(uploadLocalImage(formats[0][2], CONFIG, async () => Response.json({ secure_url: 'file:///tmp/private.png' })), /HTTPS 图片地址/)
})
