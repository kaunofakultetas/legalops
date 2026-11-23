// -----------------------------------------------------------
//  [*] Tests — the login page's particles backdrop
//         (pages/Login/Particles.jsx)
//
//  The dots-and-lines layer behind the sign-in sheet, with
//  tsparticles itself replaced by a probe that records the
//  props it is handed (jsdom draws no canvas, and the engine
//  would spin a frame loop for nothing). Nothing renders
//  where a canvas gives no 2D context — the setup's own stub
//  is that browser. With a context: one layer, hidden from
//  assistive technology and transparent to the pointer; the
//  scene in white over the page's gradient, linked, drifting,
//  pushed aside by the cursor through the window, sized to
//  its layer, one dot per 10 px of the viewport; still and
//  deaf to the cursor under "reduce motion"; the slim bundle
//  loaded into the engine the library hands over. And the
//  login page mounts it lazily, behind the sheet, inside its
//  main, on the theme's ink gradient.
// -----------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderPage } from '../support/render';
import { mediaQueryMatches } from '../support/setup';
import { COLORS } from '@/theme';
import LoginParticles from '@/pages/Login/Particles';
import Login from '@/pages/Login/Login';


// The props each render handed the tsparticles component
const scenes = vi.hoisted(() => []);

vi.mock('react-tsparticles', () => ({
  default: (props) => {
    scenes.push(props);
    return <div data-testid="particles-scene" id={props.id} className={props.className} />;
  },
}));

vi.mock('tsparticles-slim', () => ({ loadSlim: vi.fn(async () => {}) }));

// A canvas that hands out a 2D context, for one test
const withCanvas = () => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({});

// The options of the newest render
const lastOptions = () => scenes.at(-1).options;







// -----------------------------------------------------------
// the layer
// -----------------------------------------------------------

describe('LoginParticles — the layer', () => {

  it('draws nothing where a canvas gives no 2D context', () => {
    scenes.length = 0;
    const { container } = renderPage(<LoginParticles />);
    expect(container.querySelector('#login-particles')).toBeNull();
    expect(scenes).toHaveLength(0);
  });


  it('is one layer over the page, hidden from assistive technology and transparent to the pointer', () => {
    withCanvas();
    renderPage(<LoginParticles />);
    const scene = screen.getByTestId('particles-scene');
    const layer = scene.parentElement;
    expect(layer).toHaveAttribute('aria-hidden');
    expect(layer).toHaveClass('absolute', 'inset-0', 'pointer-events-none');
    expect(scene).toHaveAttribute('id', 'login-particles');
  });
});







// -----------------------------------------------------------
// the scene
// -----------------------------------------------------------

describe('LoginParticles — the scene', () => {

  it('links drifting white dots, sized to its layer, pushed aside by the cursor through the window', () => {
    withCanvas();
    renderPage(<LoginParticles />);
    const options = lastOptions();
    expect(options.fullScreen).toEqual({ enable: false });
    expect(scenes.at(-1)).toMatchObject({ width: '100%', height: '100%' });
    expect(options.particles.color.value).toBe(COLORS.paper);
    expect(options.particles.links).toMatchObject({ enable: true, color: COLORS.paper });
    expect(options.particles.move.enable).toBe(true);
    expect(options.interactivity.detectsOn).toBe('window');
    expect(options.interactivity.events.onHover).toEqual({ enable: true, mode: 'repulse' });
  });


  it('counts one dot per 10 px of the viewport\'s width', () => {
    withCanvas();
    vi.stubGlobal('innerWidth', 1440);
    renderPage(<LoginParticles />);
    expect(lastOptions().particles.number.value).toBe(144);
  });


  it('stands still and ignores the cursor under "reduce motion"', () => {
    withCanvas();
    mediaQueryMatches('(prefers-reduced-motion: reduce)');
    renderPage(<LoginParticles />);
    const options = lastOptions();
    expect(options.particles.move.enable).toBe(false);
    expect(options.interactivity.events.onHover.enable).toBe(false);
    // still a network — the dots and lines stay
    expect(options.particles.links.enable).toBe(true);
  });


  it('loads the slim bundle into the engine the library hands over', async () => {
    withCanvas();
    const { loadSlim } = await import('tsparticles-slim');
    renderPage(<LoginParticles />);
    const engine = { name: 'engine' };
    await scenes.at(-1).init(engine);
    expect(loadSlim).toHaveBeenCalledWith(engine);
  });
});







// -----------------------------------------------------------
// on the login page
// -----------------------------------------------------------

describe('Login — the backdrop', () => {

  it('mounts the layer lazily inside the main landmark, on the ink gradient, before the sheet that covers it', async () => {
    withCanvas();
    renderPage(<Login />, { route: '/login', path: '/login' });
    const main = screen.getByRole('main');
    const scene = await within(main).findByTestId('particles-scene');
    const heading = within(main).getByRole('heading', { level: 1, name: 'Sign in' });
    // the layer comes first, so the sheet paints over it
    expect(scene.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main).toHaveClass('relative', 'isolate', 'bg-linear-to-br', 'from-primary-dark', 'via-primary', 'to-primary-light');
  });
});
