import { describe, expect, it } from 'vitest';

import { buildEmbedUrl, extractYouTubeVideoId, thumbnailUrlFor, YouTubeVideoProvider } from './youtube';

const ID = 'dQw4w9WgXcQ';

describe('URL から動画IDを取り出す', () => {
  it('よくある形をすべて受け入れる', () => {
    const urls = [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
    ];

    for (const url of urls) {
      expect(extractYouTubeVideoId(url), url).toBe(ID);
    }
  });

  it('ID をそのまま貼っても受け入れる', () => {
    expect(extractYouTubeVideoId(ID)).toBe(ID);
  });

  it('前後の空白を無視する', () => {
    expect(extractYouTubeVideoId(`  https://youtu.be/${ID}  `)).toBe(ID);
  });

  it('再生位置つきの URL でも ID を取れる', () => {
    expect(extractYouTubeVideoId(`https://www.youtube.com/watch?v=${ID}&t=90s`)).toBe(ID);
    expect(extractYouTubeVideoId(`https://youtu.be/${ID}?t=90`)).toBe(ID);
  });

  it('再生リストつきの URL でも動画IDを取れる', () => {
    expect(extractYouTubeVideoId(`https://www.youtube.com/watch?v=${ID}&list=PLxxxx&index=2`)).toBe(ID);
  });

  it('YouTube 以外の URL は受け入れない', () => {
    expect(extractYouTubeVideoId('https://vimeo.com/123456')).toBeNull();
    expect(extractYouTubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('壊れた入力は null', () => {
    expect(extractYouTubeVideoId('')).toBeNull();
    expect(extractYouTubeVideoId('   ')).toBeNull();
    expect(extractYouTubeVideoId('ただの文章')).toBeNull();
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
  });

  it('11文字ちょうどでなければ ID とみなさない', () => {
    expect(extractYouTubeVideoId('dQw4w9WgXc')).toBeNull(); // 10文字
    expect(extractYouTubeVideoId('dQw4w9WgXcQQ')).toBeNull(); // 12文字
  });
});

describe('埋め込み URL の組み立て（仮想クリップ）', () => {
  it('範囲を指定しなければ位置を付けない', () => {
    const url = buildEmbedUrl(ID, null, null);
    expect(url).toContain(`/embed/${ID}`);
    expect(url).not.toContain('start=');
    expect(url).not.toContain('end=');
  });

  it('開始と終了を秒で載せる', () => {
    const url = new URL(buildEmbedUrl(ID, 754, 828));
    expect(url.searchParams.get('start')).toBe('754');
    expect(url.searchParams.get('end')).toBe('828');
  });

  it('小数の秒は開始を切り捨て、終了を切り上げる（場面が切れないように）', () => {
    const url = new URL(buildEmbedUrl(ID, 754.7, 828.2));
    expect(url.searchParams.get('start')).toBe('754');
    expect(url.searchParams.get('end')).toBe('829');
  });

  it('開始0は付けない（先頭から再生する）', () => {
    expect(buildEmbedUrl(ID, 0, null)).not.toContain('start=');
  });

  it('Cookie を置かない方のドメインを使う', () => {
    expect(buildEmbedUrl(ID, null, null)).toContain('youtube-nocookie.com');
  });
});

describe('YouTubeVideoProvider', () => {
  const provider = new YouTubeVideoProvider();

  it('仮想クリップに対応している', () => {
    expect(provider.supportsVirtualClip()).toBe(true);
  });

  it('再生元として埋め込み URL を返す', async () => {
    const source = await provider.createPlaybackSource({
      provider: 'youtube',
      providerVideoId: ID,
      startSeconds: 100,
      endSeconds: 130,
    });

    expect(source.kind).toBe('iframe');
    if (source.kind === 'iframe') {
      expect(source.url).toContain('start=100');
      expect(source.url).toContain('end=130');
    }
  });

  it('動画IDが無ければ再生できない', async () => {
    await expect(
      provider.createPlaybackSource({ provider: 'youtube', providerVideoId: null }),
    ).rejects.toThrow();
  });

  it('MVP では API を呼ばないので長さは分からない', async () => {
    const metadata = await provider.getMetadata({ provider: 'youtube', providerVideoId: ID });
    expect(metadata.durationSeconds).toBeNull();
    expect(metadata.thumbnailUrl).toBe(thumbnailUrlFor(ID));
  });
});
