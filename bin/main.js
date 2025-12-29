#!/usr/bin/env node

import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { showBanner, showConfig, showSummary, showError } from '../lib/ui.js';
import { logFileInfo, logInfo } from '../lib/logger.js';
import { parseFilePaths, validateInputFile, saveInspectData, cleanupTempFile, checkFBX2glTF } from '../lib/utils.js';
import { 
  convertFBXToGLB, 
  initGLTFTransform, 
  readGLBDocument, 
  optimizeScene, 
  applyCompression, 
  writeGLB,
  inspectDocument 
} from '../lib/transform.js';
import { generateReport } from '../lib/report.js';

const program = new Command();

program
  .name('fbx2glb')
  .description('FBX 转 GLB 自动优化工具')
  .requiredOption('-i, --input <file>', '指定输入 FBX 文件')
  .option('-o, --output <file>', '输出 GLB 文件（默认与 FBX 同目录）')
  .option('--draco', '开启 Draco 几何压缩', false)
  .option('--ktx2', '开启 KTX2 贴图压缩', false)
  .option('--maxTex <number>', '最大纹理尺寸', 2048)
  .parse(process.argv);

const options = program.opts();

// 解析文件路径
const { inputFBX, outputGLB, tempGLB } = parseFilePaths(options.input, options.output);

// 检测 FBX2glTF 工具
if (!checkFBX2glTF()) {
  console.error(chalk.red.bold('❌ 错误: 未找到 FBX2glTF 工具'));
  console.error(chalk.yellow('\n请先安装 FBX2glTF 工具:'));
  console.error(chalk.cyan('  macOS: brew install fbx2gltf'));
  console.error(chalk.cyan('  或访问: https://github.com/facebookincubator/FBX2glTF'));
  console.error(chalk.gray('\n确保 FBX2glTF 已添加到系统 PATH 环境变量中'));
  process.exit(1);
}

// 验证输入文件
try {
  validateInputFile(inputFBX);
} catch (err) {
  console.error(chalk.red.bold('❌ 错误: 输入文件不存在'));
  console.error(chalk.red(`   文件路径: ${inputFBX}`));
  process.exit(1);
}

let spinner;

async function main() {
  const startTime = Date.now();
  
  try {
    // 显示启动信息
    showBanner();
    showConfig(inputFBX, outputGLB, options);
    
    // ========== 步骤 1: FBX 转 GLB ==========
    convertFBXToGLB(inputFBX, tempGLB);
    logFileInfo(tempGLB, '临时 GLB');

    // ========== 步骤 2: 初始化 GLTF Transform ==========
    const io = await initGLTFTransform();

    // ========== 步骤 3: 读取 GLB ==========
    const document = await readGLBDocument(io, tempGLB);
    
    // 保存优化前的inspect结果
    spinner = ora('正在分析优化前数据...').start();
    const beforeInspect = inspectDocument(document);
    const beforeFile = path.join(path.dirname(outputGLB), 'inspect_before.json');
    saveInspectData(beforeInspect, beforeFile);
    spinner.succeed('优化前数据分析完成');
    logFileInfo(beforeFile, '优化前数据');

    // ========== 步骤 4: 场景优化 ==========
    await optimizeScene(document);

    // ========== 步骤 5: 可选压缩 ==========
    await applyCompression(document, options);

    // ========== 步骤 6: 写入输出 ==========
    await writeGLB(io, document, outputGLB);
    logFileInfo(outputGLB, '输出 GLB');
    
    // 清理临时文件
    if (cleanupTempFile(tempGLB)) {
      logInfo('临时文件已清理', path.basename(tempGLB));
    }
    
    // ========== 生成分析报告 ==========
    await generateReport(document, outputGLB, beforeInspect, options);

    // ========== 完成总结 ==========
    showSummary(inputFBX, outputGLB, startTime);

    process.exit(0);
  } catch (err) {
    if (spinner) {
      spinner.fail('处理失败');
    }
    
    showError(err);
    
    // 清理临时文件
    cleanupTempFile(tempGLB);
    
    process.exit(1);
  }
}

main();
