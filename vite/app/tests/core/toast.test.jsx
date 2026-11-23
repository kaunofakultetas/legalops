// -----------------------------------------------------------
//  [*] Tests — utils/toast (each toast as long as it takes to
//      read)
//
//  toastDuration: a short confirmation goes quickly, a longer
//  message stays longer and never past the cap, an error
//  never goes before four seconds, white space counts once,
//  and the words of React elements are read out of them. The
//  toast itself: success, error and the plain toast reach
//  react-hot-toast with that duration (the library mocked
//  here), a caller's own options kept and its own duration
//  winning, and the library's other functions passed through.
// -----------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';

const library = vi.hoisted(() => {
  const plain = vi.fn(() => 'plain-id');
  return Object.assign(plain, { success: vi.fn(() => 'success-id'), error: vi.fn(() => 'error-id'), dismiss: vi.fn() });
});

vi.mock('react-hot-toast', () => ({ default: library }));

const { default: toast, toastDuration } = await import('@/utils/toast');


// The toast that names what a user's delete removed — the
// longest confirmation of the app
const DELETED = 'Naudotojas Jonas Naudotojas ištrintas su visais duomenimis (įmonės: 1, ataskaitos: 2, dokumentai: 5, pokalbiai: 0)';


beforeEach(() => {
  library.mockClear();
  library.success.mockClear();
  library.error.mockClear();
});







// -----------------------------------------------------------
// toastDuration
// -----------------------------------------------------------

describe('toastDuration', () => {

  it('a short confirmation goes after a second and a half; a longer one stays longer, a second plus 25 ms a character', () => {
    expect(toastDuration('Išsaugota', 'success')).toBe(1500);
    expect(toastDuration('Naudotojas sukurtas', 'success')).toBe(1500);
    expect(toastDuration(DELETED, 'success')).toBe(1000 + DELETED.length * 25);
    expect(toastDuration(DELETED, 'success')).toBeGreaterThan(3500);
  });


  it('nothing stays past the cap — eight seconds, nine for an error', () => {
    expect(toastDuration('ž'.repeat(1000), 'success')).toBe(8000);
    expect(toastDuration('ž'.repeat(1000))).toBe(8000);
    expect(toastDuration('ž'.repeat(1000), 'error')).toBe(9000);
  });


  it('an error never goes before four seconds, and a long one stays longer', () => {
    expect(toastDuration('Klaida', 'error')).toBe(4000);
    expect(toastDuration('Pirmiausia atšaukite vykdomą analizę arba dokumento generavimą.', 'error')).toBe(4000);
    const long = 'Laikykite mygtuką nuspaustą 2 sek., kad ištrintumėte naudotoją su visais duomenimis. '.repeat(2);
    expect(toastDuration(long, 'error')).toBe(1000 + long.trim().length * 25);
  });


  it('counts a run of white space once, reads the words out of React elements, and takes an unknown kind as a plain toast', () => {
    expect(toastDuration('  Išsaugota  \n\n  vėl  ', 'success')).toBe(toastDuration('Išsaugota vėl', 'success'));
    const element = <span><b>Hold 2 seconds</b> to delete {DELETED}</span>;
    expect(toastDuration(element, 'success')).toBe(toastDuration(`Hold 2 seconds to delete ${DELETED}`, 'success'));
    expect(toastDuration(<svg aria-hidden />, 'error')).toBe(4000);
    expect(toastDuration(null)).toBe(1500);
    expect(toastDuration(DELETED, 'whatever')).toBe(toastDuration(DELETED));
  });
});







// -----------------------------------------------------------
// toast
// -----------------------------------------------------------

describe('toast', () => {

  it('success, error and the plain toast reach the library with the duration of their words', () => {
    expect(toast.success('Išsaugota')).toBe('success-id');
    expect(library.success).toHaveBeenCalledWith('Išsaugota', { duration: 1500 });
    expect(toast.error('Klaida')).toBe('error-id');
    expect(library.error).toHaveBeenCalledWith('Klaida', { duration: 4000 });
    expect(toast(DELETED)).toBe('plain-id');
    expect(library).toHaveBeenCalledWith(DELETED, { duration: 1000 + DELETED.length * 25 });
  });


  it('keeps a caller\'s own options, and a caller\'s own duration wins', () => {
    toast.error('Klaida', { id: 'Klaida' });
    expect(library.error).toHaveBeenCalledWith('Klaida', { id: 'Klaida', duration: 4000 });
    toast.success('Išsaugota', { duration: 10_000 });
    expect(library.success).toHaveBeenCalledWith('Išsaugota', { duration: 10_000 });
  });


  it('passes the library\'s other functions through as they are', () => {
    toast.dismiss('x');
    expect(library.dismiss).toHaveBeenCalledWith('x');
  });
});
