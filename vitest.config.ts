import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: [
      'src/lib/katexVisualExtract/**/*.test.ts',
      'src/lib/persistenceQa.test.ts',
      'src/lib/notebookImagePersist.test.ts',
      'src/lib/freeSpaceLocalMerge.test.ts',
      'src/lib/sync/**/*.test.ts',
    ],
  },
});
