import { defineConfig } from "cypress";
import fs from 'fs';
import { PNG } from 'pngjs';
import pixelmatch from "pixelmatch";

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:9876',
    setupNodeEvents(on, config) {
      on('task', {
        comparePngs({ base, compare, diffPath }) {
          const imgBase = PNG.sync.read(fs.readFileSync(base));
          const imgCompare = PNG.sync.read(fs.readFileSync(compare));
          const { width, height } = imgBase;
          const diff = new PNG({ width, height });
    
          const diffPixelCount = pixelmatch(
            imgBase.data,
            imgCompare.data,
            diff.data,
            width,
            height,
            { threshold: 0.075 }
          );
          fs.writeFileSync(diffPath, PNG.sync.write(diff));
    
          return diffPixelCount;
        },
      })
    },
  },
})
