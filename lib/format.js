#!/usr/bin/env node

/**
 * CLI 自动化 FBX ->  GLB 转换
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Command } from 'commander';
import chalk from 'chalk';
import { NodeIO } from '@gltf-transform/core';
import draco3d from 'draco3d'
import { KHRDracoMeshCompression, KHRTextureBasisu } from '@gltf-transform/extensions';
import { prune, dedup, draco, textureCompress, weld , inspect} from '@gltf-transform/functions';
import { analyzeComparison, printComparisonReport } from './lib/compare.js';
import { printHeader, printInput, printOptions, printStep, printSummary, printFooter } from './lib/format.js';

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
const inputFBX = options.input;
// 获取 FBX 所在目录
const inputDir = path.dirname(inputFBX);
// 获取 FBX 文件名（不带后缀）
const baseName = path.basename(inputFBX, path.extname(inputFBX));
// 输出GLB 文件
const outputGLB = options.output || path.join(inputDir, `${baseName}${performance.now()}.glb`);

if (!fs.existsSync(inputFBX)) {
    console.error(chalk.red('❌ 输入文件不存在:', inputFBX));
    process.exit(1);
}

const tempGLB = path.join(path.dirname(outputGLB), 'temp_raw.glb');

// 生成对比报告的函数
function generateComparison(before, after) {
  const comparison = {
    summary: {},
    details: {}
  };
  
  // 对比各个关键指标
  const keys = ['meshes', 'geometry', 'buffers', 'materials'];
  
  keys.forEach(key => {
    if (before[key] && after[key]) {
      const beforeVal = before[key];
      const afterVal = after[key];
      
      if (typeof beforeVal === 'number' && typeof afterVal === 'number') {
        const diff = afterVal - beforeVal;
        const percent = beforeVal > 0 ? ((diff / beforeVal) * 100).toFixed(2) : 0;
        
        comparison.summary[key] = {
          before: beforeVal,
          after: afterVal,
          difference: diff,
          percentChange: `${percent}%`
        };
      } else if (typeof beforeVal === 'object' && typeof afterVal === 'object') {
        comparison.details[key] = {
          before: beforeVal,
          after: afterVal
        };
      }
    }
  });
  
  // 如果有buffers，计算总大小
  if (before.buffers && after.buffers && typeof before.buffers === 'object' && typeof after.buffers === 'object') {
    const beforeSize = before.buffers.byteLength || 0;
    const afterSize = after.buffers.byteLength || 0;
    const sizeDiff = afterSize - beforeSize;
    const sizePercent = beforeSize > 0 ? ((sizeDiff / beforeSize) * 100).toFixed(2) : 0;
    
    comparison.summary.bufferSize = {
      before: `${(beforeSize / 1024 / 1024).toFixed(2)} MB`,
      after: `${(afterSize / 1024 / 1024).toFixed(2)} MB`,
      difference: `${(sizeDiff / 1024 / 1024).toFixed(2)} MB`,
      percentChange: `${sizePercent}%`
    };
  }
  
  return comparison;
}


async function main() {
  const startTime = Date.now();
  
  try {
    // 打印标题和初始信息
    printHeader('1.2.0', 'Your Team');
    printInput(inputFBX);
    printOptions({
      draco: options.draco,
      ktx2: options.ktx2,
      resize: options.ktx2, // KTX2 压缩时会自动 resize
      resizeThreshold: 1024,
      maxTex: options.maxTex
    });

    // 步骤 1: FBX → GLB
    execSync(`FBX2glTF -b -i "${inputFBX}" -o "${tempGLB}"`, { stdio: 'inherit' });
    const tempSize = fs.statSync(tempGLB).size;
    printStep(1, 6, 'FBX → GLB', 'success', `Exported raw GLB (${formatFileSize(tempSize)})`);

    // 步骤 2: 加载和读取
    const io = new NodeIO()
          .registerExtensions([KHRDracoMeshCompression, KHRTextureBasisu])
          .registerDependencies({
            'draco3d.encoder': await draco3d.createEncoderModule(),
            'draco3d.decoder': await draco3d.createDecoderModule(),
          });
   
    const document = await io.read(tempGLB);

    // 保存优化前的inspect结果
    const beforeInspect = inspect(document, {
      meshes: true,
      geometry: true,
      buffers: true,
      materials: true,
    });
    
    const beforeFile = path.join(path.dirname(outputGLB), 'inspect_before.json');
    fs.writeFileSync(beforeFile, JSON.stringify(beforeInspect, null, 2), 'utf-8');
    
    // 场景优化
    await document.transform(
      weld({ tolerance: 0.0001 }), // 顶点焊接-> 合并顶点
      prune(), // 场景瘦身->清理无用数据
      dedup() // 数据去重 (复用 Accessor/Mesh)
    );
    printStep(2, 6, 'Scene cleanup', 'success', 'prune / dedup / weld');

    // 步骤 3: 几何压缩
    if (options.draco) {
      await document.transform(
        draco({
          method: 'edgebreaker',
          quantizationVolume: 'mesh',
          quantizationBits: { 
            POSITION: 14,
            NORMAL: 10,
            TEX_COORD: 12,
            COLOR: 8,
            GENERIC: 12,
          }
        })
      );
      printStep(3, 6, 'Geometry compression', 'success', 'Draco (POSITION:14, NORMAL:10)');
    } else {
      printStep(3, 6, 'Geometry compression', 'success', 'Skipped (not enabled)');
    }

    // 步骤 4: 贴图压缩
    if (options.ktx2) {
      await document.transform(
        textureCompress({
          encoder: 'basisu',
          format: 'UASTC',
          quality: 128,
          resize: [1024, 1024]
        })
      );
      printStep(4, 6, 'Texture compression', 'success', 'KTX2 (UASTC, quality=128)');
    } else {
      printStep(4, 6, 'Texture compression', 'success', 'Skipped (not enabled)');
    }

    // 步骤 5: 写入输出
    await io.write(outputGLB, document);
    const outputSize = fs.statSync(outputGLB).size;
    const outputFileName = path.basename(outputGLB);
    printStep(5, 6, 'Writing output', 'success', `${outputFileName} (${formatFileSize(outputSize)})`);

    fs.unlinkSync(tempGLB);
    
    // 保存优化后的inspect结果
    const afterInspect = inspect(document, {
      meshes: true,
      geometry: true,
      buffers: true,
      materials: true,
    });
    
    const afterFile = path.join(path.dirname(outputGLB), 'inspect_after.json');
    fs.writeFileSync(afterFile, JSON.stringify(afterInspect, null, 2), 'utf-8');
    
    // 生成对比报告（保留旧格式用于 JSON 文件）
    const comparison = generateComparison(beforeInspect, afterInspect);
    const comparisonFile = path.join(path.dirname(outputGLB), 'comparison.json');
    fs.writeFileSync(comparisonFile, JSON.stringify(comparison, null, 2), 'utf-8');
    
    // 打印优化摘要
    printSummary(beforeInspect, afterInspect, options);
    
    // 打印总时间和完成标记
    const totalTime = Date.now() - startTime;
    printFooter(totalTime);

    // 退出程序
    process.exit(0);
  } catch (err) {
    console.error(chalk.red('❌ 转换失败:'), err);
    process.exit(1);
  }
}

// 格式化文件大小的辅助函数
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

main();

