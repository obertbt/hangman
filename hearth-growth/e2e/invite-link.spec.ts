import { expect, test } from '@playwright/test';

/**
 * 招待リンクが「実際に配られる形」で通ること。
 *
 * ここを単体テストだけに任せると取り逃す。
 * スキーマ単体では通るトークンでも、Next.js は経路の `=` を復号せず
 * `%3D` のまま渡すため、画面に届く時点では別の文字列になっていた。
 * 実際に URL を叩いて確かめないと分からない種類の不具合なので、E2E に置く。
 *
 * Supabase の用意は要らない。ここで見たいのは
 * 「形式検査で弾かれずに照合まで進むか」だけで、
 * 照合の結果（見つかる／見つからない）は別の話。
 */

/** 32byte 乱数を base64url にしたときの実際の長さ（43文字）。 */
const TOKEN = 'm8jtSqjLUEdeDr39_Ua9z4N3jn7PL3JhBOqq4IoSISQ';

const FORMAT_ERROR = 'この招待リンクは正しくありません';

test.describe('招待リンク', () => {
  test('詰め物付き（末尾 =）のリンクでも形式で弾かれない', async ({ page }) => {
    await page.goto(`/invite/${TOKEN}=`);
    await expect(page.getByText(FORMAT_ERROR)).toBeHidden();
  });

  test('%3D で符号化されて届いても形式で弾かれない', async ({ page }) => {
    await page.goto(`/invite/${TOKEN}%3D`);
    await expect(page.getByText(FORMAT_ERROR)).toBeHidden();
  });

  test('詰め物の無いリンクも形式で弾かれない', async ({ page }) => {
    await page.goto(`/invite/${TOKEN}`);
    await expect(page.getByText(FORMAT_ERROR)).toBeHidden();
  });

  test('符号化を戻した結果がパス操作になるものは弾く', async ({ page }) => {
    // 復号すると `../` を含む。復号したあとに検査していないと通ってしまう。
    await page.goto('/invite/%2E%2E%2F%2E%2E%2Fetc%2Fpasswdxxxxxxxxxx');
    await expect(page.getByText(FORMAT_ERROR)).toBeVisible();
  });

  test('短すぎるリンクは弾く', async ({ page }) => {
    await page.goto('/invite/short');
    await expect(page.getByText(FORMAT_ERROR)).toBeVisible();
  });
});
