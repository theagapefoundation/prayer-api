import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { BiblesService } from './bibles.service';
import { ResponseInterceptor } from 'src/response.interceptor';

@Controller('bibles')
export class BiblesController {
  constructor(private readonly appService: BiblesService) {}

  @Get('translations')
  async fetchAllTransitions(
    @Query('lang') lang?: string,
    @Query('cursor') cursor?: number,
  ) {
    const { data, cursor: newCursor } = await this.appService.fetchTranslations(
      { lang, cursor },
    );
    return {
      createdAt: new Date().toISOString(),
      data,
      cursor: newCursor,
    };
  }

  @UseInterceptors(ResponseInterceptor)
  @Get('books/:bookId/chapters/:chapterId')
  async fetchVersesOfTheChapter(
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: number,
    @Query('translationId') translationId?: number,
  ) {
    const bookParam = bookId
      .toLowerCase()
      .replace('1 ', 'first_')
      .replace('2 ', 'second_')
      .replace('3 ', 'third_')
      .replace('song of songs', 'song_of_solomon');
    const data = await this.appService.fetchVerseOfTheChapter({
      translationId: translationId ?? 1,
      book: bookParam,
      chapter: chapterId,
    });
    return data;
  }

  @UseInterceptors(ResponseInterceptor)
  @Get('verses/:verseId')
  async fetchVerses(
    @Param('verseId') verseId: number,
    @Query('translationId') translationId?: number,
  ) {
    const data = await this.appService.fetchVerse({
      id: verseId,
      translationId: translationId ?? 1,
    });
    return data;
  }
}
