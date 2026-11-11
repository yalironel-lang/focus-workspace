import { mergeConfig } from 'vitest/config';
import base from '../../../vitest.config';
export default mergeConfig(base, { envDir: false, test: { exclude: ['**/node_modules/**', '**/*.live.test.*'], maxWorkers: 2, fileParallelism: false } });
