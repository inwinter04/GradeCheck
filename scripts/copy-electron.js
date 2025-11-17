import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const sourceDir = join(__dirname, '../electron')
const targetDir = join(__dirname, '../dist-electron')

// 递归复制目录
function copyDir(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true })
  }

  const entries = readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

// 复制electron目录到dist-electron
try {
  console.log('正在复制electron文件到dist-electron...')
  copyDir(sourceDir, targetDir)
  console.log('✓ electron文件复制完成')
} catch (error) {
  console.error('复制electron文件失败:', error)
  process.exit(1)
}

