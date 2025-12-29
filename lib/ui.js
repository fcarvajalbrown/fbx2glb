import chalk from 'chalk';
import boxen from 'boxen';
import prettyBytes from 'pretty-bytes';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgPath = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

/**
 * 显示启动横幅
 */
export function showBanner() {
  const content =
    chalk.bold.cyan(pkg.name) + '\n' +
    chalk.gray(pkg.description || '') + '\n\n' +
    chalk.gray('Author: ') + chalk.cyan(pkg.author || '') + '\n' +
    chalk.gray('Version: ') + chalk.cyan(`v${pkg.version}`);

  console.log(
    boxen(content, {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
    })
  );
}

/**
 * 显示配置信息
 */
export function showConfig(inputFBX, outputGLB, options) {
  const inputSize = fs.existsSync(inputFBX) ? fs.statSync(inputFBX).size : 0;
  const config = [
    chalk.white.bold('📁 输入文件:') + ' ' + chalk.cyan(inputFBX),
    chalk.white.bold('💾 文件大小:') + ' ' + chalk.yellow(prettyBytes(inputSize)),
    chalk.white.bold('⚙️  优化选项:'),
    '   • Draco 压缩: ' + (options.draco ? chalk.green('✓ 启用') : chalk.gray('✗ 禁用')),
    '   • KTX2 压缩: ' + (options.ktx2 ? chalk.green('✓ 启用') : chalk.gray('✗ 禁用')),
    '   • 最大纹理: ' + chalk.yellow(`${options.maxTex}px`)
  ].join('\n');
  
  console.log(boxen(config, {
    padding: 1,
    margin: { top: 0, bottom: 1 },
    borderStyle: 'round',
    borderColor: 'blue'
  }));
}

/**
 * 显示完成总结
 */
export function showSummary(inputFBX, outputGLB, startTime) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const inputSize = fs.statSync(inputFBX).size;
  const outputSize = fs.statSync(outputGLB).size;
  const compressionRatio = ((1 - outputSize / inputSize) * 100).toFixed(1);
  
  const summary = [
    chalk.white.bold('✨ 转换完成！'),
    '',
    chalk.white.bold('📊 转换统计:'),
    `   输入大小: ${chalk.yellow(prettyBytes(inputSize))}`,
    `   输出大小: ${chalk.yellow(prettyBytes(outputSize))}`,
    `   压缩率: ${chalk.green(`${compressionRatio}%`)}`,
    `   耗时: ${chalk.cyan(`${duration}s`)}`,
    '',
    chalk.white.bold('📁 输出文件:'),
    `   ${chalk.cyan(outputGLB)}`
  ].join('\n');
  
  console.log(boxen(summary, {
    padding: 1,
    margin: { top: 1, bottom: 0 },
    borderStyle: 'round',
    borderColor: 'green'
  }));
}

/**
 * 显示错误信息
 */
export function showError(err) {
  const errorBox = boxen(
    chalk.red.bold('❌ 转换失败') + '\n\n' +
    chalk.white('错误信息:') + '\n' +
    chalk.red(err.message || String(err)) + '\n\n' +
    chalk.gray('请检查:') + '\n' +
    chalk.gray('  • 输入文件是否存在且有效') + '\n' +
    chalk.gray('  • FBX2glTF 工具是否正确安装') + '\n' +
    chalk.gray('  • 文件路径是否包含特殊字符'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'red'
    }
  );
  console.error(errorBox);
}

