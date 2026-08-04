/**
 * Server Action の戻り値。
 *
 * 例外を投げっぱなしにせず、画面に出せるメッセージへ変換して返す。
 * ここに載せるのは利用者向けの文言だけで、内部情報は含めない（20章）。
 */
export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? { data?: undefined } : { data: T }))
  | { ok: false; message: string; field?: string };

export function ok(): ActionResult;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data } as ActionResult<T>;
}

export function fail(message: string, field?: string): ActionResult<never> {
  return { ok: false, message, field };
}
