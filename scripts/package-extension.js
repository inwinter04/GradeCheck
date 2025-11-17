// 打包浏览器扩展脚本
import { createWriteStream } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// 尝试使用 archiver，如果没有则提示手动打包
let archiver;
try {
  archiver = require('archiver');
} catch (e) {
  console.log('⚠️  未安装 archiver 包，将使用手动打包方式');
  console.log('\n📦 手动打包步骤：');
  console.log('1. 进入 extension 目录');
  console.log('2. 选择所有文件（manifest.json, background.js, content.js, popup.html, popup.js, 所有图标文件）');
  console.log('3. 右键 -> 发送到 -> 压缩(zipped)文件夹');
  console.log('4. 将压缩包重命名为：广理成绩核查助手-扩展.zip');
  console.log('\n或者安装 archiver 后使用此脚本：');
  console.log('npm install archiver --save-dev');
  process.exit(0);
}

const EXTENSION_DIR = join(process.cwd(), 'extension');
const OUTPUT_DIR = join(process.cwd(), 'release');
const ZIP_NAME = '广理成绩核查助手-扩展.zip';

async function packageExtension() {
  console.log('🚀 开始打包浏览器扩展...');
  console.log('📁 扩展目录:', EXTENSION_DIR);
  console.log('📦 输出目录:', OUTPUT_DIR);
  
  try {
    // 确保输出目录存在
    const fs = await import('fs');
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    const outputPath = join(OUTPUT_DIR, ZIP_NAME);
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // 最高压缩级别
    });
    
    return new Promise((resolve, reject) => {
      output.on('close', () => {
        const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
        console.log(`\n✅ 扩展打包完成！`);
        console.log(`📦 文件路径: ${outputPath}`);
        console.log(`📊 文件大小: ${sizeInMB} MB`);
        console.log(`\n📝 安装说明:`);
        console.log(`1. 打开 Chrome 浏览器`);
        console.log(`2. 访问 chrome://extensions/`);
        console.log(`3. 开启右上角的"开发者模式"开关`);
        console.log(`4. 点击"加载已解压的扩展程序"按钮`);
        console.log(`5. 选择项目中的 extension 文件夹（或解压后的文件夹）`);
        console.log(`\n💡 提示：也可以直接在 Chrome 中使用"打包扩展程序"功能生成 .crx 文件`);
        resolve();
      });
      
      archive.on('error', (err) => {
        console.error('❌ 打包失败:', err);
        reject(err);
      });
      
      archive.pipe(output);
      
      // 添加扩展文件
      archive.directory(EXTENSION_DIR, false);
      
      archive.finalize();
    });
  } catch (error) {
    console.error('❌ 打包失败:', error);
    process.exit(1);
  }
}

packageExtension().catch(console.error);
