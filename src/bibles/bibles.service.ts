import { Injectable } from '@nestjs/common';
import { KyselyService } from 'src/kysely/kysely.service';

@Injectable()
export class BiblesService {
  constructor(private dbService: KyselyService) {}

  async fetchTranslations(params?: { lang?: string; cursor?: number }) {
    const data = await this.dbService
      .selectFrom('bible_translations')
      .$if(!!params?.lang, (eb) => eb.where('lang', '=', params!.lang!))
      .$if(!!params?.cursor, (eb) => eb.where('id', '>', params!.cursor!))
      .orderBy('id asc')
      .limit(11)
      .selectAll()
      .execute();
    const newCursor = data.length < 11 ? null : data.pop();
    return { data, cursor: newCursor };
  }

  fetchVerseOfTheChapter({
    translationId = 1,
    book,
    chapter,
  }: {
    translationId: number;
    book: string;
    chapter: number;
  }) {
    return this.dbService
      .selectFrom('bible_verses')
      .where('bible_verses.translation_id', '=', translationId)
      .where('bible_verses.book', '=', book as any)
      .where('bible_verses.chapter', '=', chapter)
      .selectAll()
      .orderBy('verse asc')
      .execute();
  }

  fetchVerse({ id, translationId = 1 }: { id: number; translationId: number }) {
    return this.dbService
      .selectFrom('bible_verses')
      .where('bible_verses.translation_id', '=', translationId)
      .where('bible_verses.verse_id', '=', id)
      .selectAll()
      .executeTakeFirst();
  }
}
