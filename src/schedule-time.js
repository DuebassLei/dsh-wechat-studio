const pad = n => String(n).padStart(2, '0')
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/

function validDateParts(year, month, day) {
  if (month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= lengths[month - 1]
}

function localDate(year, month, day, hour = 0, minute = 0) {
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(hour, minute, 0, 0)
  return date
}

export function dayKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new RangeError('无效日期')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseDay(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key))
  if (!match) throw new RangeError('无效日期')
  const [year, month, day] = match.slice(1).map(Number)
  if (!validDateParts(year, month, day)) throw new RangeError('无效日期')
  return localDate(year, month, day)
}

export function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function mondayOf(date) {
  return addDays(date, -((date.getDay() + 6) % 7))
}

export function atOn(key, hour, minute = 0) {
  const day = parseDay(key)
  const year = day.getFullYear()
  if (year < 2000 || year > 2100 || !Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new RangeError('无效发布时间')
  }
  const date = localDate(year, day.getMonth() + 1, day.getDate(), hour, minute)
  if (date.getFullYear() !== year || date.getMonth() !== day.getMonth() || date.getDate() !== day.getDate() || date.getHours() !== hour || date.getMinutes() !== minute) {
    throw new RangeError('所选本地时间不存在')
  }
  return date.toISOString()
}

export function scheduleTime(value) {
  if (typeof value !== 'string') throw new RangeError('无效发布时间')
  const match = ISO_PATTERN.exec(value)
  if (!match) throw new RangeError('无效发布时间')
  const [year, month, day, hour, minute, second = '0', , zone] = match.slice(1)
  const numbers = [year, month, day, hour, minute, second].map(Number)
  if (!validDateParts(...numbers.slice(0, 3)) || numbers[0] < 2000 || numbers[0] > 2100 || numbers[3] > 23 || numbers[4] > 59 || numbers[5] > 59) {
    throw new RangeError('无效发布时间')
  }
  if (zone !== 'Z') {
    const [zoneHour, zoneMinute] = zone.slice(1).split(':').map(Number)
    if (zoneHour > 23 || zoneMinute > 59) throw new RangeError('无效发布时间')
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new RangeError('无效发布时间')
  return date.toISOString()
}

export function isOverdue(scheduledFor, now) {
  return new Date(scheduledFor).getTime() < now
}
