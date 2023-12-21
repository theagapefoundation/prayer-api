import { Test } from '@nestjs/testing';
import { AppModule } from 'src/app.module';
import { BiblesService } from './bibles.service';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

describe('BiblesController', () => {
  let app: NestFastifyApplication;
  let service: BiblesService;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    service = module.get(BiblesService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('GET /bibles/translations', async () => {
    const serviceSpied = jest.spyOn(service, 'fetchTranslations');
    serviceSpied.mockImplementationOnce(async () => ({
      data: [
        {
          lang: 'en',
          id: 1,
          abbreviation: 'KJV',
          name: 'King James Version',
        },
      ],
      cursor: {
        lang: 'ko',
        id: 2,
        abbreviation: 'KRV',
        name: '개역한글',
      },
    }));
    const result = await app.inject({
      method: 'GET',
      url: '/bibles/translations',
    });
    expect(serviceSpied).toHaveBeenCalled();
    expect(result.statusCode).toEqual(200);
    expect(result.json()['createdAt']).toBeTruthy();
    expect(result.json()['data']).toHaveLength(1);
    expect(result.json()['cursor']).toBeTruthy();
  });

  it('GET /bibles/books/:bookId/chapters/:chapterId', async () => {
    const serviceSpied = jest.spyOn(service, 'fetchVerseOfTheChapter');
    serviceSpied.mockImplementationOnce(async () => [
      {
        id: 1,
        translation_id: 1,
        verse_id: 1,
        book: 'acts',
        chapter: 1,
        verse: 2,
        value: 'test',
      },
    ]);
    const result = await app.inject({
      method: 'GET',
      url: '/bibles/books/genesis/chapters/5',
    });
    expect(serviceSpied).toHaveBeenCalled();
    expect(result.statusCode).toEqual(200);
    expect(result.json()['data']).toHaveLength(1);
    expect(result.json()['created_at']).toBeTruthy();
  });

  it('GET /bibles/verses/:verseId', async () => {
    const serviceSpied = jest.spyOn(service, 'fetchVerse');
    serviceSpied.mockImplementationOnce(async () => ({
      id: 1,
      translation_id: 1,
      verse_id: 1,
      book: 'acts',
      chapter: 1,
      verse: 2,
      value: 'test',
    }));
    const result = await app.inject({
      method: 'GET',
      url: '/bibles/verses/1',
    });
    expect(serviceSpied).toHaveBeenCalled();
    expect(result.statusCode).toEqual(200);
    expect(result.json()['data']['value']).toBe('test');
    expect(result.json()['created_at']).toBeTruthy();
  });

  afterAll(async () => {
    await app.close();
  });
});
