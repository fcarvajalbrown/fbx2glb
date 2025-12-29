import chalk from 'chalk';

/**
 * 对比分析前后数据并生成格式化报告
 * @param {Object} beforeInspect - 优化前的 inspect 数据
 * @param {Object} afterInspect - 优化后的 inspect 数据
 * @param {Object} options - 优化选项（draco, ktx2 等）
 * @returns {Object} 分析结果
 */
export function analyzeComparison(beforeInspect, afterInspect, options = {}) {
  const analysis = {
    vertices: analyzeVertices(beforeInspect, afterInspect),
    uv: analyzeUV(beforeInspect, afterInspect),
    geometry: analyzeGeometry(beforeInspect, afterInspect),
    materials: analyzeMaterials(beforeInspect, afterInspect),
    animations: analyzeAnimations(beforeInspect, afterInspect),
    textures: analyzeTextures(beforeInspect, afterInspect, options),
    highlights: []
  };

  // 生成优化重点说明
  analysis.highlights = generateHighlights(analysis, options);

  return analysis;
}

/**
 * 分析顶点数变化
 */
function analyzeVertices(before, after) {
  // 优先使用 scenes 中的 uploadVertexCount，如果没有则使用 meshes 中的 vertices 总和
  const beforeVertices = getUploadVertexCount(before) || getTotalVertices(before);
  const afterVertices = getUploadVertexCount(after) || getTotalVertices(after);
  const diff = afterVertices - beforeVertices;
  const percent = beforeVertices > 0 ? ((diff / beforeVertices) * 100).toFixed(1) : '0.0';

  return {
    before: beforeVertices,
    after: afterVertices,
    diff,
    percent: `${percent}%`
  };
}

/**
 * 分析 UV 属性变化
 */
function analyzeUV(before, after) {
  const beforeUVCount = countMeshesWithUV(before);
  const afterUVCount = countMeshesWithUV(after);
  const totalMeshes = getMeshCount(before);
  
  let change = '0%';
  if (beforeUVCount > 0 && afterUVCount === 0) {
    change = '100% 删除';
  } else if (beforeUVCount > 0 && afterUVCount < beforeUVCount) {
    const deleted = beforeUVCount - afterUVCount;
    change = `${((deleted / beforeUVCount) * 100).toFixed(1)}% 删除`;
  } else if (afterUVCount > beforeUVCount) {
    change = `${(((afterUVCount - beforeUVCount) / beforeUVCount) * 100).toFixed(1)}% 增加`;
  }

  return {
    before: beforeUVCount,
    after: afterUVCount,
    totalMeshes,
    change
  };
}

/**
 * 分析几何体体积变化
 */
function analyzeGeometry(before, after) {
  const beforeSize = getTotalGeometrySize(before);
  const afterSize = getTotalGeometrySize(after);
  const diff = afterSize - beforeSize;
  const percent = beforeSize > 0 ? ((diff / beforeSize) * 100).toFixed(1) : '0.0';

  return {
    before: beforeSize,
    after: afterSize,
    beforeMB: (beforeSize / 1024 / 1024).toFixed(2),
    afterMB: (afterSize / 1024 / 1024).toFixed(2),
    diff,
    diffMB: (diff / 1024 / 1024).toFixed(2),
    percent: `${percent}%`
  };
}

/**
 * 分析材质数量变化
 */
function analyzeMaterials(before, after) {
  const beforeCount = getMaterialCount(before);
  const afterCount = getMaterialCount(after);
  const diff = afterCount - beforeCount;
  
  let reason = '';
  if (diff < 0) {
    reason = '（dedup）';
  } else if (diff > 0) {
    reason = '（增加）';
  }

  return {
    before: beforeCount,
    after: afterCount,
    diff,
    reason
  };
}

/**
 * 分析动画保留情况
 */
function analyzeAnimations(before, after) {
  const beforeAnimations = before.animations?.properties?.length || 0;
  const afterAnimations = after.animations?.properties?.length || 0;
  
  return {
    before: beforeAnimations,
    after: afterAnimations,
    preserved: beforeAnimations === afterAnimations && beforeAnimations > 0
  };
}

/**
 * 分析贴图情况
 */
function analyzeTextures(before, after, options) {
  const beforeTextures = countTextures(before);
  const afterTextures = countTextures(after);
  const hasTextures = beforeTextures > 0 || afterTextures > 0;
  
  let ktx2Status = '';
  if (options.ktx2) {
    ktx2Status = hasTextures ? '已应用' : '不适用（无贴图模型）';
  } else {
    ktx2Status = hasTextures ? '未启用' : '不适用（无贴图模型）';
  }

  return {
    before: beforeTextures,
    after: afterTextures,
    hasTextures,
    ktx2Status
  };
}

/**
 * 生成优化重点说明
 */
function generateHighlights(analysis, options) {
  const highlights = [];

  // UV 删除说明
  if (analysis.uv.change.includes('删除')) {
    highlights.push('体积下降主要来自 prune 删除无用 UV');
  }

  // 材质去重说明
  if (analysis.materials.diff < 0) {
    highlights.push(`材质通过 dedup 从 ${analysis.materials.before} 减少到 ${analysis.materials.after}`);
  }

  // 几何压缩说明
  if (options.draco) {
    highlights.push('Draco 几何压缩已应用');
  }

  // 贴图压缩说明
  if (options.ktx2 && analysis.textures.hasTextures) {
    highlights.push('KTX2 贴图压缩已应用');
  }

  return highlights;
}

/**
 * 打印格式化报告
 */
export function printComparisonReport(analysis) {
  console.log(chalk.cyan('\n📊 本次 FBX → GLB 优化中：\n'));

  // 顶点数
  const vertexPercent = parseFloat(analysis.vertices.percent);
  const vertexChange = Math.abs(vertexPercent) < 0.1
    ? chalk.gray('0% 变化')
    : analysis.vertices.diff > 0 
      ? chalk.yellow(`${analysis.vertices.percent} 增加`)
      : chalk.green(`${analysis.vertices.percent} 减少`);
  console.log(`顶点数：${vertexChange}`);

  // UV 属性
  const uvChange = analysis.uv.change.includes('删除')
    ? chalk.green(analysis.uv.change)
    : analysis.uv.change.includes('增加')
      ? chalk.yellow(analysis.uv.change)
      : chalk.gray(analysis.uv.change);
  console.log(`UV 属性：${uvChange}`);

  // 几何体体积
  const geometryChange = analysis.geometry.percent.startsWith('-')
    ? chalk.green(analysis.geometry.percent)
    : analysis.geometry.percent.startsWith('+')
      ? chalk.yellow(analysis.geometry.percent)
      : chalk.gray(analysis.geometry.percent);
  console.log(`几何体体积：${geometryChange}`);

  // 材质数量
  const materialText = analysis.materials.diff === 0
    ? `${analysis.materials.before} → ${analysis.materials.after}（无变化）`
    : `${analysis.materials.before} → ${analysis.materials.after}${chalk.cyan(analysis.materials.reason)}`;
  console.log(`材质数量：${materialText}`);

  // 动画
  if (analysis.animations.before > 0) {
    const animStatus = analysis.animations.preserved
      ? chalk.green('完整保留')
      : chalk.yellow(`部分保留（${analysis.animations.after}/${analysis.animations.before}）`);
    console.log(`动画${animStatus}`);
  } else {
    console.log(`动画：${chalk.gray('无动画数据')}`);
  }

  // 贴图
  if (!analysis.textures.hasTextures) {
    console.log(chalk.gray('无贴图模型，KTX2 不适用'));
  } else {
    const textureStatus = analysis.textures.ktx2Status.includes('已应用')
      ? chalk.green(analysis.textures.ktx2Status)
      : chalk.yellow(analysis.textures.ktx2Status);
    console.log(`KTX2 贴图压缩：${textureStatus}`);
  }

  // 优化重点
  if (analysis.highlights.length > 0) {
    console.log(chalk.cyan('\n👉 优化重点：'));
    analysis.highlights.forEach(highlight => {
      console.log(chalk.white(`   • ${highlight}`));
    });
  }

  console.log(''); // 空行
}

// ========== 辅助函数 ==========

function getTotalVertices(inspect) {
  if (!inspect.meshes?.properties) return 0;
  return inspect.meshes.properties.reduce((sum, mesh) => sum + (mesh.vertices || 0), 0);
}

function countMeshesWithUV(inspect) {
  if (!inspect.meshes?.properties) return 0;
  return inspect.meshes.properties.filter(mesh => 
    mesh.attributes?.some(attr => attr.startsWith('TEXCOORD'))
  ).length;
}

function getMeshCount(inspect) {
  return inspect.meshes?.properties?.length || 0;
}

function getTotalGeometrySize(inspect) {
  if (!inspect.meshes?.properties) return 0;
  return inspect.meshes.properties.reduce((sum, mesh) => sum + (mesh.size || 0), 0);
}

function getMaterialCount(inspect) {
  return inspect.materials?.properties?.length || 0;
}

function countTextures(inspect) {
  // 检查 textures 对象
  if (inspect.textures?.properties && Array.isArray(inspect.textures.properties)) {
    return inspect.textures.properties.length;
  }
  // 如果没有 textures 对象，检查 materials 中的 textures
  if (inspect.materials?.properties) {
    let count = 0;
    inspect.materials.properties.forEach(material => {
      if (material.textures && Array.isArray(material.textures)) {
        count += material.textures.length;
      }
    });
    return count;
  }
  return 0;
}

function getUploadVertexCount(inspect) {
  if (inspect.scenes?.properties && inspect.scenes.properties.length > 0) {
    return inspect.scenes.properties[0].uploadVertexCount || 0;
  }
  return 0;
}

/**
 * 生成对比报告（用于 JSON 文件保存）
 */
export function generateComparison(before, after) {
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

