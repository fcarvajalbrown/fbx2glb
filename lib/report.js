import path from 'path';
import ora from 'ora';
import { inspectDocument } from './transform.js';
import { generateComparison, analyzeComparison, printComparisonReport } from './compare.js';
import { saveInspectData } from './utils.js';
import { logFileInfo, logAnalysisTitle } from './logger.js';

/**
 * 生成并保存优化报告
 */
export async function generateReport(document, outputGLB, beforeInspect, options) {
  logAnalysisTitle();
  const spinner = ora('正在分析优化后数据...').start();
  
  // 分析优化后数据
  const afterInspect = inspectDocument(document);
  
  // 保存文件
  const afterFile = path.join(path.dirname(outputGLB), 'inspect_after.json');
  saveInspectData(afterInspect, afterFile);
  
  const comparison = generateComparison(beforeInspect, afterInspect);
  const comparisonFile = path.join(path.dirname(outputGLB), 'comparison.json');
  saveInspectData(comparison, comparisonFile);
  
  spinner.succeed('数据分析完成');
  logFileInfo(afterFile, '优化后数据');
  logFileInfo(comparisonFile, '对比报告');
  
  // 生成格式化报告
  const analysis = analyzeComparison(beforeInspect, afterInspect, {
    draco: options.draco,
    ktx2: options.ktx2
  });
  printComparisonReport(analysis);
}

