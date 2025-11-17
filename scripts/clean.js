import { rmSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const rootDir = join(__dirname, '..')

// 需要清理的目录
const dirsToClean = [
  'dist',
  'dist-electron',
  'release'
]

console.log('正在清理构建产物...')

dirsToClean.forEach(dir => {
  const dirPath = join(rootDir, dir)
  if (existsSync(dirPath)) {
    try {
      rmSync(dirPath, { recursive: true, force: true })
      console.log(`✓ 已清理: ${dir}`)
    } catch (error) {
      console.error(`✗ 清理失败 ${dir}:`, error.message)
    }
  } else {
    console.log(`- 目录不存在: ${dir}`)
  }
})

console.log('清理完成！')

