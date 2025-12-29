import path from 'path';
import { execSync } from 'child_process';
import { NodeIO } from '@gltf-transform/core';
import draco3d from 'draco3d';
import { KHRDracoMeshCompression, KHRTextureBasisu } from '@gltf-transform/extensions';
import { prune, dedup, draco, textureCompress, weld, inspect } from '@gltf-transform/functions';
import ora from 'ora';
import { logStep, logInfo } from './logger.js';

/**
 * 转换 FBX 到临时 GLB
 */
export function convertFBXToGLB(inputFBX, tempGLB) {
  logStep('1/6', '转换 FBX → Raw GLB');
  const spinner = ora('正在执行 FBX2glTF 转换...').start();
  
  try {
    execSync(`FBX2glTF -b -i "${inputFBX}" -o "${tempGLB}"`, { 
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    spinner.succeed('FBX 转换完成');
    return true;
  } catch (error) {
    spinner.fail('FBX 转换失败');
    throw new Error(`FBX2glTF 转换失败: ${error.message}`);
  }
}

/**
 * 初始化 GLTF Transform IO
 */
export async function initGLTFTransform() {
  logStep('2/6', '初始化 GLTF Transform 引擎');
  const spinner = ora('正在加载扩展和依赖...').start();
  
  const io = new NodeIO()
    .registerExtensions([KHRDracoMeshCompression, KHRTextureBasisu])
    .registerDependencies({
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'draco3d.decoder': await draco3d.createDecoderModule(),
    });
  
  spinner.succeed('引擎初始化完成');
  logInfo('已注册扩展', 'Draco, KTX2/BasisU');
  
  return io;
}

/**
 * 读取 GLB 文档
 */
export async function readGLBDocument(io, tempGLB) {
  logStep('3/6', '读取并解析 GLB 文件');
  const spinner = ora('正在读取 GLB 文档...').start();
  
  const document = await io.read(tempGLB);
  
  spinner.succeed('GLB 文件读取完成');
  
  return document;
}

/**
 * 执行场景优化
 */
export async function optimizeScene(document) {
  logStep('4/6', '执行场景优化');
  const spinner = ora('正在应用优化管道 (weld + prune + dedup)...').start();
  
  await document.transform(
    weld({ tolerance: 0.0001 }), // 顶点焊接-> 合并顶点
    prune(), // 场景瘦身->清理无用数据
    dedup() // 数据去重 (复用 Accessor/Mesh)
  );
  
  spinner.succeed('场景优化完成');
  logInfo('已应用优化', '顶点焊接、场景清理、数据去重');
}

/**
 * 应用压缩算法
 */
export async function applyCompression(document, options) {
  if (!options.draco && !options.ktx2) {
    logStep('5/6', '跳过压缩步骤');
    logInfo('压缩选项', '未启用任何压缩算法');
    return;
  }
  
  logStep('5/6', '应用压缩算法');
  
  if (options.draco) {
    const spinner = ora('正在应用 Draco 几何压缩...').start();
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
    spinner.succeed('Draco 压缩完成');
    logInfo('压缩配置', 'Edgebreaker 方法，量化位深已优化');
  }

  if (options.ktx2) {
    const spinner = ora('正在应用 KTX2/BasisU 贴图压缩...').start();
    await document.transform(
      textureCompress({
        encoder: 'basisu',
        format: 'UASTC',
        quality: 128,
        resize: [options.maxTex, options.maxTex]
      })
    );
    spinner.succeed('KTX2 压缩完成');
    logInfo('压缩配置', `UASTC 格式，质量 128，最大尺寸 ${options.maxTex}px`);
  }
}

/**
 * 写入最终 GLB 文件
 */
export async function writeGLB(io, document, outputGLB) {
  logStep('6/6', '写入最终 GLB 文件');
  const spinner = ora(`正在写入输出文件: ${path.basename(outputGLB)}...`).start();
  
  await io.write(outputGLB, document);
  
  spinner.succeed('文件写入完成');
}

/**
 * 分析文档数据
 */
export function inspectDocument(document) {
  return inspect(document, {
    meshes: true,
    geometry: true,
    buffers: true,
    materials: true,
  });
}

