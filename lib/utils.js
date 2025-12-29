import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

/**
 * 解析输入输出文件路径
 */
export function parseFilePaths(inputFBX, outputOption) {
  const inputDir = path.dirname(inputFBX);
  const baseName = path.basename(inputFBX, path.extname(inputFBX));
  const outputGLB = outputOption || path.join(inputDir, `${baseName}_${Date.now()}.glb`);
  const tempGLB = path.join(path.dirname(outputGLB), 'temp_raw.glb');
  
  return {
    inputFBX,
    outputGLB,
    tempGLB,
    baseName,
    inputDir
  };
}

/**
 * 验证输入文件是否存在
 */
export function validateInputFile(inputFBX) {
  if (!fs.existsSync(inputFBX)) {
    throw new Error(`输入文件不存在: ${inputFBX}`);
  }
}

/**
 * 保存 inspect 数据到文件
 */
export function saveInspectData(data, filePath) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 清理临时文件
 */
export function cleanupTempFile(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

/**
 * 检测 FBX2glTF 工具是否可用
 */
export function checkFBX2glTF() {
  try {
    // 尝试执行 FBX2glTF 命令，检查是否可用
    execSync('FBX2glTF --version', { 
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    return true;
  } catch (error) {
    return false;
  }
}

