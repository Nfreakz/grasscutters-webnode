import fs from 'node:fs';
import path from 'node:path';
import type { RatingStore } from './ratingStore';
import type { RatingsSnapshot } from './types';

export class LocalJsonRatingStore implements RatingStore {
  kind = 'json' as const;
  private readonly filePath: string;

  constructor() {
    this.filePath = path.join(process.cwd(), 'data', 'gc-ratings', 'rating-store.json');
  }

  async load() {
    if (!fs.existsSync(this.filePath)) return null;
    return JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as RatingsSnapshot;
  }

  async save(snapshot: RatingsSnapshot) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
    fs.renameSync(tempPath, this.filePath);
  }
}

