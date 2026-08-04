import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BottomNav } from './bottom-nav';

const pathname = vi.hoisted(() => ({ current: '/home' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
}));

describe('BottomNav', () => {
  it('5つの導線を出す', () => {
    render(<BottomNav />);
    for (const label of ['ホーム', 'タイムライン', '活動開始', '記録', 'マイページ']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('現在地に aria-current を付ける', () => {
    pathname.current = '/timeline';
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: 'タイムライン' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'ホーム' })).not.toHaveAttribute('aria-current');
  });

  it('下位ページにいてもその親を現在地として扱う', () => {
    pathname.current = '/activities/123';
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '記録' })).toHaveAttribute('aria-current', 'page');
  });
});
