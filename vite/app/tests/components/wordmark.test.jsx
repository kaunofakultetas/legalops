// -----------------------------------------------------------
//  [*] Tests — Wordmark (the brand's mark and name)
//
//  The mosaic mark: four tiles in reading order — the quarter
//  disc in ink, the two squares in the middle blue, the
//  quarter disc in the yellow — hidden from assistive
//  technology, drawn at the size asked for with its margin
//  cropped, so the tiles fill the box; reversed for the ink
//  bar (white, pale blue, the yellow kept). The wordmark: the
//  name as plain text beside it, white on ink. Then where the
//  brand shows: the top bar wears the reversed mark, the
//  sign-in sheet the plain one, and the favicon and the
//  browser's theme colour carry the same colours.
// -----------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { screen, within } from '@testing-library/react';
import { renderPage, authData } from '../support/render';
import Wordmark, { Mark } from '@/components/layout/Wordmark';
import Navbar from '@/components/layout/Navbar';
import Login from '@/pages/Login/Login';


// The mark on paper and reversed on ink, tile by tile
const ON_PAPER = ['#173A6E', '#3E6FB0', '#3E6FB0', '#FFD84A'];
const ON_INK = ['#FFFFFF', '#8FB1E3', '#8FB1E3', '#FFD84A'];

// The fill of each tile of a drawn mark
const tiles = (svg) => [...svg.children].map((tile) => tile.getAttribute('fill'));

// The mark drawn beside a wordmark's name
const markBeside = (name) => screen.getByText(name).previousElementSibling;

// A file of the app, read as text
const appFile = (...parts) => readFileSync(join(process.cwd(), ...parts), 'utf8');







// -----------------------------------------------------------
// the mark
// -----------------------------------------------------------

describe('Mark', () => {

  it('draws the four tiles in the brand colours, hidden from assistive technology', () => {
    const { container } = renderPage(<Mark size={24} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(tiles(svg)).toEqual(ON_PAPER);
  });


  it('fills the size it is given, its margin cropped by the view box', () => {
    const { container } = renderPage(<Mark size={40} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '40');
    expect(svg).toHaveAttribute('height', '40');
    expect(svg).toHaveAttribute('viewBox', '8 8 48 48');
  });


  it('reverses for an ink ground: white and pale blue, the yellow kept', () => {
    const { container } = renderPage(<Mark size={24} onDark />);
    expect(tiles(container.querySelector('svg'))).toEqual(ON_INK);
  });
});







// -----------------------------------------------------------
// the wordmark
// -----------------------------------------------------------

describe('Wordmark', () => {

  it('sets the name as plain text in the serif beside the mark', () => {
    renderPage(<Wordmark name="Compliance assistant" />);
    const name = screen.getByText('Compliance assistant');
    expect(name).toHaveClass('font-serif', 'text-content', 'truncate');
    expect(tiles(markBeside('Compliance assistant'))).toEqual(ON_PAPER);
  });


  it('turns white with the reversed mark on ink', () => {
    renderPage(<Wordmark name="Compliance assistant" onDark />);
    expect(screen.getByText('Compliance assistant')).toHaveClass('text-white');
    expect(tiles(markBeside('Compliance assistant'))).toEqual(ON_INK);
  });
});







// -----------------------------------------------------------
// where the brand shows
// -----------------------------------------------------------

describe('the brand in the app', () => {

  it('the ink top bar wears the reversed mark inside its link home', () => {
    renderPage(<Navbar authData={authData} />);
    const home = within(screen.getByRole('banner')).getByRole('link', { name: 'Compliance assistant — home' });
    expect(tiles(home.querySelector('svg'))).toEqual(ON_INK);
  });


  it('the sign-in sheet wears the mark on paper', () => {
    renderPage(<Login />, { route: '/login', path: '/login' });
    expect(tiles(markBeside('Compliance assistant'))).toEqual(ON_PAPER);
  });


  it('the favicon is the reversed mosaic on an ink tile, and the browser chrome takes the ink', () => {
    const favicon = appFile('public', 'favicon.svg');
    const fills = [...favicon.matchAll(/fill="(#[0-9A-F]{6})"/gi)].map((match) => match[1].toUpperCase());
    expect(fills).toEqual(['#173A6E', ...ON_INK]);
    expect(appFile('index.html')).toContain('<meta name="theme-color" content="#173A6E" />');
  });
});
