import * as fs from 'node:fs/promises';
import path from 'node:path';
import iconv from 'iconv-lite';
import { isBinary } from 'istextorbinary';
import jschardet from 'jschardet';
import pMap from 'p-map';
import { logger } from '../../shared/logger.js';
import { getProcessConcurrency } from '../../shared/processConcurrency.js';
import type { RawFile } from './fileTypes.js';

// Maximum file size to process (50MB)
// This prevents out-of-memory errors when processing very large files
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const collectFiles = async (filePaths: string[], rootDir: string): Promise<RawFile[]> => {
  const rawFiles = await pMap(
    filePaths,
    async (filePath) => {
      const fullPath = path.resolve(rootDir, filePath);
      const content = await readRawFile(fullPath);
      if (content) {
        return { path: filePath, content };
      }
      return null;
    },
    {
      concurrency: getProcessConcurrency(),
    },
  );

  return rawFiles.filter((file): file is RawFile => file != null);
};

const readRawFile = async (filePath: string): Promise<string | null> => {
  try {
    const stats = await fs.stat(filePath);

    if (stats.size > MAX_FILE_SIZE) {
      const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
      logger.log('⚠️ Large File Warning:');
      logger.log('────────────────────────────────────────────────');
      logger.log(`File exceeds size limit: ${sizeMB}MB > ${MAX_FILE_SIZE / 1024 / 1024}MB (${filePath})`);
      logger.note('Add this file to .repomixignore if you want to exclude it permanently');
      logger.log('');
      return null;
    }

    if (isBinary(filePath)) {
      logger.debug(`Skipping binary file: ${filePath}`);
      return null;
    }

    logger.trace(`Reading file: ${filePath}`);

    const buffer = await fs.readFile(filePath);

    if (isBinary(null, buffer)) {
      logger.debug(`Skipping binary file (content check): ${filePath}`);
      return null;
    }

    const encoding = jschardet.detect(buffer).encoding || 'utf-8';
    const content = iconv.decode(buffer, encoding);

    return content;
  } catch (error) {
    logger.warn(`Failed to read file: ${filePath}`, error);
    return null;
  }
};
