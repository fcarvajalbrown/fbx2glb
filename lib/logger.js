import chalk from 'chalk';
import prettyBytes from 'pretty-bytes';
import fs from 'fs';

/**
 * 格式化步骤输出
 */
export function logStep(step, message) {
  console.log(chalk.cyan.bold(`\n[${step}]`) + ' ' + chalk.white(message));
}

/**
 * 格式化成功消息
 */
export function logSuccess(message, detail = '') {
  console.log(chalk.green('  ✓ ') + chalk.white(message) + (detail ? chalk.gray(` (${detail})`) : ''));
}

/**
 * 格式化信息消息
 */
export function logInfo(message, detail = '') {
  console.log(chalk.blue('  ℹ ') + chalk.white(message) + (detail ? chalk.gray(` (${detail})`) : ''));
}

/**
 * 格式化文件信息
 */
export function logFileInfo(filePath, label = '文件') {
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const size = prettyBytes(stats.size);
    console.log(chalk.gray(`    ${label}: ${filePath}`));
    console.log(chalk.gray(`    大小: ${size}`));
  }
}

/**
 * 格式化分析标题
 */
export function logAnalysisTitle() {
  console.log(chalk.cyan.bold('\n[分析] 生成优化报告'));
}

